import type { Connection } from "../state/lightsReducer";

const messages: Record<Exclude<Connection, "ok">, string> = {
  unreachable: "サーバに接続できません",
  degraded: "サーバが電球と通信できません",
};

export function Header({ connection }: { connection: Connection }) {
  return (
    <header className="flex min-h-11 items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight">konai</h1>
      {connection !== "ok" && (
        <p role="status" className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-red-500" />
          {messages[connection]}
        </p>
      )}
    </header>
  );
}
