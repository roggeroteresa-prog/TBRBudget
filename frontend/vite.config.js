import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serve il sito da un sottopercorso (https://<utente>.github.io/<repo>/),
// quindi il base path va impostato solo in fase di build, non nel dev server locale.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/TBRBudget/" : "/",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
}));