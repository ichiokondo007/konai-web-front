import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Connection } from "../state/lightsReducer";
import { Header } from "./Header";

describe("Header", () => {
  it("アプリ名を見出しで表示する", () => {
    render(<Header connection="ok" />);
    expect(screen.getByRole("heading", { name: "konai" })).toBeInTheDocument();
  });

  it("アプリ名の右にアイコン画像を置く(装飾なので alt は空)", () => {
    render(<Header connection="ok" />);
    const heading = screen.getByRole("heading", { name: "konai" });
    const img = heading.parentElement?.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "/konai.png");
    expect(img).toHaveAttribute("alt", "");
    expect(heading.compareDocumentPosition(img as Element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    ["unreachable", "サーバに接続できません"],
    ["degraded", "サーバが電球と通信できません"],
  ] as const)("%s のとき status に「%s」", (connection: Connection, message: string) => {
    render(<Header connection={connection} />);
    expect(screen.getByRole("status")).toHaveTextContent(message);
  });

  it("ok のとき status を出さない", () => {
    render(<Header connection="ok" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
