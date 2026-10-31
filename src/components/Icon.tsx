import type { IconName } from "../config/rooms";

const paths: Record<IconName, string> = {
  // ソファ
  sofa: "M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 13a2 2 0 0 1 2-2 2 2 0 0 1 2 2v3h10v-3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v5H3zM6 18v2M18 18v2",
  // 机とモニター
  desk: "M4 5h16v9H4zM12 14v4M8 18h8M3 21h18",
  // 電球
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.3V17h6v-1.2c0-.9.4-1.7 1-2.3A6 6 0 0 0 12 3z",
  // 箱(その他)
  box: "M3 8l9-4 9 4-9 4-9-4zM3 8v8l9 4 9-4V8M12 12v8",
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={paths[name]} />
    </svg>
  );
}
