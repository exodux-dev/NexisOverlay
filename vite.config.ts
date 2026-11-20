/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed dev port and does not want Vite to clear its logs.
export default defineConfig({
  plugins: [react()],
  // Build identity (CI sets GITHUB_SHA) — used for the "update available" check.
  define: {
    __BUILD_SHA__: JSON.stringify(process.env.GITHUB_SHA ?? "dev"),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  build: { target: "es2022", outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 900 },
  test: { environment: "node" },
});
