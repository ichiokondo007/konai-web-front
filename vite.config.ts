import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// 開発時のみ: /api → API サーバ(既定は localhost:3000、.env.local の VITE_DEV_API_URL で変更)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/api": {
          target: env.VITE_DEV_API_URL || "http://localhost:3000",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      // git worktree をリポジトリ内(.worktrees/)に作ると、その中のテストまで拾ってしまうため除外
      exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**"],
    },
  };
});
