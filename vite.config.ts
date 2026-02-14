import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "capture",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/channels": "http://localhost:8787",
      "/pair": "http://localhost:8787",
      "/messages": "http://localhost:8787",
      "/api": "http://localhost:8787",
    },
  },
});
