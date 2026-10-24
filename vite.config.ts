import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/.secrets/**",
        "**/[Cc]redentials*.json",
        "**/client_secret*.json",
      ],
    },
    allowedHosts: ["app.ca77group.org"],
    proxy: { "/api": "http://127.0.0.1:3002" },
  },
  build: { chunkSizeWarningLimit: 900 },
});
