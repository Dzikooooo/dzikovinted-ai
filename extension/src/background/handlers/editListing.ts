// Handler d'execution pour l'action "edit_listing" (Partie 4, sprint
// extension V1) -- miroir de handlePublishListing.ts (publish_listing),
// seule difference reelle : l'onglet s'ouvre sur la page d'edition de
// L'ARTICLE CIBLE (payload.vintedItemId) plutot que sur le formulaire de
// creation generique, et le content script attendu est vinted-edit.ts
// (commande EDIT_LISTING).
//
// CAUSE RACINE demontree le 2026-07-15 (pipeline ResellOS -> Vinted
// n'atteignait jamais Vinted, symptome observe : "la page Vinted s'ouvre
// brievement puis disparait") : l'ancienne version envoyait la commande
// EDIT_LISTING via un retry aveugle a duree fixe (6 tentatives / 250ms,
// ~7.75s max) sans jamais savoir si vinted-edit.ts avait fini de charger
// (chunk CRXJS charge de facon asynchrone sur une vraie navigation de
// page, duree non garantie). Des que les tentatives s'epuisaient,
// settle() fermait l'onglet -- exactement le symptome observe, avant
// meme que le content script ait pu s'enregistrer. Remplace par un
// signal explicite (EDIT_TAB_READY, envoye par vinted-edit.ts des qu'il
// a enregistre son listener) : la commande n'est envoyee qu'une fois ce
// signal recu, plus aucune course.

import { logger } from "../logger";
import { isContentReport } from "../../lib/messages";
import type { ContentCommand, EditListingPayload, PublishStep, RunActionOutcome, RunActionRequest } from "../../lib/messages";
import { errorMessage } from "../../lib/errorMessage";

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

  pipeline("Creation de la tache d'edition", { vintedItemId: payload.vintedItemId, price: payload.price });
  logger.info(`[${historyId}] handleEditListing: demarrage`, {
    vintedItemId: payload.vintedItemId,
    price: payload.price,
  });

  onProgress("preparing");

  const editUrl = `https://www.vinted.fr/items/${payload.vintedItemId}/edit`;

  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.create({ url: editUrl, active: true });
    pipeline("Ouverture de la page d'edition Vinted", { editUrl, tabId: tab.id });
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
    let commandSent = false;

    function onMessage(message: unknown, sender: chrome.runtime.MessageSender): boolean {
      if (sender.tab?.id !== tabId || !isContentReport(message)) return false;

      if (message.type === "EDIT_TAB_READY") {
        pipeline("Injection du content script confirmee (signal EDIT_TAB_READY)");
        clearTimeout(tabReadyTimeout);
        if (!commandSent) {
          commandSent = true;
          sendEditCommand(tabId, payload)
            .then(() => {
              pipeline("Commande EDIT_LISTING envoyee au content script");
              logger.debug(`[${historyId}] handleEditListing: commande EDIT_LISTING envoyee au content script`);
            })
            .catch((err) => {
              logger.error(`[${historyId}] handleEditListing: envoi de la commande a echoue`, errorMessage(err));
              settle({
                status: "error",
                errorMessage: `Impossible de communiquer avec la page Vinted : ${errorMessage(err)}`,
              });
            });
        }
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

    function onRemoved(removedTabId: number): void {
      if (removedTabId !== tabId || tabClosedByHandler) return;
      pipeline("ECHEC : onglet ferme avant la fin (fermeture externe, pas par le handler)");
      logger.warn(`[${historyId}] handleEditListing: onglet ferme avant la fin`);
      settle({ status: "error", errorMessage: "Modification interrompue (onglet fermé)" });
    }

    function cleanup(): void {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.tabs.onRemoved.removeListener(onRemoved);
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

    // Si le content script ne s'est jamais signale pret, l'echec est
    // honnete et precis plutot qu'un simple "delai depasse" generique --
    // distingue explicitement cette etape des autres.
    const tabReadyTimeout = setTimeout(() => {
      pipeline(`ECHEC : le content script ne s'est jamais signale pret sous ${TAB_READY_TIMEOUT_MS}ms`);
      logger.error(`[${historyId}] handleEditListing: EDIT_TAB_READY jamais recu (${TAB_READY_TIMEOUT_MS}ms)`);
      settle({
        status: "error",
        errorMessage:
          "La page d'édition Vinted n'a pas fini de charger à temps (le script d'automatisation ne s'est jamais signalé prêt). Réessaie -- si le problème persiste, la page Vinted a peut-être changé de structure.",
      });
    }, TAB_READY_TIMEOUT_MS);

    chrome.runtime.onMessage.addListener(onMessage);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}
