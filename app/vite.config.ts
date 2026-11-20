import { defineConfig } from "vite";

// Config pensada para o Tauri: porta fixa e build enxuto.
export default defineConfig({
  clearScreen: false,
  server: { port: 5173, strictPort: true, host: "127.0.0.1" },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: ["es2022", "safari15"],
    chunkSizeWarningLimit: 1500,
  },
});
