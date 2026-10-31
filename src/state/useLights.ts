import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { lightsApi, type LightsApi } from "../api/lightsApi";
import { ApiError, type ApiErrorCode, type LightCommand, type LightPower } from "../api/types";
import { rooms as roomConfig } from "../config/rooms";
import { initialState, lightsReducer, type Action, type AppState } from "./lightsReducer";
import { buildRooms, summarize, toBrightness, type AllLightsView, type RoomView } from "./selectors";

export const POLL_INTERVAL_MS = 10_000;
export const REFETCH_DELAY_MS = 1_000;

export interface LightsController {
  state: AppState;
  rooms: RoomView[];
  all: AllLightsView;
  /** 現在 ON なら OFF、それ以外は ON。pending 中は何もしない */
  toggle(name: string): Promise<void>;
  setPower(name: string, power: LightPower): Promise<void>;
  /** percent は 0〜100。{ brightness } だけを送る(消灯中でも点灯する) */
  setBrightness(name: string, percent: number): Promise<void>;
  /** 1 つでも点灯していれば全 OFF、でなければ全 ON */
  toggleAll(): Promise<void>;
  openSheet(name: string): void;
  closeSheet(): void;
}

function codeOf(e: unknown): ApiErrorCode {
  return e instanceof ApiError ? e.code : "NETWORK";
}

/**
 * 取得の層。ポーリングと操作をここに閉じ込める。
 * 将来 SSE に変えるときは poll の中身を EventSource に差し替えるだけでよい。
 */
export function useLights(api: LightsApi = lightsApi): LightsController {
  const [state, dispatch] = useReducer(lightsReducer, initialState);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const namesRef = useRef<string[] | null>(null);
  const pendingRef = useRef(new Set<string>());
  /** pending 中に来た明るさ変更。捨てずに、完了後に最後の 1 件だけ送る */
  const queuedRef = useRef(new Map<string, LightCommand>());
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchTimers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const safeDispatch = useCallback((action: Action) => {
    if (mounted.current) dispatch(action);
  }, []);

  const fetchLight = useCallback(
    async (name: string) => {
      try {
        const light = await api.getLight(name);
        safeDispatch({ type: "lightFetched", light });
      } catch (e) {
        safeDispatch({ type: "lightFetchFailed", name, code: codeOf(e) });
      }
    },
    [api, safeDispatch],
  );

  useEffect(() => {
    mounted.current = true;
    const refetchTimerSet = refetchTimers.current;

    const clearPoll = () => {
      if (pollTimer.current !== null) {
        clearTimeout(pollTimer.current);
        pollTimer.current = null;
      }
    };

    const schedule = () => {
      clearPoll();
      if (!mounted.current || document.visibilityState === "hidden") return;
      pollTimer.current = setTimeout(() => {
        pollTimer.current = null;
        void poll();
      }, POLL_INTERVAL_MS);
    };

    const poll = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        let names = namesRef.current;
        if (names === null) {
          try {
            names = await api.listLights();
            namesRef.current = names;
            safeDispatch({ type: "namesLoaded", names });
          } catch (e) {
            safeDispatch({ type: "connectionFailed", code: codeOf(e) });
            return;
          }
        }
        if (stateRef.current.connection === "degraded") {
          try {
            const health = await api.getHealth();
            safeDispatch({ type: "healthChecked", ok: health.status === "ok" });
            if (health.status !== "ok") return;
          } catch (e) {
            safeDispatch({ type: "connectionFailed", code: codeOf(e) });
            return;
          }
        }
        await Promise.all(names.map(fetchLight));
      } finally {
        inFlight.current = false;
        schedule();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") clearPoll();
      else void poll();
    };

    document.addEventListener("visibilitychange", onVisibility);
    void poll();

    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      clearPoll();
      for (const timer of refetchTimerSet) clearTimeout(timer);
      refetchTimerSet.clear();
    };
  }, [api, fetchLight, safeDispatch]);

  const run = useCallback(
    async function run(name: string, command: LightCommand): Promise<void> {
      if (pendingRef.current.has(name)) {
        // 明るさは最後の値を保留して後で送る。電源の切替は捨てる(二度押しで元に戻さない。UI 側も pending 中は無効)
        if (command.brightness !== undefined) queuedRef.current.set(name, command);
        return;
      }
      pendingRef.current.add(name);
      dispatch({ type: "commandStarted", name });
      try {
        const light = await api.setLightState(name, command);
        safeDispatch({ type: "commandSucceeded", light });
        if (!mounted.current) return;
        const timer = setTimeout(() => {
          refetchTimers.current.delete(timer);
          void fetchLight(name);
        }, REFETCH_DELAY_MS);
        refetchTimers.current.add(timer);
      } catch (e) {
        safeDispatch({ type: "commandFailed", name, code: codeOf(e) });
      } finally {
        pendingRef.current.delete(name);
        const next = queuedRef.current.get(name);
        if (next !== undefined) {
          queuedRef.current.delete(name);
          if (mounted.current) void run(name, next);
        }
      }
    },
    [api, fetchLight, safeDispatch],
  );

  const toggle = useCallback(
    (name: string) => {
      const entry = stateRef.current.lights[name];
      return run(name, { state: entry?.state === "ON" ? "OFF" : "ON" });
    },
    [run],
  );

  const setPower = useCallback((name: string, power: LightPower) => run(name, { state: power }), [run]);

  const setBrightness = useCallback(
    (name: string, percent: number) => run(name, { brightness: toBrightness(percent) }),
    [run],
  );

  const toggleAll = useCallback(async () => {
    const { names, lights } = stateRef.current;
    const power: LightPower = summarize(names, lights).anyOn ? "OFF" : "ON";
    await Promise.allSettled(names.map((name) => run(name, { state: power })));
  }, [run]);

  const openSheet = useCallback((name: string) => dispatch({ type: "sheetOpened", name }), []);
  const closeSheet = useCallback(() => dispatch({ type: "sheetClosed" }), []);

  const rooms = useMemo(() => buildRooms(roomConfig, state.names, state.lights), [state.names, state.lights]);
  const all = useMemo(() => summarize(state.names, state.lights), [state.names, state.lights]);

  return { state, rooms, all, toggle, setPower, setBrightness, toggleAll, openSheet, closeSheet };
}
