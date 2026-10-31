import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AllLightsCard } from "./AllLightsCard";

describe("AllLightsCard", () => {
  it("点灯数を表示し aria-checked が anyOn", () => {
    render(<AllLightsCard summary={{ on: 1, total: 2, anyOn: true }} disabled={false} onToggle={() => {}} />);
    const sw = screen.getByRole("switch", { name: "すべての照明" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("1 / 2 点灯")).toBeInTheDocument();
  });

  it("全消灯なら aria-checked が false", () => {
    render(<AllLightsCard summary={{ on: 0, total: 2, anyOn: false }} disabled={false} onToggle={() => {}} />);
    expect(screen.getByRole("switch", { name: "すべての照明" })).toHaveAttribute("aria-checked", "false");
  });

  it("クリックで onToggle", async () => {
    const onToggle = vi.fn();
    render(<AllLightsCard summary={{ on: 1, total: 2, anyOn: true }} disabled={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("switch", { name: "すべての照明" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("disabled では押せない", () => {
    render(<AllLightsCard summary={{ on: 1, total: 2, anyOn: true }} disabled={true} onToggle={() => {}} />);
    expect(screen.getByRole("switch", { name: "すべての照明" })).toBeDisabled();
  });

  it("total が 0 では押せない", () => {
    render(<AllLightsCard summary={{ on: 0, total: 0, anyOn: false }} disabled={false} onToggle={() => {}} />);
    expect(screen.getByRole("switch", { name: "すべての照明" })).toBeDisabled();
    expect(screen.getByText("0 / 0 点灯")).toBeInTheDocument();
  });
});
