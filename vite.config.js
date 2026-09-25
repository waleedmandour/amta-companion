import { defineConfig } from "vite";

// Tauri expects a fixed dev port; failing fast on a busy port avoids
// confusing "devUrl mismatch" errors later.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2021" }
});
