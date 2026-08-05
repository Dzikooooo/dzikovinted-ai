// Pont entre l'app web et l'extension Chrome ResellOS, via externally_connectable
// (voir extension/manifest.config.ts et EXTENSION.md §3). Aucune authentification
// separee ici : on relaie la session Supabase deja ouverte dans l'app web.

import type { ActionOutcome, ActionRequest } from './actions/types';
import { translateExtensionError } from './errorMessages';
import { devLog, devWarn, devError } from './devLog';

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

// Le background peut repondre {ok:false, error:"..."} sans jamais passer par
// chrome.runtime.lastError (ex. "Message externe inconnu" quand l'extension
// installee ne reconnait pas encore ce type de message -- typiquement pas
// rechargee apres une mise a jour) -- translateExtensionError() n'etait
// applique qu'au chemin lastError, laissant ce texte technique fuiter tel
// quel a l'utilisateur (bug reel confirme le 2026-07-28, voir errorMessages.ts).
function translateResponseError<T extends { ok: boolean; error?: string }>(response: T | undefined, fallbackError: string): T {
  if (!response) return { ok: false, error: fallbackError } as T;
  if (response.ok || !response.error) return response;
  return { ...response, error: translateExtensionError(response.error) };
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
    devWarn('[ResellOS][pairing] EXTENSION_ID: absent (VITE_RESELLOS_EXTENSION_ID non definie sur cette build)');
  } else {
    devLog(`[ResellOS][pairing] EXTENSION_ID: present (${EXTENSION_ID.slice(0, 6)}...)`);
  }
}

// Pas de reponse dans le delai imparti = extension non installee. C'est le
// comportement normal de chrome.runtime.sendMessage vers un id inconnu : pas
// d'exception, juste chrome.runtime.lastError dans le callback (ou aucun
// callback si l'extension n'a jamais recu le message).
export async function pingExtension(timeoutMs = 400): Promise<boolean> {
  const runtime = getRuntime();
  if (!EXTENSION_ID || !runtime) {
    devWarn('[ResellOS][pairing] pingExtension() abandonne : EXTENSION_ID ou chrome.runtime absent', {
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
  devLog('[ResellOS][pairing] pairExtension() appelee', {
    hasAccessToken: !!accessToken,
    hasRefreshToken: !!refreshToken,
  });
  logExtensionIdStatus();

  const runtime = getRuntime();
  if (!EXTENSION_ID) {
    const result = { ok: false, error: "Extension non configurée (VITE_RESELLOS_EXTENSION_ID absent)" };
    devError('[ResellOS][pairing] pairExtension() abandonnee :', result.error);
    return result;
  }
  if (!runtime) {
    const result = { ok: false, error: "chrome.runtime indisponible (navigateur non-Chrome, ou page hors contexte d'extension)" };
    devError('[ResellOS][pairing] pairExtension() abandonnee :', result.error);
    return result;
  }

  return new Promise((resolve) => {
    try {
      runtime.sendMessage(
        EXTENSION_ID,
        { type: "PAIR", access_token: accessToken, refresh_token: refreshToken },
        (response) => {
          if (runtime.lastError) {
            const raw = runtime.lastError.message ?? "Échec de la connexion à l'extension";
            devError('[ResellOS][pairing] pairExtension() chrome.runtime.lastError :', raw);
            resolve({ ok: false, error: translateExtensionError(raw) });
            return;
          }
          const result = translateResponseError(response as PairResult | undefined, "Réponse vide de l'extension");
          devLog('[ResellOS][pairing] pairExtension() reponse :', result);
          resolve(result);
        }
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      devError('[ResellOS][pairing] pairExtension() exception :', raw);
      resolve({ ok: false, error: translateExtensionError(raw) });
    }
  });
}

// Etat d'appairage reel de l'extension (chrome.storage.local, cote
// background) -- distinct de vinted_accounts.connected (etat Vinted d'UN
// compte precis, voir VintedAccountPage.tsx). GET_STATUS ne renvoie que le
// compte par defaut (Phase A du popup, voir extension/background/pairing.ts) --
// vintedConnected/lastSyncedAt ne servent ici qu'a un affichage de secours,
// la source de verite multi-comptes reste useVintedAccountFilter().
export interface ExtensionStatus {
  paired: boolean;
  // P-04 (audit pre-beta 2026-08-03) : id de l'utilisateur ResellOS auquel
  // l'extension est reellement appairee -- a comparer avec l'utilisateur
  // actuellement connecte dans cet onglet (useAuth().user.id) avant
  // d'afficher "Connecte". Un appairage orphelin d'un compte precedent (poste
  // partage, changement de compte ResellOS) ne doit jamais etre presente
  // comme actif : les prochaines synchros ecriraient les donnees Vinted
  // detectees sous ce pairedUserId, pas sous l'utilisateur actuel.
  pairedUserId: string | null;
  vintedConnected: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

// null = extension non installee/non repondante (meme convention que
// pingExtension) -- jamais leve, toujours resolu.
export async function getExtensionStatus(timeoutMs = 1500): Promise<ExtensionStatus | null> {
  const runtime = getRuntime();
  if (!EXTENSION_ID || !runtime) return null;

  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);

    try {
      runtime.sendMessage(EXTENSION_ID, { type: "GET_STATUS" }, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Une extension installee mais pas encore rechargee apres une mise a
        // jour de ResellOS peut repondre {ok:false, error:"Message externe
        // inconnu"} plutot que la forme ExtensionStatus attendue -- ne
        // jamais caster aveuglement une reponse qui ne porte pas `paired`
        // (bug reel confirme le 2026-07-28 : paired devenait `undefined`,
        // silencieusement traite comme "non apparie" sans aucune trace).
        if (runtime.lastError || !response || typeof (response as { paired?: unknown }).paired !== "boolean") {
          if (response) devWarn('[ResellOS][pairing] getExtensionStatus() reponse inattendue :', response);
          resolve(null);
          return;
        }
        resolve(response as ExtensionStatus);
      });
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    }
  });
}

export interface UnpairResult {
  ok: boolean;
  error?: string;
}

export async function unpairExtension(): Promise<UnpairResult> {
  const runtime = getRuntime();
  if (!EXTENSION_ID || !runtime) {
    return { ok: false, error: "Extension non détectée" };
  }

  return new Promise((resolve) => {
    try {
      runtime.sendMessage(EXTENSION_ID, { type: "UNPAIR" }, (response) => {
        if (runtime.lastError) {
          resolve({ ok: false, error: translateExtensionError(runtime.lastError.message ?? "Échec de la connexion à l'extension") });
          return;
        }
        resolve(translateResponseError(response as UnpairResult | undefined, "Réponse vide de l'extension"));
      });
    } catch (err) {
      resolve({ ok: false, error: translateExtensionError(err instanceof Error ? err.message : String(err)) });
    }
  });
}

export interface RunActionResult {
  ok: boolean;
  outcome?: ActionOutcome;
  error?: string;
  // Bug reel demontre le 2026-07-17 : un delai local depasse ICI (aucune
  // reponse RUN_ACTION recue a temps) n'est PAS une preuve d'echec -- le
  // pipeline cote extension continue de tourner independamment (son propre
  // GLOBAL_TIMEOUT_MS, plus genereux) et peut reussir reellement APRES que
  // ce cote-ci ait abandonne. Sans cette distinction, StockPage.tsx
  // ecrivait vinted_sync_status=sync_failed sur un simple "on ne sait pas
  // encore", ecrasant potentiellement un succes reel qui arrive plus tard
  // sans jamais pouvoir etre observe. Uniquement true dans ce cas precis --
  // jamais pour une erreur reellement rapportee par l'extension.
  timedOut?: boolean;
}

// Chaine EXACTE utilisee au timeout local ci-dessous -- exportee pour que
// les appelants (StockPage.tsx) puissent distinguer honnetement "on n'a
// pas eu de reponse a temps" d'une erreur reellement rapportee, sans dupliquer
// la chaine (source unique de verite).
export const RUN_ACTION_TIMEOUT_ERROR = "Délai dépassé (aucune réponse de l'extension)";

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
        devWarn(`[ResellOS][action][${historyId}] runAction() : delai depasse (${timeoutMs}ms) sans reponse de l'extension`);
        port?.disconnect();
        resolve({ ok: false, error: RUN_ACTION_TIMEOUT_ERROR, timedOut: true });
      }
    }, timeoutMs);

    try {
      devLog(`[ResellOS][action][${historyId}] envoi RUN_ACTION vers l'extension (etape 2 : creation/envoi de l'action)`, {
        kind: request.kind,
        vintedAccountId: request.vintedAccountId,
        listingId: request.listingId,
        extensionId: EXTENSION_ID,
      });
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
            resolve({ ok: false, error: translateExtensionError(runtime.lastError.message ?? "Échec de la connexion à l'extension") });
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
        resolve({ ok: false, error: translateExtensionError(err instanceof Error ? err.message : String(err)) });
      }
    }
  });
}
