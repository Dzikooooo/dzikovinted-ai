// Handler d'execution pour l'action "edit_listing" (Partie 4, sprint
// extension V1) -- miroir de handlePublishListing.ts (publish_listing),
// seule difference reelle : l'onglet s'ouvre sur la page d'edition de
// L'ARTICLE CIBLE (payload.vintedItemId) plutot que sur le formulaire de
// creation generique, et le content script attendu est vinted-edit.ts
// (commande EDIT_LISTING).

import { withRetry } from "../retry";
import { logger } from "../logger";
import { isContentReport } from "../../lib/messages";
import type { ContentCommand, EditListingPayload, PublishStep, RunActionOutcome, RunActionRequest } from "../../lib/messages";

const GLOBAL_TIMEOUT_MS = 90000;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function sendCommandWhenReady(tabId: number, payload: EditListingPayload): Promise<void> {
  const command: ContentCommand = { type: "EDIT_LISTING", payload };
  await withRetry(
    () =>
      new Promise<void>((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, command, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      }),
    { attempts: 6, baseDelayMs: 250 }
  );
}

export async function handleEditListing(
  request: RunActionRequest,
  onProgress: (step: PublishStep) => void
): Promise<RunActionOutcome> {
  const historyId = request.historyId;
  // historyId injecte dans le payload uniquement pour que le content
  // script (vinted-edit.ts) puisse taguer ses propres logs avec le meme
  // identifiant -- jamais utilise pour la logique metier.
  const payload: EditListingPayload = { ...(request.payload as unknown as EditListingPayload), historyId };

  logger.info(`[${historyId}] handleEditListing: demarrage`, {
    vintedItemId: payload.vintedItemId,
    price: payload.price,
  });

  onProgress("preparing");

  const editUrl = `https://www.vinted.fr/items/${payload.vintedItemId}/edit`;

  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.create({ url: editUrl, active: false });
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

    function onMessage(message: unknown, sender: chrome.runtime.MessageSender): boolean {
      if (sender.tab?.id !== tabId || !isContentReport(message)) return false;
      if (message.type === "PUBLISH_PROGRESS") {
        logger.debug(`[${historyId}] handleEditListing: progression`, { step: message.step });
        onProgress(message.step);
      } else if (message.type === "PUBLISH_RESULT") {
        logger.info(`[${historyId}] handleEditListing: resultat recu du content script`, message.outcome);
        settle(message.outcome);
      }
      return false;
    }

    function onRemoved(removedTabId: number): void {
      if (removedTabId !== tabId || tabClosedByHandler) return;
      logger.warn(`[${historyId}] handleEditListing: onglet ferme avant la fin`);
      settle({ status: "error", errorMessage: "Modification interrompue (onglet fermé)" });
    }

    function cleanup(): void {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(globalTimeout);
    }

    function settle(outcome: RunActionOutcome): void {
      if (settled) return;
      settled = true;
      cleanup();
      tabClosedByHandler = true;
      chrome.tabs.remove(tabId).catch(() => {});
      logger.info(`[${historyId}] handleEditListing: termine`, { status: outcome.status });
      resolve(outcome);
    }

    const globalTimeout = setTimeout(() => {
      logger.error(`[${historyId}] handleEditListing: delai depasse (${GLOBAL_TIMEOUT_MS}ms)`);
      settle({ status: "error", errorMessage: "Délai dépassé : la modification n'a pas abouti" });
    }, GLOBAL_TIMEOUT_MS);

    chrome.runtime.onMessage.addListener(onMessage);
    chrome.tabs.onRemoved.addListener(onRemoved);

    sendCommandWhenReady(tabId, payload)
      .then(() => logger.debug(`[${historyId}] handleEditListing: commande EDIT_LISTING envoyee au content script`))
      .catch((err) => {
        logger.error(`[${historyId}] handleEditListing: envoi de la commande a echoue`, errorMessage(err));
        settle({
          status: "error",
          errorMessage: `Impossible de communiquer avec la page Vinted : ${errorMessage(err)}`,
        });
      });
  });
}
