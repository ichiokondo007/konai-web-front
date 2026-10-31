import type { LightView } from "../state/selectors";
import { Icon } from "./Icon";
import { statusText } from "./statusText";

export function LightCard({
  light,
  disabled,
  onTap,
  onMore,
}: {
  light: LightView;
  disabled: boolean;
  onTap: () => void;
  onMore: () => void;
}) {
  const { entry, label } = light;
  const isOn = entry.state === "ON";
  const hasError = entry.error !== null && !entry.pending;
  const statusClass = hasError
    ? "text-red-600 dark:text-red-400"
    : isOn
      ? "text-amber-700 dark:text-amber-300"
      : "text-gray-500 dark:text-slate-400";

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        disabled={disabled || entry.pending}
        onClick={onTap}
        className="flex min-h-[88px] w-full flex-col gap-2 rounded-2xl bg-white p-3 text-left shadow-sm transition active:scale-[0.98] disabled:opacity-50 dark:bg-slate-800"
      >
        <span
          aria-hidden="true"
          className={`flex size-9 items-center justify-center rounded-full transition ${
            isOn ? "bg-amber-200 text-amber-800 dark:bg-amber-400 dark:text-amber-950" : "bg-gray-200 text-gray-500 dark:bg-slate-700 dark:text-slate-300"
          }`}
        >
          <Icon name="bulb" className="size-5" />
        </span>
        <span className="block truncate font-semibold">{label}</span>
        <span className={`block text-sm ${statusClass}`}>{statusText(entry)}</span>
      </button>
      <button
        type="button"
        aria-label={`${label} の明るさ`}
        disabled={disabled}
        onClick={onMore}
        className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-full text-xl leading-none text-gray-400 transition hover:bg-gray-100 disabled:opacity-50 dark:text-slate-500 dark:hover:bg-slate-700"
      >
        ⋯
      </button>
    </div>
  );
}
