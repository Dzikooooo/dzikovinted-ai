// Handler d'execution pour l'action "publish_listing" (Phase 3.1), premier
// vrai handler du registre HANDLERS de runAction.ts (jusqu'ici vide, voir
// ARCHITECTURE.md §4.6). Ouvre un onglet Vinted, delegue le remplissage au
// content script (vinted-publish.ts), relaie sa progression, garantit un
// statut terminal explicite dans tous les cas (aucune donnee perdue - voir
// EXTENSION.md).

import { withRetry } from "../retry";
import { isContentReport } from "../../lib/messages";
import type { ContentCommand, PublishListingPayload, PublishStep, RunActionOutcome, RunActionRequest } from "../../lib/messages";

const VINTED_NEW_LISTING_URL = "https://www.vinted.fr/items/new";
const GLOBAL_TIMEOUT_MS = 90000;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function sendCommandWhenReady(tabId: number, payload: PublishListingPayload): Promise<void> {
  const command: ContentCommand = { type: "PUBLISH_LISTING", payload };
  // Le content script peut ne pas avoir fini de s'enregistrer juste apres
  // la creation de l'onglet - reessaie brievement plutot qu'un delai fixe
  // avant le premier envoi.
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

export async function handlePublishListing(
  request: RunActionRequest,
  onProgress: (step: PublishStep) => void
): Promise<RunActionOutcome> {
  const payload = request.payload as unknown as PublishListingPayload;

  onProgress("preparing");

  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.create({ url: VINTED_NEW_LISTING_URL, active: false });
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
      settle({ status: "error", errorMessage: "Publication interrompue (onglet fermé)" });
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
      settle({ status: "error", errorMessage: "Délai dépassé : la publication n'a pas abouti" });
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
