import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

// Portee volontairement minimale (etape 1.1 du plan Phase 1 - appairage uniquement) :
// pas de permission "tabs" (rien n'ouvre d'onglet), host_permissions limite a vinted.fr,
// externally_connectable limite a l'app en dev (localhost:5173, app pas encore deployee).
export default defineManifest({
  manifest_version: 3,
  name: "ResellOS pour Vinted",
  description: "Connecte ton compte Vinted a ResellOS.",
  version: pkg.version,
  icons: {
    16: "public/icons/icon16.png",
    48: "public/icons/icon48.png",
    128: "public/icons/icon128.png",
  },
  action: {
    default_popup: "src/popup/index.html",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  permissions: ["storage", "alarms"],
  host_permissions: ["https://www.vinted.fr/*"],
  externally_connectable: {
    matches: ["http://localhost:5173/*"],
  },
});
