import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Set via VITE_BASE_PATH in CI for GitHub Pages subpath; defaults to "/" for local dev
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react()],
  resolve: {
    alias: {
      // Direct source alias — bypasses workspace symlinks on non-NTFS drives
      "@v4/engine": path.resolve(__dirname, "../../packages/engine/src/index.ts"),
    },
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["@v4/engine"],
  },
});
