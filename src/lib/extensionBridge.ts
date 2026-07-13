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

// Expose l'id attendu (jamais un secret -- deja visible publiquement sur
// chrome://extensions par quiconque a l'extension installee) pour que l'UI
// puisse l'afficher a cote de l'id reellement visible sur chrome://extensions
// et laisser l'utilisateur comparer lui-meme. chrome.runtime.sendMessage ne
// renvoie aucune information exploitable pour distinguer automatiquement
// "mauvais id" de "extension non installee" (meme absence de reponse dans
// les deux cas) -- pas de detection auto d'un id errone, volontairement,
// plutot que d'inventer un signal qui n'existe pas.
export function getConfiguredExtensionId(): string | null {
  return EXTENSION_ID ?? null;
}

// Diagnostic explicite (demande utilisateur, 2026-07-13) : ne jamais logger
// les tokens eux-memes, mais toujours logger si EXTENSION_ID est present
// (sans reveler sa valeur complete) - la cause la plus probable d'un
// appairage qui echoue silencieusement est une variable d'environnement de
// build manquante sur le deploiement reellement utilise (voir VintedAccountPage.tsx
// 'not-configured' et extension/README.md).
function logExtensionIdStatus(): void {
  if (!EXTENSION_ID) {
    console.warn('[ResellOS][pairing] EXTENSION_ID: absent (VITE_RESELLOS_EXTENSION_ID non definie sur cette build)');
  } else {
    console.log(`[ResellOS][pairing] EXTENSION_ID: present (${EXTENSION_ID.slice(0, 6)}...)`);
  }
}

// Pas de reponse dans le delai imparti = extension non installee. C'est le
// comportement normal de chrome.runtime.sendMessage vers un id inconnu : pas
// d'exception, juste chrome.runtime.lastError dans le callback (ou aucun
// callback si l'extension n'a jamais recu le message).
export async function pingExtension(timeoutMs = 400): Promise<boolean> {
  const runtime = getRuntime();
  if (!EXTENSION_ID || !runtime) {
    console.warn('[ResellOS][pairing] pingExtension() abandonne : EXTENSION_ID ou chrome.runtime absent', {
      hasExtensionId: !!EXTENSION_ID,
      hasRuntime: !!runtime,
    });
    return false;
  }

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
  console.log('[ResellOS][pairing] pairExtension() appelee', {
    hasAccessToken: !!accessToken,
    hasRefreshToken: !!refreshToken,
  });
  logExtensionIdStatus();

  const runtime = getRuntime();
  if (!EXTENSION_ID) {
    const result = { ok: false, error: "Extension non configurée (VITE_RESELLOS_EXTENSION_ID absent)" };
    console.error('[ResellOS][pairing] pairExtension() abandonnee :', result.error);
    return result;
  }
  if (!runtime) {
    const result = { ok: false, error: "chrome.runtime indisponible (navigateur non-Chrome, ou page hors contexte d'extension)" };
    console.error('[ResellOS][pairing] pairExtension() abandonnee :', result.error);
    return result;
  }

  return new Promise((resolve) => {
    try {
      runtime.sendMessage(
        EXTENSION_ID,
        { type: "PAIR", access_token: accessToken, refresh_token: refreshToken },
        (response) => {
          if (runtime.lastError) {
            const error = runtime.lastError.message ?? "Échec de la connexion à l'extension";
            console.error('[ResellOS][pairing] pairExtension() chrome.runtime.lastError :', error);
            resolve({ ok: false, error });
            return;
          }
          const result = (response as PairResult | undefined) ?? { ok: false, error: "Réponse vide de l'extension" };
          console.log('[ResellOS][pairing] pairExtension() reponse :', result);
          resolve(result);
        }
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error('[ResellOS][pairing] pairExtension() exception :', error);
      resolve({ ok: false, error });
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
