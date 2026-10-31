import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyEntry, type LightEntry, type LightView } from "../state/selectors";
import { LightCard } from "./LightCard";
import { statusText } from "./statusText";

const on: LightEntry = { ...emptyEntry, state: "ON", brightness: 178, updatedAt: "t" };
const light: LightView = { name: "living1", label: "天井ライト", entry: on };

describe("statusText", () => {
  it.each<[string, LightEntry, string]>([
    ["送信中", { ...on, pending: true }, "送信中…"],
    ["応答なし", { ...on, error: "DEVICE_TIMEOUT" }, "応答なし"],
    ["その他のエラー", { ...on, error: "LIGHT_NOT_FOUND" }, "エラー"],
    ["未取得", emptyEntry, "取得中…"],
    ["消灯", { ...on, state: "OFF" }, "消灯"],
    ["点灯 + 明るさ", on, "点灯 · 70%"],
    ["点灯 + 明るさ不明", { ...on, brightness: null }, "点灯"],
  ])("%s", (_label, entry, expected) => {
    expect(statusText(entry)).toBe(expected);
  });

  it("送信中はエラーより優先する", () => {
    expect(statusText({ ...on, pending: true, error: "DEVICE_TIMEOUT" })).toBe("送信中…");
  });
});

describe("LightCard", () => {
  it("表示名と状態行を描画し、タップで onTap", async () => {
    const onTap = vi.fn();
    render(<LightCard light={light} disabled={false} onTap={onTap} onMore={() => {}} />);
    const body = screen.getByRole("button", { name: "天井ライト" });
    expect(body).toHaveTextContent("点灯 · 70%");
    await userEvent.click(body);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("pending 中は本体が disabled で onTap が呼ばれない", async () => {
    const onTap = vi.fn();
    render(
      <LightCard light={{ ...light, entry: { ...on, pending: true } }} disabled={false} onTap={onTap} onMore={() => {}} />,
    );
    const body = screen.getByRole("button", { name: "天井ライト" });
    expect(body).toBeDisabled();
    await userEvent.click(body);
    expect(onTap).not.toHaveBeenCalled();
  });

  it("disabled 指定でも本体が押せない", () => {
    render(<LightCard light={light} disabled={true} onTap={() => {}} onMore={() => {}} />);
    expect(screen.getByRole("button", { name: "天井ライト" })).toBeDisabled();
  });

  it("「の明るさ」ボタンで onMore", async () => {
    const onMore = vi.fn();
    render(<LightCard light={light} disabled={false} onTap={() => {}} onMore={onMore} />);
    await userEvent.click(screen.getByRole("button", { name: "天井ライト の明るさ" }));
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it("error が応答なしのときも本体は押せる", () => {
    render(
      <LightCard
        light={{ ...light, entry: { ...on, error: "DEVICE_TIMEOUT" } }}
        disabled={false}
        onTap={() => {}}
        onMore={() => {}}
      />,
    );
    const body = screen.getByRole("button", { name: "天井ライト" });
    expect(body).toBeEnabled();
    expect(body).toHaveTextContent("応答なし");
  });
});
