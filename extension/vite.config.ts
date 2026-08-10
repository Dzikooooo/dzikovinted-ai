import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import { buildManifest } from "./manifest.config";

// mode === "beta" declenche via `vite build --mode beta` (script
// package.json::build:beta) -- seul ce mode retire localhost:5173 de
// externally_connectable (voir manifest.config.ts). Le mode par defaut
// (dev, et `npm run build` sans --mode) reste inchange pour ne pas casser
// le developpement local.
export default defineConfig(({ mode }) => ({
  plugins: [react(), crx({ manifest: buildManifest(mode === "beta") })],
  server: {
    port: 5175,
    strictPort: true,
    hmr: { port: 5175 },
  },
}));
