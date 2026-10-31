import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Connection } from "../state/lightsReducer";
import { Header } from "./Header";

describe("Header", () => {
  it("アプリ名を見出しで表示する", () => {
    render(<Header connection="ok" />);
    expect(screen.getByRole("heading", { name: "konai" })).toBeInTheDocument();
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
