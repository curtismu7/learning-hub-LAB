import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: the hub API runs on :4600 (npm run dev -w server).
export default defineConfig({
  plugins: [react()],
  server: { port: 4601, proxy: { "/api": { target: "http://127.0.0.1:4600" } } },
  test: { environment: "jsdom", globals: true, testTimeout: 20000, setupFiles: "./src/testSetup.js" },
});
