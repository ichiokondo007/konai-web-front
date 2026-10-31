import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import type { LightPower } from "../api/types";
import { toPercent, type LightView } from "../state/selectors";

/** スライダーの input が止まってから送信するまでの時間 */
export const SLIDER_DEBOUNCE_MS = 300;

interface Props {
  /** null なら何も描画しない */
  light: LightView | null;
  onClose: () => void;
  onBrightness: (percent: number) => void;
  onPower: (power: LightPower) => void;
}

export function BrightnessSheet({ light, onClose, onBrightness, onPower }: Props) {
  if (light === null) return null;
  return <Sheet light={light} onClose={onClose} onBrightness={onBrightness} onPower={onPower} />;
}

function Sheet({ light, onClose, onBrightness, onPower }: Props & { light: LightView }) {
  const { entry, label } = light;
  const known = entry.brightness !== null;
  const fromProps = known ? toPercent(entry.brightness as number) : 100;

  const [local, setLocal] = useState(fromProps);
  const [dirty, setDirty] = useState(false);
  const sliderRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef<number | null>(null);

  const clearDebounce = () => {
    if (debounce.current !== null) {
      clearTimeout(debounce.current);
      debounce.current = null;
    }
  };

  const commit = useCallback(
    (percent: number) => {
      clearDebounce();
      if (lastSent.current === percent) return;
      lastSent.current = percent;
      onBrightness(percent);
    },
    [onBrightness],
  );

  // ドラッグ中(未送信の値がある間)でなければ、電球側の明るさに表示を追従させる
  useEffect(() => {
    if (debounce.current === null) {
      setLocal(fromProps);
      setDirty(false);
      lastSent.current = null;
    }
  }, [fromProps]);

  // 指を離した(change)ときは直ちに送る。React の onChange は値が同じだと発火しないので native で受ける
  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    const onNativeChange = () => commit(Number(el.value));
    el.addEventListener("change", onNativeChange);
    return () => el.removeEventListener("change", onNativeChange);
  }, [commit]);

  useEffect(() => clearDebounce, []);

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setLocal(value);
    setDirty(true);
    clearDebounce();
    debounce.current = setTimeout(() => {
      debounce.current = null;
      commit(value);
    }, SLIDER_DEBOUNCE_MS);
  };

  const isOn = entry.state === "ON";
  const percentText = known || dirty ? `${local}%` : "--";

  return (
    <div className="fixed inset-0 z-50">
      <div data-testid="sheet-backdrop" aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="absolute inset-x-0 bottom-0 mx-auto max-w-xl rounded-t-3xl bg-white p-5 pb-8 text-gray-900 shadow-2xl dark:bg-slate-800 dark:text-slate-100"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{label}</h2>
          <button
            type="button"
            aria-label="閉じる"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full text-xl text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            ✕
          </button>
        </div>
        <p data-testid="percent" className="my-4 text-center text-5xl font-bold tabular-nums">
          {percentText}
        </p>
        <input
          ref={sliderRef}
          type="range"
          min="0"
          max="100"
          step="1"
          aria-label="明るさ"
          value={local}
          onChange={onInput}
          className="h-11 w-full accent-amber-500"
        />
        <div className="mt-5 flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-slate-400">{isOn ? "点灯" : "消灯"}</span>
          <button
            type="button"
            role="switch"
            aria-checked={isOn}
            aria-label="電源"
            onClick={() => onPower(isOn ? "OFF" : "ON")}
            className={`relative inline-block h-7 w-12 rounded-full transition ${
              isOn ? "bg-amber-500" : "bg-gray-300 dark:bg-slate-600"
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-1 size-5 rounded-full bg-white shadow transition ${isOn ? "left-6" : "left-1"}`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
