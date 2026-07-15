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

import { logger } from "../logger";
import { isContentReport } from "../../lib/messages";
import type { ContentCommand, EditListingPayload, PublishStep, RunActionOutcome, RunActionRequest } from "../../lib/messages";
import { errorMessage } from "../../lib/errorMessage";

// GARDE TEMPORAIRE (demande explicite 2026-07-15, phase de validation du
// pipeline edit_listing) -- meme protection que src/lib/actions/checks.ts::
// checkEditSandboxOnly cote app, dupliquee ici en defense en profondeur
// puisque c'est CE code qui execute reellement l'ecriture sur Vinted.
// Aucune annonce reelle (polos, jeans...) ne doit pouvoir etre touchee
// pendant les tests repetes du pipeline. A RETIRER PROPREMENT (cette
// constante + le bloc de verification dans handleEditListing) une fois le
// pipeline valide de bout en bout -- ne doit jamais rester en production.
const SANDBOX_TEST_VINTED_ITEM_ID = "9400476768";

const GLOBAL_TIMEOUT_MS = 90000;
// Delai raisonnable pour qu'une vraie navigation de page + chargement d'un
// chunk JS dynamique se termine -- distinct et bien plus court que le
// timeout global (qui couvre en plus tout le remplissage/soumission).
const TAB_READY_TIMEOUT_MS = 20000;

function sendEditCommand(tabId: number, payload: EditListingPayload): Promise<void> {
  const command: ContentCommand = { type: "EDIT_LISTING", payload };
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

  // GARDE TEMPORAIRE -- voir commentaire en tete de fichier. Refuse avant
  // meme d'ouvrir un onglet.
  if (payload.vintedItemId !== SANDBOX_TEST_VINTED_ITEM_ID) {
    logger.error(`[${historyId}] handleEditListing: refuse (protection sandbox temporaire)`, {
      vintedItemId: payload.vintedItemId,
      sandboxAutorise: SANDBOX_TEST_VINTED_ITEM_ID,
    });
    return {
      status: "error",
      errorMessage:
        'Protection temporaire active : seule l\'annonce sandbox de test ("Planche en bois") peut être modifiée pendant la phase de validation du pipeline.',
    };
  }

  pipeline("tab_created (creation de la tache d'edition)", { vintedItemId: payload.vintedItemId, price: payload.price });
  logger.info(`[${historyId}] handleEditListing: demarrage`, {
    vintedItemId: payload.vintedItemId,
    price: payload.price,
  });

  onProgress("preparing");

  const editUrl = `https://www.vinted.fr/items/${payload.vintedItemId}/edit`;

  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.create({ url: editUrl, active: true });
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

  return new Promise<RunActionOutcome>((resolve) => {
    let settled = false;
    let tabClosedByHandler = false;
    let sendInFlight = false;
    let explicitlyInjectedAfterComplete = false;

    function attemptSend(reason: string): void {
      if (sendInFlight) return;
      sendInFlight = true;
      pipeline("edit_payload_sent", { reason, tabId });
      logger.debug(`[${historyId}] handleEditListing: envoi de EDIT_LISTING (${reason})`);
      sendEditCommand(tabId, payload)
        .then(() => {
          pipeline("edit_payload_received (ACK du content script)");
          logger.debug(`[${historyId}] handleEditListing: commande EDIT_LISTING envoyee et acquittee`);
        })
        .catch((err) => {
          // NON FATAL (cause racine #2) : le content script qui a envoye
          // EDIT_TAB_READY n'existe deja plus (navigation entre-temps).
          // On ne cloture PAS le pipeline ici -- on continue d'ecouter un
          // nouvel EDIT_TAB_READY (reinjection explicite ci-dessous ou
          // reinjection declarative sur le document final) jusqu'au
          // timeout tabReadyTimeout.
          pipeline("ECHEC envoi (non fatal, en attente d'un nouveau signal pret)", { message: errorMessage(err) });
          logger.warn(`[${historyId}] handleEditListing: envoi de EDIT_LISTING a echoue, en attente d'un nouveau signal`, errorMessage(err));
          sendInFlight = false;
        });
    }

    function onMessage(message: unknown, sender: chrome.runtime.MessageSender): boolean {
      if (sender.tab?.id !== tabId || !isContentReport(message)) return false;

      if (message.type === "EDIT_TAB_READY") {
        pipeline("edit_ready_received");
        clearTimeout(tabReadyTimeout);
        attemptSend("EDIT_TAB_READY recu");
        return false;
      }

      if (message.type === "PUBLISH_PROGRESS") {
        pipeline(`Progression : ${message.step}`);
        logger.debug(`[${historyId}] handleEditListing: progression`, { step: message.step });
        onProgress(message.step);
      } else if (message.type === "PUBLISH_RESULT") {
        pipeline("Retour vers ResellOS (resultat recu du content script)", message.outcome);
        logger.info(`[${historyId}] handleEditListing: resultat recu du content script`, message.outcome);
        settle(message.outcome);
      }
      return false;
    }

    // Cause racine #2, mecanisme 2/2 : des que la navigation est
    // REELLEMENT terminee (pas juste document_idle sur un document
    // intermediaire eventuel), reinjecte explicitement le content script
    // pour garantir une instance vivante dans le document final.
    function onTabUpdated(updatedTabId: number, changeInfo: chrome.tabs.OnUpdatedInfo): void {
      if (updatedTabId !== tabId || changeInfo.status !== "complete" || explicitlyInjectedAfterComplete) return;
      explicitlyInjectedAfterComplete = true;
      pipeline("tab_complete");
      logger.debug(`[${historyId}] handleEditListing: onglet status=complete, reinjection explicite`);

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
    }

    function settle(outcome: RunActionOutcome): void {
      if (settled) return;
      settled = true;
      cleanup();
      tabClosedByHandler = true;
      chrome.tabs.remove(tabId).catch(() => {});
      pipeline("Pipeline termine", { status: outcome.status });
      logger.info(`[${historyId}] handleEditListing: termine`, { status: outcome.status });
      resolve(outcome);
    }

    const globalTimeout = setTimeout(() => {
      logger.error(`[${historyId}] handleEditListing: delai depasse (${GLOBAL_TIMEOUT_MS}ms)`);
      settle({ status: "error", errorMessage: "Délai dépassé : la modification n'a pas abouti" });
    }, GLOBAL_TIMEOUT_MS);

    // Si aucun EDIT_TAB_READY exploitable (envoi reussi) n'est jamais
    // recu, l'echec est honnete et precis plutot qu'un simple "delai
    // depasse" generique -- distingue explicitement cette etape des
    // autres.
    const tabReadyTimeout = setTimeout(() => {
      pipeline(`ECHEC : aucun EDIT_LISTING acquitte sous ${TAB_READY_TIMEOUT_MS}ms`);
      logger.error(`[${historyId}] handleEditListing: aucun envoi de EDIT_LISTING acquitte sous ${TAB_READY_TIMEOUT_MS}ms`);
      settle({
        status: "error",
        errorMessage:
          "La page d'édition Vinted n'a pas confirmé être prête à temps (le script d'automatisation n'a jamais pu recevoir la commande). Réessaie -- si le problème persiste, la page Vinted a peut-être changé de structure.",
      });
    }, TAB_READY_TIMEOUT_MS);

    chrome.runtime.onMessage.addListener(onMessage);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.onUpdated.addListener(onTabUpdated);
  });
}
