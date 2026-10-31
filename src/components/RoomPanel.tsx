import type { RoomView } from "../state/selectors";
import { Icon } from "./Icon";
import { LightCard } from "./LightCard";

export function RoomPanel({
  room,
  disabled,
  onTap,
  onMore,
}: {
  room: RoomView;
  disabled: boolean;
  onTap: (name: string) => void;
  onMore: (name: string) => void;
}) {
  const headingId = `room-${room.id}`;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="flex items-center gap-2 px-1 text-base font-semibold">
        <Icon name={room.icon} className="size-5 text-gray-500 dark:text-slate-400" />
        {room.name}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {room.lights.map((light) => (
          <LightCard
            key={light.name}
            light={light}
            disabled={disabled}
            onTap={() => onTap(light.name)}
            onMore={() => onMore(light.name)}
          />
        ))}
      </div>
    </section>
  );
}
