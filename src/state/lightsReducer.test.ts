import { describe, expect, it } from "vitest";
import type { LightState } from "../api/types";
import { connectionFor, initialState, lightsReducer, type AppState } from "./lightsReducer";
import { emptyEntry } from "./selectors";

const living1On: LightState = { name: "living1", state: "ON", brightness: 254, updatedAt: "t1" };
const deskOffNoBrightness: LightState = { name: "desk", state: "OFF", updatedAt: "t1" };

function loaded(): AppState {
  let s = lightsReducer(initialState, { type: "namesLoaded", names: ["living1", "desk"] });
  s = lightsReducer(s, { type: "lightFetched", light: living1On });
  s = lightsReducer(s, { type: "lightFetched", light: deskOffNoBrightness });
  return s;
}

describe("lightsReducer", () => {
  it("namesLoaded は名前を置き換え、各名前に emptyEntry を作る", () => {
    const s = lightsReducer(initialState, { type: "namesLoaded", names: ["living1", "desk"] });
    expect(s.names).toEqual(["living1", "desk"]);
    expect(s.lights).toEqual({ living1: emptyEntry, desk: emptyEntry });
    expect(s.connection).toBe("ok");
  });

  it("namesLoaded は既存の entry を保持する", () => {
    const s = lightsReducer(loaded(), { type: "namesLoaded", names: ["living1", "desk"] });
    expect(s.lights.living1.state).toBe("ON");
    expect(s.lights.living1.brightness).toBe(254);
  });

  it("lightFetched は応答で上書きし、brightness 無しを null にする", () => {
    const s = loaded();
    expect(s.lights.living1).toEqual({ state: "ON", brightness: 254, updatedAt: "t1", pending: false, error: null });
    expect(s.lights.desk).toEqual({ state: "OFF", brightness: null, updatedAt: "t1", pending: false, error: null });
  });

  it("commandStarted → commandSucceeded で pending が true → false", () => {
    const started = lightsReducer(loaded(), { type: "commandStarted", name: "living1" });
    expect(started.lights.living1.pending).toBe(true);
    const done = lightsReducer(started, {
      type: "commandSucceeded",
      light: { name: "living1", state: "OFF", brightness: 254, updatedAt: "t2" },
    });
    expect(done.lights.living1).toEqual({ state: "OFF", brightness: 254, updatedAt: "t2", pending: false, error: null });
  });

  it("commandFailed(DEVICE_TIMEOUT) は entry.error に入り、pending が戻り、connection は ok", () => {
    const started = lightsReducer(loaded(), { type: "commandStarted", name: "living1" });
    const s = lightsReducer(started, { type: "commandFailed", name: "living1", code: "DEVICE_TIMEOUT" });
    expect(s.lights.living1.error).toBe("DEVICE_TIMEOUT");
    expect(s.lights.living1.pending).toBe(false);
    expect(s.lights.living1.state).toBe("ON");
    expect(s.connection).toBe("ok");
  });

  it("commandFailed(MQTT_UNAVAILABLE) は connection=degraded で entry.error は null のまま", () => {
    const started = lightsReducer(loaded(), { type: "commandStarted", name: "living1" });
    const s = lightsReducer(started, { type: "commandFailed", name: "living1", code: "MQTT_UNAVAILABLE" });
    expect(s.connection).toBe("degraded");
    expect(s.lights.living1.error).toBeNull();
    expect(s.lights.living1.pending).toBe(false);
  });

  it("lightFetchFailed(NETWORK) は connection=unreachable", () => {
    const s = lightsReducer(loaded(), { type: "lightFetchFailed", name: "living1", code: "NETWORK" });
    expect(s.connection).toBe("unreachable");
    expect(s.lights.living1.error).toBeNull();
  });

  it("connectionFailed(NETWORK) は connection=unreachable で lights は変わらない", () => {
    const before = loaded();
    const s = lightsReducer(before, { type: "connectionFailed", code: "NETWORK" });
    expect(s.connection).toBe("unreachable");
    expect(s.lights).toBe(before.lights);
  });

  it("connectionFailed(DEVICE_TIMEOUT) は connection を変えない", () => {
    const before = lightsReducer(loaded(), { type: "connectionFailed", code: "NETWORK" });
    const s = lightsReducer(before, { type: "connectionFailed", code: "DEVICE_TIMEOUT" });
    expect(s.connection).toBe("unreachable");
  });

  it("lightFetched で error が消え connection が ok に戻る", () => {
    let s = lightsReducer(loaded(), { type: "lightFetchFailed", name: "living1", code: "DEVICE_TIMEOUT" });
    s = lightsReducer(s, { type: "connectionFailed", code: "NETWORK" });
    s = lightsReducer(s, { type: "lightFetched", light: living1On });
    expect(s.lights.living1.error).toBeNull();
    expect(s.connection).toBe("ok");
  });

  it("DEVICE_TIMEOUT の失敗は connection を ok に戻す(API には届いている)", () => {
    let s = lightsReducer(loaded(), { type: "connectionFailed", code: "NETWORK" });
    s = lightsReducer(s, { type: "lightFetchFailed", name: "living1", code: "DEVICE_TIMEOUT" });
    expect(s.connection).toBe("ok");
  });

  it("healthChecked は ok なら ok、でなければ degraded", () => {
    const degraded = lightsReducer(loaded(), { type: "healthChecked", ok: false });
    expect(degraded.connection).toBe("degraded");
    expect(lightsReducer(degraded, { type: "healthChecked", ok: true }).connection).toBe("ok");
  });

  it("sheetOpened / sheetClosed", () => {
    const opened = lightsReducer(loaded(), { type: "sheetOpened", name: "desk" });
    expect(opened.sheet).toBe("desk");
    expect(lightsReducer(opened, { type: "sheetClosed" }).sheet).toBeNull();
  });

  it("入力の state を変更しない", () => {
    const frozen = Object.freeze({
      ...loaded(),
      lights: Object.freeze({ living1: Object.freeze({ ...emptyEntry }) }),
    }) as AppState;
    expect(() => lightsReducer(frozen, { type: "commandStarted", name: "living1" })).not.toThrow();
    expect(() => lightsReducer(frozen, { type: "lightFetched", light: living1On })).not.toThrow();
    expect(frozen.lights.living1.pending).toBe(false);
  });
});

describe("connectionFor", () => {
  it.each([
    ["MQTT_UNAVAILABLE", "degraded"],
    ["NETWORK", "unreachable"],
    ["INTERNAL_ERROR", "unreachable"],
    ["DEVICE_TIMEOUT", "ok"],
    ["LIGHT_NOT_FOUND", "ok"],
    ["INVALID_REQUEST", "ok"],
    ["NOT_FOUND", "ok"],
  ] as const)("connectionFor(%s) = %s", (code, expected) => {
    expect(connectionFor(code)).toBe(expected);
  });
});
