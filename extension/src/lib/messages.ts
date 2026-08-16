// Contrat de messages partage entre l'app web, le background et le popup.
// Voir EXTENSION.md §4. Toute nouvelle valeur de "type" doit etre ajoutee ici,
// jamais en dur dans un fichier de traitement.

import type { LogEntry } from "../background/logger";

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
  // "verifying" (2026-07-21) : specifique a edit_listing -- rapportee
  // directement par handleEditListing.ts (background), pas par un content
  // script via PUBLISH_PROGRESS, puisque la phase de verification est
  // desormais declenchee par l'observation de navigation du background
  // lui-meme (voir cause racine #4 dans editListing.ts). publish_listing ne
  // rapporte jamais cette valeur.
  | "verifying"
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

// Audit "prefill partiel" (2026-08-10) : le fetch() des photos est deplace
// du content script (vinted-publish.ts, soumis au CORS de vinted.fr) vers
// handlePublishListing.ts (background, beneficie de host_permissions sur
// images*.vinted.net, voir manifest.config.ts). Le content script ne recoit
// plus jamais d'URL a fetcher lui-meme -- uniquement le resultat deja tente,
// succes ou echec explicite, jamais suppose. arrayBuffer null = fetch echoue
// (voir error) ; le content script ne retente jamais lui-meme.
// Champs de diagnostic ajoutes (mission "5 photos non reconnues comme images",
// 2026-08-11) : PHOTO_CONTENT_NOT_RECOGNIZED_AS_IMAGE observe 5/5 en test live
// -- avant de supposer quoi que ce soit (faux positif du sniffer vs contenu
// reellement invalide), il faut pouvoir comparer le Content-Type HTTP declare
// par le CDN aux magic bytes reels, et savoir si une redirection a eu lieu
// (ex. vers une page d'erreur/challenge). Tous optionnels/nullable -- best
// effort, ne doivent jamais faire echouer fetchPhoto() si absents.
export interface FetchedPhoto {
  url: string;
  arrayBuffer: ArrayBuffer | null;
  mimeType: string | null;
  fileName: string;
  error: string | null;
  httpStatus: number | null;
  contentTypeHeader: string | null;
  contentLengthHeader: string | null;
  finalUrl: string | null;
  redirected: boolean | null;
}

// Mission "PREUVE LIVE PRECISE -- TRANSPORT BINAIRE PHOTOS" (2026-08-11) :
// CAUSE CONFIRMEE -- chrome.tabs.sendMessage() serialise son message via
// JSON (documente par Chrome), pas via clone structure complet -- un
// ArrayBuffer degenere en "{}" a la traversee (aucune propriete enumerable
// propre), perdant integralement les octets. Forme "sur le fil" de
// FetchedPhoto : arrayBuffer (binaire reel) remplace par arrayBufferBase64
// (string, JSON-safe) -- utilisee UNIQUEMENT entre sendPublishCommand()
// (background, encode) et le listener PUBLISH_LISTING (content script,
// decode immediatement en ArrayBuffer reel avant tout autre traitement).
// fetchPhoto()/reconstructPhotoFiles() ne voient jamais ce type, ils
// continuent de manipuler FetchedPhoto (ArrayBuffer reel) sans changement.
export interface FetchedPhotoWire extends Omit<FetchedPhoto, "arrayBuffer"> {
  arrayBufferBase64: string | null;
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
//
// AUTO_ENRICH_REQUESTED (audit "prefill partiel", 2026-08-10) : envoye a un
// onglet Vinted ouvert en arriere-plan (inactive:true) sur la page d'une
// annonce EXISTANTE (/items/{id}), jamais /items/new -- demande a
// vinted-item.ts d'extraire les details complets (meme fonctions que le clic
// "Importer", voir buildPayload() dans ce fichier) et de les renvoyer
// directement dans la reponse, SANS jamais afficher son bouton flottant ni
// attendre une action utilisateur. Reponse type AutoEnrichResponse.
export type ContentCommand =
  | { type: "PUBLISH_LISTING"; payload: PublishListingPayload; photos: FetchedPhotoWire[] }
  | { type: "EDIT_LISTING"; payload: EditListingPayload }
  | { type: "VERIFY_EDIT_FIELDS"; payload: VerifyEditFieldsPayload }
  | { type: "AUTO_ENRICH_REQUESTED" };

// Reponse directe (callback de chrome.tabs.sendMessage) a AUTO_ENRICH_REQUESTED
// -- distincte de ContentReport (qui porte des messages POUSSES par le
// content script de sa propre initiative) : ceci est la reponse synchrone-ish
// a UNE commande precise, meme convention que ImportItemResponse/
// CheckItemLinkedResponse plus bas dans ce fichier.
export type AutoEnrichResponse =
  | { ok: true; item: SingleItemPayload; vintedUsername: string }
  | { ok: false; error: string };

// Reponse synchrone (ACK) a PUBLISH_LISTING (mission "ACK PUBLISH_LISTING
// MANQUANT", 2026-08-11) -- CAUSE CONFIRMEE en test live : l'ancien listener
// (vinted-publish.ts) ne repondait JAMAIS (ni sendResponse, ni return true),
// laissant Chrome fermer le port avant reponse ("message port closed before a
// response was received.") alors meme que le content script avait bien recu
// le message et demarre runPublish(). Distingue desormais explicitement DEUX
// notions : "la commande a ete remise au content script" (ce type) vs "la
// republication est terminee" (toujours PUBLISH_RESULT/onTabUpdated,
// jamais confondus). `duplicate:true` si PUBLISH_LISTING arrive alors qu'un
// runPublish() est deja en cours dans ce document -- accepte proprement SANS
// relancer un second traitement (voir runPublishInFlight, vinted-publish.ts).
// documentInstanceId (mission "DIAGNOSTIC LIVE APRES REJET DES PHOTOS
// INVALIDES", 2026-08-11) : identifiant genere UNE FOIS au boot du content
// script (const module-level, voir vinted-publish.ts), stable tant que le
// MEME document JS reste vivant. Permet de prouver -- au lieu de le
// supposer -- si le document qui a repondu a PUBLISH_LISTING (donc dont
// runPublish() a demarre) est bien le MEME document que celui finalement
// visible/rempli par l'utilisateur, ou si une navigation Vinted l'a remplace
// entre-temps par un document B jamais destinataire de la commande.
export interface PublishCommandResponse {
  ok: true;
  accepted: true;
  duplicate: boolean;
  documentInstanceId: string;
}

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
// EDIT_FIELD_FILL_FAILED (2026-07-25, mode diagnostic minimal -- demande
// explicite) : distinct de PUBLISH_RESULT{status:"error"}. Envoye
// UNIQUEMENT si un champ echoue a se remplir AVANT le clic sur "Valider"
// (ex. selectMatchingOption ne trouve jamais le conteneur d'options d'un
// picker marque/taille/etat/couleur/matiere) -- jamais pour un echec
// pendant/apres submitEdit() (clic + attente de navigation), qui continue
// de rapporter PUBLISH_RESULT normalement. Seul ce signal precis indique a
// handleEditListing.ts de laisser l'onglet Vinted ouvert au lieu de le
// fermer, pour permettre l'inspection manuelle du DOM reel qui a echoue.
// PUBLISH_PREFILL_SUMMARY (republication assistee, 2026-08-11) : envoye une
// seule fois par vinted-publish.ts juste apres la phase de remplissage
// automatise (texte + photos, seuls champs jamais tentes ici -- voir le
// commentaire d'en-tete de resolveCategory() dans formFill.ts : le picker
// categorie n'ouvre jamais via script, et brand/size/condition/color/material
// n'existent meme pas dans le DOM tant qu'une categorie feuille n'a pas ete
// choisie). `confirmed` ne liste que les champs RELUS dans le DOM apres
// ecriture (jamais juste "tentes") ; `pending` liste les champs que
// l'utilisateur doit terminer lui-meme sur Vinted, EXCLUANT tout champ vide
// dans l'annonce d'origine (inutile de demander de "confirmer" un champ que
// le vendeur n'avait jamais renseigne). Cote handlePublishListing.ts,
// reception de ce message marque aussi le debut de la phase d'attente d'un
// clic reel de l'utilisateur (voir keepTabOpen sur timeout).
// PUBLISH_TAB_READY (mission "port message ferme", 2026-08-11) : MEME cause
// racine et MEME correctif qu'EDIT_TAB_READY ci-dessus, appliques a
// publish_listing -- vinted-publish.ts se chargeait de facon asynchrone sur
// /items/new (plusieurs cycles de navigation reels observes en direct, voir
// TAB_UPDATED repetes avant "complete") et handlePublishListing.ts envoyait
// PUBLISH_LISTING en aveugle (retry a duree fixe) des la creation de
// l'onglet -- "Receiving end does not exist" puis "message port closed"
// confirmes en test live, jamais recus cote content script
// (CONTENT_SCRIPT_MESSAGE_RECEIVED absent des logs). Desormais le content
// script signale explicitement sa disponibilite ; PUBLISH_LISTING n'est
// envoye qu'apres reception de ce signal, jamais avant.
export type ContentReport =
  | { type: "PUBLISH_PROGRESS"; step: PublishStep }
  | { type: "PUBLISH_RESULT"; outcome: RunActionOutcome }
  | { type: "PUBLISH_PREFILL_SUMMARY"; confirmed: string[]; pending: string[] }
  | { type: "PUBLISH_TAB_READY"; documentInstanceId: string }
  | { type: "EDIT_TAB_READY" }
  | { type: "EDIT_SAVE_SUBMITTED"; vintedItemId: string; vintedUrl: string }
  | {
      type: "EDIT_VERIFICATION_RESULT";
      matches: boolean;
      // `matches` par champ (2026-07-27, bug reel confirme) : la comparaison
      // reelle du prix est numerique (parsePriceToNumber, gere le format
      // Vinted "83,00 €" vs la valeur brute demandee "83") -- describeMismatch
      // (editListing.ts) comparait auparavant les chaines BRUTES pour decider
      // quels champs afficher, listant a tort le prix comme "en desaccord"
      // meme quand sa comparaison numerique avait reellement reussi. Chaque
      // entree porte desormais son propre verdict, source unique de verite.
      details: Record<string, { expected: string; actual: string | null; matches: boolean }>;
    }
  | { type: "EDIT_FIELD_FILL_FAILED"; errorMessage: string };

export function isContentCommand(msg: unknown): msg is ContentCommand {
  if (typeof msg !== "object" || msg === null || !("type" in msg)) return false;
  const type = (msg as { type: unknown }).type;
  return type === "PUBLISH_LISTING" || type === "EDIT_LISTING" || type === "VERIFY_EDIT_FIELDS" || type === "AUTO_ENRICH_REQUESTED";
}

export function isContentReport(msg: unknown): msg is ContentReport {
  if (typeof msg !== "object" || msg === null || !("type" in msg)) return false;
  const type = (msg as { type: unknown }).type;
  return (
    type === "PUBLISH_PROGRESS" ||
    type === "PUBLISH_RESULT" ||
    type === "PUBLISH_PREFILL_SUMMARY" ||
    type === "PUBLISH_TAB_READY" ||
    type === "EDIT_TAB_READY" ||
    type === "EDIT_SAVE_SUBMITTED" ||
    type === "EDIT_VERIFICATION_RESULT" ||
    type === "EDIT_FIELD_FILL_FAILED"
  );
}

// App web -> background, port persistant (chrome.runtime.connect, via
// externally_connectable) pour relayer la progression d'une action longue -
// complement du canal RUN_ACTION (sendMessage/callback unique, qui ne porte
// que le resultat terminal). Un seul port actif a la fois est supporte (une
// seule action en cours a la fois cote UI) - voir EXTENSION.md.
export const ACTION_PROGRESS_PORT_NAME = "action-progress";
// "heartbeat" (2026-07-17) : maintien du service worker MV3 actif pendant
// une action longue (voir runAction.ts) -- DISTINCT de "progress" pour que
// l'app ne journalise jamais une entree "Centre des Actions" en double
// pour la meme etape reemise periodiquement. Aucune signification metier,
// uniquement un vrai appel chrome.runtime.Port.postMessage() qui
// reinitialise le minuteur d'inactivite de Chrome cote background.
// "prefill_summary" (republication assistee, 2026-08-11) : relaie
// PUBLISH_PREFILL_SUMMARY (voir ContentReport) jusqu'a l'app via le meme
// port persistant que la progression -- l'app n'a besoin de cette
// information qu'une seule fois par action, jamais rejouee comme "progress".
export type ActionProgressPortMessage =
  | { type: "progress"; step: PublishStep }
  | { type: "prefill_summary"; confirmed: string[]; pending: string[] }
  | { type: "heartbeat" };

// App web -> background, via chrome.runtime.sendMessage(EXTENSION_ID, ...)
// (externally_connectable, limite a l'origine de l'app - voir manifest.config.ts)
//
// GET_STATUS/UNPAIR (2026-07-28) : deja geres cote background pour le popup
// (InternalMessage) depuis le tout debut -- ajoutes ici uniquement pour que
// VintedAccountPage.tsx (page web) puisse lire l'etat d'appairage reel et
// dissocier l'extension sans passer par le popup Chrome. Aucune nouvelle
// logique metier : memes fonctions pair()/unpair()/getStatus() (voir
// background/index.ts), qui ne lisent/ecrivent jamais que la session locale
// de l'extension -- aucune donnee sensible supplementaire exposee a l'app.
export type ExternalMessage =
  | { type: "PING" }
  | { type: "PAIR"; access_token: string; refresh_token: string }
  | { type: "GET_STATUS" }
  | { type: "UNPAIR" }
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

// RELAY_LOG_ENTRY (2026-07-25, bug reel confirme en test edit_listing) : un
// content script ne persiste plus jamais directement dans chrome.storage.local
// (voir logger.ts) -- il relaie chaque entree ici, et seul le background
// (persistRelayedEntry(), une seule writeQueue pour toute l'extension) ecrit
// reellement, eliminant la course entre les writeQueue independantes de
// chaque contexte JS.
export type RelayLogEntryMessage = { type: "RELAY_LOG_ENTRY"; entry: LogEntry };

// Popup et content scripts -> background, via chrome.runtime.sendMessage
// (sans id, meme extension - capte par onMessage, pas onMessageExternal).
export type InternalMessage =
  | { type: "GET_STATUS" }
  | { type: "UNPAIR" }
  | { type: "ACCOUNT_DETECTED"; vintedUserId: string; vintedUsername: string }
  | { type: "LISTINGS_DETECTED"; vintedUserId: string; vintedUsername: string; listings: ListingPayload[] }
  | { type: "IMPORT_ITEM_REQUESTED"; vintedUsername: string; item: SingleItemPayload }
  | { type: "CHECK_ITEM_LINKED_REQUESTED"; vintedUsername: string; vintedItemId: string }
  | RelayLogEntryMessage
  | ContentReport;

export interface StatusResponse {
  paired: boolean;
  // P-04 (audit pre-beta 2026-08-03) : id de l'utilisateur ResellOS auquel
  // l'extension est reellement appairee (chrome.storage.local, voir
  // session.ts) -- distinct de l'utilisateur connecte dans l'onglet web au
  // meme instant. Sans ce champ, le web app n'avait aucun moyen de detecter
  // un appairage "orphelin" d'un compte precedent sur un navigateur partage,
  // et affichait "Connecte" meme quand les prochaines synchros ecriraient
  // silencieusement les donnees Vinted d'un utilisateur B dans le compte
  // ResellOS d'un utilisateur A encore appaire. null si non appaire.
  pairedUserId: string | null;
  vintedConnected: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export type InternalResponse = StatusResponse | ExternalResponse;

export function isExternalMessage(msg: unknown): msg is ExternalMessage {
  if (typeof msg !== "object" || msg === null || !("type" in msg)) return false;
  const type = (msg as { type: unknown }).type;
  return type === "PING" || type === "PAIR" || type === "GET_STATUS" || type === "UNPAIR" || type === "RUN_ACTION";
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
    type === "RELAY_LOG_ENTRY" ||
    isContentReport(msg)
  );
}
