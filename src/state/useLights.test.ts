import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LightState } from "../api/types";
import { createFakeApi, type FakeApi } from "../test/fakeApi";
import { POLL_INTERVAL_MS, REFETCH_DELAY_MS, useLights } from "./useLights";

const t = "2026-11-01T00:00:00.000Z";
const initial: LightState[] = [
  { name: "living1", state: "ON", brightness: 254, updatedAt: t },
  { name: "desk", state: "OFF", updatedAt: t },
];

let api: FakeApi;

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const flush = () => advance(0);
const count = (method: string, name?: string) =>
  api.calls.filter((c) => c.method === method && (name === undefined || c.name === name)).length;

function setVisibility(value: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
  document.dispatchEvent(new Event("visibilitychange"));
}

async function mount() {
  const hook = renderHook(() => useLights(api));
  await flush();
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers();
  api = createFakeApi(initial);
});

afterEach(() => {
  delete (document as { visibilityState?: unknown }).visibilityState;
  vi.useRealTimers();
});

describe("useLights: 取得", () => {
  it("マウント時に名前一覧と各電球の状態を取得する", async () => {
    const { result } = await mount();
    expect(result.current.state.names).toEqual(["living1", "desk"]);
    expect(result.current.state.lights.living1.state).toBe("ON");
    expect(result.current.state.lights.desk.state).toBe("OFF");
    expect(count("listLights")).toBe(1);
    expect(count("getLight")).toBe(2);
    expect(result.current.rooms.map((r) => r.id)).toEqual(["living", "desk"]);
    expect(result.current.all).toEqual({ on: 1, total: 2, anyOn: true });
  });

  it("10 秒後に再取得する", async () => {
    await mount();
    await advance(POLL_INTERVAL_MS - 1);
    expect(count("getLight")).toBe(2);
    await advance(1);
    expect(count("getLight")).toBe(4);
    expect(count("listLights")).toBe(1);
  });

  it("ページが hidden の間は取得せず、visible に戻ると直ちに取得する", async () => {
    await mount();
    act(() => setVisibility("hidden"));
    await advance(POLL_INTERVAL_MS * 3);
    expect(count("getLight")).toBe(2);
    act(() => setVisibility("visible"));
    await flush();
    expect(count("getLight")).toBe(4);
  });

  it("前の周期が終わる前に次を始めない", async () => {
    await mount();
    api.getLight = () =>
      new Promise(() => {
        /* 永遠に保留 */
      });
    const getLight = vi.spyOn(api, "getLight");
    await advance(POLL_INTERVAL_MS);
    expect(getLight).toHaveBeenCalledTimes(2);
    act(() => setVisibility("visible"));
    await flush();
    await advance(POLL_INTERVAL_MS);
    expect(getLight).toHaveBeenCalledTimes(2);
  });

  it("listLights が失敗したら 10 秒後に再試行する", async () => {
    api.failNext("NETWORK");
    const { result } = await mount();
    expect(result.current.state.connection).toBe("unreachable");
    expect(result.current.state.names).toEqual([]);
    await advance(POLL_INTERVAL_MS);
    expect(result.current.state.names).toEqual(["living1", "desk"]);
    expect(result.current.state.connection).toBe("ok");
  });

  it("アンマウント後はタイマーが残らない", async () => {
    const { unmount } = await mount();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("useLights: 操作", () => {
  it("toggle は ON の電球に { state: OFF } を送り、pending を経て応答で更新する", async () => {
    const { result } = await mount();
    let done: Promise<void>;
    act(() => {
      done = result.current.toggle("living1");
    });
    expect(result.current.state.lights.living1.pending).toBe(true);
    await act(() => done);
    expect(api.calls.at(-1)).toEqual({ method: "setLightState", name: "living1", command: { state: "OFF" } });
    expect(result.current.state.lights.living1.pending).toBe(false);
    expect(result.current.state.lights.living1.state).toBe("OFF");
  });

  it("toggle は OFF の電球に { state: ON } を送る", async () => {
    const { result } = await mount();
    await act(() => result.current.toggle("desk"));
    expect(api.calls.at(-1)).toEqual({ method: "setLightState", name: "desk", command: { state: "ON" } });
  });

  it("toggle は pending 中は無視する", async () => {
    const { result } = await mount();
    await act(async () => {
      void result.current.toggle("living1");
      void result.current.toggle("living1");
    });
    expect(count("setLightState")).toBe(1);
  });

  it("操作成功の 1 秒後に getLight で取り直す", async () => {
    const { result } = await mount();
    await act(() => result.current.toggle("living1"));
    const before = count("getLight", "living1");
    await advance(REFETCH_DELAY_MS - 1);
    expect(count("getLight", "living1")).toBe(before);
    await advance(1);
    expect(count("getLight", "living1")).toBe(before + 1);
  });

  it("setBrightness(50) は { brightness: 127 } だけを送る", async () => {
    const { result } = await mount();
    await act(() => result.current.setBrightness("desk", 50));
    expect(api.calls.at(-1)).toEqual({ method: "setLightState", name: "desk", command: { brightness: 127 } });
    expect(result.current.state.lights.desk).toMatchObject({ state: "ON", brightness: 127 });
  });

  it("pending 中の setBrightness は捨てずに、完了後に最後の値だけを送る", async () => {
    const { result } = await mount();
    let release!: () => void;
    const started: unknown[] = [];
    const original = api.setLightState.bind(api);
    api.setLightState = (name, command) =>
      new Promise((resolve) => {
        started.push(command);
        release = () => resolve(original(name, command));
      });
    let first!: Promise<void>;
    act(() => {
      first = result.current.setBrightness("desk", 30);
    });
    await act(async () => {
      void result.current.setBrightness("desk", 40);
      void result.current.setBrightness("desk", 50);
    });
    expect(started).toEqual([{ brightness: 76 }]);
    api.setLightState = original;
    await act(async () => {
      release();
      await first;
    });
    await flush();
    const sent = api.calls.filter((c) => c.method === "setLightState").map((c) => c.command);
    expect(sent).toEqual([{ brightness: 76 }, { brightness: 127 }]);
    expect(result.current.state.lights.desk.brightness).toBe(127);
  });

  it("setPower は { state } を送る", async () => {
    const { result } = await mount();
    await act(() => result.current.setPower("living1", "OFF"));
    expect(api.calls.at(-1)).toEqual({ method: "setLightState", name: "living1", command: { state: "OFF" } });
  });

  it("toggleAll は 1 つでも点灯していれば全 OFF", async () => {
    const { result } = await mount();
    await act(() => result.current.toggleAll());
    const sent = api.calls.filter((c) => c.method === "setLightState");
    expect(sent).toEqual([
      { method: "setLightState", name: "living1", command: { state: "OFF" } },
      { method: "setLightState", name: "desk", command: { state: "OFF" } },
    ]);
    expect(result.current.all.anyOn).toBe(false);
  });

  it("toggleAll は全消灯なら全 ON", async () => {
    api.lights.set("living1", { ...initial[0], state: "OFF" });
    const { result } = await mount();
    await act(() => result.current.toggleAll());
    const sent = api.calls.filter((c) => c.method === "setLightState").map((c) => c.command);
    expect(sent).toEqual([{ state: "ON" }, { state: "ON" }]);
  });

  it("toggleAll は一部が失敗しても他を続け、失敗した電球だけ error", async () => {
    const { result } = await mount();
    api.failNext("DEVICE_TIMEOUT");
    await act(() => result.current.toggleAll());
    expect(count("setLightState")).toBe(2);
    expect(result.current.state.lights.living1.error).toBe("DEVICE_TIMEOUT");
    expect(result.current.state.lights.desk.error).toBeNull();
    expect(result.current.state.lights.desk.state).toBe("OFF");
  });

  it("openSheet / closeSheet で state.sheet が変わる", async () => {
    const { result } = await mount();
    act(() => result.current.openSheet("desk"));
    expect(result.current.state.sheet).toBe("desk");
    act(() => result.current.closeSheet());
    expect(result.current.state.sheet).toBeNull();
  });
});

describe("useLights: エラーと接続状態", () => {
  it("DEVICE_TIMEOUT は connection を ok のままにする", async () => {
    const { result } = await mount();
    api.failNext("DEVICE_TIMEOUT");
    await act(() => result.current.toggle("living1"));
    expect(result.current.state.connection).toBe("ok");
    expect(result.current.state.lights.living1.error).toBe("DEVICE_TIMEOUT");
    expect(result.current.state.lights.living1.pending).toBe(false);
  });

  it("NETWORK で unreachable になり、次の周期で成功すると ok に戻る", async () => {
    const { result } = await mount();
    api.failNext("NETWORK");
    await act(() => result.current.toggle("living1"));
    expect(result.current.state.connection).toBe("unreachable");
    await advance(POLL_INTERVAL_MS);
    expect(result.current.state.connection).toBe("ok");
  });

  it("MQTT_UNAVAILABLE で degraded になり、ok になるまで getHealth だけを呼ぶ", async () => {
    const { result } = await mount();
    api.failNext("MQTT_UNAVAILABLE");
    await act(() => result.current.toggle("living1"));
    expect(result.current.state.connection).toBe("degraded");

    api.health = { status: "degraded", mqtt: "disconnected" };
    const lightsBefore = count("getLight");
    await advance(POLL_INTERVAL_MS);
    expect(count("getHealth")).toBe(1);
    expect(count("getLight")).toBe(lightsBefore);
    expect(result.current.state.connection).toBe("degraded");

    api.health = { status: "ok", mqtt: "connected" };
    await advance(POLL_INTERVAL_MS);
    expect(count("getHealth")).toBe(2);
    expect(count("getLight")).toBe(lightsBefore + 2);
    expect(result.current.state.connection).toBe("ok");
  });

  it("degraded 中に getHealth が失敗したら unreachable", async () => {
    const { result } = await mount();
    api.failNext("MQTT_UNAVAILABLE");
    await act(() => result.current.toggle("living1"));
    api.failNext("NETWORK");
    await advance(POLL_INTERVAL_MS);
    expect(result.current.state.connection).toBe("unreachable");
  });
});
