import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const restProxy = {
  "/qore-rest": {
    target: "https://api-testnet.qore.host",
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/qore-rest/, ""),
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { fs: { allow: [".."] }, proxy: restProxy },
  preview: { proxy: restProxy },
  build: { target: "es2022", sourcemap: false },
});
