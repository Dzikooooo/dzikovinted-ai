// Mission "ROUND SUIVANT -- POC DIAGNOSTIQUE DIRECT DU BOUTON AJOUTER"
// (2026-08-19). L'audit precedent a etabli que le blocage isTrusted/DataDome
// connu (route de sauvegarde d'edition, meme SAVE_BUTTON_SELECTOR) n'a JAMAIS
// ete teste directement sur le bouton "Ajouter" (creation) lui-meme --
// seulement extrapole par similarite de composant. Ce module leve cette
// inconnue avec le plus petit test live possible, sans jamais tenter de
// contourner quoi que ce soit : UNE tentative, EXPLICITEMENT declenchee,
// utilisant la MEME methode synthetique deja standard dans ce projet
// (dispatchFullClick -- reutilisee TELLE QUELLE, jamais une nouvelle
// technique visant a paraitre "plus humaine").
//
// ISOLATION (demande explicite : "impossible de lancer le POC
// involontairement") :
//  1. Le point d'entree n'est attache a `window` que derriere
//     `import.meta.env.MODE !== "beta"` -- MEME detection que
//     manifest.config.ts::buildExternallyConnectableMatches (vite.config.ts
//     passe `mode === "beta"` a buildManifest(), le seul autre endroit du
//     projet qui distingue deja "ce qu'un beta-testeur/utilisateur reel
//     recoit" de "ce que le developpeur utilise en local"). Mission
//     "ROUND SUIVANT -- ACTIVER LE POC EN BUILD LOCALE" (2026-08-19) :
//     l'ancien gate `import.meta.env.DEV` exigeait `npm run dev` (serveur
//     Vite local), obligeant a une seconde installation d'extension --
//     jamais ce que l'utilisateur veut pour un simple `npm run build` +
//     rechargement de son extension deja chargee. Le seul build reellement
//     distribue a un beta-testeur/utilisateur est `npm run build:beta`
//     (`--mode beta`) : c'est LUI, et uniquement lui, qui doit ne jamais
//     exposer ce point d'entree. `npm run build` (mode "production" par
//     defaut, workflow local habituel du developpeur) et `npm run dev`
//     (mode "development") l'exposent tous les deux desormais.
//     Verifie directement dans le bundle produit : le corps de la fonction
//     reste techniquement present dans le fichier (le bundler ne l'elague
//     pas), mais la condition qui l'expose sur `window` est figee au
//     litteral correspondant au mode de build -- `false` uniquement pour
//     `--mode beta`.
//  2. Rien n'invoque ce POC automatiquement, quel que soit le mode : ce
//     fichier expose uniquement `window.__resellosRunPublishSyntheticClickPoc()`,
//     un point d'entree qui n'existe QUE dans le contexte JS ISOLATED du
//     content script -- il faut ouvrir les DevTools sur l'onglet /items/new,
//     selectionner explicitement ce contexte dans le selecteur de contexte de
//     la console (jamais le contexte "top" par defaut), puis appeler la
//     fonction a la main. Aucun bouton UI, aucun raccourci, aucune commande
//     ResellOS normale (RUN_ACTION, PUBLISH_LISTING, etc.) ne mene ici --
//     grep exhaustif confirme que `runSyntheticClickTestOnce` n'a qu'UN
//     SEUL appelant dans tout ce fichier, la fonction retournee par
//     `initPublishSyntheticClickPoc` et assignee a `window`.
//  3. Une seule tentative par instance de document (`pocAttempted`, jamais
//     reinitialise sauf vraie navigation qui recree un document/realm neuf)
//     -- un second appel est refuse et journalise, jamais rejoue.
//  4. Refuse de s'executer tant que la readiness n'est pas CONFIRMEE STABLE
//     (le meme signal, deja valide sur 750ms continu, qui declenche
//     PUBLISH_READY_TO_SUBMIT -- voir publishReadiness.ts, jamais une
//     nouvelle logique de lecture d'etat).
//
// PORTEE VOLONTAIREMENT MINIMALE : ce module ne touche a rien d'autre --
// aucune ecriture sur le prix/package size/photos, aucune interaction avec
// republishTransaction.ts ou le scheduler (inexistant a ce jour), aucune
// modification de deleteOldListing.ts/vinted-item.ts. Il se contente
// d'observer un unique clic synthetique deja standard sur un bouton deja
// preexistant.
//
// x-datadome : chrome.webRequest (seule API capable de lire des en-tetes de
// reponse) n'existe PAS dans un content script -- uniquement en background.
// publishMutationInstrumentation.ts (deja installe en permanence, voir
// background/index.ts) journalise DEJA ce header en clair (jamais redige,
// voir webRequestRedaction.ts) pour toute mutation /api/v2/*, y compris
// celle-ci si elle part. Plutot que d'ajouter un nouveau canal de messages
// pour correler automatiquement (hors du perimetre "plus petit test
// possible" demande), ce POC journalise honnetement `datadomeObserved: null`
// et pointe explicitement vers ce log deja existant -- voir la procedure de
// test live fournie a l'utilisateur.

import { PRICE_INPUT_SELECTOR, SAVE_BUTTON_SELECTOR } from "./publishSelectors";
import { describeActiveElement, dispatchFullClick, type PriceValidationState } from "./formFill";
import { PUBLISH_CREATE_RESPONSE_EVENT_NAME, type PublishCreateResponseCapture } from "./publishCreateResponseCapture";

export interface SyntheticClickPocButtonState {
  found: boolean;
  disabled: boolean | null;
  ariaDisabled: string | null;
}

export interface PublishSyntheticClickPocDeps {
  isReadinessConfirmed: () => boolean;
  describeButtonState: () => SyntheticClickPocButtonState;
  // Mission "ROUND SUIVANT -- AUDIT FOCUS PRIX" (2026-08-19) : reutilise TEL
  // QUEL checkPriceState()/describePriceValidationState() deja existant
  // (publishReadiness.ts/formFill.ts) -- jamais une nouvelle logique de
  // lecture d'etat prix.
  describePriceState: () => PriceValidationState;
  log: {
    info: (message: string, detail?: Record<string, unknown>) => void;
    warn: (message: string, detail?: Record<string, unknown>) => void;
  };
}

// Purement diagnostique -- lecture de document.activeElement uniquement,
// jamais une comparaison figee (re-resout le champ prix fraichement a
// chaque appel, meme discipline que le reste de ce module).
function isPriceFieldActiveElement(): boolean {
  return document.activeElement === document.querySelector(PRICE_INPUT_SELECTOR);
}

// Meme ordre de grandeur que DEFAULT_TIMEOUT_MS (domWait.ts) -- large marge
// pour un vrai aller-retour reseau, jamais un delai technique court.
export const SYNTHETIC_CLICK_TEST_WAIT_MS = 8000;

const SYNTHETIC_METHOD_DESCRIPTION =
  "dispatchFullClick (pointerdown->mousedown->pointerup->mouseup->click, bubbles:true) -- methode synthetique deja standard dans ce projet (formFill.ts), aucune nouvelle technique tentee";

let pocAttempted = false;

// Exportee pour testabilite/reinitialisation entre tests -- jamais appelee
// par un vrai flow (une vraie navigation recree de toute facon un document
// neuf, donc un nouveau realm avec pocAttempted=false naturellement).
export function resetPublishSyntheticClickPocForTests(): void {
  pocAttempted = false;
}

async function runSyntheticClickTestOnce(deps: PublishSyntheticClickPocDeps): Promise<void> {
  if (pocAttempted) {
    deps.log.warn("PUBLISH_SYNTHETIC_CLICK_TEST_ALREADY_ATTEMPTED", {
      reason: "une tentative a deja eu lieu dans ce document -- jamais rejouee automatiquement, recharger la page pour retenter",
    });
    return;
  }
  if (!deps.isReadinessConfirmed()) {
    deps.log.warn("PUBLISH_SYNTHETIC_CLICK_TEST_BLOCKED_NOT_READY", {
      reason: "readiness pas encore confirmee stable (PUBLISH_READY_TO_SUBMIT jamais envoye dans ce document) -- POC refuse de s'executer",
    });
    return;
  }
  // Verrouillage synchrone AVANT tout travail asynchrone -- un double appel
  // rapproche (ex. deux fois la meme commande console) ne peut pas passer
  // cette garde deux fois.
  pocAttempted = true;

  const buttonState = deps.describeButtonState();
  deps.log.info("PUBLISH_SYNTHETIC_CLICK_TEST_STARTED", {
    buttonFound: buttonState.found,
    disabled: buttonState.disabled,
    ariaDisabled: buttonState.ariaDisabled,
    readinessStable: true,
    syntheticMethod: SYNTHETIC_METHOD_DESCRIPTION,
    // Mission "ROUND SUIVANT -- AUDIT FOCUS PRIX" (2026-08-19) : instantane
    // purement diagnostique juste avant le clic synthetique -- reutilise TEL
    // QUEL describePriceValidationState() (formFill.ts), aucune nouvelle
    // logique de lecture d'etat prix.
    activeElementIsPriceField: isPriceFieldActiveElement(),
    activeElementDescription: describeActiveElement(),
    priceState: deps.describePriceState(),
  });

  const btn = document.querySelector<HTMLButtonElement>(SAVE_BUTTON_SELECTOR);
  if (!buttonState.found || !btn) {
    deps.log.warn("PUBLISH_SYNTHETIC_CLICK_TEST_RESULT", {
      requestObserved: false,
      creationSucceeded: false,
      datadomeObserved: null,
      reason: "bouton introuvable au moment du declenchement -- aucune tentative de clic",
    });
    return;
  }

  let documentClickReceived = false;
  let clickIsTrustedObserved: boolean | null = null;
  function onDocumentClick(e: MouseEvent): void {
    documentClickReceived = true;
    clickIsTrustedObserved = e.isTrusted;
  }
  document.addEventListener("click", onDocumentClick, true);

  // Holder objet plutot qu'un `let` reassigne dans la closure -- evite un
  // faux-positif de narrowing TypeScript (le controle de flux ne suit pas
  // toujours une reassignation faite depuis un callback passe a
  // addEventListener, meme si elle survient reellement avant la lecture).
  const captureHolder: { value: PublishCreateResponseCapture | null } = { value: null };
  function onCreateResponse(event: Event): void {
    captureHolder.value = (event as CustomEvent<PublishCreateResponseCapture>).detail;
  }
  document.addEventListener(PUBLISH_CREATE_RESPONSE_EVENT_NAME, onCreateResponse);

  const hrefBeforeClick = location.href;

  dispatchFullClick(btn);

  await new Promise<void>((resolve) => setTimeout(resolve, SYNTHETIC_CLICK_TEST_WAIT_MS));

  document.removeEventListener("click", onDocumentClick, true);
  document.removeEventListener(PUBLISH_CREATE_RESPONSE_EVENT_NAME, onCreateResponse);

  const capture = captureHolder.value;
  deps.log.info("PUBLISH_SYNTHETIC_CLICK_TEST_RESULT", {
    documentClickReceived,
    clickIsTrustedObserved,
    requestObserved: capture !== null,
    creationSucceeded: capture?.ok ?? false,
    statusCode: capture?.statusCode ?? null,
    // Toujours null ici par construction (voir en-tete du fichier) --
    // cross-check manuel requis dans la console du SERVICE WORKER,
    // "PUBLISH_MUTATION_REQUEST_CAPTURED", header "x-datadome".
    datadomeObserved: null,
    navigatedAway: location.href !== hrefBeforeClick,
    finalHref: location.href,
  });
}

// Mission "ROUND SUIVANT -- AUDIT FOCUS PRIX" (2026-08-19) : listener passif
// (jamais preventDefault/stopPropagation, ne modifie jamais l'evenement ni
// n'interfere avec le flow reel) qui capture l'etat EXACT juste avant que le
// PREMIER clic humain reel (isTrusted:true) sur "Ajouter" ne soit traite --
// permet de comparer directement avec l'instantane du clic synthetique
// ci-dessus (memes champs). INDEPENDANT de runSyntheticClickTestOnce() : ce
// listener tourne des l'activation du POC (meme garde MODE !== "beta"),
// que le POC synthetique ait ete declenche ou non, et n'est jamais retire
// tant qu'aucun clic reel n'est survenu (ce n'est pas une fuite : il attend
// indefiniment un evenement qui peut survenir a tout moment de la session).
// Meme pattern de re-resolution fraiche que watchAndHighlightSaveButton()
// (publishReadinessHighlight.ts) -- jamais une reference figee.
function installHumanClickDiagnostic(deps: PublishSyntheticClickPocDeps): void {
  let fired = false;
  function onClick(e: MouseEvent): void {
    if (!e.isTrusted || fired) return;
    const btn = document.querySelector<HTMLButtonElement>(SAVE_BUTTON_SELECTOR);
    const target = e.target as Node | null;
    if (!btn || !target || !btn.contains(target)) return;
    fired = true;
    document.removeEventListener("click", onClick, true);
    deps.log.info("PUBLISH_HUMAN_CLICK_DIAGNOSTIC", {
      activeElementIsPriceField: isPriceFieldActiveElement(),
      activeElementDescription: describeActiveElement(),
      priceState: deps.describePriceState(),
    });
  }
  document.addEventListener("click", onClick, true);
}

// Point d'entree unique. `isEnabled` par defaut lit le mode Vite reel --
// jamais override par un appelant reel, seuls les tests passent une valeur
// explicite pour verifier les deux branches sans dependre de la config Vite
// globale. `!== "beta"` (et non `=== "development"`) : couvre a la fois
// `npm run dev` (mode "development") ET `npm run build` (mode "production"
// par defaut, le build local habituel du developpeur) -- seul
// `npm run build:beta` (le seul build reellement distribue a un
// beta-testeur/utilisateur, voir manifest.config.ts) reste exclu.
export function initPublishSyntheticClickPoc(
  deps: PublishSyntheticClickPocDeps,
  isEnabled: boolean = import.meta.env.MODE !== "beta"
): void {
  if (!isEnabled) return;
  installHumanClickDiagnostic(deps);
  (window as unknown as { __resellosRunPublishSyntheticClickPoc?: () => void }).__resellosRunPublishSyntheticClickPoc =
    () => void runSyntheticClickTestOnce(deps);
}
