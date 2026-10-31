import type { AllLightsView } from "../state/selectors";

export function AllLightsCard({
  summary,
  disabled,
  onToggle,
}: {
  summary: AllLightsView;
  disabled: boolean;
  onToggle: () => void;
}) {
  const off = disabled || summary.total === 0;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={summary.anyOn}
      aria-label="すべての照明"
      disabled={off}
      onClick={onToggle}
      className="flex min-h-14 w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left shadow-sm transition disabled:opacity-50 dark:bg-slate-800"
    >
      <span>
        <span className="block font-semibold">すべての照明</span>
        <span className="block text-sm text-gray-500 dark:text-slate-400">
          {summary.on} / {summary.total} 点灯
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`relative inline-block h-7 w-12 shrink-0 rounded-full transition ${
          summary.anyOn ? "bg-amber-500" : "bg-gray-300 dark:bg-slate-600"
        }`}
      >
        <span
          className={`absolute top-1 size-5 rounded-full bg-white shadow transition ${
            summary.anyOn ? "left-6" : "left-1"
          }`}
        />
      </span>
    </button>
  );
}
