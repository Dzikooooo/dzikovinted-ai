// Handler d'execution pour l'action "edit_listing" (Partie 4, sprint
// extension V1) -- miroir de handlePublishListing.ts (publish_listing),
// seule difference reelle : l'onglet s'ouvre sur la page d'edition de
// L'ARTICLE CIBLE (payload.vintedItemId) plutot que sur le formulaire de
// creation generique, et le content script attendu est vinted-edit.ts
// (commande EDIT_LISTING).
//
// CAUSE RACINE #1 demontree le 2026-07-15 (pipeline ResellOS -> Vinted
// n'atteignait jamais Vinted, symptome observe : "la page Vinted s'ouvre
// brievement puis disparait") : l'ancienne version envoyait la commande
// EDIT_LISTING via un retry aveugle a duree fixe. Corrige par un signal
// explicite (EDIT_TAB_READY, envoye par vinted-edit.ts des qu'il a
// enregistre son listener) -- voir commit precedent.
//
// CAUSE RACINE #2 demontree le meme jour, test suivant : EDIT_TAB_READY
// est desormais bien recu, mais l'envoi de EDIT_LISTING qui suit
// immediatement echoue avec "Could not establish connection. Receiving
// end does not exist." Preuve que le content script qui a envoye
// EDIT_TAB_READY n'existe deja plus au moment de la reponse -- coherent
// avec une navigation/redirection reelle de la page ENTRE l'envoi du
// signal et la reponse (le premier document qui s'injecte declarativement
// a document_idle n'est pas forcement le document final si Vinted
// redirige apres coup). Corrige par deux mecanismes complementaires :
// 1) l'echec d'un envoi n'est plus fatal -- le handler continue d'ecouter
//    un NOUVEL EDIT_TAB_READY (une eventuelle reinjection sur le document
//    final) plutot que d'abandonner immediatement ;
// 2) des que l'onglet atteint chrome.tabs.onUpdated status:"complete"
//    (navigation reellement terminee), le content script est reinjecte
//    EXPLICITEMENT via chrome.scripting.executeScript (fichiers lus
//    depuis le manifest genere, jamais code en dur) -- garantit une
//    instance vivante dans le document final, independamment de ce que
//    l'injection declarative a pu faire sur d'eventuels documents
//    intermediaires.
//
// CAUSE RACINE #3 demontree le 2026-07-16, test suivant (98 -> 97 euros) :
// "Vinted est toujours a 99 euros. ResellOS est revenu a 99 euros. aucun
// message d'erreur visible." Le predicat de "confirmation"
// (/\/items\/\d+/.test(location.pathname), cote vinted-edit.ts) n'etait
// pas ancre et matchait DEJA l'URL de depart /items/{id}/edit avant meme
// que le clic sur Enregistrer ait pu produire un effet -- un succes
// (PUBLISH_RESULT status:"success") etait donc rapporte quasi
// instantanement et inconditionnellement. Consequence en cascade : la
// ligne action_log/listing passait sync_success, ce qui la retirait de la
// protection "ne jamais ecraser silencieusement" (reservee a
// sync_pending/sync_failed cote recordListings/recordSingleItemImport) --
// la synchronisation passive suivante a donc legitimement re-importe la
// vraie valeur Vinted (99), ecrasant le 97 jamais reellement enregistre.
// Corrige en deux temps : (1) le predicat exclut desormais /edit ; (2) le
// pipeline edit_listing ne se termine plus jamais sur un simple clic --
// une PHASE DE VERIFICATION distincte est ajoutee ci-dessous : des que
// vinted-edit.ts rapporte EDIT_SAVE_SUBMITTED (clic + navigation hors
// /edit, PAS une preuve), ce handler renavigue EXPLICITEMENT l'onglet vers
// la MEME page d'edition (chrome.tabs.update), reutilise le mecanisme
// EDIT_TAB_READY deja fiable pour une seconde injection, puis envoie
// VERIFY_EDIT_FIELDS pour que le content script relise les valeurs REELLES
// des champs texte modifies (titre/description/prix) directement dans le
// DOM. Seul EDIT_VERIFICATION_RESULT determine desormais success/error --
// "preuve acceptable" #3 explicitement demandee par l'utilisateur
// ("rechargement de la page d'edition et lecture du champ prix egal a la
// valeur demandee"). Les champs d'attributs (categorie/marque/taille/
// etat/couleur/matiere) n'ont pas de mecanisme de relecture fiable
// equivalent -- limite documentee : si SEULS des attributs ont change
// (aucun champ verifiable dans changedFields), le succes est encore
// declare sur EDIT_SAVE_SUBMITTED, sans la garantie renforcee.

import { logger } from "../logger";
import { isContentReport } from "../../lib/messages";
import type {
  ContentCommand,
  EditListingPayload,
  PublishStep,
  RunActionOutcome,
  RunActionRequest,
  VerifyEditFieldsPayload,
} from "../../lib/messages";
import { errorMessage } from "../../lib/errorMessage";

type VerifiableField = "title" | "description" | "price";
function isVerifiableField(field: string): field is VerifiableField {
  return field === "title" || field === "description" || field === "price";
}

// Porte a 120000ms (2026-07-18) : les deux attentes de chargement de
// formulaire (vinted-edit.ts, FORM_FOUND + phase de verification) sont
// chacune plafonnees a 30000ms sur la base d'une mesure reelle (baseline
// ~8.8s, marge pour absorber la variance Vinted) -- le pire cas cumule
// (30s + ecriture + 20s d'attente de navigation apres clic + 30s de
// verification + tout l'overhead d'ouverture/injection d'onglet)
// approchait deja l'ancien plafond de 90s, qui n'etait plus une marge de
// securite mais un risque de faux echec par lui-meme. Ce plafond doit
// rester cense avec ACTION_TIMEOUT_MS cote app (useActionEngine.ts).
const GLOBAL_TIMEOUT_MS = 120000;
// Delai raisonnable pour qu'une vraie navigation de page + chargement d'un
// chunk JS dynamique se termine -- distinct et bien plus court que le
// timeout global (qui couvre en plus tout le remplissage/soumission).
const TAB_READY_TIMEOUT_MS = 30000;
// Accalmie (2026-07-20, cause racine #5) requise avant de forcer la
// renavigation de verification : evite d'interrompre la propre navigation
// client de Vinted encore en cours apres la sauvegarde (confirme provoquer
// une page d'erreur Vinted si on interfere trop tot). Reinitialise a CHAQUE
// evenement tab_updated reel -- ne retarde donc PAS les cas ou Vinted se
// stabilise plus vite ; valeur de depart raisonnable, pas une mesure
// precise comme les 30000ms ci-dessus -- a ajuster si un prochain test
// montre qu'elle est encore trop courte.
const NAVIGATION_SETTLE_DEBOUNCE_MS = 2000;

// CAUSE RACINE #6 demontree en test reel le 2026-07-22 (modification de
// titre) : la sauvegarde reussit reellement (titre visible sur l'annonce
// publique, avec un badge "Verification en cours") mais Vinted invalide
// /edit APRES coup pour ce type de champ -- la page renvoie une erreur
// generique des la renavigation de la phase de verification. Contrairement
// au prix (qui ne declenche jamais de revue Vinted, /edit reste toujours
// accessible), le mecanisme de relecture existant (relire un <input> dans
// le formulaire /edit) est structurellement inutilisable dans ce cas -- ce
// n'est pas un probleme de delai/course, la page n'existe plus du tout.
// Solution : relecture de secours via la page PUBLIQUE de l'annonce
// (/items/{id}), qui reste toujours accessible et affiche deja la valeur
// reelle (meme sous revue) via son bloc <script type="application/ld+json">
// -- deja verifie en direct le 2026-07-13 pour l'import (voir
// itemSelectors.ts::extractLdJsonProduct), duplique ici car
// chrome.scripting.executeScript({func}) exige une fonction totalement
// autonome (serialisee et executee dans la page cible, aucune fermeture
// sur les variables de ce fichier n'est possible).
// CAUSE RACINE #7 demontree en test reel le 2026-07-22 (description) : la
// donnee ld+json EST reellement presente et correcte des que la page est
// completement rendue (confirme manuellement en direct sur ce meme item,
// hors pipeline, immediatement apres l'echec) -- mais le tout premier
// "complete" observe par le background (declencheur de cette fonction) peut
// correspondre a un etat pas encore completement hydrate cote Vinted, avant
// que le bloc <script type="application/ld+json"> n'ait ete insere. Meme
// classe de probleme que la navigation de verification (voir
// NAVIGATION_SETTLE_DEBOUNCE_MS), resolue ici en attendant directement
// l'element recherche (MutationObserver, jamais un sleep fixe) plutot qu'un
// delai devine -- fonction async, chrome.scripting.executeScript attend
// automatiquement la resolution de la promesse retournee.
async function readLdJsonForVerification(expected: { title?: string; description?: string; price?: string }): Promise<{
  matches: boolean;
  details: Record<string, { expected: string; actual: string | null }>;
}> {
  const script = await new Promise<Element | null>((resolve) => {
    const existing = document.querySelector('script[type="application/ld+json"]');
    if (existing) {
      resolve(existing);
      return;
    }
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, 10000);
    const observer = new MutationObserver(() => {
      const found = document.querySelector('script[type="application/ld+json"]');
      if (found) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(found);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
  let data: { name?: string; description?: string; offers?: { price?: number } } = {};
  if (script?.textContent) {
    try {
      data = JSON.parse(script.textContent) as typeof data;
    } catch {
      // data reste vide -- traite comme "champ introuvable" ci-dessous
    }
  }
  const details: Record<string, { expected: string; actual: string | null }> = {};
  const fieldMatches: Record<string, boolean> = {};
  if (expected.title !== undefined) {
    const actual = data.name ?? null;
    details.title = { expected: expected.title, actual };
    fieldMatches.title = actual === expected.title;
  }
  if (expected.description !== undefined) {
    const actual = data.description ?? null;
    details.description = { expected: expected.description, actual };
    fieldMatches.description = actual === expected.description;
  }
  if (expected.price !== undefined) {
    const actual = typeof data.offers?.price === "number" ? String(data.offers.price) : null;
    details.price = { expected: expected.price, actual };
    const parseNum = (s: string | null) => (s === null ? null : parseFloat(s.replace(",", ".")));
    fieldMatches.price = parseNum(actual) === parseNum(expected.price);
  }
  return { matches: Object.values(fieldMatches).every(Boolean), details };
}

function sendCommandToTab(tabId: number, command: ContentCommand): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, command, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

// Fichiers du content script d'edition tels qu'enregistres dans le
// manifest genere par CRXJS -- lus dynamiquement (jamais de chemin/hash
// code en dur, qui changerait a chaque build) pour permettre une
// reinjection explicite en secours de l'injection declarative.
function findEditContentScriptFiles(): string[] {
  const manifest = chrome.runtime.getManifest();
  const entry = manifest.content_scripts?.find((cs) => cs.js?.some((f) => f.includes("vinted-edit")));
  return entry?.js ?? [];
}

export async function handleEditListing(
  request: RunActionRequest,
  onProgress: (step: PublishStep) => void
): Promise<RunActionOutcome> {
  const historyId = request.historyId;
  const pipelineStart = performance.now();
  function pipeline(name: string, detail?: unknown): void {
    const elapsedMs = Math.round(performance.now() - pipelineStart);
    logger.info(`[PIPELINE][${historyId}] ${name} (+${elapsedMs}ms)`, detail ?? {});
  }

  // historyId injecte dans le payload uniquement pour que le content
  // script (vinted-edit.ts) puisse taguer ses propres logs avec le meme
  // identifiant -- jamais utilise pour la logique metier.
  const payload: EditListingPayload = { ...(request.payload as unknown as EditListingPayload), historyId };

  pipeline("tab_created (creation de la tache d'edition)", { vintedItemId: payload.vintedItemId, price: payload.price });
  logger.info(`[${historyId}] handleEditListing: demarrage`, {
    vintedItemId: payload.vintedItemId,
    price: payload.price,
  });

  onProgress("preparing");

  const editUrl = `https://www.vinted.fr/items/${payload.vintedItemId}/edit`;

  let tab: chrome.tabs.Tab;
  try {
    // active: false (2026-07-21, finition UX demandee) : cet onglet est
    // purement technique -- le remplissage/soumission se fait par
    // simulation DOM depuis le content script, aucune interaction humaine
    // requise. Le laisser en arriere-plan evite de voler le focus a
    // l'utilisateur pendant toute la duree du pipeline (jusqu'a ~15-20s) et,
    // combine avec l'accalmie de navigation (cause racine #5), evite aussi
    // qu'il voie passer une eventuelle page d'erreur transitoire de Vinted
    // pendant la renavigation de verification -- l'onglet se ferme de
    // lui-meme (settle()) sans jamais avoir ete visible. Meme choix deja
    // fait pour publish_listing (publishListing.ts).
    tab = await chrome.tabs.create({ url: editUrl, active: false });
    pipeline("tab_created", { editUrl, tabId: tab.id });
    logger.debug(`[${historyId}] handleEditListing: onglet ouvert`, { editUrl, tabId: tab.id });
  } catch (err) {
    logger.error(`[${historyId}] handleEditListing: chrome.tabs.create a echoue`, errorMessage(err));
    return { status: "error", errorMessage: `Impossible d'ouvrir un onglet Vinted : ${errorMessage(err)}` };
  }
  if (tab.id === undefined) {
    logger.error(`[${historyId}] handleEditListing: onglet cree sans id`);
    return { status: "error", errorMessage: "Onglet Vinted invalide" };
  }
  const tabId: number = tab.id;

  // Seuls title/description/price ont un mecanisme de relecture DOM fiable
  // (memes selecteurs, comparaison directe) -- voir commentaire cause
  // racine #3 en tete de fichier.
  const verifiableFields = payload.changedFields.filter(isVerifiableField);

  return new Promise<RunActionOutcome>((resolve) => {
    let settled = false;
    let tabClosedByHandler = false;
    let sendInFlight = false;
    let explicitlyInjectedAfterComplete = false;
    let phase: "editing" | "verifying" = "editing";
    let navigationSettleTimer: ReturnType<typeof setTimeout> | null = null;
    // Cause racine #6 : au plus UNE tentative de relecture via la page
    // publique -- evite une boucle si CETTE relecture echoue aussi (ex.
    // ld+json absent pour une raison imprevue).
    let publicPageFallbackAttempted = false;
    let publicPageReadyListener: ((tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => void) | null = null;
    // INSTRUMENTATION (2026-07-18, demande explicite) : trace precise du
    // cycle de vie de messagerie pour localiser exactement ou "The message
    // port closed before a response was received." se produit. Aucun de ces
    // compteurs/logs ne change le comportement -- uniquement de la lecture.
    // editTabReadyCount > 1 pendant la phase "editing" (ou > 1 pendant
    // "verifying") est le signal le plus probant d'un EDIT_TAB_READY
    // dupliqué (deux documents distincts qui bootent tous les deux, par ex.
    // a cause d'une redirection interne Vinted apres le premier chargement) --
    // cause plausible d'un second runEdit() declenche pendant que le
    // premier tourne encore, expliquant a la fois le port ferme (sur le
    // premier envoi, dont le document a ete detruit) ET le timeout
    // waitForElement rapporte ensuite (le second runEdit() tournant sur un
    // document deja navigue hors de /edit).
    let editTabReadyCount = 0;
    let editListingDispatchCount = 0;
    let verifyFieldsDispatchCount = 0;
    // Compte chaque cycle de navigation "complete" observe par Chrome, TOUS
    // confondus (edition + verification) -- plus d'un "complete" avant le
    // premier EDIT_TAB_READY de la phase editing serait la preuve directe
    // d'une redirection interne Vinted non anticipee (voir onTabUpdated).
    let completeCount = 0;
    // URL reelle post-sauvegarde (page de l'article, pas /edit) rapportee
    // par EDIT_SAVE_SUBMITTED -- conservee pour le resultPayload final
    // plutot que reutiliser editUrl, qui ne redevient valide qu'apres la
    // renavigation de la phase de verification.
    let confirmedVintedUrl = editUrl;

    function buildExpected(): VerifyEditFieldsPayload["expected"] {
      const expected: VerifyEditFieldsPayload["expected"] = {};
      // String(payload.price) : doit correspondre exactement a la valeur
      // ecrite dans le DOM par vinted-edit.ts (setNativeValue(priceInput,
      // payload.price.toString())) pour que la comparaison soit valide.
      if (verifiableFields.includes("price")) expected.price = String(payload.price);
      if (verifiableFields.includes("title")) expected.title = payload.title;
      if (verifiableFields.includes("description")) expected.description = payload.description;
      return expected;
    }

    function currentCommand(): ContentCommand {
      return phase === "editing"
        ? { type: "EDIT_LISTING", payload }
        : { type: "VERIFY_EDIT_FIELDS", payload: { historyId, expected: buildExpected() } };
    }

    function attemptSend(reason: string): void {
      if (sendInFlight) {
        pipeline("attemptSend ignore (envoi deja en cours)", { reason, phase, sendInFlight });
        return;
      }
      sendInFlight = true;
      const command = currentCommand();
      if (command.type === "EDIT_LISTING") editListingDispatchCount += 1;
      if (command.type === "VERIFY_EDIT_FIELDS") verifyFieldsDispatchCount += 1;
      pipeline(`${command.type}_sent`, {
        reason,
        tabId,
        phase,
        editListingDispatchCount,
        verifyFieldsDispatchCount,
      });
      logger.debug(`[${historyId}] handleEditListing: envoi de ${command.type} (${reason})`, {
        editListingDispatchCount,
        verifyFieldsDispatchCount,
      });
      sendCommandToTab(tabId, command)
        .then(() => {
          pipeline(`${command.type}_received (ACK du content script)`);
          logger.debug(`[${historyId}] handleEditListing: commande ${command.type} envoyee et acquittee`);
        })
        .catch((err) => {
          // NON FATAL (cause racine #2) : le content script qui a envoye
          // EDIT_TAB_READY n'existe deja plus (navigation entre-temps).
          // On ne cloture PAS le pipeline ici -- on continue d'ecouter un
          // nouvel EDIT_TAB_READY (reinjection explicite ci-dessous ou
          // reinjection declarative sur le document final) jusqu'au
          // timeout tabReadyTimeout.
          pipeline("ECHEC envoi (non fatal, en attente d'un nouveau signal pret)", {
            message: errorMessage(err),
            commandType: command.type,
            phase,
            editListingDispatchCount,
            verifyFieldsDispatchCount,
            editTabReadyCount,
          });
          logger.warn(
            `[${historyId}] handleEditListing: envoi de ${command.type} a echoue, en attente d'un nouveau signal`,
            { message: errorMessage(err), phase, editListingDispatchCount, verifyFieldsDispatchCount }
          );
          sendInFlight = false;
        });
    }

    // Declenchee des reception de EDIT_SAVE_SUBMITTED (clic + navigation
    // hors /edit -- PAS une preuve). Si aucun champ verifiable n'a change
    // (attributs seuls), aucune relecture fiable n'existe : succes declare
    // directement, limite documentee explicitement (voir commentaire cause
    // racine #3). Sinon : renavigue vers la MEME page d'edition et
    // reutilise EDIT_TAB_READY pour une seconde injection dediee a la
    // verification.
    //
    // CAUSE RACINE #4 demontree sur QUATRE tests reels consecutifs le
    // 2026-07-20 (prix reellement sauvegarde a chaque fois, confirme sur
    // Vinted -- 91, 93, 93, 93) : EDIT_SAVE_SUBMITTED, envoye en
    // fire-and-forget par vinted-edit.ts juste apres la redirection vers
    // /member/{userId}, n'est JAMAIS arrive jusqu'ici (verifyFieldsDispatchCount
    // reste a 0 a chaque fois, aucune ligne "edit_save_submitted" dans les
    // 4 runs). Consequence en cascade observee : phase reste "editing", donc
    // si le navigateur revient un jour sur une URL /items/*/edit (redirection
    // Vinted, hors de notre controle), le prochain EDIT_TAB_READY est relu
    // comme "en train de demarrer" et redeclenche un EDIT_LISTING redondant
    // (editListingDispatchCount:2 observe) -- un second essai qui a lui-meme
    // fini par echouer sur un simple timeout de champ (formulaire pas encore
    // pret sur ce rechargement). idempotent via `verificationStarted` ci-dessous
    // pour pouvoir etre appelee depuis DEUX declencheurs desormais (le
    // message ET onTabUpdated, voir plus bas).
    let verificationStarted = false;
    function beginVerificationPhase(vintedUrl: string): void {
      if (verificationStarted) return;
      verificationStarted = true;
      if (verifiableFields.length === 0) {
        pipeline("verification_ignoree (aucun champ texte verifiable dans changedFields)", { changedFields: payload.changedFields });
        logger.info(`[${historyId}] handleEditListing: aucun champ verifiable, succes declare sans relecture reelle`, {
          changedFields: payload.changedFields,
        });
        settle({ status: "success", resultPayload: { vintedItemId: payload.vintedItemId, vintedUrl } });
        return;
      }

      phase = "verifying";
      sendInFlight = false;
      explicitlyInjectedAfterComplete = false;
      clearTimeout(tabReadyTimeout);
      tabReadyTimeout = setTimeout(onTabReadyTimeout, TAB_READY_TIMEOUT_MS);
      // Rapportee directement ici (pas via un message PUBLISH_PROGRESS du
      // content script) : cette phase est desormais declenchee par
      // l'observation de navigation du background lui-meme (cause racine
      // #4), qui n'a pas besoin d'un aller-retour par la page Vinted pour
      // savoir qu'elle a demarre. Permet a l'UI (ResellOS) d'afficher une
      // etape "Vérification" distincte plutot que de rester bloquee sur
      // "Mise à jour du prix" pendant toute la renavigation.
      onProgress("verifying");

      pipeline("verification_phase_started", { verifiableFields, editUrl });
      logger.info(`[${historyId}] handleEditListing: demarrage de la phase de verification (renavigation)`, { verifiableFields });

      chrome.tabs.update(tabId, { url: editUrl }).catch((err) => {
        pipeline("ECHEC : renavigation vers la page d'edition pour verification");
        logger.error(`[${historyId}] handleEditListing: chrome.tabs.update (verification) a echoue`, errorMessage(err));
        settle({ status: "error", errorMessage: `Impossible de relire la page Vinted pour confirmer la modification : ${errorMessage(err)}` });
      });
    }

    function describeMismatch(details: Record<string, { expected: string; actual: string | null }>): string {
      return Object.entries(details)
        .filter(([, d]) => d.actual !== d.expected)
        .map(([field, d]) => `${field} attendu "${d.expected}", trouve "${d.actual ?? "(champ introuvable)"}"`)
        .join(" ; ");
    }

    // Cause racine #6 : declenchee quand la phase de verification /edit
    // rapporte un ECHEC INTERNE (page indisponible, PAS un vrai desaccord
    // de valeur -- voir le garde "_error" au point d'appel). Renavigue vers
    // la page publique de l'annonce (toujours accessible, meme sous revue
    // Vinted) et y relit les champs via ld+json (readLdJsonForVerification,
    // fonction autonome injectee directement, pas de content script dedie).
    function attemptPublicPageFallback(): void {
      if (publicPageFallbackAttempted) {
        settle({ status: "error", errorMessage: "Vinted n'a pas confirmé la modification (page d'édition et page publique toutes deux indisponibles pour la vérification)." });
        return;
      }
      publicPageFallbackAttempted = true;
      const publicUrl = `https://www.vinted.fr/items/${payload.vintedItemId}`;
      pipeline("public_page_fallback_started", { publicUrl });
      logger.info(
        `[${historyId}] handleEditListing: /edit indisponible apres sauvegarde (probable revue Vinted), tentative de verification via la page publique`,
        { publicUrl }
      );
      chrome.tabs
        .update(tabId, { url: publicUrl })
        .then(() => {
          publicPageReadyListener = (updatedTabId, changeInfo) => {
            if (updatedTabId !== tabId || changeInfo.status !== "complete" || !publicPageReadyListener) return;
            chrome.tabs.onUpdated.removeListener(publicPageReadyListener);
            publicPageReadyListener = null;
            pipeline("public_page_loaded", { publicUrl });
            chrome.scripting
              .executeScript({ target: { tabId }, func: readLdJsonForVerification, args: [buildExpected()] })
              .then((results) => {
                const result = results[0]?.result;
                if (!result) {
                  settle({ status: "error", errorMessage: "Impossible de relire la page publique de l'annonce pour confirmer la modification." });
                  return;
                }
                pipeline("public_page_verification_result", result);
                logger.info(`[${historyId}] handleEditListing: resultat de la relecture via la page publique`, result);
                if (result.matches) {
                  settle({ status: "success", resultPayload: { vintedItemId: payload.vintedItemId, vintedUrl: publicUrl } });
                } else {
                  settle({
                    status: "error",
                    errorMessage: `Vinted n'a pas confirmé la modification (relecture via la page publique). ${describeMismatch(result.details)}`,
                  });
                }
              })
              .catch((err) => {
                settle({ status: "error", errorMessage: `Impossible de relire la page publique de l'annonce : ${errorMessage(err)}` });
              });
          };
          chrome.tabs.onUpdated.addListener(publicPageReadyListener);
        })
        .catch((err) => {
          settle({ status: "error", errorMessage: `Impossible de naviguer vers la page publique de l'annonce : ${errorMessage(err)}` });
        });
    }

    function onMessage(message: unknown, sender: chrome.runtime.MessageSender): boolean {
      if (sender.tab?.id !== tabId || !isContentReport(message)) return false;

      if (message.type === "EDIT_TAB_READY") {
        editTabReadyCount += 1;
        // senderUrl est LA preuve directe recherchee : si ce document (URL)
        // differe du precedent EDIT_TAB_READY de la MEME phase, c'est qu'un
        // second document a boote pendant que le premier tournait encore
        // (redirection interne Vinted non anticipee) -- distinct d'une
        // simple double-injection (declarative + explicite) sur le MEME
        // document, qui elle est deja gardee par __resellosEditBooted cote
        // content script et ne devrait jamais produire un second signal.
        pipeline("edit_ready_received", {
          phase,
          editTabReadyCount,
          senderUrl: sender.url,
          senderFrameId: sender.frameId,
        });
        if (editTabReadyCount > 1) {
          logger.warn(
            `[${historyId}] handleEditListing: EDIT_TAB_READY recu ${editTabReadyCount} fois (phase ${phase}) -- signal potentiel d'un second document/runEdit()`,
            { senderUrl: sender.url }
          );
        }
        clearTimeout(tabReadyTimeout);
        attemptSend("EDIT_TAB_READY recu");
        return false;
      }

      if (message.type === "PUBLISH_PROGRESS") {
        pipeline(`Progression : ${message.step}`);
        logger.debug(`[${historyId}] handleEditListing: progression`, { step: message.step });
        onProgress(message.step);
      } else if (message.type === "PUBLISH_RESULT") {
        // Uniquement atteint sur un ECHEC reel desormais (timeout DOM,
        // session expiree...) -- le chemin de succes n'envoie plus
        // PUBLISH_RESULT, voir EDIT_SAVE_SUBMITTED ci-dessous.
        pipeline("Retour vers ResellOS (resultat recu du content script)", message.outcome);
        logger.info(`[${historyId}] handleEditListing: resultat recu du content script`, message.outcome);
        settle(message.outcome);
      } else if (message.type === "EDIT_SAVE_SUBMITTED") {
        pipeline("edit_save_submitted (clic + navigation detectes, pas encore une preuve)", { ...message, senderUrl: sender.url });
        logger.info(`[${historyId}] handleEditListing: EDIT_SAVE_SUBMITTED recu, demarrage de la verification`, { ...message, senderUrl: sender.url });
        confirmedVintedUrl = message.vintedUrl;
        beginVerificationPhase(message.vintedUrl);
      } else if (message.type === "EDIT_VERIFICATION_RESULT") {
        pipeline("verification_result_received", { ...message, senderUrl: sender.url });
        logger.info(`[${historyId}] handleEditListing: resultat de verification recu`, { ...message, senderUrl: sender.url });
        if (message.matches) {
          settle({ status: "success", resultPayload: { vintedItemId: payload.vintedItemId, vintedUrl: confirmedVintedUrl } });
        } else if ("_error" in message.details) {
          // Cause racine #6 : "_error" signifie que la phase de verification
          // ELLE-MEME a echoue (page /edit indisponible, ex. revue Vinted
          // apres modification de titre) -- PAS un vrai desaccord de
          // valeur. Un vrai desaccord rapporte des cles par champ
          // (price/title/description), jamais "_error". Tente la relecture
          // via la page publique avant de conclure a un echec.
          attemptPublicPageFallback();
        } else {
          settle({
            status: "error",
            errorMessage: `Vinted n'a pas confirmé la modification. ${describeMismatch(message.details)}`,
          });
        }
      }
      return false;
    }

    // Cause racine #2, mecanisme 2/2 : des que la navigation est
    // REELLEMENT terminee (pas juste document_idle sur un document
    // intermediaire eventuel), reinjecte explicitement le content script
    // pour garantir une instance vivante dans le document final. Reutilise
    // pour les DEUX phases (edition et verification) -- explicitlyInjectedAfterComplete
    // est reinitialise au debut de la phase de verification.
    function onTabUpdated(updatedTabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, updatedTab: chrome.tabs.Tab): void {
      if (updatedTabId !== tabId) return;
      // Log INCONDITIONNEL de CHAQUE evenement (pas seulement "complete") --
      // preuve directe recherchee : si Vinted redirige en interne apres le
      // premier chargement (ex. /edit -> /edit apres normalisation d'URL/
      // session), on verra ICI deux cycles loading->complete distincts avec
      // des URLs differentes, AVANT que quoi que ce soit d'autre dans le
      // pipeline ne l'indique. changeInfo.url n'est present que lors d'un
      // changement d'URL -- absent sinon (juste un changement de statut).
      completeCount += changeInfo.status === "complete" ? 1 : 0;
      pipeline("tab_updated", {
        phase,
        status: changeInfo.status,
        changedUrl: changeInfo.url,
        currentTabUrl: updatedTab.url,
        completeCount,
      });

      // CAUSE RACINE #4 (voir commentaire de beginVerificationPhase ci-dessus) :
      // EDIT_SAVE_SUBMITTED, envoye en fire-and-forget par le content script,
      // s'est avere non fiable sur QUATRE tests reels consecutifs -- jamais
      // recu, alors que CETTE observation (le tabId sous notre controle
      // quitte reellement /edit) s'est averee fiable a CHAQUE fois, sur les
      // 4 memes tests, en 5 a 15s. Plutot que d'attendre indefiniment un
      // message qui ne vient jamais, la navigation reelle du tab -- deja
      // observee directement par Chrome, independamment du content script --
      // sert desormais de declencheur de secours pour la phase de
      // verification. beginVerificationPhase() est idempotente
      // (verificationStarted) : si EDIT_SAVE_SUBMITTED finit par arriver
      // quand meme (juste avant ou juste apres), le second appel est un
      // no-op sans effet secondaire.
      //
      // CAUSE RACINE #5 demontree le 2026-07-20 : declencher la
      // renavigation vers /edit DES le premier evenement (souvent un simple
      // "loading" du tout debut de la redirection Vinted) interrompt la
      // propre navigation/rendu cote client de Vinted encore en cours (les
      // logs montrent des cycles loading/complete repetes sur /member
      // pendant 10+ secondes) -- confirme par un test manuel HORS extension
      // le meme jour : /items/9400476768/edit se charge normalement quand
      // on n'interfere pas. Vinted renvoie alors une page d'erreur generique
      // pour la relecture suivante. Correctif : ACCALMIE (debounce) avant de
      // declencher la verification -- reinitialise le minuteur a CHAQUE
      // evenement tab_updated reel tant que phase reste "editing" ; ne
      // demarre la verification qu'apres NAVIGATION_SETTLE_DEBOUNCE_MS sans
      // le moindre nouvel evenement. Pilote par l'activite reelle du tab
      // (jamais un sleep fixe inconditionnel) -- si Vinted continue de
      // s'agiter, on continue d'attendre ; des que ca se calme, on enchaine
      // immediatement, sans attente superflue.
      if (phase === "editing" && updatedTab.url && !updatedTab.url.includes("/edit")) {
        const path = (() => {
          try {
            return new URL(updatedTab.url).pathname;
          } catch {
            return updatedTab.url;
          }
        })();
        if (/\/items\/\d+/.test(path) || /\/member\/\d+/.test(path)) {
          pipeline("navigation_detectee_hors_edit (attente d'accalmie avant verification)", { tabUrl: updatedTab.url });
          if (navigationSettleTimer) clearTimeout(navigationSettleTimer);
          navigationSettleTimer = setTimeout(() => {
            navigationSettleTimer = null;
            pipeline(`navigation_stabilisee (accalmie de ${NAVIGATION_SETTLE_DEBOUNCE_MS}ms sans nouvel evenement), demarrage verification`, { tabUrl: updatedTab.url });
            logger.info(`[${historyId}] handleEditListing: navigation hors de /edit stabilisee, demarrage de la verification sans attendre EDIT_SAVE_SUBMITTED`, {
              tabUrl: updatedTab.url,
            });
            confirmedVintedUrl = `https://www.vinted.fr/items/${payload.vintedItemId}`;
            beginVerificationPhase(confirmedVintedUrl);
          }, NAVIGATION_SETTLE_DEBOUNCE_MS);
        }
      }

      if (changeInfo.status !== "complete" || explicitlyInjectedAfterComplete) return;
      explicitlyInjectedAfterComplete = true;
      pipeline("tab_complete", { phase, completeCount, tabUrl: updatedTab.url });
      logger.debug(`[${historyId}] handleEditListing: onglet status=complete, reinjection explicite`, { phase, completeCount, tabUrl: updatedTab.url });

      const files = findEditContentScriptFiles();
      if (files.length === 0) {
        logger.error(`[${historyId}] handleEditListing: aucun fichier de content script d'edition trouve dans le manifest`);
        return;
      }
      chrome.scripting
        .executeScript({ target: { tabId }, files })
        .then(() => {
          pipeline("content_script_injected", { files });
          logger.debug(`[${historyId}] handleEditListing: reinjection explicite reussie`, { files });
        })
        .catch((err) => {
          // Non fatal : l'injection declarative a peut-etre deja suffi
          // (EDIT_TAB_READY peut arriver independamment de cette
          // reinjection) -- seul le timeout global tabReadyTimeout decide
          // d'un echec final.
          pipeline("ECHEC reinjection explicite (non fatal)", { message: errorMessage(err) });
          logger.warn(`[${historyId}] handleEditListing: reinjection explicite a echoue`, errorMessage(err));
        });
    }

    function onRemoved(removedTabId: number): void {
      if (removedTabId !== tabId || tabClosedByHandler) return;
      pipeline("ECHEC : onglet ferme avant la fin (fermeture externe, pas par le handler)");
      logger.warn(`[${historyId}] handleEditListing: onglet ferme avant la fin`);
      settle({ status: "error", errorMessage: "Modification interrompue (onglet fermé)" });
    }

    function cleanup(): void {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
      clearTimeout(globalTimeout);
      clearTimeout(tabReadyTimeout);
      if (navigationSettleTimer) clearTimeout(navigationSettleTimer);
      if (publicPageReadyListener) chrome.tabs.onUpdated.removeListener(publicPageReadyListener);
    }

    function settle(outcome: RunActionOutcome): void {
      if (settled) return;
      settled = true;
      cleanup();
      tabClosedByHandler = true;
      chrome.tabs.remove(tabId).catch(() => {});
      // Recapitulatif final UNIQUE (demande explicite 2026-07-18) : une
      // seule ligne grep-able "PIPELINE_SUMMARY" reunissant tous les
      // compteurs de cycle de vie de messagerie. editTabReadyCount > 2
      // (1 pour l'edition + 1 pour la verification est le cas normal) ou
      // editListingDispatchCount > 1 est la preuve directe d'un second
      // document/runEdit() declenche pendant que le premier tournait encore.
      pipeline("PIPELINE_SUMMARY", {
        status: outcome.status,
        finalPhase: phase,
        editTabReadyCount,
        editListingDispatchCount,
        verifyFieldsDispatchCount,
        navigationCompleteCount: completeCount,
      });
      logger.info(`[${historyId}] handleEditListing: termine`, {
        status: outcome.status,
        finalPhase: phase,
        editTabReadyCount,
        editListingDispatchCount,
        verifyFieldsDispatchCount,
        navigationCompleteCount: completeCount,
      });
      resolve(outcome);
    }

    const globalTimeout = setTimeout(() => {
      logger.error(`[${historyId}] handleEditListing: delai depasse (${GLOBAL_TIMEOUT_MS}ms)`);
      settle({ status: "error", errorMessage: "Délai dépassé : la modification n'a pas abouti" });
    }, GLOBAL_TIMEOUT_MS);

    // Si aucun EDIT_TAB_READY exploitable (envoi reussi) n'est jamais
    // recu, l'echec est honnete et precis plutot qu'un simple "delai
    // depasse" generique -- distingue explicitement cette etape des
    // autres. Reassigne (let, pas const) au debut de la phase de
    // verification pour donner un nouveau delai a la seconde attente.
    function onTabReadyTimeout(): void {
      pipeline(`ECHEC : aucune commande acquittee sous ${TAB_READY_TIMEOUT_MS}ms (phase ${phase})`);
      logger.error(`[${historyId}] handleEditListing: aucune commande acquittee sous ${TAB_READY_TIMEOUT_MS}ms`, { phase });
      settle({
        status: "error",
        errorMessage:
          phase === "editing"
            ? "La page d'édition Vinted n'a pas confirmé être prête à temps (le script d'automatisation n'a jamais pu recevoir la commande). Réessaie -- si le problème persiste, la page Vinted a peut-être changé de structure."
            : "Impossible de relire la page Vinted après sauvegarde pour confirmer la modification (délai dépassé). Vinted n'a pas confirmé la modification.",
      });
    }
    let tabReadyTimeout = setTimeout(onTabReadyTimeout, TAB_READY_TIMEOUT_MS);

    chrome.runtime.onMessage.addListener(onMessage);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.onUpdated.addListener(onTabUpdated);
  });
}
