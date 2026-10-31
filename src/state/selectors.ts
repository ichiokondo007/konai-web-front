import type { ApiErrorCode, LightPower } from "../api/types";
import type { IconName, RoomConfig } from "../config/rooms";

/** 1 個の電球について画面が持つ状態。state が null = まだ取得できていない */
export interface LightEntry {
  state: LightPower | null;
  /** 0〜254 の生値。応答に無ければ null */
  brightness: number | null;
  updatedAt: string | null;
  /** 操作を送信中 */
  pending: boolean;
  /** 直近の操作 / 取得の失敗(電球単位のもの) */
  error: ApiErrorCode | null;
}

export interface LightView {
  name: string;
  label: string;
  entry: LightEntry;
}

export interface RoomView {
  id: string;
  name: string;
  icon: IconName;
  lights: LightView[];
}

export interface AllLightsView {
  on: number;
  total: number;
  anyOn: boolean;
}

export const OTHER_ROOM_ID = "other";

export const emptyEntry: LightEntry = {
  state: null,
  brightness: null,
  updatedAt: null,
  pending: false,
  error: null,
};

const MAX_BRIGHTNESS = 254;

/** 設定 × API の名前一覧から部屋パネルを組み立てる。設定に無い名前は末尾の「その他」へ */
export function buildRooms(
  config: RoomConfig[],
  names: string[],
  lights: Record<string, LightEntry>,
): RoomView[] {
  const known = new Set(names);
  const entryOf = (name: string): LightEntry => lights[name] ?? emptyEntry;

  const result: RoomView[] = [];
  const placed = new Set<string>();
  for (const room of config) {
    const views: LightView[] = [];
    for (const light of room.lights) {
      if (!known.has(light.name) || placed.has(light.name)) continue;
      placed.add(light.name);
      views.push({ name: light.name, label: light.label, entry: entryOf(light.name) });
    }
    if (views.length > 0) result.push({ id: room.id, name: room.name, icon: room.icon, lights: views });
  }

  const others = names
    .filter((name) => !placed.has(name))
    .map((name) => ({ name, label: name, entry: entryOf(name) }));
  if (others.length > 0) result.push({ id: OTHER_ROOM_ID, name: "その他", icon: "box", lights: others });

  return result;
}

export function summarize(names: string[], lights: Record<string, LightEntry>): AllLightsView {
  const on = names.filter((name) => lights[name]?.state === "ON").length;
  return { on, total: names.length, anyOn: on > 0 };
}

/** 0〜254 → 0〜100 */
export function toPercent(brightness: number): number {
  return Math.round((brightness / MAX_BRIGHTNESS) * 100);
}

/** 0〜100 → 0〜254(範囲外は丸める) */
export function toBrightness(percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent));
  return Math.round((clamped / 100) * MAX_BRIGHTNESS);
}
