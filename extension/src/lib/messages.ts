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

// Duplique EditableFieldName (src/lib/actions/handlers/editListing.ts) --
// meme convention de duplication assumee pour EditListingPayload.
export type EditableFieldName =
  | "title"
  | "description"
  | "price"
  | "category"
  | "brand"
  | "size"
  | "condition"
  | "color"
  | "material";

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
  // BUG REEL trouve en test reel le 2026-07-16 : le formulaire d'edition
  // a deja une categorie definie, donc traiter les 9 champs
  // inconditionnellement (comme en creation) ouvrait/attendait le
  // selecteur de categorie meme pour un simple changement de prix,
  // bloquant le pipeline sur un panneau jamais necessaire pour ce test.
  // vinted-edit.ts ne touche/n'attend desormais QUE les champs listes
  // ici -- calcule cote EditListingModal.tsx en comparant le formulaire a
  // l'annonce d'origine, avant toute fusion.
  changedFields: EditableFieldName[];
  // Identifiant de l'action (RunActionRequest.historyId, meme ligne
  // action_log cote app) -- injecte par handleEditListing.ts (le payload
  // app ne le porte pas, il vit deja au niveau RunActionRequest). Sert
  // uniquement a correler les logs du content script avec ceux du
  // background/de l'app pour un meme run -- jamais utilise pour la logique
  // metier elle-meme.
  historyId?: string;
}

// Verification post-sauvegarde (2026-07-16) : CAUSE RACINE demontree du
// "faux succes" -- l'ancienne "confirmation" attendait que location.pathname
// corresponde a /\/items\/\d+/, un regex sans ancrage qui matchait DEJA
// l'URL de depart /items/{id}/edit (qui CONTIENT "/items/{id}") des le tout
// premier essai synchrone de waitForCondition, avant meme que le clic sur
// Enregistrer ait pu produire un quelconque effet reel. SAVE_CONFIRMED
// n'a donc jamais ete une preuve de quoi que ce soit. Desormais, apres le
// clic, le background renavigue explicitement vers la MEME page d'edition
// (chrome.tabs.update) et relit la valeur REELLE des champs texte modifies
// (titre/description/prix -- seuls relisibles de facon fiable, meme
// selecteurs que l'ecriture) -- "preuve acceptable" #3 explicitement
// demandee : "rechargement de la page d'edition et lecture du champ prix
// egal a la valeur demandee". Reutilise EDIT_TAB_READY pour cette seconde
// injection (meme mecanisme deja fiable que le premier envoi).
export interface VerifyEditFieldsPayload {
  historyId?: string;
  expected: Partial<Record<"title" | "description" | "price", string>>;
}

// Background -> content script, via chrome.tabs.sendMessage.
export type ContentCommand =
  | { type: "PUBLISH_LISTING"; payload: PublishListingPayload }
  | { type: "EDIT_LISTING"; payload: EditListingPayload }
  | { type: "VERIFY_EDIT_FIELDS"; payload: VerifyEditFieldsPayload };

// Content script -> background, via chrome.runtime.sendMessage (meme canal
// interne que ACCOUNT_DETECTED/LISTINGS_DETECTED, capte par onMessage).
// Reutilise les memes etapes/variantes pour publish_listing ET edit_listing
// (PublishStep est deja documente comme generique -- pas de doublon
// EDIT_PROGRESS/EDIT_RESULT).
//
// EDIT_TAB_READY (2026-07-15) : CAUSE RACINE demontree du pipeline
// ResellOS -> Vinted qui n'atteignait jamais Vinted -- vinted-edit.ts se
// charge de facon asynchrone (chunk CRXJS charge dynamiquement, sur une
// vraie navigation de page) et pouvait ne pas encore avoir enregistre son
// listener chrome.runtime.onMessage quand handleEditListing.ts tentait de
// lui envoyer la commande EDIT_LISTING. L'ancien mecanisme (retry aveugle,
// 6 tentatives / 250ms, ~7.75s max) abandonnait puis FERMAIT l'onglet
// (chrome.tabs.remove) des que les tentatives s'epuisaient -- observe
// comme "la page Vinted s'ouvre brievement puis disparait". Desormais le
// content script signale explicitement quand il est pret a recevoir une
// commande ; handleEditListing.ts attend ce signal avant tout envoi,
// eliminant la course entierement plutot que d'allonger un delai au
// hasard.
// EDIT_SAVE_SUBMITTED (2026-07-16) : remplace l'ancien faux "succes"
// immediat -- signale seulement que le clic sur Enregistrer a eu lieu et
// qu'une navigation hors de /edit a ete detectee (predicat CORRIGE :
// exclut desormais explicitement /edit), PAS que Vinted a reellement
// enregistre la nouvelle valeur. Le pipeline edit_listing ne se termine
// plus sur ce signal -- seul EDIT_VERIFICATION_RESULT (apres relecture
// reelle) determine success/error.
export type ContentReport =
  | { type: "PUBLISH_PROGRESS"; step: PublishStep }
  | { type: "PUBLISH_RESULT"; outcome: RunActionOutcome }
  | { type: "EDIT_TAB_READY" }
  | { type: "EDIT_SAVE_SUBMITTED"; vintedItemId: string; vintedUrl: string }
  | { type: "EDIT_VERIFICATION_RESULT"; matches: boolean; details: Record<string, { expected: string; actual: string | null }> };

export function isContentCommand(msg: unknown): msg is ContentCommand {
  if (typeof msg !== "object" || msg === null || !("type" in msg)) return false;
  const type = (msg as { type: unknown }).type;
  return type === "PUBLISH_LISTING" || type === "EDIT_LISTING" || type === "VERIFY_EDIT_FIELDS";
}

export function isContentReport(msg: unknown): msg is ContentReport {
  if (typeof msg !== "object" || msg === null || !("type" in msg)) return false;
  const type = (msg as { type: unknown }).type;
  return (
    type === "PUBLISH_PROGRESS" ||
    type === "PUBLISH_RESULT" ||
    type === "EDIT_TAB_READY" ||
    type === "EDIT_SAVE_SUBMITTED" ||
    type === "EDIT_VERIFICATION_RESULT"
  );
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

// draftProtected : true si une modification locale non synchronisee
// (vinted_sync_status sync_pending/sync_failed) existait deja pour cet
// article -- l'import a alors delibrement PRESERVE le brouillon (titre/
// prix/description/...) plutot que de l'ecraser par les valeurs Vinted
// (demande explicite 2026-07-15 : "ne pas ecraser silencieusement le
// brouillon lors d'un nouvel import sans avertissement").
export type ImportItemResponse =
  | { ok: true; created: boolean; draftProtected: boolean }
  | { ok: false; error: string };

// Verification legere en lecture seule (2026-07-14) : le bouton injecte par
// vinted-item.ts doit afficher "Importer" ou "Mettre a jour" AVANT tout
// clic, ce qui necessite de demander au background (seul a avoir acces a
// Supabase) si l'article est deja lie -- aucune ecriture declenchee.
export type CheckItemLinkedResponse = { ok: true; linked: boolean } | { ok: false; error: string };

// Popup et content scripts -> background, via chrome.runtime.sendMessage
// (sans id, meme extension - capte par onMessage, pas onMessageExternal).
export type InternalMessage =
  | { type: "GET_STATUS" }
  | { type: "UNPAIR" }
  | { type: "ACCOUNT_DETECTED"; vintedUserId: string; vintedUsername: string }
  | { type: "LISTINGS_DETECTED"; vintedUserId: string; vintedUsername: string; listings: ListingPayload[] }
  | { type: "IMPORT_ITEM_REQUESTED"; vintedUsername: string; item: SingleItemPayload }
  | { type: "CHECK_ITEM_LINKED_REQUESTED"; vintedUsername: string; vintedItemId: string }
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
    type === "CHECK_ITEM_LINKED_REQUESTED" ||
    isContentReport(msg)
  );
}
