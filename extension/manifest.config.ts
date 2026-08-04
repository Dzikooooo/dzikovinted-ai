import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

// host_permissions limite a vinted.fr.
// "tabs"/"scripting" ajoutees pour la Phase 3.1 (publication) : le
// background doit pouvoir ouvrir un onglet vinted.fr/items/new et lui
// envoyer une commande (chrome.tabs.create/sendMessage) - absentes avant
// cette phase car rien n'ouvrait d'onglet, voir EXTENSION.md.
//
// BUG REEL trouve et corrige le 2026-07-13 (diagnostic "Extension non
// appairee" au premier import reel) : externally_connectable.matches ne
// listait QUE localhost:5173 alors que l'app est deployee depuis plusieurs
// jours sur https://dzikovinted-ai.vercel.app. Toute tentative de PAIR/PING
// envoyee par l'app REELLEMENT utilisee (Vercel) etait donc silencieusement
// rejetee par Chrome avant meme d'atteindre onMessageExternal (le
// commentaire d'origine, "app pas encore deployee", n'a jamais ete mis a
// jour). Si un appairage anterieur (fait sur localhost pendant le
// developpement) existait encore en storage, tout continuait a fonctionner
// jusqu'a ce que son propre cycle de rafraichissement echoue une seule
// fois -- apres quoi plus aucun re-appairage n'etait possible depuis
// l'app reellement utilisee. Les deux origines sont maintenant listees.
//
// MEME BUG, MEME CAUSE, recidive le 2026-08-04 : le domaine personnalise
// resellosapp.com / www.resellosapp.com a ete rattache au projet Vercel
// (voir alias `vercel alias ls`) sans jamais etre ajoute ici. Chrome
// applique cette liste AVANT que le message n'atteigne onMessageExternal --
// aucune trace cote extension (ni logger, ni service worker console),
// chrome.runtime.sendMessage echoue juste avec un lastError "Could not
// establish connection", strictement indiscernable d'une extension non
// installee. C'est ce qui produisait "Extension Chrome non detectee" alors
// que l'extension etait bel et bien installee et fonctionnelle -- diagnostic
// pre-beta 2026-08-04. Toute future migration de domaine DOIT mettre a jour
// cette liste en meme temps que le rattachement DNS/Vercel, jamais apres.
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
  // "alarms" retiree (2026-07-23, revue de coherence) : jamais utilisee par
  // aucun code de l'extension (grep exhaustif de chrome.alarms/alarms.* sur
  // extension/src/, aucun resultat) -- une permission Chrome non justifiee
  // est un risque et une confusion pour rien.
  //
  permissions: ["storage", "tabs", "scripting"],
  host_permissions: ["https://www.vinted.fr/*"],
  externally_connectable: {
    matches: [
      "http://localhost:5173/*",
      "https://dzikovinted-ai.vercel.app/*",
      "https://resellosapp.com/*",
      "https://www.resellosapp.com/*",
    ],
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
    {
      // Fiche d'une annonce existante (import intelligent, sprint V1) --
      // exclude_matches ecarte /items/new* deja pris en charge par le
      // content script de creation ci-dessus, et /items/*/edit pris en
      // charge par le content script de modification ci-dessous.
      matches: ["https://www.vinted.fr/items/*"],
      exclude_matches: ["https://www.vinted.fr/items/new*", "https://www.vinted.fr/items/*/edit*"],
      js: ["src/content/vinted-item.ts"],
      run_at: "document_idle",
    },
    {
      // Modification d'une annonce existante (sprint V1, Partie 4). Voir
      // le commentaire d'en-tete de vinted-edit.ts pour la decision
      // d'architecture (clic manuel de l'utilisateur, route de sauvegarde
      // Vinted protegee par un anti-bot -- pas d'automatisation silencieuse
      // pour l'instant).
      matches: ["https://www.vinted.fr/items/*/edit*"],
      js: ["src/content/vinted-edit.ts"],
      run_at: "document_idle",
    },
  ],
});
