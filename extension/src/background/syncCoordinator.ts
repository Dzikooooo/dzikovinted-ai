// Mission "SYNC_VINTED_ACCOUNT" (2026-08-16, lot 2 fiabilisation synchro) :
// correle une commande de synchro EXPLICITE (SYNC_VINTED_ACCOUNT, voir
// background/index.ts) aux evenements NATURELS deja emis par
// vinted-profile.ts (ACCOUNT_DETECTED/LISTINGS_DETECTED, inchanges depuis le
// lot 1) -- ce module ne relit JAMAIS Vinted lui-meme, il se contente
// d'ecouter si une synchro est "attendue" pour un vintedUserId donne et,
// si oui, de rapporter sa progression et son resultat final au demandeur.
//
// Volontairement chrome-libre a l'exception de `openTab` (injecte par
// l'appelant, voir background/index.ts) : garde ce module directement
// testable sans mock global de `chrome`, meme discipline que
// brandDropdownOpen.ts (extension/src/content).
//
// AUCUN changement au comportement PASSIF existant : si aucune synchro
// n'est enregistree pour un vintedUserId (visite organique du profil, ou
// meme synchro deja resolue/expiree), toutes les fonctions ci-dessous sont
// des no-op silencieux -- recordAccountDetected()/recordListings() (sync.ts)
// continuent de s'executer exactement comme avant.

import type { SyncStep, SyncVintedAccountReason, SyncVintedAccountResult } from "../lib/messages";
import type { RecordListingsResult } from "./sync";

export interface OpenSyncTabResult {
  tabId: number | null;
  error?: string;
}

// Genereux : la pagination wardrobe (lot 1) peut porter plusieurs pages,
// chacune avec ses propres tentatives bornees (jusqu'a 3, backoff 500/1000ms),
// plus le temps de chargement du profil Vinted lui-meme.
export const SYNC_TIMEOUT_MS = 90_000;

interface PendingSync {
  promise: Promise<SyncVintedAccountResult>;
  resolve: (result: SyncVintedAccountResult) => void;
  onProgress: (step: SyncStep) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
  settled: boolean;
}

const pendingSyncs = new Map<string, PendingSync>();

function buildResult(overrides: Partial<SyncVintedAccountResult> & { reason: SyncVintedAccountReason }): SyncVintedAccountResult {
  return {
    ok: false,
    complete: false,
    created: 0,
    updated: 0,
    deletedMarked: 0,
    pagesRead: 0,
    pagesExpected: 0,
    ...overrides,
  };
}

function settle(vintedUserId: string, result: SyncVintedAccountResult): void {
  const pending = pendingSyncs.get(vintedUserId);
  if (!pending || pending.settled) return;
  pending.settled = true;
  clearTimeout(pending.timeoutHandle);
  pendingSyncs.delete(vintedUserId);
  pending.resolve(result);
}

// Point d'entree unique de ce module -- appele par le handler
// SYNC_VINTED_ACCOUNT (background/index.ts). `openTab` est fourni par
// l'appelant (encapsule chrome.tabs.create, jamais importe ici directement).
//
// CONCURRENCE : si une synchro est deja en vol pour ce vintedUserId, la MEME
// promesse est reutilisee -- jamais un second appel a openTab()/un second
// recordListings() concurrent (voir la mission, point "CONCURRENCE").
export function startAccountSync(
  vintedUserId: string,
  onProgress: (step: SyncStep) => void,
  openTab: () => Promise<OpenSyncTabResult>,
  timeoutMs: number = SYNC_TIMEOUT_MS
): Promise<SyncVintedAccountResult> {
  const existing = pendingSyncs.get(vintedUserId);
  if (existing) return existing.promise;

  onProgress("connecting");

  let resolveFn!: (result: SyncVintedAccountResult) => void;
  const promise = new Promise<SyncVintedAccountResult>((resolve) => {
    resolveFn = resolve;
  });

  const pending: PendingSync = {
    promise,
    resolve: resolveFn,
    onProgress,
    settled: false,
    timeoutHandle: setTimeout(() => {
      settle(
        vintedUserId,
        buildResult({ reason: "timeout", error: "Aucune réponse de Vinted dans le délai imparti (session expirée ou profil injoignable)" })
      );
    }, timeoutMs),
  };
  pendingSyncs.set(vintedUserId, pending);

  void openTab().then((tabResult) => {
    if (tabResult.tabId === null) {
      settle(vintedUserId, buildResult({ reason: "tab_open_failed", error: tabResult.error ?? "Impossible d'ouvrir l'onglet Vinted" }));
    }
    // Si l'onglet s'ouvre normalement, rien d'autre a faire ici : on attend
    // les evenements naturels du content script, correles ci-dessous.
  });

  return promise;
}

// Appelee depuis le handler ACCOUNT_DETECTED existant, juste apres
// recordAccountDetected() -- `ok` reflete son resultat reel (lot 1). No-op
// si aucune synchro n'est enregistree pour ce compte.
export function notifyAccountDetected(vintedUserId: string, ok: boolean): void {
  const pending = pendingSyncs.get(vintedUserId);
  if (!pending) return;
  if (!ok) {
    settle(vintedUserId, buildResult({ reason: "not_paired", error: "Extension non appairée à ce compte ResellOS" }));
    return;
  }
  pending.onProgress("fetching");
}

// Appelee depuis le handler LISTINGS_DETECTED existant, juste AVANT
// d'appeler recordListings() -- no-op si aucune synchro en attente.
export function notifyListingsProcessing(vintedUserId: string): void {
  pendingSyncs.get(vintedUserId)?.onProgress("writing");
}

// Appelee APRES que recordListings() a resolu -- construit le resultat final
// EXCLUSIVEMENT a partir de son resultat structure reel (lot 1), jamais
// recalcule ici. pagesRead/pagesExpected viennent du message LISTINGS_DETECTED
// (wardrobeApi.ts::WardrobeFetchResult, portes tels quels).
export function resolveAccountSyncWithListingsResult(
  vintedUserId: string,
  result: RecordListingsResult,
  pagesRead: number,
  pagesExpected: number
): void {
  if (!pendingSyncs.has(vintedUserId)) return;
  const reason: SyncVintedAccountReason = !result.ok ? "not_paired" : result.complete ? "success" : "partial_scan";
  settle(vintedUserId, {
    ok: result.ok,
    complete: result.complete,
    created: result.created,
    updated: result.updated,
    deletedMarked: result.deletedMarked,
    pagesRead,
    pagesExpected,
    reason,
  });
}

// Appelee si recordListings() a leve une exception (voir le .catch existant
// dans background/index.ts) -- evite qu'une synchro en attente reste bloquee
// jusqu'a son timeout alors que la cause reelle est deja connue.
export function resolveAccountSyncWithError(vintedUserId: string, errorMsg: string): void {
  if (!pendingSyncs.has(vintedUserId)) return;
  settle(vintedUserId, buildResult({ reason: "error", error: errorMsg }));
}

// Reserve aux tests -- vide le registre entre deux cas pour eviter qu'une
// synchro laissee en attente par un test precedent (timeout non ecoule) ne
// fausse le suivant.
export function __resetPendingSyncsForTests(): void {
  for (const pending of pendingSyncs.values()) clearTimeout(pending.timeoutHandle);
  pendingSyncs.clear();
}
