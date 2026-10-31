// ../konai-web/docs/api/openapi.yaml(1.1.0)に対応する型

export type LightPower = "ON" | "OFF";

export interface LightState {
  name: string;
  state: LightPower;
  /** 0〜254 の生値。電球の応答に無ければ省略 */
  brightness?: number;
  updatedAt: string;
}

export interface LightCommand {
  state?: LightPower;
  brightness?: number;
}

export interface Health {
  status: "ok" | "degraded";
  mqtt: "connected" | "disconnected";
}

export type ErrorCode =
  | "INVALID_REQUEST"
  | "LIGHT_NOT_FOUND"
  | "NOT_FOUND"
  | "MQTT_UNAVAILABLE"
  | "DEVICE_TIMEOUT"
  | "INTERNAL_ERROR";

export const ERROR_CODES: readonly ErrorCode[] = [
  "INVALID_REQUEST",
  "LIGHT_NOT_FOUND",
  "NOT_FOUND",
  "MQTT_UNAVAILABLE",
  "DEVICE_TIMEOUT",
  "INTERNAL_ERROR",
];

/** NETWORK = 接続不可、タイムアウト、JSON でない応答(API に届いていない、または API が壊れている) */
export type ApiErrorCode = ErrorCode | "NETWORK";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | null;

  constructor(code: ApiErrorCode, status: number | null, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}
