import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./types";
import { lightsApi, REQUEST_TIMEOUT_MS } from "./lightsApi";

const fetchMock = vi.fn();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit];
  return { url, init };
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  vi.useRealTimers();
});

describe("lightsApi", () => {
  it("listLights は /api/lights を GET し名前の配列を返す", async () => {
    fetchMock.mockResolvedValueOnce(json({ lights: ["living1", "desk"] }));
    await expect(lightsApi.listLights()).resolves.toEqual(["living1", "desk"]);
    expect(lastCall().url).toBe("/api/lights");
  });

  it("getLight は /api/lights/{name} の応答をそのまま返す", async () => {
    const state = { name: "living1", state: "ON", brightness: 254, updatedAt: "2026-11-01T00:00:00.000Z" };
    fetchMock.mockResolvedValueOnce(json(state));
    await expect(lightsApi.getLight("living1")).resolves.toEqual(state);
    expect(lastCall().url).toBe("/api/lights/living1");
  });

  it("setLightState は PUT、Content-Type: application/json、body が command の JSON", async () => {
    const after = { name: "desk", state: "ON", brightness: 100, updatedAt: "2026-11-01T00:00:00.000Z" };
    fetchMock.mockResolvedValueOnce(json(after));
    await expect(lightsApi.setLightState("desk", { state: "ON", brightness: 100 })).resolves.toEqual(after);
    const { url, init } = lastCall();
    expect(url).toBe("/api/lights/desk/state");
    expect(init.method).toBe("PUT");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ state: "ON", brightness: 100 });
  });

  it("エラー応答は ApiError(code, status) になる", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: "LIGHT_NOT_FOUND", message: "unknown light: x" } }, 404));
    const p = lightsApi.getLight("x");
    await expect(p).rejects.toBeInstanceOf(ApiError);
    await expect(p).rejects.toMatchObject({ code: "LIGHT_NOT_FOUND", status: 404 });
  });

  it("fetch が throw したら ApiError(NETWORK, null)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(lightsApi.listLights()).rejects.toMatchObject({ code: "NETWORK", status: null });
  });

  it("JSON でない応答は ApiError(NETWORK, status)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(lightsApi.listLights()).rejects.toMatchObject({ code: "NETWORK", status: 502 });
  });

  it("getHealth は 503 でも Health を返す", async () => {
    fetchMock.mockResolvedValueOnce(json({ status: "degraded", mqtt: "disconnected" }, 503));
    await expect(lightsApi.getHealth()).resolves.toEqual({ status: "degraded", mqtt: "disconnected" });
    expect(lastCall().url).toBe("/api/health");
  });

  it("8 秒で中断して ApiError(NETWORK)", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const assertion = expect(lightsApi.listLights()).rejects.toMatchObject({ code: "NETWORK" });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
  });
});
