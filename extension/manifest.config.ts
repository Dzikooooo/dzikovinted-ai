import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

// host_permissions limite a vinted.fr, externally_connectable limite a
// l'app en dev (localhost:5173, app pas encore deployee).
// "tabs"/"scripting" ajoutees pour la Phase 3.1 (publication) : le
// background doit pouvoir ouvrir un onglet vinted.fr/items/new et lui
// envoyer une commande (chrome.tabs.create/sendMessage) - absentes avant
// cette phase car rien n'ouvrait d'onglet, voir EXTENSION.md.
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
  permissions: ["storage", "alarms", "tabs", "scripting"],
  host_permissions: ["https://www.vinted.fr/*"],
  externally_connectable: {
    matches: ["http://localhost:5173/*"],
  },
  content_scripts: [
    {
      matches: ["https://www.vinted.fr/member/*"],
      js: ["src/content/vinted-profile.ts"],
      run_at: "document_idle",
    },
    {
      matches: ["https://www.vinted.fr/items/new*"],
      js: ["src/content/vinted-publish.ts"],
      run_at: "document_idle",
    },
  ],
});
