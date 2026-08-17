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
// Exportee uniquement pour les tests (voir __tests__/extensionBridge.test.ts) --
// aucun autre appelant hors ce fichier.
export function translateResponseError<T extends { ok: boolean; error?: string }>(response: T | undefined, fallbackError: string): T {
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
//
// Bug reel confirme en test live (2026-08-11, republication assistee) :
// l'ancien defaut de 400ms declenchait un faux "extension non connectee" au
// clic sur "Republier", alors que l'extension etait reellement appairee et
// synchronisait (popup + GET_STATUS le confirmaient). Cause : le service
// worker MV3 de l'extension se suspend apres inactivite ; un sendMessage
// externe qui arrive pendant cette periode oblige Chrome a le reveiller
// avant de repondre a onMessageExternal, ce qui peut depasser 400ms sur un
// build dev/unpacked. Le popup (GET_STATUS via chrome.runtime.sendMessage
// interne, sans timeout local) n'est jamais concerne par ce probleme : il
// attend simplement la reponse, aussi longtemps qu'il le faut. 1500ms aligne
// ce defaut sur getExtensionStatus() ci-dessous, deja calibre pour la meme
// latence de reveil et deja utilise sans probleme signale par
// VintedAccountPage.tsx/DashboardLayout.tsx.
export async function pingExtension(timeoutMs = 1500): Promise<boolean> {
  const runtime = getRuntime();
  if (!EXTENSION_ID || !runtime) {
    devWarn('[ResellOS][pairing] pingExtension() abandonne : EXTENSION_ID ou chrome.runtime absent', {
      hasExtensionId: !!EXTENSION_ID,
      hasRuntime: !!runtime,
    });
    return false;
  }

  // Instrumentation TEMPORAIRE (diagnostic Bug Live n2, republication assistee,
  // 2026-08-10) -- a retirer une fois la cause confirmee. Le code precedent
  // avalait chrome.runtime.lastError en simple `false`, sans jamais logger le
  // message reel -- impossible de distinguer "pas de reponse a temps" de
  // "Chrome a rejete le message avant meme qu'il n'atteigne l'extension"
  // (ex. origine absente de externally_connectable.matches, voir
  // manifest.config.ts : ce cas precis s'est deja produit deux fois).
  const startedAt = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        devWarn('[ResellOS Bridge] PING timeout local (aucune reponse a temps)', {
          extensionId: EXTENSION_ID,
          timeoutMs,
          elapsedMs: Date.now() - startedAt,
        });
        resolve(false);
      }
    }, timeoutMs);

    try {
      runtime.sendMessage(EXTENSION_ID, { type: "PING" }, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const lastError = runtime.lastError?.message;
        const ok = !runtime.lastError && !!(response as { ok?: boolean } | undefined)?.ok;
        devLog('[ResellOS Bridge] PING', {
          extensionId: EXTENSION_ID,
          response,
          lastError,
          durationMs: Date.now() - startedAt,
          ok,
        });
        resolve(ok);
      });
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        devWarn('[ResellOS Bridge] PING exception synchrone', {
          extensionId: EXTENSION_ID,
          error: err instanceof Error ? err.message : String(err),
        });
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

  // Instrumentation TEMPORAIRE (diagnostic Bug Live n2, meme raison que
  // pingExtension() ci-dessus) -- a retirer une fois la cause confirmee.
  const startedAt = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        devWarn('[ResellOS Bridge] GET_STATUS timeout local (aucune reponse a temps)', {
          extensionId: EXTENSION_ID,
          timeoutMs,
          elapsedMs: Date.now() - startedAt,
        });
        resolve(null);
      }
    }, timeoutMs);

    try {
      runtime.sendMessage(EXTENSION_ID, { type: "GET_STATUS" }, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const lastError = runtime.lastError?.message;
        devLog('[ResellOS Bridge] GET_STATUS', {
          extensionId: EXTENSION_ID,
          response,
          lastError,
          durationMs: Date.now() - startedAt,
        });
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
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        devWarn('[ResellOS Bridge] GET_STATUS exception synchrone', {
          extensionId: EXTENSION_ID,
          error: err instanceof Error ? err.message : String(err),
        });
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
  // Republication assistee (2026-08-11) : meme port, message distinct
  // ("prefill_summary" -- voir ActionProgressPortMessage) -- seul
  // publish_listing/republish_listing l'emet aujourd'hui, une seule fois par
  // action. N'affecte aucune autre action (ignore simplement si non fourni).
  onPrefillSummary?: (confirmed: string[], pending: string[]) => void;
  // Mission "CLIC FINAL + CONFIRMATION POST-PUBLICATION" (2026-08-16) : meme
  // port, message distinct ("ready_to_submit") -- envoye au plus une fois par
  // action, des que Vinted lui-meme considere le formulaire soumissible (voir
  // vinted-publish.ts::watchForPublishReadiness). Ne declenche jamais de clic
  // automatique (ecarte, cause DataDome deja prouvee sur le meme composant
  // via edit_listing) -- sert uniquement a inviter l'utilisateur a cliquer
  // au bon moment.
  onReadyToSubmit?: () => void;
  // Mission "CORRIGER LE FAUX TERMINE" (2026-08-17) : meme port, message
  // distinct ("awaiting_old_listing_deletion") -- envoye une fois republish_listing
  // seulement, quand l'extension attend desormais un clic humain reel sur
  // "Confirmer et supprimer" (ancienne annonce, onglet reste ouvert). Ne
  // constitue jamais une preuve de suppression a lui seul -- seul le
  // resultat final (resultPayload.cleanupRequired absent/false) l'atteste.
  onAwaitingOldListingDeletion?: () => void;
}

const ACTION_PROGRESS_PORT_NAME = "action-progress";

// Delai plus long que pingExtension() (1500ms) : une action reelle (Phase
// 3.1+) peut ouvrir un onglet/attendre le content script, un simple ping ne
// suffit pas comme reference de duree.
export async function runAction(
  historyId: string,
  request: ActionRequest,
  options: RunActionOptions = {}
): Promise<RunActionResult> {
  const { timeoutMs = 8000, onProgress, onPrefillSummary, onReadyToSubmit, onAwaitingOldListingDeletion } = options;
  const runtime = getRuntime();
  if (!EXTENSION_ID || !runtime) {
    return { ok: false, error: "Extension non détectée" };
  }

  let port: ExtensionPort | null = null;
  if (onProgress || onPrefillSummary || onReadyToSubmit || onAwaitingOldListingDeletion) {
    try {
      port = runtime.connect(EXTENSION_ID, { name: ACTION_PROGRESS_PORT_NAME });
      port.onMessage.addListener((message) => {
        const portMessage = message as { type?: string; step?: string; confirmed?: unknown; pending?: unknown } | undefined;
        if (portMessage?.type === "progress" && typeof portMessage.step === "string") {
          onProgress?.(portMessage.step);
        } else if (portMessage?.type === "prefill_summary" && Array.isArray(portMessage.confirmed) && Array.isArray(portMessage.pending)) {
          onPrefillSummary?.(portMessage.confirmed as string[], portMessage.pending as string[]);
        } else if (portMessage?.type === "ready_to_submit") {
          onReadyToSubmit?.();
        } else if (portMessage?.type === "awaiting_old_listing_deletion") {
          onAwaitingOldListingDeletion?.();
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
          // P1-3 (Freeze Audit correctif) : le chemin lastError ci-dessus
          // etait deja traduit, mais pas une reponse normale {ok:false,
          // error:"..."} venant directement du background (meme cause que le
          // bug du 2026-07-28 deja corrige pour pairExtension/unpairExtension,
          // jamais applique ici) -- translateResponseError() laisse passer
          // outcome/timedOut inchanges, ne traduit que le champ error.
          resolve(translateResponseError(response as RunActionResult | undefined, "Réponse vide de l'extension"));
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

// Mission "SYNC_VINTED_ACCOUNT" (2026-08-16, lot 2 fiabilisation synchro) :
// remplace le pattern window.open()+poll Supabase (ListingsManagementSection.tsx)
// par une vraie commande explicite, meme canal externally_connectable que
// RUN_ACTION ci-dessus. Type duplique depuis extension/src/lib/messages.ts
// (meme convention de duplication assumee pour RunActionResult/ActionOutcome
// ci-dessus -- extension/ est un paquet independant).
export type SyncVintedAccountReason = "success" | "partial_scan" | "not_paired" | "tab_open_failed" | "timeout" | "error";
export interface SyncVintedAccountResult {
  ok: boolean;
  complete: boolean;
  created: number;
  updated: number;
  deletedMarked: number;
  pagesRead: number;
  pagesExpected: number;
  reason: SyncVintedAccountReason;
  error?: string;
}

export type SyncStep = "connecting" | "fetching" | "writing";

export interface SyncVintedAccountOptions {
  timeoutMs?: number;
  onProgress?: (step: SyncStep) => void;
}

const SYNC_PROGRESS_PORT_NAME = "sync-progress";

// Chaine EXACTE utilisee au timeout LOCAL ci-dessous (distinct du timeout
// structure interne a l'extension, reason:"timeout", SYNC_TIMEOUT_MS=90s
// cote syncCoordinator.ts) -- exportee pour que ListingsManagementSection.tsx
// puisse distinguer honnetement "aucune reponse du tout" (extension
// injoignable/service worker mort) d'un resultat structure reellement recu.
export const SYNC_VINTED_ACCOUNT_TIMEOUT_ERROR = "Délai dépassé (aucune réponse de l'extension)";

// timeoutMs par defaut volontairement PLUS LONG que SYNC_TIMEOUT_MS cote
// extension (90s) -- le timeout structure de l'extension (reason:"timeout",
// deja un resultat honnete et exploitable) doit systematiquement arriver en
// premier ; ce timeout-ci n'est qu'un filet de securite pour le cas ou
// l'extension elle-meme ne repond plus du tout (ex. service worker tue sans
// que son propre setTimeout ait pu s'executer).
export async function syncVintedAccount(
  vintedUserId: string,
  vintedUsername: string,
  options: SyncVintedAccountOptions = {}
): Promise<SyncVintedAccountResult> {
  const { timeoutMs = 100000, onProgress } = options;
  const runtime = getRuntime();
  if (!EXTENSION_ID || !runtime) {
    return {
      ok: false,
      complete: false,
      created: 0,
      updated: 0,
      deletedMarked: 0,
      pagesRead: 0,
      pagesExpected: 0,
      reason: "error",
      error: "Extension non détectée",
    };
  }

  let port: ExtensionPort | null = null;
  if (onProgress) {
    try {
      port = runtime.connect(EXTENSION_ID, { name: SYNC_PROGRESS_PORT_NAME });
      port.onMessage.addListener((message) => {
        const portMessage = message as { type?: string; step?: string } | undefined;
        if (portMessage?.type === "progress" && typeof portMessage.step === "string") {
          onProgress(portMessage.step as SyncStep);
        }
        // "heartbeat" (voir SyncProgressPortMessage cote extension) :
        // ignore volontairement -- maintien du service worker uniquement,
        // aucune signification metier, ne doit jamais declencher onProgress.
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
        devWarn(`[ResellOS][sync][${vintedUserId}] syncVintedAccount() : delai local depasse (${timeoutMs}ms) sans reponse`);
        port?.disconnect();
        resolve({
          ok: false,
          complete: false,
          created: 0,
          updated: 0,
          deletedMarked: 0,
          pagesRead: 0,
          pagesExpected: 0,
          reason: "timeout",
          error: SYNC_VINTED_ACCOUNT_TIMEOUT_ERROR,
        });
      }
    }, timeoutMs);

    try {
      devLog(`[ResellOS][sync][${vintedUserId}] envoi SYNC_VINTED_ACCOUNT vers l'extension`, { vintedUserId, vintedUsername });
      runtime.sendMessage(EXTENSION_ID, { type: "SYNC_VINTED_ACCOUNT", vintedUserId, vintedUsername }, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        port?.disconnect();
        if (runtime.lastError) {
          resolve({
            ok: false,
            complete: false,
            created: 0,
            updated: 0,
            deletedMarked: 0,
            pagesRead: 0,
            pagesExpected: 0,
            reason: "error",
            error: translateExtensionError(runtime.lastError.message ?? "Échec de la connexion à l'extension"),
          });
          return;
        }
        const result = response as SyncVintedAccountResult | undefined;
        if (!result) {
          resolve({
            ok: false,
            complete: false,
            created: 0,
            updated: 0,
            deletedMarked: 0,
            pagesRead: 0,
            pagesExpected: 0,
            reason: "error",
            error: "Réponse vide de l'extension",
          });
          return;
        }
        resolve(result.error ? { ...result, error: translateExtensionError(result.error) } : result);
      });
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        port?.disconnect();
        resolve({
          ok: false,
          complete: false,
          created: 0,
          updated: 0,
          deletedMarked: 0,
          pagesRead: 0,
          pagesExpected: 0,
          reason: "error",
          error: translateExtensionError(err instanceof Error ? err.message : String(err)),
        });
      }
    }
  });
}
