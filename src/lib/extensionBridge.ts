// Pont entre l'app web et l'extension Chrome ResellOS, via externally_connectable
// (voir extension/manifest.config.ts et EXTENSION.md §3). Aucune authentification
// separee ici : on relaie la session Supabase deja ouverte dans l'app web.

import type { ActionOutcome, ActionRequest } from './actions/types';

interface ExtensionPort {
  onMessage: { addListener: (callback: (message: unknown) => void) => void };
  onDisconnect: { addListener: (callback: () => void) => void };
  disconnect: () => void;
}

interface ExtensionRuntime {
  sendMessage: (extensionId: string, message: unknown, callback: (response: unknown) => void) => void;
  connect: (extensionId: string, connectInfo?: { name?: string }) => ExtensionPort;
  lastError?: { message?: string };
}

declare global {
  interface Window {
    chrome?: { runtime?: ExtensionRuntime };
  }
}

const EXTENSION_ID = import.meta.env.VITE_RESELLOS_EXTENSION_ID as string | undefined;

export interface PairResult {
  ok: boolean;
  error?: string;
}

function getRuntime(): ExtensionRuntime | null {
  return window.chrome?.runtime ?? null;
}

export function isExtensionConfigured(): boolean {
  return !!EXTENSION_ID;
}

// Pas de reponse dans le delai imparti = extension non installee. C'est le
// comportement normal de chrome.runtime.sendMessage vers un id inconnu : pas
// d'exception, juste chrome.runtime.lastError dans le callback (ou aucun
// callback si l'extension n'a jamais recu le message).
export async function pingExtension(timeoutMs = 400): Promise<boolean> {
  const runtime = getRuntime();
  if (!EXTENSION_ID || !runtime) return false;

  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, timeoutMs);

    try {
      runtime.sendMessage(EXTENSION_ID, { type: "PING" }, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const ok = !runtime.lastError && !!(response as { ok?: boolean } | undefined)?.ok;
        resolve(ok);
      });
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
    }
  });
}

export async function pairExtension(accessToken: string, refreshToken: string): Promise<PairResult> {
  const runtime = getRuntime();
  if (!EXTENSION_ID || !runtime) {
    return { ok: false, error: "Extension non détectée" };
  }

  return new Promise((resolve) => {
    try {
      runtime.sendMessage(
        EXTENSION_ID,
        { type: "PAIR", access_token: accessToken, refresh_token: refreshToken },
        (response) => {
          if (runtime.lastError) {
            resolve({ ok: false, error: runtime.lastError.message ?? "Échec de la connexion à l'extension" });
            return;
          }
          resolve((response as PairResult | undefined) ?? { ok: false, error: "Réponse vide de l'extension" });
        }
      );
    } catch (err) {
      resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

export interface RunActionResult {
  ok: boolean;
  outcome?: ActionOutcome;
  error?: string;
}

export interface RunActionOptions {
  timeoutMs?: number;
  // Phase 3.1 (publication) : abonnement optionnel aux etapes intermediaires
  // d'une action longue, relayees par l'extension via un port persistant
  // (chrome.runtime.connect) plutot que par le canal RUN_ACTION classique,
  // qui ne porte que la reponse finale. N'affecte pas les actions qui ne
  // rapportent aucune progression (le port reste simplement inutilise).
  onProgress?: (step: string) => void;
}

const ACTION_PROGRESS_PORT_NAME = "action-progress";

// Delai plus long que pingExtension() (400ms) : une action reelle (Phase
// 3.1+) peut ouvrir un onglet/attendre le content script, un simple ping ne
// suffit pas comme reference de duree.
export async function runAction(
  historyId: string,
  request: ActionRequest,
  options: RunActionOptions = {}
): Promise<RunActionResult> {
  const { timeoutMs = 8000, onProgress } = options;
  const runtime = getRuntime();
  if (!EXTENSION_ID || !runtime) {
    return { ok: false, error: "Extension non détectée" };
  }

  let port: ExtensionPort | null = null;
  if (onProgress) {
    try {
      port = runtime.connect(EXTENSION_ID, { name: ACTION_PROGRESS_PORT_NAME });
      port.onMessage.addListener((message) => {
        const progress = message as { type?: string; step?: string } | undefined;
        if (progress?.type === "progress" && typeof progress.step === "string") {
          onProgress(progress.step);
        }
      });
    } catch {
      port = null; // la progression est un bonus, pas requis pour obtenir le resultat
    }
  }

  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        port?.disconnect();
        resolve({ ok: false, error: "Délai dépassé" });
      }
    }, timeoutMs);

    try {
      runtime.sendMessage(
        EXTENSION_ID,
        {
          type: "RUN_ACTION",
          request: {
            historyId,
            kind: request.kind,
            vintedAccountId: request.vintedAccountId,
            listingId: request.listingId,
            payload: request.payload as Record<string, unknown>,
          },
        },
        (response) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          port?.disconnect();
          if (runtime.lastError) {
            resolve({ ok: false, error: runtime.lastError.message ?? "Échec de la connexion à l'extension" });
            return;
          }
          resolve((response as RunActionResult | undefined) ?? { ok: false, error: "Réponse vide de l'extension" });
        }
      );
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        port?.disconnect();
        resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
  });
}
