import { ApiError, isErrorCode, type Health, type LightCommand, type LightState } from "./types";

/** API の電球待ち(5 秒)より長く、README の推奨 7〜10 秒の範囲 */
export const REQUEST_TIMEOUT_MS = 8000;

export interface LightsApi {
  listLights(): Promise<string[]>;
  getLight(name: string): Promise<LightState>;
  setLightState(name: string, command: LightCommand): Promise<LightState>;
  /** 503(degraded)でも Health の形なら正常に返す */
  getHealth(): Promise<Health>;
}

interface Sent {
  ok: boolean;
  status: number;
  /** JSON として読めなければ null */
  body: unknown;
}

async function send(path: string, init: RequestInit = {}): Promise<Sent> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(path, { ...init, signal: controller.signal });
  } catch (e) {
    throw new ApiError("NETWORK", null, e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

function toApiError(sent: Sent): ApiError {
  const err = (sent.body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  const code = isErrorCode(err?.code) ? err.code : "NETWORK";
  const message = typeof err?.message === "string" ? err.message : `HTTP ${sent.status}`;
  return new ApiError(code, sent.status, message);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const sent = await send(path, init);
  if (!sent.ok) throw toApiError(sent);
  if (sent.body === null) throw new ApiError("NETWORK", sent.status, "response is not JSON");
  return sent.body as T;
}

function isHealth(body: unknown): body is Health {
  const b = body as Partial<Health> | null;
  return (
    (b?.status === "ok" || b?.status === "degraded") &&
    (b.mqtt === "connected" || b.mqtt === "disconnected")
  );
}

export const lightsApi: LightsApi = {
  async listLights() {
    const body = await request<{ lights: string[] }>("/api/lights");
    return body.lights;
  },

  getLight(name) {
    return request<LightState>(`/api/lights/${encodeURIComponent(name)}`);
  },

  setLightState(name, command) {
    return request<LightState>(`/api/lights/${encodeURIComponent(name)}/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
  },

  async getHealth() {
    const sent = await send("/api/health");
    if (isHealth(sent.body)) return sent.body;
    throw toApiError(sent);
  },
};
