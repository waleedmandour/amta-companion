import { defineConfig } from "vite";

// Tauri expects a fixed dev port; failing fast on a busy port avoids
// confusing "devUrl mismatch" errors later.
export default defineConfig({
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_ENV_"],
  server: { port: 1420, strictPort: true },
  build: {
    // The frontend must compile for the OLDEST bundled WebView (Tauri
    // template guidance): chrome105 for Windows, safari13 elsewhere.
    // es2021 would emit logical-assignment ops Safari 13 cannot parse.
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG
  }
});
