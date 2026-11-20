import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
const base = process.env.PAGES_BASE_PATH || "/";
export default defineConfig({
  base,
  plugins: [
    react(),
    tailwind(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "مِقدر",
        short_name: "مِقدر",
        lang: "ar",
        dir: "rtl",
        description: "السعرات والماكروز، ببساطة",
        theme_color: "#0b1515",
        background_color: "#0b1515",
        display: "standalone",
        start_url: base,
        scope: base,
        icons: [
          { src: `${base}icon-192.png`, sizes: "192x192", type: "image/png" },
          {
            src: `${base}icon-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api/],
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
      },
    }),
  ],
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore"],
        },
      },
    },
  },
});
