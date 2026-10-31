import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyEntry, type RoomView } from "../state/selectors";
import { RoomPanel } from "./RoomPanel";

const room: RoomView = {
  id: "living",
  name: "リビング",
  icon: "sofa",
  lights: [
    { name: "living1", label: "天井ライト", entry: { ...emptyEntry, state: "ON", brightness: 254, updatedAt: "t" } },
    { name: "living2", label: "フロア", entry: { ...emptyEntry, state: "OFF", updatedAt: "t" } },
  ],
};

describe("RoomPanel", () => {
  it("部屋名と電球カードを描画し、onTap / onMore に電球名を渡す", async () => {
    const onTap = vi.fn();
    const onMore = vi.fn();
    render(<RoomPanel room={room} disabled={false} onTap={onTap} onMore={onMore} />);
    const section = screen.getByRole("region", { name: "リビング" });
    expect(within(section).getAllByRole("button")).toHaveLength(4);
    await userEvent.click(within(section).getByRole("button", { name: "フロア" }));
    expect(onTap).toHaveBeenCalledWith("living2");
    await userEvent.click(within(section).getByRole("button", { name: "天井ライト の明るさ" }));
    expect(onMore).toHaveBeenCalledWith("living1");
  });

  it("disabled を各カードに伝える", () => {
    render(<RoomPanel room={room} disabled={true} onTap={() => {}} onMore={() => {}} />);
    expect(screen.getByRole("button", { name: "天井ライト" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "フロア" })).toBeDisabled();
  });
});
