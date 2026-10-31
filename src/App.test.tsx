import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { LightState } from "./api/types";
import { createFakeApi, type FakeApi } from "./test/fakeApi";

const t = "2026-11-01T00:00:00.000Z";
const initial: LightState[] = [
  { name: "living1", state: "ON", brightness: 254, updatedAt: t },
  { name: "desk", state: "OFF", updatedAt: t },
];

let api: FakeApi;
const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

async function renderApp(lights: LightState[] = initial) {
  api = createFakeApi(lights);
  render(<App api={api} />);
  await flush();
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("App", () => {
  it("アプリ名を表示する", async () => {
    await renderApp();
    expect(screen.getByRole("heading", { name: "konai" })).toBeInTheDocument();
  });

  it("部屋パネルと電球カードを設定の表示名で描画する", async () => {
    await renderApp();
    expect(screen.getByRole("region", { name: "リビング" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "デスク" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "天井ライト" })).toHaveTextContent("点灯 · 100%");
    expect(screen.getByRole("button", { name: "デスクライト" })).toHaveTextContent("消灯");
    expect(screen.getByText("1 / 2 点灯")).toBeInTheDocument();
  });

  it("カードのタップで PUT { state: OFF } が飛び、表示が「消灯」になる", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "天井ライト" }));
    await flush();
    expect(api.calls.filter((c) => c.method === "setLightState")).toEqual([
      { method: "setLightState", name: "living1", command: { state: "OFF" } },
    ]);
    expect(screen.getByRole("button", { name: "天井ライト" })).toHaveTextContent("消灯");
  });

  it("「の明るさ」でシートが開き、スライダーの change で { brightness: 127 } が飛ぶ", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "デスクライト の明るさ" }));
    const dialog = screen.getByRole("dialog", { name: "デスクライト" });
    expect(dialog).toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider", { name: "明るさ" }), { target: { value: "50" } });
    await flush();
    expect(api.calls.at(-1)).toEqual({ method: "setLightState", name: "desk", command: { brightness: 127 } });
    expect(screen.getByRole("button", { name: "デスクライト" })).toHaveTextContent("点灯 · 50%");
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("すべての照明で全消灯", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("switch", { name: "すべての照明" }));
    await flush();
    const sent = api.calls.filter((c) => c.method === "setLightState").map((c) => c.command);
    expect(sent).toEqual([{ state: "OFF" }, { state: "OFF" }]);
    expect(screen.getByText("0 / 2 点灯")).toBeInTheDocument();
  });

  it("DEVICE_TIMEOUT でカードに「応答なし」", async () => {
    await renderApp();
    api.failNext("DEVICE_TIMEOUT");
    fireEvent.click(screen.getByRole("button", { name: "天井ライト" }));
    await flush();
    expect(screen.getByRole("button", { name: "天井ライト" })).toHaveTextContent("応答なし");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("MQTT_UNAVAILABLE でヘッダーに通知が出て全カードが無効", async () => {
    await renderApp();
    api.failNext("MQTT_UNAVAILABLE");
    fireEvent.click(screen.getByRole("button", { name: "天井ライト" }));
    await flush();
    expect(screen.getByRole("status")).toHaveTextContent("サーバが電球と通信できません");
    expect(screen.getByRole("button", { name: "天井ライト" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "デスクライト" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "すべての照明" })).toBeDisabled();
  });

  it("電球が 0 個なら「電球が登録されていません」", async () => {
    await renderApp([]);
    expect(screen.getByText("電球が登録されていません")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "すべての照明" })).toBeDisabled();
  });
});
