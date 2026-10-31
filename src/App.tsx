import { lightsApi, type LightsApi } from "./api/lightsApi";
import { AllLightsCard } from "./components/AllLightsCard";
import { BrightnessSheet } from "./components/BrightnessSheet";
import { Header } from "./components/Header";
import { RoomPanel } from "./components/RoomPanel";
import { useLights } from "./state/useLights";

export default function App({ api = lightsApi }: { api?: LightsApi }) {
  const { state, rooms, all, toggle, setPower, setBrightness, toggleAll, openSheet, closeSheet } = useLights(api);
  const disabled = state.connection !== "ok";
  const sheetLight =
    state.sheet === null ? null : (rooms.flatMap((r) => r.lights).find((l) => l.name === state.sheet) ?? null);

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 dark:bg-slate-900 dark:text-slate-100">
      <main className="mx-auto max-w-7xl space-y-4 p-4">
        <Header connection={state.connection} />
        <AllLightsCard summary={all} disabled={disabled} onToggle={() => void toggleAll()} />
        {state.loaded && state.names.length === 0 && state.connection === "ok" ? (
          <p className="py-8 text-center text-gray-500 dark:text-slate-400">電球が登録されていません</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <RoomPanel
                key={room.id}
                room={room}
                disabled={disabled}
                onTap={(name) => void toggle(name)}
                onMore={openSheet}
              />
            ))}
          </div>
        )}
      </main>
      <BrightnessSheet
        light={sheetLight}
        disabled={disabled}
        onClose={closeSheet}
        onBrightness={(percent) => {
          if (state.sheet !== null) void setBrightness(state.sheet, percent);
        }}
        onPower={(power) => {
          if (state.sheet !== null) void setPower(state.sheet, power);
        }}
      />
    </div>
  );
}
