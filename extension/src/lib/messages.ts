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

// Phase 3.1 (publication) : etapes de progression rapportees pendant
// l'execution d'une action longue. Nom volontairement generique
// (PublishStep) meme si seule publish_listing les emet aujourd'hui - les
// actions futures (republication, offres) reutiliseront ce meme type.
export type PublishStep =
  | "preparing"
  | "connecting"
  | "uploading_photos"
  | "filling_form"
  | "publishing"
  | "syncing";

export interface PublishListingPayload {
  title: string;
  description: string;
  price: number;
  category: string;
  brand: string | null;
  size: string | null;
  condition: string;
  color: string | null;
  material: string | null;
  imageUrls: string[];
  packageSize: "small" | "medium" | "large";
  expectedVintedUsername: string;
}

// Modification d'une annonce existante (Partie 4, sprint extension V1) :
// mêmes champs texte/attributs que PublishListingPayload, sans photos
// (limite V1 validée avec l'utilisateur -- le widget photo du formulaire
// d'édition n'est pas vérifié en direct) ni packageSize (déjà défini sur
// Vinted, non modifié ici). vintedItemId cible la page d'édition exacte
// (https://www.vinted.fr/items/{id}/edit -- URL confirmée en direct, mais
// pas encore le contenu du formulaire lui-même).
export interface EditListingPayload {
  vintedItemId: string;
  title: string;
  description: string;
  price: number;
  category: string;
  brand: string | null;
  size: string | null;
  condition: string;
  color: string | null;
  material: string | null;
  expectedVintedUsername: string;
}

// Background -> content script, via chrome.tabs.sendMessage.
export type ContentCommand =
  | { type: "PUBLISH_LISTING"; payload: PublishListingPayload }
  | { type: "EDIT_LISTING"; payload: EditListingPayload };

// Content script -> background, via chrome.runtime.sendMessage (meme canal
// interne que ACCOUNT_DETECTED/LISTINGS_DETECTED, capte par onMessage).
// Reutilise les memes etapes/variantes pour publish_listing ET edit_listing
// (PublishStep est deja documente comme generique -- pas de doublon
// EDIT_PROGRESS/EDIT_RESULT).
export type ContentReport =
  | { type: "PUBLISH_PROGRESS"; step: PublishStep }
  | { type: "PUBLISH_RESULT"; outcome: RunActionOutcome };

export function isContentCommand(msg: unknown): msg is ContentCommand {
  if (typeof msg !== "object" || msg === null || !("type" in msg)) return false;
  const type = (msg as { type: unknown }).type;
  return type === "PUBLISH_LISTING" || type === "EDIT_LISTING";
}

export function isContentReport(msg: unknown): msg is ContentReport {
  if (typeof msg !== "object" || msg === null || !("type" in msg)) return false;
  const type = (msg as { type: unknown }).type;
  return type === "PUBLISH_PROGRESS" || type === "PUBLISH_RESULT";
}

// App web -> background, port persistant (chrome.runtime.connect, via
// externally_connectable) pour relayer la progression d'une action longue -
// complement du canal RUN_ACTION (sendMessage/callback unique, qui ne porte
// que le resultat terminal). Un seul port actif a la fois est supporte (une
// seule action en cours a la fois cote UI) - voir EXTENSION.md.
export const ACTION_PROGRESS_PORT_NAME = "action-progress";
export type ActionProgressPortMessage = { type: "progress"; step: PublishStep };

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

// Import intelligent (annonce Vinted existante -> ResellOS), declenche par
// un clic explicite sur la page item (content/vinted-item.ts) -- jamais
// automatique, contrairement a ACCOUNT_DETECTED/LISTINGS_DETECTED. Plus
// riche que ListingPayload (description/categorie/couleur/etat/matiere/
// galerie complete) car c'est une action deliberee sur UN article precis,
// pas une synchro de fond.
export interface SingleItemPayload {
  vintedItemId: string;
  vintedUrl: string;
  title: string;
  description: string | null;
  price: number | null;
  brand: string | null;
  category: string | null;
  color: string | null;
  size: string | null;
  condition: string | null;
  material: string | null;
  imageUrls: string[];
}

export type ImportItemResponse = { ok: true; created: boolean } | { ok: false; error: string };

// Popup et content scripts -> background, via chrome.runtime.sendMessage
// (sans id, meme extension - capte par onMessage, pas onMessageExternal).
export type InternalMessage =
  | { type: "GET_STATUS" }
  | { type: "UNPAIR" }
  | { type: "ACCOUNT_DETECTED"; vintedUserId: string; vintedUsername: string }
  | { type: "LISTINGS_DETECTED"; vintedUserId: string; vintedUsername: string; listings: ListingPayload[] }
  | { type: "IMPORT_ITEM_REQUESTED"; vintedUsername: string; item: SingleItemPayload }
  | ContentReport;

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
  return (
    type === "GET_STATUS" ||
    type === "UNPAIR" ||
    type === "ACCOUNT_DETECTED" ||
    type === "LISTINGS_DETECTED" ||
    type === "IMPORT_ITEM_REQUESTED" ||
    isContentReport(msg)
  );
}
