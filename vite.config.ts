import "dotenv/config";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

/*
  Nitro turns the TanStack Start server into a deployable bundle.
  It auto-detects Vercel and Cloudflare Workers builds. To force a target,
  set NITRO_PRESET (e.g. "vercel" or "cloudflare_module") when building.

  tslib is bundled in on purpose. Otherwise Nitro copies the wrong tslib
  file into the Vercel function, and every request fails with a 500.
*/
export default defineConfig({
  server: {
    port: 3000
  },
  resolve: {
    tsconfigPaths: true
  },
  plugins: [tanstackStart(), viteReact(), nitro({ noExternals: ["tslib"] }), tailwindcss()]
});
