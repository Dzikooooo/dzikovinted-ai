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
// Distribution beta (2026-08-10, packaging ZIP pour beta-testeurs externes) :
// le build local (npm run build, mode par defaut) doit continuer a inclure
// localhost:5173 pour le dev quotidien -- seul le build beta dedie
// (npm run build:beta, --mode beta, voir vite.config.ts) doit le retirer.
// Une seule liste, calculee une fois, plutot que deux manifestes dupliques
// a maintenir en parallele (risque de recidive du bug documente ci-dessous
// si les deux listes divergent).
//
// RAPPEL CRITIQUE (audit securite, 2026-08-28) : `npm run build` (mode par
// defaut) INCLUT localhost:5173 dans externally_connectable -- correct pour
// le dev quotidien, mais dangereux pour tout ce qui quitte cette machine.
// `npm run build:beta` / `npm run package:beta` sont deja la commande sure
// (localhost retire, voir buildExternallyConnectableMatches ci-dessous) --
// c'est aussi la commande a utiliser pour une future premiere soumission au
// Chrome Web Store, JAMAIS `npm run build` seul. Meme classe d'erreur que
// les deux incidents documentes ci-dessus (2026-07-13, 2026-08-04) : une
// liste de confiance qui n'est pas mise a jour au bon moment echoue de
// facon silencieuse, sans trace cote extension.
function buildExternallyConnectableMatches(isBeta: boolean): string[] {
  const matches = [
    "https://dzikovinted-ai.vercel.app/*",
    "https://resellosapp.com/*",
    "https://www.resellosapp.com/*",
  ];
  if (!isBeta) matches.unshift("http://localhost:5173/*");
  return matches;
}

// ID d'extension instable corrige (2026-08-10, diagnostic bêta Albin) :
// une extension chargee via "Charger l'extension non empaquetee" SANS champ
// `key` obtient un ID calcule par Chrome a partir du CHEMIN ABSOLU du
// dossier -- donc un ID different par machine/emplacement (c'etait la cause
// exacte du "Extension Chrome non detectee" : le SaaS attendait l'ID genere
// sur la machine de dev, jamais celui d'Albin). `key` = cle publique (PAS un
// secret -- elle finit de toute facon visible dans manifest.json de chaque
// copie distribuee) : Chrome calcule alors l'ID a partir de CETTE cle,
// identique pour tout le monde, sur toute machine, quel que soit le dossier
// d'installation. Meme cle utilisee pour tous les modes (dev/beta) : un seul
// ID a connaitre partout, pas de complexite dev/beta/prod a maintenir pour
// ce probleme precis (voir rapport du lot "correctif ID extension").
// Cle privee correspondante : extension/.beta-signing-key.pem (jamais
// commitee, voir .gitignore) -- generee par scripts/generate-signing-key.mjs
// (a lancer UNE SEULE FOIS, jamais en routine : relancer regeneres une cle
// ET donc un nouvel ID). Sans objet pour la premiere publication Chrome Web
// Store : Google assigne alors son propre ID final, independant de cette cle
// (mise a jour a faire une seule fois dans VITE_RESELLOS_EXTENSION_ID a ce
// moment-la -- non bloquant, deja documente dans .env.example).
const BETA_SIGNING_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAx2qRV6QvP1T0AFKlshX5YMqOzzg68Ze6uglmpNelS7i6xgM57b53uiOJwPsV+/ILpaQ0TupVbRbmH6FHA7PSFGul4659npVkJoFSDGTlNGPlNSVasxOpkTVL2S+IWl4x+q7y/4BcS9h5iMkBuYs8kek/PS+Rv2eMfedJ6Rjhsuz+zMpKNhKzl/t8jrPV3IXSzO8kYm8Ct9QYjmuzNLMFQ/urMivbtTqhUd4zXS2SuPzYgjqz44YuQNsX0dgO8KNOCXII2+u/lMDAUP31sLoLfvNmZUUJqlVIg0KSBMZC3Pbwjugqx5FzWZsJlcReZpJXsQj9aUlg786Za2WatvIRzwIDAQAB";

export function buildManifest(isBeta = false) {
  return defineManifest({
    manifest_version: 3,
    name: "ResellOS pour Vinted",
    description: "Connecte ton compte Vinted a ResellOS.",
    version: pkg.version,
    key: BETA_SIGNING_PUBLIC_KEY,
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
    // "alarms" retiree le 2026-07-23 (jamais utilisee a l'epoque), REINTRODUITE
    // le 2026-08-20 (mission "ROUND 3 -- CHROME.ALARMS UNIQUEMENT, REVEIL/LOG
    // SANS EXECUTION VINTED") : seul mecanisme MV3 capable de reveiller le
    // service worker a une heure future precise, y compris apres suspension
    // ou redemarrage du navigateur (voir republishScheduler.ts) -- necessaire
    // pour detecter automatiquement les programmations de republication
    // dues (republish_schedules, deja persistees en base depuis le round 2).
    // Jamais utilisee pour autre chose que ce planificateur.
    //
    // "webRequest" ajoutee (2026-08-17, mission "AUTOMATISER ENTIEREMENT LA
    // SUPPRESSION DE A") : uniquement pour observer en LECTURE SEULE (aucun
    // "blocking" dans extraInfoSpec) les headers/corps de
    // POST /api/v2/items/{id}/delete la prochaine fois qu'une suppression
    // reelle a lieu -- voir deleteRequestInstrumentation.ts. Necessaire pour
    // classer cette route (protegee par le service anti-bot comme les deux
    // autres mutations deja confirmees protegees, ou rejouable normalement)
    // sans deviner ni sacrifier une nouvelle annonce reelle juste pour lire
    // ces headers a la main.
    permissions: ["storage", "tabs", "scripting", "webRequest", "alarms"],
    // https://*.vinted.net/* (2026-08-10, audit "prefill partiel" -- CORS
    // confirme en test live sur images1.vinted.net) : le CDN photo de Vinted
    // est un domaine DISTINCT de vinted.fr et ne renvoie aucun header
    // Access-Control-Allow-Origin -- un fetch() depuis le content script
    // (soumis au CORS de la PAGE, vinted.fr) echoue toujours, quelle que
    // soit cette permission. host_permissions ne beneficie qu'aux fetch()
    // emis depuis un contexte D'EXTENSION (background/popup), jamais depuis
    // un content script -- c'est pourquoi le fetch des photos est deplace
    // dans handlePublishListing.ts (background), voir son commentaire.
    // Wildcard sur le sous-domaine (imagesN.vinted.net, sharding CDN
    // classique) plutot qu'un domaine unique code en dur -- toujours borne a
    // vinted.net, jamais un domaine tiers.
    host_permissions: ["https://www.vinted.fr/*", "https://*.vinted.net/*"],
    externally_connectable: {
      matches: buildExternallyConnectableMatches(isBeta),
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
      // Mission "AUTOMATISER ENTIEREMENT LA REPUBLICATION" (2026-08-17) :
      // instrumentation ciblee et TEMPORAIRE (voir
      // publishCreateResponseCapture.ts). MONDE MAIN + document_start est le
      // SEUL point d'injection assez tot pour patcher window.fetch/
      // XMLHttpRequest avant que le bundle JS de Vinted n'en capture sa
      // propre reference native -- la premiere version (injection tardive
      // via chrome.scripting.executeScript au tab "complete", voir
      // handlePublishListing.ts) n'a RIEN capture lors d'un test live reel
      // malgre une creation reussie (POST confirme 200 par
      // chrome.webRequest). Champ `world` supporte nativement par
      // content_scripts depuis Chrome 111 (MV3) -- aucune permission
      // supplementaire necessaire.
      matches: ["https://www.vinted.fr/items/new*"],
      js: ["src/content/publishCreateResponseCaptureBoot.ts"],
      world: "MAIN",
      run_at: "document_start",
    },
    {
      // Mission "ECRITURE DU PRIX EN MONDE MAIN" (2026-08-26) : le champ prix
      // est un composant React controle dont l'etat interne n'etait jamais
      // atteint depuis le monde ISOLE (voir priceMainWorldWriter.ts pour la
      // preuve live et la cause structurelle). MONDE MAIN requis pour voir le
      // vrai `_valueTracker` et l'override de `value` poses par React.
      // document_start pour la meme raison que la capture ci-dessus : garantir
      // que le listener est en place avant que le content script ISOLE
      // (document_idle) ne puisse emettre sa premiere demande.
      matches: ["https://www.vinted.fr/items/new*"],
      js: ["src/content/priceMainWorldWriterBoot.ts"],
      world: "MAIN",
      run_at: "document_start",
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
}
