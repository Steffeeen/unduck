import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Unduck",
        short_name: "Unduck",
        theme_color: "#131313",
        background_color: "#131313",
        icons: [{ src: "/search.svg", sizes: "any", type: "image/svg+xml" }],
      },
      includeAssets: ["*.svg"],
      workbox: {
        globIgnores: ["**/bangs/**"],
        navigateFallbackAllowlist: [/^\/(?:\?|$)/, /^\/list\/?(?:\?|$)/],
      },
    }),
  ],
});
