import type { Listing, VintedAccount } from '../types';

// Union figee : toute nouvelle action (Phase 3.1+) ajoute une valeur ici et
// une entree ActionDefinition dans handlers/index.ts, jamais un nouveau
// fichier avec sa propre logique de cycle de vie.
export type ActionKind =
  | 'publish_listing'
  | 'edit_listing'
  | 'edit_price'
  | 'edit_photos'
  | 'republish_listing'
  | 'pause_listing'
  | 'reactivate_listing'
  | 'delete_listing'
  | 'reply_message'
  | 'accept_offer'
  | 'counter_offer';

export interface ActionContext {
  userId: string;
  vintedAccountId: string | null;
  listingId?: string;
  now: Date;
}

export interface ActionCheckFailure {
  code: string;
  message: string;
}

export type ActionCheckResult = { ok: true } | { ok: false; failure: ActionCheckFailure };

export interface ActionCheckDeps {
  extensionConnected: boolean;
  selectedAccount: VintedAccount | null;
  targetListing: Listing | null;
}

export type ActionCheck = (ctx: ActionContext, deps: ActionCheckDeps) => ActionCheckResult;

export interface ActionRequest<TPayload = unknown> {
  kind: ActionKind;
  vintedAccountId: string | null;
  listingId?: string;
  payload: TPayload;
}

export interface ActionPreview {
  summary: string;
  details: Record<string, unknown>;
}

// Jeton opaque : seule facon de referencer une action en cours pour
// confirm()/cancel(). Impossible a construire hors de engine.ts::prepare(),
// et un echec de verification ne le produit jamais - c'est la garantie
// structurelle qu'aucune ecriture ne peut sauter la validation utilisateur.
export interface PreparedAction<TPayload = unknown> {
  readonly __brand: 'PreparedAction';
  readonly id: string;
  readonly request: ActionRequest<TPayload>;
  readonly ctx: ActionContext;
  readonly preview: ActionPreview;
  readonly preparedAt: string;
}

export type ActionOutcome =
  | { status: 'success'; resultPayload?: Record<string, unknown> }
  | { status: 'error'; errorMessage: string }
  | { status: 'cancelled' }
  | { status: 'not_implemented' };

export interface ActionResult {
  historyId: string;
  outcome: ActionOutcome;
  durationMs: number;
}

export interface ActionDefinition<TPayload = unknown> {
  kind: ActionKind;
  label: string;
  checks: ActionCheck[];
  buildPreview: (request: ActionRequest<TPayload>, ctx: ActionContext) => ActionPreview;
  // Absent pour toute entree tant qu'aucun handler reel n'existe cote
  // extension (Phase 3) - engine.ts retombe alors sur deps.runViaExtension,
  // qui resout systematiquement 'not_implemented' via le registre vide de
  // extension/src/background/runAction.ts.
  execute?: (
    request: ActionRequest<TPayload>,
    ctx: ActionContext,
    deps: ActionEngineDeps
  ) => Promise<ActionOutcome>;
}

export type ActionHistoryStatus =
  | 'pending_confirmation'
  | 'success'
  | 'error'
  | 'cancelled'
  | 'not_implemented';

export interface ActionHistoryEntry {
  id: string;
  userId: string;
  vintedAccountId: string | null;
  listingId: string | null;
  kind: ActionKind;
  status: ActionHistoryStatus;
  payload: unknown;
  preview: ActionPreview | null;
  resultPayload: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}

export interface ActionEngineDeps {
  insertHistoryRow: (
    row: Omit<
      ActionHistoryEntry,
      'id' | 'status' | 'completedAt' | 'durationMs' | 'resultPayload' | 'errorMessage'
    >
  ) => Promise<string>;
  updateHistoryRow: (
    id: string,
    patch: Partial<
      Pick<
        ActionHistoryEntry,
        'status' | 'resultPayload' | 'errorMessage' | 'completedAt' | 'durationMs'
      >
    >
  ) => Promise<void>;
  runViaExtension: (historyId: string, request: ActionRequest) => Promise<ActionOutcome>;
  // Reçoit l'outcome complet (pas seulement la requête) : une action réussie
  // porte souvent l'information nécessaire à la resynchronisation dans son
  // resultPayload (ex. publish_listing renvoie vintedItemId/vintedUrl).
  resyncAffectedData: (request: ActionRequest, outcome: Extract<ActionOutcome, { status: 'success' }>) => Promise<void>;
  now: () => Date;
}

export interface ActionEngine {
  prepare: <TPayload>(
    request: ActionRequest<TPayload>,
    ctx: ActionContext,
    checkDeps: ActionCheckDeps
  ) => Promise<
    { ok: true; prepared: PreparedAction<TPayload> } | { ok: false; failure: ActionCheckFailure }
  >;
  confirm: (prepared: PreparedAction) => Promise<ActionResult>;
  cancel: (prepared: PreparedAction) => Promise<ActionResult>;
}
