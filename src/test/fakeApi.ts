import type { LightsApi } from "../api/lightsApi";
import { ApiError, type ApiErrorCode, type Health, type LightCommand, type LightState } from "../api/types";

export interface FakeCall {
  method: "listLights" | "getLight" | "setLightState" | "getHealth";
  name?: string;
  command?: LightCommand;
}

/** メモリ上の電球を真実とするテスト用 API。setLightState は Zigbee2MQTT と同じ規則で状態を更新する */
export interface FakeApi extends LightsApi {
  lights: Map<string, LightState>;
  calls: FakeCall[];
  /** 次の 1 回の呼び出しを ApiError(code) で失敗させる(複数回呼べばキューになる) */
  failNext(code: ApiErrorCode): void;
  /** getHealth が返す値 */
  health: Health;
}

export function createFakeApi(initial: LightState[]): FakeApi {
  const lights = new Map(initial.map((l) => [l.name, { ...l }]));
  const calls: FakeCall[] = [];
  const failures: ApiErrorCode[] = [];
  let tick = 0;

  function record(call: FakeCall): void {
    calls.push(call);
    const code = failures.shift();
    if (code !== undefined) throw new ApiError(code, code === "NETWORK" ? null : 500, `fake ${code}`);
  }

  function stamp(): string {
    tick += 1;
    return new Date(Date.UTC(2026, 10, 1, 0, 0, tick)).toISOString();
  }

  const api: FakeApi = {
    lights,
    calls,
    health: { status: "ok", mqtt: "connected" },
    failNext(code) {
      failures.push(code);
    },

    async listLights() {
      record({ method: "listLights" });
      return [...lights.keys()];
    },

    async getLight(name) {
      record({ method: "getLight", name });
      const light = lights.get(name);
      if (!light) throw new ApiError("LIGHT_NOT_FOUND", 404, `unknown light: ${name}`);
      return { ...light };
    },

    async setLightState(name, command) {
      record({ method: "setLightState", name, command });
      const light = lights.get(name);
      if (!light) throw new ApiError("LIGHT_NOT_FOUND", 404, `unknown light: ${name}`);
      const next: LightState = { ...light, updatedAt: stamp() };
      if (command.state === "OFF") {
        next.state = "OFF";
      } else if (command.brightness !== undefined) {
        next.brightness = command.brightness;
        next.state = command.brightness === 0 ? "OFF" : "ON";
      } else if (command.state === "ON") {
        next.state = "ON";
      }
      lights.set(name, next);
      return { ...next };
    },

    async getHealth() {
      record({ method: "getHealth" });
      return { ...api.health };
    },
  };
  return api;
}
