import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyEntry, type LightEntry, type LightView } from "../state/selectors";
import { BrightnessSheet, SLIDER_DEBOUNCE_MS } from "./BrightnessSheet";

const on: LightEntry = { ...emptyEntry, state: "ON", brightness: 127, updatedAt: "t" };
const light: LightView = { name: "living1", label: "天井ライト", entry: on };

function renderSheet(view: LightView | null = light) {
  const onClose = vi.fn();
  const onBrightness = vi.fn();
  const onPower = vi.fn();
  const utils = render(<BrightnessSheet light={view} onClose={onClose} onBrightness={onBrightness} onPower={onPower} />);
  return { ...utils, onClose, onBrightness, onPower };
}

const slider = () => screen.getByRole("slider", { name: "明るさ" }) as HTMLInputElement;
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("BrightnessSheet", () => {
  it("light が null なら何も描画しない", () => {
    renderSheet(null);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("表示名、現在のパーセント、スライダーの値を描画する", () => {
    renderSheet();
    expect(screen.getByRole("dialog", { name: "天井ライト" })).toBeInTheDocument();
    expect(screen.getByTestId("percent")).toHaveTextContent("50%");
    expect(slider().value).toBe("50");
  });

  it("brightness が null なら「--」とスライダー 100", () => {
    renderSheet({ ...light, entry: { ...on, brightness: null } });
    expect(screen.getByTestId("percent")).toHaveTextContent("--");
    expect(slider().value).toBe("100");
  });

  it("input から 300ms 後に 1 回だけ onBrightness", async () => {
    const { onBrightness } = renderSheet();
    fireEvent.input(slider(), { target: { value: "30" } });
    fireEvent.input(slider(), { target: { value: "40" } });
    expect(screen.getByTestId("percent")).toHaveTextContent("40%");
    await advance(SLIDER_DEBOUNCE_MS - 1);
    expect(onBrightness).not.toHaveBeenCalled();
    await advance(1);
    expect(onBrightness).toHaveBeenCalledTimes(1);
    expect(onBrightness).toHaveBeenCalledWith(40);
  });

  it("change は直ちに送り、残っていたデバウンスは捨てる", async () => {
    const { onBrightness } = renderSheet();
    fireEvent.input(slider(), { target: { value: "60" } });
    fireEvent.change(slider(), { target: { value: "60" } });
    expect(onBrightness).toHaveBeenCalledTimes(1);
    expect(onBrightness).toHaveBeenCalledWith(60);
    await advance(SLIDER_DEBOUNCE_MS);
    expect(onBrightness).toHaveBeenCalledTimes(1);
  });

  it("同じ値の change を続けて出しても 1 回", async () => {
    const { onBrightness } = renderSheet();
    fireEvent.change(slider(), { target: { value: "60" } });
    fireEvent.change(slider(), { target: { value: "60" } });
    await advance(SLIDER_DEBOUNCE_MS);
    expect(onBrightness).toHaveBeenCalledTimes(1);
  });

  it("props の明るさが変わると表示が追従する", () => {
    const { rerender, onClose, onBrightness, onPower } = renderSheet();
    rerender(
      <BrightnessSheet
        light={{ ...light, entry: { ...on, brightness: 254 } }}
        onClose={onClose}
        onBrightness={onBrightness}
        onPower={onPower}
      />,
    );
    expect(screen.getByTestId("percent")).toHaveTextContent("100%");
    expect(slider().value).toBe("100");
  });

  it("電源スイッチで onPower(OFF)、消灯中なら onPower(ON)", () => {
    const { onPower, rerender, onClose, onBrightness } = renderSheet();
    const sw = screen.getByRole("switch", { name: "電源" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    fireEvent.click(sw);
    expect(onPower).toHaveBeenCalledWith("OFF");
    rerender(
      <BrightnessSheet
        light={{ ...light, entry: { ...on, state: "OFF" } }}
        onClose={onClose}
        onBrightness={onBrightness}
        onPower={onPower}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "電源" }));
    expect(onPower).toHaveBeenLastCalledWith("ON");
  });

  it("背景のクリックと閉じるボタンで onClose", () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByTestId("sheet-backdrop"));
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
