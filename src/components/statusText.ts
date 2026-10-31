import { toPercent, type LightEntry } from "../state/selectors";

/** カードの状態行の文言 */
export function statusText(entry: LightEntry): string {
  if (entry.pending) return "送信中…";
  if (entry.error === "DEVICE_TIMEOUT") return "応答なし";
  if (entry.error !== null) return "エラー";
  if (entry.state === null) return "取得中…";
  if (entry.state === "OFF") return "消灯";
  if (entry.brightness === null) return "点灯";
  return `点灯 · ${toPercent(entry.brightness)}%`;
}
