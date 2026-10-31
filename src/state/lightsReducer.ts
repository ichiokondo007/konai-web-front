import type { ApiErrorCode, LightState } from "../api/types";
import { emptyEntry, type LightEntry } from "./selectors";

/** ok = 正常 / unreachable = API に届かない / degraded = API は動いているが MQTT 未接続 */
export type Connection = "ok" | "unreachable" | "degraded";

export interface AppState {
  /** GET /lights の順 */
  names: string[];
  lights: Record<string, LightEntry>;
  connection: Connection;
  /** 明るさシートを開いている電球名 */
  sheet: string | null;
}

export const initialState: AppState = {
  names: [],
  lights: {},
  connection: "ok",
  sheet: null,
};

export type Action =
  | { type: "namesLoaded"; names: string[] }
  | { type: "lightFetched"; light: LightState }
  | { type: "lightFetchFailed"; name: string; code: ApiErrorCode }
  | { type: "commandStarted"; name: string }
  | { type: "commandSucceeded"; light: LightState }
  | { type: "commandFailed"; name: string; code: ApiErrorCode }
  /** 電球に紐づかない失敗(listLights、getHealth の例外) */
  | { type: "connectionFailed"; code: ApiErrorCode }
  | { type: "healthChecked"; ok: boolean }
  | { type: "sheetOpened"; name: string }
  | { type: "sheetClosed" };

/** エラーコードが示す接続状態。ok = 電球単位のエラーで、API 自体には届いている */
export function connectionFor(code: ApiErrorCode): Connection {
  switch (code) {
    case "MQTT_UNAVAILABLE":
      return "degraded";
    case "NETWORK":
    case "INTERNAL_ERROR":
      return "unreachable";
    default:
      return "ok";
  }
}

function fromResponse(light: LightState): LightEntry {
  return {
    state: light.state,
    brightness: light.brightness ?? null,
    updatedAt: light.updatedAt,
    pending: false,
    error: null,
  };
}

function patch(state: AppState, name: string, changes: Partial<LightEntry>): Record<string, LightEntry> {
  return { ...state.lights, [name]: { ...(state.lights[name] ?? emptyEntry), ...changes } };
}

function failed(state: AppState, name: string, code: ApiErrorCode): AppState {
  const connection = connectionFor(code);
  if (connection === "ok") {
    // 電球単位のエラー: その電球に記録し、API には届いているので接続は ok
    return { ...state, connection, lights: patch(state, name, { pending: false, error: code }) };
  }
  return { ...state, connection, lights: patch(state, name, { pending: false }) };
}

export function lightsReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "namesLoaded": {
      const lights: Record<string, LightEntry> = {};
      for (const name of action.names) lights[name] = state.lights[name] ?? emptyEntry;
      return { ...state, names: action.names, lights, connection: "ok" };
    }
    case "lightFetched":
    case "commandSucceeded":
      return {
        ...state,
        connection: "ok",
        lights: { ...state.lights, [action.light.name]: fromResponse(action.light) },
      };
    case "lightFetchFailed":
    case "commandFailed":
      return failed(state, action.name, action.code);
    case "commandStarted":
      return { ...state, lights: patch(state, action.name, { pending: true }) };
    case "connectionFailed": {
      const connection = connectionFor(action.code);
      return connection === "ok" ? state : { ...state, connection };
    }
    case "healthChecked":
      return { ...state, connection: action.ok ? "ok" : "degraded" };
    case "sheetOpened":
      return { ...state, sheet: action.name };
    case "sheetClosed":
      return { ...state, sheet: null };
  }
}
