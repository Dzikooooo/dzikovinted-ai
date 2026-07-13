// Handler d'execution pour l'action "edit_listing" (Partie 4, sprint
// extension V1) -- miroir de handlePublishListing.ts (publish_listing),
// seule difference reelle : l'onglet s'ouvre sur la page d'edition de
// L'ARTICLE CIBLE (payload.vintedItemId) plutot que sur le formulaire de
// creation generique, et le content script attendu est vinted-edit.ts
// (commande EDIT_LISTING).

import { withRetry } from "../retry";
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
  const payload = request.payload as unknown as EditListingPayload;

  onProgress("preparing");

  const editUrl = `https://www.vinted.fr/items/${payload.vintedItemId}/edit`;

  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.create({ url: editUrl, active: false });
  } catch (err) {
    return { status: "error", errorMessage: `Impossible d'ouvrir un onglet Vinted : ${errorMessage(err)}` };
  }
  if (tab.id === undefined) {
    return { status: "error", errorMessage: "Onglet Vinted invalide" };
  }
  const tabId: number = tab.id;

  return new Promise<RunActionOutcome>((resolve) => {
    let settled = false;
    let tabClosedByHandler = false;

    function onMessage(message: unknown, sender: chrome.runtime.MessageSender): boolean {
      if (sender.tab?.id !== tabId || !isContentReport(message)) return false;
      if (message.type === "PUBLISH_PROGRESS") {
        onProgress(message.step);
      } else if (message.type === "PUBLISH_RESULT") {
        settle(message.outcome);
      }
      return false;
    }

    function onRemoved(removedTabId: number): void {
      if (removedTabId !== tabId || tabClosedByHandler) return;
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
      resolve(outcome);
    }

    const globalTimeout = setTimeout(() => {
      settle({ status: "error", errorMessage: "Délai dépassé : la modification n'a pas abouti" });
    }, GLOBAL_TIMEOUT_MS);

    chrome.runtime.onMessage.addListener(onMessage);
    chrome.tabs.onRemoved.addListener(onRemoved);

    sendCommandWhenReady(tabId, payload).catch((err) => {
      settle({
        status: "error",
        errorMessage: `Impossible de communiquer avec la page Vinted : ${errorMessage(err)}`,
      });
    });
  });
}
