import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// globals: false のため RTL の自動 cleanup が登録されない。明示的に登録する
afterEach(() => {
  cleanup();
});
