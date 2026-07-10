// Contrat de messages partage entre l'app web, le background et le popup.
// Voir EXTENSION.md §4. Toute nouvelle valeur de "type" doit etre ajoutee ici,
// jamais en dur dans un fichier de traitement.

// ActionKind duplique depuis src/lib/actions/types.ts (pas importe : extension/
// est un paquet independant, sans tooling monorepo - meme convention deja
// assumee pour ListingPayload ci-dessous, voir EXTENSION.md §9).
export type ActionKind =
  | "publish_listing"
  | "edit_listing"
  | "edit_price"
  | "edit_photos"
  | "republish_listing"
  | "pause_listing"
  | "reactivate_listing"
  | "delete_listing"
  | "reply_message"
  | "accept_offer"
  | "counter_offer";

// Action Engine (Phase 3, preparation) : requete envoyee par l'app web une
// fois l'action preparee et confirmee cote client (historyId = ligne
// action_log deja inseree en pending_confirmation par prepare()). Voir
// EXTENSION.md et ARCHITECTURE.md §4.6.
export interface RunActionRequest {
  historyId: string;
  kind: ActionKind;
  vintedAccountId: string | null;
  listingId?: string;
  payload: Record<string, unknown>;
}

export type RunActionOutcome =
  | { status: "success"; resultPayload?: Record<string, unknown> }
  | { status: "error"; errorMessage: string }
  | { status: "not_implemented" };

export type RunActionResponse = { ok: true; outcome: RunActionOutcome } | { ok: false; error: string };

// App web -> background, via chrome.runtime.sendMessage(EXTENSION_ID, ...)
// (externally_connectable, limite a l'origine de l'app - voir manifest.config.ts)
export type ExternalMessage =
  | { type: "PING" }
  | { type: "PAIR"; access_token: string; refresh_token: string }
  | { type: "RUN_ACTION"; request: RunActionRequest };

export type ExternalResponse = { ok: true } | { ok: false; error: string };

export interface ListingPayload {
  vintedItemId: string;
  title: string;
  price: number | null;
  imageUrl: string | null;
  vintedUrl: string;
  favourites: number | null;
  views: number | null;
  status: string;
  brand: string | null;
  size: string | null;
}

// Popup et content scripts -> background, via chrome.runtime.sendMessage
// (sans id, meme extension - capte par onMessage, pas onMessageExternal).
export type InternalMessage =
  | { type: "GET_STATUS" }
  | { type: "UNPAIR" }
  | { type: "ACCOUNT_DETECTED"; vintedUserId: string; vintedUsername: string }
  | { type: "LISTINGS_DETECTED"; vintedUserId: string; vintedUsername: string; listings: ListingPayload[] };

export interface StatusResponse {
  paired: boolean;
  vintedConnected: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export type InternalResponse = StatusResponse | ExternalResponse;

export function isExternalMessage(msg: unknown): msg is ExternalMessage {
  if (typeof msg !== "object" || msg === null || !("type" in msg)) return false;
  const type = (msg as { type: unknown }).type;
  return type === "PING" || type === "PAIR" || type === "RUN_ACTION";
}

export function isInternalMessage(msg: unknown): msg is InternalMessage {
  if (typeof msg !== "object" || msg === null || !("type" in msg)) return false;
  const type = (msg as { type: unknown }).type;
  return type === "GET_STATUS" || type === "UNPAIR" || type === "ACCOUNT_DETECTED" || type === "LISTINGS_DETECTED";
}
