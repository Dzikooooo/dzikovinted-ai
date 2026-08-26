// Handler d'execution pour "publish_listing"/"republish_listing" (reutilise
// tel quel pour les deux, voir runAction.ts). Ouvre un onglet Vinted, delegue
// le remplissage des champs surs au content script (vinted-publish.ts),
// relaie sa progression et son etat des lieux de prereplissage, garantit un
// statut terminal explicite dans tous les cas (aucune donnee perdue - voir
// EXTENSION.md).
//
// REPUBLICATION ASSISTEE (2026-08-11, lot dedie) : reecriture complete du
// mecanisme de detection de succes. L'ancienne version attendait un message
// PUBLISH_RESULT envoye par le content script apres un clic SYNTHETIQUE sur
// le bouton de soumission -- jamais verifie en conditions reelles, et
// desormais explicitement abandonne (voir le commentaire d'en-tete de
// vinted-publish.ts : aucun clic automatique final, meme raison que
// vinted-edit.ts). La soumission reelle est maintenant un clic 100% humain ;
// ce handler detecte une reussite authentique exactement comme
// handleEditListing.ts le fait deja pour la sauvegarde d'edition -- via
// chrome.tabs.onUpdated, qui observe la navigation REELLE du tab
// independamment du content script (dont le contexte JS est de toute facon
// detruit par une vraie navigation de page, voir cause racine #4 documentee
// dans editListing.ts). Une URL /items/{id numerique}, distincte de
// /items/new, est une preuve directe et suffisante que Vinted a reellement
// cree l'annonce -- contrairement a edit_listing, aucune phase de
// verification separee n'est necessaire ici (il n'y a pas de valeur
// "avant/apres" a comparer, juste une annonce qui existe ou n'existe pas).
//
// tabActive:true (au lieu de false) : l'utilisateur doit VOIR l'onglet pour
// pouvoir terminer categorie/attributs et cliquer lui-meme sur "Ajouter" --
// meme raison que active:true dans handleEditListing.ts.
//
// keepTabOpen sur timeout APRES reception de PUBLISH_PREFILL_SUMMARY : une
// fois la phase automatisee terminee, l'utilisateur peut legitimement
// prendre plusieurs minutes pour naviguer l'arbre de categories et remplir
// le reste a la main -- fermer l'onglet sous son nez au premier timeout
// detruirait un travail en cours. Seul un timeout survenant AVANT ce point
// (page jamais chargee, compte non detecte...) continue de fermer l'onglet
// normalement, comme avant.

import { logger } from "../logger";
import { isContentReport } from "../../lib/messages";
import type {
  ContentCommand,
  FetchedPhoto,
  PublishCommandResponse,
  PublishListingPayload,
  PublishStep,
  RunActionOutcome,
  RunActionRequest,
} from "../../lib/messages";
import { errorDetails, errorMessage } from "../../lib/errorMessage";
import { arrayBufferToBase64, describeBinaryValue } from "../../lib/binaryTransport";
import { enrichListingIfNeeded } from "./enrichListing";
import { findListingsByVintedItemIds, listKnownVintedItemIds } from "../sync";
import { startAccountSync, type OpenSyncTabResult } from "../syncCoordinator";
import { performRepublishReplaceTransaction } from "../republishTransaction";

// Mission "PORT MESSAGE FERMÉ" (2026-08-11) : etiquette constante de l'onglet
// PRINCIPAL (visible, actif) dans tous les logs TAB_*/SEND_MESSAGE_* -- a
// distinguer de l'onglet TEMPORAIRE d'enrichissement (purpose="enrich", voir
// enrichListing.ts), jamais le meme onglet que celui qui affiche l'erreur
// Vinted rapportee en direct.
const TAB_PURPOSE = "publish" as const;

const VINTED_NEW_LISTING_URL = "https://www.vinted.fr/items/new";
// Genereux et volontairement NON mesure (2026-08-11) : contrairement aux
// attentes internes du content script (waitForElement/waitForCondition,
// qui restent plafonnees a quelques dizaines de secondes sur des etapes
// reellement automatisees), ce delai couvre desormais aussi le temps que
// l'utilisateur prend pour naviguer lui-meme l'arbre de categories Vinted,
// choisir ses attributs, et cliquer sur "Ajouter" -- une duree humaine, pas
// une duree de script. 10 minutes, a ajuster avec un vrai retour d'usage
// (aucune publication assistee n'a encore ete testee en conditions
// reelles) plutot que devinee plus courte et risquer de couper l'utilisateur
// en plein milieu de sa saisie.
const GLOBAL_TIMEOUT_MS = 600000;
// Mission "PORT MESSAGE FERMÉ" (2026-08-11) : delai raisonnable pour qu'une
// vraie navigation de page + injection du content script se termine --
// distinct et bien plus court que GLOBAL_TIMEOUT_MS (qui couvre en plus toute
// la phase manuelle utilisateur). Meme valeur qu'editListing.ts::TAB_READY_TIMEOUT_MS
// (pattern identique, cause racine identique -- voir commentaire d'en-tete
// de vinted-publish.ts::bootPublishContentScript).
const TAB_READY_TIMEOUT_MS = 30000;
// Mission "REPUBLICATION : PUBLICATION REUSSIE MAIS SUCCES NON DETECTE"
// (2026-08-17) : bornes explicites de la reconciliation post-submit (CAS B,
// /member/{userId}) -- "quelques retries bornés" (demande explicite), jamais
// une boucle infinie. Le delai entre tentatives laisse le temps a l'index
// wardrobe Vinted (potentiellement en retard de quelques secondes juste
// apres une creation) de se mettre a jour avant le prochain rechargement.
const RECONCILE_MAX_ATTEMPTS = 4;
const RECONCILE_RETRY_DELAY_MS = 4000;

function isNewListingUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).pathname.startsWith("/items/new");
  } catch {
    return false;
  }
}

// Vraie annonce creee : /items/{id numerique}, jamais /items/new lui-meme.
function extractPublishedItemId(url: string | undefined): string | null {
  if (!url || isNewListingUrl(url)) return null;
  try {
    const match = new URL(url).pathname.match(/^\/items\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Mission "REPUBLICATION : PUBLICATION REUSSIE MAIS SUCCES NON DETECTE"
// (2026-08-17) : CAUSE CONFIRMEE en test live -- apres un clic humain reussi
// sur "Ajouter", Vinted ne redirige pas toujours vers /items/{nouvel_id}
// (le seul cas gere jusqu'ici, voir extractPublishedItemId ci-dessus) : le
// tab de publication a ete observe naviguant vers /member/{userId}
// (parfois suivi de ?promo_shown=true). L'ID numerique du compte est extrait
// depuis le PATH -- `new URL().pathname` exclut deja la query string, donc
// aucun traitement special n'est necessaire pour ?promo_shown=true.
// IMPORTANT : cette fonction ne prouve PAS a elle seule un succes -- une
// navigation vers /member/{userId} est seulement le SIGNAL qui declenche une
// reconciliation ciblee (voir reconcilePostSubmitViaMemberRedirect plus bas),
// jamais un succes aveugle.
function extractMemberUserId(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const match = new URL(url).pathname.match(/^\/member\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mission "AUTOMATISER ENTIEREMENT LA REPUBLICATION" (2026-08-17), CAS C :
// preuve live obtenue -- la reponse REELLE de POST /api/v2/item_upload/items
// (capturee par publishCreateResponseCapture.ts, transport fetch OU xhr)
// contient directement l'id du nouvel item cree
// ({"item":{"id":9691226139},...,"code":0}), sans ambiguite possible
// contrairement a CAS A (navigation /items/{id}, pas toujours declenchee --
// la reponse observee porte after_upload_actions:["show_upload_another_item_tip"],
// signe que Vinted peut rester sur la page apres creation) et CAS B
// (redirection /member/{userId}, plus lente, plus indirecte). Cette fonction
// est PUREMENT une validation -- aucune decision ici, seulement une preuve
// verifiee ou un rejet explicite avec sa raison exacte, jamais un throw
// (une reponse malformee/inattendue doit degrader vers CAS A/CAS B/timeout
// global, jamais crasher le handler).
type PublishCreateResponseValidation =
  | { valid: true; vintedItemId: string }
  | { valid: false; reason: string };

const CREATE_RESPONSE_URL_PATTERN = /\/api\/v2\/item_upload\/items$/;

function validatePublishCreateResponse(
  url: string,
  ok: boolean,
  statusCode: number,
  bodyText: string
): PublishCreateResponseValidation {
  // Revalidation de l'URL cote background -- defense en profondeur, en plus
  // du filtrage deja fait cote MAIN-world (publishCreateResponseCapture.ts) :
  // ce content script est le seul emetteur de ce message aujourd'hui, mais
  // rien ne garantit qu'il le restera, et cette verification est gratuite.
  if (!CREATE_RESPONSE_URL_PATTERN.test(url)) return { valid: false, reason: "unexpected_url" };
  if (!ok) return { valid: false, reason: "not_ok" };
  if (statusCode < 200 || statusCode >= 300) return { valid: false, reason: "bad_status" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { valid: false, reason: "invalid_json" };
  }

  if (typeof parsed !== "object" || parsed === null) return { valid: false, reason: "invalid_json" };
  const code = (parsed as { code?: unknown }).code;
  if (code !== 0) return { valid: false, reason: "unexpected_code" };

  const itemId = (parsed as { item?: { id?: unknown } }).item?.id;
  if (typeof itemId !== "number" || !Number.isInteger(itemId) || itemId <= 0) {
    return { valid: false, reason: "invalid_item_id" };
  }

  return { valid: true, vintedItemId: String(itemId) };
}

// Mission "DIAGNOSTIC REQUEST BODY COULEUR" (2026-08-19) : run live confirme
// -- Couleur "Bleu" reellement selectionnee/confirmee en DOM (aria-checked=
// true), tous les autres champs visibles remplis, auto-submit declenche,
// mais Vinted repond 400 sur ce POST precis. Extraction PURE, aucune
// decision metier -- scanne recursivement le corps de REQUETE (si JSON
// valide) et retourne tout couple cle/valeur dont la cle contient "color" OU
// "attribute" (insensible a la casse, a n'importe quelle profondeur) -- la
// representation reelle de Couleur dans le payload Vinted n'est pas encore
// connue avec certitude (c'est exactement ce que cette instrumentation vise
// a etablir), donc AUCUNE cle precise n'est supposee/codee en dur au-dela de
// ce filtre volontairement large. `null` si le corps n'est pas un JSON valide
// (ex. multipart/form-data) -- jamais un parsing partiel/devine ; `{}` si le
// corps est un JSON valide sans aucun champ correspondant.
export function summarizeColorRelatedFields(requestBodyText: string | null): Record<string, unknown> | null {
  if (!requestBodyText) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(requestBodyText);
  } catch {
    return null;
  }

  const COLOR_OR_ATTRIBUTE_KEY_PATTERN = /color|attribute/i;
  const found: Record<string, unknown> = {};

  function walk(value: unknown, path: string): void {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (typeof value !== "object") return;
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (COLOR_OR_ATTRIBUTE_KEY_PATTERN.test(key)) {
        found[nextPath] = val;
      }
      walk(val, nextPath);
    }
  }

  walk(parsed, "");
  return found;
}

// Meme convention d'URL que extractPublishedItemId ci-dessous (pas de slug
// SEO -- Vinted resout normalement une URL /items/{id} sans slug, la seule
// donnee qui compte pour l'identification/le rattachement est l'id
// numerique, jamais l'URL elle-meme).
function buildVintedItemUrl(vintedItemId: string): string {
  return `https://www.vinted.fr/items/${vintedItemId}`;
}

// Fetch des photos deplace ICI (background), pas dans le content script
// (audit "prefill partiel", 2026-08-10 -- CORS confirme en test live sur
// images1.vinted.net). Un fetch() emis par un content script est soumis au
// CORS de la PAGE HOTE (vinted.fr), qui n'a aucune raison d'autoriser le CDN
// photo Vinted -- host_permissions (manifest.config.ts) ne beneficie qu'aux
// fetch() emis depuis un contexte D'EXTENSION (ici), jamais depuis un
// content script. ArrayBuffer (pas Blob) : toujours structurellement
// clonable via chrome.tabs.sendMessage, y compris pour de gros fichiers.
// Mission "5 photos non reconnues comme images" (2026-08-11) : PHOTO_CONTENT_
// NOT_RECOGNIZED_AS_IMAGE observe 5/5 en test live -- avant de supposer un
// faux positif du sniffer (format moderne non reconnu, ex. AVIF) ou un
// contenu reellement invalide (page d'erreur CDN, challenge, redirection),
// il faut pouvoir comparer le Content-Type HTTP declare par le CDN aux magic
// bytes reels lus cote content script. httpStatus/contentTypeHeader/
// contentLengthHeader/finalUrl/redirected sont donc desormais captures ICI
// (seul endroit avec acces au Response brut) et transmis tels quels -- jamais
// interpretes ici, jamais bloquants (best-effort, comme le reste de fetchPhoto).
export async function fetchPhoto(url: string): Promise<FetchedPhoto> {
  const fileName = url.split("/").pop() || "photo.jpg";
  try {
    const response = await fetch(url);
    const diagnostics = {
      httpStatus: response.status,
      contentTypeHeader: response.headers.get("content-type"),
      contentLengthHeader: response.headers.get("content-length"),
      finalUrl: response.url || null,
      redirected: response.redirected,
    };
    if (!response.ok) {
      return { url, arrayBuffer: null, mimeType: null, fileName, error: `HTTP ${response.status}`, ...diagnostics };
    }
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    return { url, arrayBuffer, mimeType: blob.type || "image/jpeg", fileName, error: null, ...diagnostics };
  } catch (err) {
    // Erreur reseau/CORS generique cote fetch() -- errorMessage() suffit a
    // prouver QUE ca echoue et a quelle URL, l'objectif de l'instrumentation
    // (voir vinted-publish.ts::injectPhotosWithConfirmation, meme discipline).
    return {
      url,
      arrayBuffer: null,
      mimeType: null,
      fileName,
      error: errorMessage(err),
      httpStatus: null,
      contentTypeHeader: null,
      contentLengthHeader: null,
      finalUrl: null,
      redirected: null,
    };
  }
}

async function fetchAllPhotos(imageUrls: string[]): Promise<FetchedPhoto[]> {
  return Promise.all(imageUrls.map(fetchPhoto));
}

// Mission "PORT MESSAGE FERMÉ" (2026-08-11) -- CAUSE RACINE CONFIRMEE en test
// live : "Receiving end does not exist" (content script pas encore enregistre)
// PUIS "message port closed" repete, MEME apres status:"complete" -- retry
// aveugle a duree fixe (l'ancien withRetry 6x/250ms) contre exactement la
// meme course que EDIT_TAB_READY/handleEditListing.ts a deja resolue pour
// edit_listing (voir son commentaire "CAUSE RACINE #2" : le document qui a
// enregistre un listener peut deja avoir ete remplace par une navigation
// interne Vinted au moment de l'envoi). Meme correctif ici : un seul envoi
// PAR signal PUBLISH_TAB_READY recu (jamais de retry aveugle), un echec
// n'est PAS fatal -- attend simplement un signal pret suivant (voir
// attemptSend() dans handlePublishListing ci-dessous). Instrumentation
// SEND_MESSAGE_* conservee a l'identique.
// Mission "ACK PUBLISH_LISTING MANQUANT" (2026-08-11) -- CAUSE CONFIRMEE en
// test live : vinted-publish.ts recevait bien PUBLISH_LISTING (runPublish()
// demarrait reellement) mais ne repondait JAMAIS -- "message port closed
// before a response was received." malgre une commande deja acceptee.
// sendPublishCommand() attend desormais explicitement un PublishCommandResponse
// ({ok:true, accepted:true, duplicate}) -- une reponse absente ou invalide est
// TOUJOURS traitee comme une erreur de TRANSPORT (jamais confondue avec un
// echec du workflow de publication lui-meme, qui continue de se rapporter via
// PUBLISH_PROGRESS/PUBLISH_PREFILL_SUMMARY/PUBLISH_RESULT, canal distinct).
// Mission "PREUVE LIVE PRECISE -- TRANSPORT BINAIRE PHOTOS" (2026-08-11) :
// CAUSE CONFIRMEE -- voir binaryTransport.ts pour la preuve complete.
// photos (ArrayBuffer reel, cote fetchPhoto()) est converti en photosWire
// (base64, JSON-safe) juste avant chrome.tabs.sendMessage -- fetchPhoto()
// lui-meme reste inchange, seule cette frontiere de transport est corrigee.
// PHOTO_BINARY_BEFORE_SEND (demande explicitement) journalise l'etat REEL de
// chaque ArrayBuffer AVANT encodage, pour verification empirique directe
// (compare a PHOTO_BINARY_AFTER_RECEIVE cote content script, vinted-publish.ts).
function sendPublishCommand(tabId: number, payload: PublishListingPayload, photos: FetchedPhoto[]): Promise<PublishCommandResponse> {
  const photosWire = photos.map((photo, index) => {
    const descriptor = describeBinaryValue(photo.arrayBuffer);
    logger.info("PHOTO_BINARY_BEFORE_SEND", {
      index,
      constructorName: descriptor.constructorName,
      isArrayBuffer: descriptor.isArrayBuffer,
      isUint8Array: descriptor.isUint8Array,
      byteLength: descriptor.byteLength,
      length: descriptor.length,
      first16BytesHex: descriptor.first16BytesHex,
    });
    const { arrayBuffer, ...rest } = photo;
    return { ...rest, arrayBufferBase64: arrayBuffer ? arrayBufferToBase64(arrayBuffer) : null };
  });
  const command: ContentCommand = { type: "PUBLISH_LISTING", payload, photos: photosWire };
  const callStack = new Error().stack ?? null;
  logger.info("SEND_MESSAGE_START", { tabId, purpose: TAB_PURPOSE, messageType: command.type, currentUrl: VINTED_NEW_LISTING_URL });
  return new Promise<PublishCommandResponse>((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, command, (response: PublishCommandResponse | undefined) => {
      if (chrome.runtime.lastError) {
        logger.error("SEND_MESSAGE_ERROR", {
          tabId,
          purpose: TAB_PURPOSE,
          messageType: command.type,
          lastError: chrome.runtime.lastError.message,
          stack: callStack,
        });
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response || response.ok !== true || response.accepted !== true) {
        logger.error("SEND_MESSAGE_ERROR", {
          tabId,
          purpose: TAB_PURPOSE,
          messageType: command.type,
          lastError: "Réponse ACK absente ou invalide du content script",
          response,
          stack: callStack,
        });
        reject(new Error("Réponse ACK absente ou invalide du content script"));
        return;
      }
      logger.info("SEND_MESSAGE_RESPONSE", { tabId, purpose: TAB_PURPOSE, messageType: command.type, response });
      resolve(response);
    });
  });
}

// Reinjection explicite de secours (meme mecanisme qu'editListing.ts::
// findEditContentScriptFiles) : des que l'onglet atteint reellement
// status:"complete", garantit une instance vivante du content script dans
// le document FINAL -- independamment de ce que l'injection declarative a
// pu faire sur d'eventuels documents intermediaires (redirections internes
// Vinted observees en direct : plusieurs TAB_UPDATED avant le "complete"
// final). Fichiers lus depuis le manifest genere, jamais un chemin/hash
// code en dur (change a chaque build).
function findPublishContentScriptFiles(): string[] {
  const manifest = chrome.runtime.getManifest();
  const entry = manifest.content_scripts?.find((cs) => cs.js?.some((f) => f.includes("vinted-publish")));
  return entry?.js ?? [];
}

export async function handlePublishListing(
  request: RunActionRequest,
  onProgress: (step: PublishStep) => void,
  onPrefillSummary: (confirmed: string[], pending: string[]) => void = () => {},
  // Mission "CLIC FINAL + CONFIRMATION POST-PUBLICATION" (2026-08-16) : relaie
  // PUBLISH_READY_TO_SUBMIT (voir son commentaire dans messages.ts) -- jamais
  // un declencheur de clic (ecarte, voir en-tete de vinted-publish.ts), juste
  // une invitation honnete a agir au bon moment.
  onReadyToSubmit: () => void = () => {},
  // Mission "CORRIGER LE FAUX TERMINE" (2026-08-17) : relaie vers l'app que
  // l'extension attend desormais un clic humain reel sur "Confirmer et
  // supprimer" (ancienne annonce, uniquement pour republish_listing) --
  // voir finalizeSuccess() ci-dessous et son fil jusqu'a
  // performRepublishReplaceTransaction/attemptDeleteOldVintedListing.
  onAwaitingOldListingDeletion: () => void = () => {}
): Promise<RunActionOutcome> {
  let payload = request.payload as unknown as PublishListingPayload;

  onProgress("preparing");

  // Instrumentation live-driven (2026-08-11, retest "payload non propage ?") :
  // preuve directe du payload AVANT toute enrichissement -- distingue "le
  // payload recu par ce handler etait deja pauvre" (bug en amont, cote app)
  // de "l'enrichissement n'a pas propage" (bug ici).
  logger.info("HANDLE_PUBLISH_PAYLOAD_BEFORE_ENRICH", {
    kind: request.kind,
    descriptionLength: payload.description.length,
    imageCount: payload.imageUrls.length,
    category: payload.category,
  });

  // Enrichissement lazy (audit "prefill partiel", 2026-08-10-11) : republish_listing
  // uniquement (previousVintedItemId requis, voir enrichListing.ts) -- best-effort,
  // ne bloque jamais la republication, ne fait rien si description deja presente.
  if (request.kind === "republish_listing") {
    const previousVintedItemId = (request.payload as { previousVintedItemId?: unknown }).previousVintedItemId;
    if (typeof previousVintedItemId === "string") {
      payload = await enrichListingIfNeeded(payload, previousVintedItemId);
    } else {
      logger.warn("HANDLE_PUBLISH_NO_PREVIOUS_ITEM_ID", { payloadHasKey: "previousVintedItemId" in request.payload });
    }
  }

  // Preuve directe du payload APRES enrichissement, juste avant qu'il ne
  // serve a fetcher les photos et a construire la commande PUBLISH_LISTING --
  // si ces valeurs different de HANDLE_PUBLISH_PAYLOAD_BEFORE_ENRICH, la
  // reaffectation `payload = await enrichListingIfNeeded(...)` a bien
  // fonctionne ; si elles sont identiques (et que AUTO_ENRICH_EXTRACT_SUCCESS
  // a pourtant ete loggue avec des valeurs non-vides), la fuite se situe
  // entre le retour de enrichListingIfNeeded() et ce point precis.
  logger.info("HANDLE_PUBLISH_PAYLOAD_AFTER_ENRICH", {
    descriptionLength: payload.description.length,
    imageCount: payload.imageUrls.length,
    category: payload.category,
  });

  // Fetch des photos EN ARRIERE-PLAN (voir commentaire de fetchPhoto ci-dessus)
  // avant meme d'ouvrir l'onglet Vinted -- le content script ne fera plus
  // jamais de fetch() lui-meme.
  const photos = await fetchAllPhotos(payload.imageUrls);
  logger.info("HANDLE_PUBLISH_PHOTOS_FETCHED_IN_BACKGROUND", {
    total: photos.length,
    succeeded: photos.filter((p) => p.arrayBuffer !== null).length,
    errors: photos.filter((p) => p.arrayBuffer === null).map((p) => ({ url: p.url, error: p.error })),
  });

  // Mission "MODE BACKGROUND -- REPUBLICATION" (2026-08-19) : republish_listing
  // UNIQUEMENT (auto-submit + suppression auto deja valides en live pour ce
  // kind, voir publishAutoSubmit.ts/deleteOldListing.ts) -- publish_listing
  // (premiere publication) n'a pas d'auto-submit et reste 100% comportement
  // actuel, onglet visible des l'ouverture, voir plus bas.
  const isRepublish = request.kind === "republish_listing";

  let tab: chrome.tabs.Tab;
  try {
    // active:!isRepublish -- republish_listing tourne desormais en arriere-plan
    // (l'utilisateur reste sur ResellOS) tant que rien n'exige reellement son
    // intervention ; publish_listing garde active:true (l'utilisateur doit
    // voir l'onglet pour terminer la publication lui-meme, aucun auto-submit
    // pour ce kind). Le filet de secours (onglet ramene au premier plan) est
    // implemente dans settle() plus bas, jamais ici.
    tab = await chrome.tabs.create({ url: VINTED_NEW_LISTING_URL, active: !isRepublish });
  } catch (err) {
    logger.error("HANDLE_PUBLISH_TAB_CREATE_FAILED", errorDetails(err));
    return { status: "error", errorMessage: `Impossible d'ouvrir un onglet Vinted : ${errorMessage(err)}` };
  }
  if (tab.id === undefined) {
    logger.error("HANDLE_PUBLISH_TAB_INVALID", { tab });
    return { status: "error", errorMessage: "Onglet Vinted invalide" };
  }
  const tabId: number = tab.id;
  logger.info("TAB_CREATED", { tabId, url: VINTED_NEW_LISTING_URL, purpose: TAB_PURPOSE, at: Date.now() });

  // Mission "REPUBLICATION : PUBLICATION REUSSIE MAIS SUCCES NON DETECTE"
  // (2026-08-17), etape 4 (snapshot pre-publication) : capture le PLUS TOT
  // possible (avant toute chance qu'une redirection /member/{userId} ne se
  // produise) l'ensemble des vinted_item_id DEJA connus pour ce compte --
  // lecture Supabase (source deja fiable, pas un nouveau fetch Vinted),
  // lancee en parallele du reste du flux sans jamais le bloquer. Utilisee
  // uniquement par reconcilePostSubmitViaMemberRedirect ci-dessous (CAS B),
  // jamais pour le CAS A (/items/{id}), qui reste inchange.
  const beforeVintedItemIdsPromise: Promise<Set<string>> = request.vintedAccountId
    ? listKnownVintedItemIds(request.vintedAccountId)
    : Promise.resolve(new Set<string>());

  return new Promise<RunActionOutcome>((resolve) => {
    let settled = false;
    let tabClosedByHandler = false;
    // Bascule des reception de PUBLISH_PREFILL_SUMMARY -- voir commentaire
    // d'en-tete (keepTabOpen sur timeout uniquement a partir de ce point).
    let reachedManualPhase = false;
    // Mission "REPUBLICATION : PUBLICATION REUSSIE MAIS SUCCES NON DETECTE"
    // (2026-08-17) : garde a UN SEUL demarrage -- plusieurs TAB_UPDATED
    // /member/{userId} successifs (loading -> complete, puis a nouveau apres
    // ?promo_shown=true, ou apres nos propres chrome.tabs.reload() de retry)
    // ne doivent jamais declencher plusieurs boucles de reconciliation
    // paralleles independantes.
    let reconciliationStarted = false;
    // Mission "REPUBLICATION : CORRIGER LES DOUBLONS" (2026-08-17) : garde
    // synchrone, posee AVANT le moindre await -- ferme la course ou le
    // succes serait signale deux fois (CAS A rejoue, ou CAS A et CAS B
    // aboutissant presque simultanement) avant que `settled` (mis a jour
    // seulement a la toute fin de finalizeSuccess(), via settle()) n'ait pu
    // le refleter. "Rejouer le meme evenement de succes deux fois doit etre
    // sans effet supplementaire" (demande explicite) -- sans cette garde,
    // un second appel concurrent relancerait un second rattachement/une
    // seconde tentative de suppression Vinted.
    let successFinalizationStarted = false;
    // Mission "PORT MESSAGE FERMÉ" (2026-08-11) : handshake explicite,
    // remplace l'ancien retry aveugle -- PUBLISH_LISTING n'est envoye
    // qu'APRES reception d'un PUBLISH_TAB_READY pousse par le content script
    // lui-meme (jamais devine via status:"complete" seul, ni via une reponse
    // a sendMessage).
    //
    // CAUSE CONFIRMEE EN LIVE (mission "CAUSE DOCUMENT-LIFECYCLE CONFIRMEE",
    // 2026-08-11) : l'ancienne garde etait un simple booleen `sendInFlight`,
    // jamais reinitialise apres un envoi REUSSI -- des qu'un premier document
    // (A) recevait/ACKait PUBLISH_LISTING puis etait remplace par une
    // navigation interne Vinted (observe en direct sur /items/new), le
    // document REELLEMENT final (B, nouveau documentInstanceId) poussait
    // bien son propre PUBLISH_TAB_READY, mais se faisait perpetuellement
    // rejeter par HANDLE_PUBLISH_SEND_SKIPPED_ALREADY_IN_FLIGHT -- formulaire
    // final entierement vide, aucun document visible n'ayant jamais recu la
    // commande. Remplace par une garde CLEE SUR documentInstanceId : seul un
    // SIGNAL PRET PROVENANT DU MEME DOCUMENT DEJA ENVOYE/ACCEPTE est ignore
    // (evite un double-envoi inutile vers un document qui l'a deja, protege
    // par le duplicate:true du content script de toute facon) -- un NOUVEAU
    // documentInstanceId est TOUJOURS traite comme une cible legitime, quel
    // que soit l'etat d'un envoi precedent vers un AUTRE document.
    let sendPendingOrAcceptedForDocumentInstanceId: string | null = null;
    let publishTabReadyCount = 0;
    let explicitlyInjectedAfterComplete = false;
    // Mission "DIAGNOSTIC INJECTION/PACKAGING" (2026-08-16) : preuve live
    // directe -- HANDLE_PUBLISH_REINJECT_FAILED ("Could not load file: ...")
    // suivi de HANDLE_PUBLISH_NO_READY_SIGNAL, cause confirmee = extension
    // chargee dans Chrome desynchronisee du dossier dist/ reellement present
    // sur disque (manifest en memoire pointant vers un chunk hashe par Vite
    // qui n'existe plus, dist/ ayant ete reconstruit depuis le dernier
    // chargement/rechargement de l'extension). Capture la raison exacte ICI
    // pour que le message final distingue ce cas precis (deja rencontre,
    // desormais diagnostiquable sans nouvelle session live) du message
    // generique "Vinted a peut-etre change de structure", qui accusait a
    // tort Vinted alors que la cause reelle etait locale.
    let reinjectFailedReason: string | null = null;

    function attemptSend(reason: string, documentInstanceId: string): void {
      if (sendPendingOrAcceptedForDocumentInstanceId === documentInstanceId) {
        logger.info("HANDLE_PUBLISH_SEND_SKIPPED_ALREADY_IN_FLIGHT", { tabId, reason, publishTabReadyCount, documentInstanceId });
        return;
      }
      // Marque CE document (et lui seul) comme ayant desormais un envoi en
      // vol/accepte -- synchrone, AVANT le moindre await, pour fermer la
      // course si le meme document pousse un second PUBLISH_TAB_READY avant
      // que la promesse ci-dessous ne se resolve.
      sendPendingOrAcceptedForDocumentInstanceId = documentInstanceId;
      logger.info("HANDLE_PUBLISH_SENDING_COMMAND", {
        tabId,
        reason,
        publishTabReadyCount,
        documentInstanceId,
        descriptionLength: payload.description.length,
        photosCount: photos.length,
      });
      sendPublishCommand(tabId, payload, photos)
        .then((response) => {
          logger.info("PUBLISH_COMMAND_ACCEPTED", { tabId, publishTabReadyCount, documentInstanceId, response });
        })
        .catch((err) => {
          // NON FATAL (meme discipline qu'editListing.ts::attemptSend) : le
          // document qui a envoye PUBLISH_TAB_READY peut deja avoir ete
          // remplace par une navigation interne Vinted au moment de l'envoi
          // -- on continue d'ecouter un NOUVEAU signal pret plutot que
          // d'abandonner immediatement. Seul tabReadyTimeout (aucun signal
          // pret utilisable) ou globalTimeout tranchent un echec final.
          logger.error("HANDLE_PUBLISH_SEND_COMMAND_FAILED", { ...errorDetails(err), reason, publishTabReadyCount, documentInstanceId });
          // Echec transport pour CE documentInstanceId precis -- libere la
          // garde SEULEMENT si elle porte encore sur lui (un signal pret
          // plus recent, pour un AUTRE document, a pu deja la reprendre
          // entre-temps ; ne jamais ecraser une garde plus recente).
          if (sendPendingOrAcceptedForDocumentInstanceId === documentInstanceId) {
            sendPendingOrAcceptedForDocumentInstanceId = null;
          }
        });
    }

    function onMessage(message: unknown, sender: chrome.runtime.MessageSender): boolean {
      if (sender.tab?.id !== tabId || !isContentReport(message)) return false;
      if (message.type === "PUBLISH_TAB_READY") {
        publishTabReadyCount += 1;
        // documentInstanceId (mission "DIAGNOSTIC LIVE APRES REJET DES PHOTOS
        // INVALIDES", 2026-08-11) : correle CE log avec PUBLISH_COMMAND_ACCEPTED
        // et les PREFILL_*/RUN_PUBLISH_* du content script -- prouve si le
        // document qui a envoye CE ready est bien celui qui recoit ensuite
        // PUBLISH_LISTING et remplit reellement le formulaire.
        logger.info("CONTENT_SCRIPT_READY", {
          tabId,
          publishTabReadyCount,
          senderUrl: sender.url,
          documentInstanceId: message.documentInstanceId,
        });
        clearTimeout(tabReadyTimeout);
        attemptSend("PUBLISH_TAB_READY reçu", message.documentInstanceId);
      } else if (message.type === "PUBLISH_PROGRESS") {
        onProgress(message.step);
      } else if (message.type === "PUBLISH_PREFILL_SUMMARY") {
        reachedManualPhase = true;
        onPrefillSummary(message.confirmed, message.pending);
      } else if (message.type === "PUBLISH_READY_TO_SUBMIT") {
        logger.info("HANDLE_PUBLISH_READY_TO_SUBMIT", { tabId });
        // Mission "ROUND READY UX" (2026-08-19), restreinte a publish_listing
        // par la mission "MODE BACKGROUND -- REPUBLICATION" (2026-08-19) :
        // ramene l'onglet Vinted au premier plan au moment ou le formulaire
        // devient reellement pret -- l'utilisateur a pu passer sur l'onglet
        // ResellOS entretemps (choisir une categorie/des attributs prend du
        // temps). Best-effort : un onglet deja actif ou ferme entre-temps ne
        // doit jamais faire echouer le reste du flow. Ne declenche et ne
        // remplace AUCUN clic -- seul le focus change, l'utilisateur clique
        // toujours lui-meme "Ajouter" (vrai UNIQUEMENT pour publish_listing :
        // republish_listing a desormais un auto-submit, voir
        // publishAutoSubmit.ts -- PUBLISH_READY_TO_SUBMIT y est une etape
        // normale du succes, jamais un signal d'echec, donc ne doit JAMAIS
        // voler le focus pour ce kind).
        if (!isRepublish) {
          chrome.tabs.update(tabId, { active: true }).catch((err) => {
            logger.error("HANDLE_PUBLISH_READY_TO_SUBMIT_ACTIVATE_TAB_FAILED", { tabId, error: errorMessage(err) });
          });
        }
        onReadyToSubmit();
      } else if (message.type === "PUBLISH_RESULT") {
        // N'arrive plus qu'en cas d'echec du remplissage automatise (session
        // expiree, page introuvable...) -- le chemin de succes ne passe plus
        // par ce message, voir onTabUpdated ci-dessous.
        settle(message.outcome);
      } else if (message.type === "PUBLISH_CREATE_RESPONSE_CAPTURED") {
        // Mission "AUTOMATISER ENTIEREMENT LA REPUBLICATION" (2026-08-17) :
        // instrumentation ciblee (voir publishCreateResponseCapture.ts) --
        // journalise TOUJOURS le corps de reponse REEL, quelle que soit sa
        // validite (utile au diagnostic meme sur un rejet), conservee a
        // l'identique.
        logger.info("PUBLISH_CREATE_RESPONSE_BODY_CAPTURED", {
          tabId,
          url: message.url,
          statusCode: message.statusCode,
          ok: message.ok,
          bodyText: message.bodyText,
          transport: message.transport,
          requestMethod: message.requestMethod,
          requestContentType: message.requestContentType,
          requestBodyType: message.requestBodyType,
          requestBodyText: message.requestBodyText,
        });
        // Mission "DIAGNOSTIC REQUEST BODY COULEUR" (2026-08-19) : resume
        // cible, log SEPARE et facilement filtrable -- purement diagnostique,
        // aucune decision metier n'en depend (CAS A/B/C ci-dessous restent
        // inchanges).
        logger.info("PUBLISH_CREATE_REQUEST_COLOR_FIELDS_SUMMARY", {
          tabId,
          requestBodyType: message.requestBodyType,
          colorOrAttributeFields: summarizeColorRelatedFields(message.requestBodyText),
        });

        // CAS C (2026-08-17) -- preuve live obtenue : la reponse REELLE de
        // creation identifie B directement et sans ambiguite (voir
        // validatePublishCreateResponse ci-dessus). UNIQUEMENT un nouvel
        // APPELANT de finalizeSuccess(), le meme choke point unique deja
        // utilise par CAS A (navigation /items/{id}, onTabUpdated) et CAS B
        // (reconciliation post-/member/{userId}) -- aucune logique de
        // rattachement/transaction/suppression dupliquee ici, tout reste
        // dans performRepublishReplaceTransaction (republishTransaction.ts,
        // inchange). Une capture invalide n'a strictement AUCUN effet
        // metier : CAS A/CAS B/le timeout global continuent de fonctionner
        // exactement comme avant cette mission.
        const validation = validatePublishCreateResponse(message.url, message.ok, message.statusCode, message.bodyText);
        if (!validation.valid) {
          logger.warn("PUBLISH_CREATE_RESPONSE_REJECTED", { tabId, reason: validation.reason, transport: message.transport });
        } else if (!settled && !successFinalizationStarted) {
          // Pre-verification purement pour la qualite du log (evite de
          // logguer "identifie" pour un appel qui va immediatement no-op
          // dans finalizeSuccess) -- finalizeSuccess() reste neanmoins seul
          // et unique garant de l'idempotence reelle via son propre garde
          // synchrone `if (settled || successFinalizationStarted) return;`,
          // pose AVANT tout await, identique a celui deja utilise par CAS
          // A/CAS B. Si CAS A/CAS B gagnent la course entre cette ligne et
          // l'appel ci-dessous (fenetre synchrone, aucun await entre les
          // deux), ce garde interne absorbe silencieusement le doublon --
          // aucun nouvel etat n'est necessaire ici.
          logger.info("AUTO_PUBLISH_NEW_ITEM_IDENTIFIED", {
            tabId,
            vintedItemId: validation.vintedItemId,
            source: "network_response",
            transport: message.transport,
          });
          void finalizeSuccess(validation.vintedItemId, buildVintedItemUrl(validation.vintedItemId));
        }
      } else if (message.type === "PUBLISH_CREATE_RESPONSE_CAPTURE_STATUS") {
        // Mission "AUTOMATISER ENTIEREMENT LA REPUBLICATION" (2026-08-17),
        // audit post-echec du 1er test live : log EXPLICITE requis pour
        // distinguer "instrumentation jamais installee" de "installee mais
        // transport non intercepte" au prochain test. Envoye une seule fois
        // par bootPublishContentScript(), en verifiant l'attribut DOM pose
        // par le nouveau content script MONDE MAIN/document_start (voir
        // manifest.config.ts) -- plus tot que l'ancienne injection tardive
        // (chrome.scripting.executeScript au tab "complete", supprimee ici
        // car confirmee trop tardive lors du test live).
        // Mission "DIAGNOSTIC CAPTURE_MISSING" (2026-08-24) : url/
        // documentInstanceId/readyState journalises des deux cotes -- sans eux,
        // le test reel du 24/08 ne permettait pas de dire sur quel document
        // l'instrumentation MAIN manquait. Diagnostic uniquement, aucun
        // changement de comportement.
        const captureContext = {
          tabId,
          url: message.url,
          documentInstanceId: message.documentInstanceId,
          readyState: message.readyState,
        };
        if (message.installed) {
          logger.info("PUBLISH_CREATE_RESPONSE_CAPTURE_INSTALLED", captureContext);
        } else {
          logger.warn("PUBLISH_CREATE_RESPONSE_CAPTURE_MISSING", captureContext);
        }
      }
      return false;
    }

    // Detection de succes reelle -- voir commentaire d'en-tete. Se declenche
    // des que Chrome observe l'onglet SOUS NOTRE CONTROLE naviguer vers une
    // URL /items/{id} qui n'est pas /items/new, quel que soit l'etat du
    // content script a ce moment (potentiellement deja detruit par la
    // navigation elle-meme).
    function onTabUpdated(updatedTabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, updatedTab: chrome.tabs.Tab): void {
      if (updatedTabId !== tabId) return;
      // Mission "PORT MESSAGE FERMÉ" (2026-08-11), item 1 : journalise CHAQUE
      // evenement, pas seulement celui qui declenche un succes -- seul moyen
      // de voir si la page a navigue plusieurs fois (ex. vers une page
      // d'erreur Vinted generique) avant ou apres l'envoi de PUBLISH_LISTING.
      logger.info("TAB_UPDATED", { tabId, url: updatedTab.url, status: changeInfo.status, purpose: TAB_PURPOSE, at: Date.now() });

      // Reinjection explicite de secours (meme mecanisme qu'editListing.ts,
      // meme cause racine) : garantit une instance vivante du content script
      // dans le document REELLEMENT final, independamment de ce que
      // l'injection declarative a pu faire sur d'eventuels documents
      // intermediaires remplaces par une redirection interne Vinted.
      if (changeInfo.status === "complete" && !explicitlyInjectedAfterComplete) {
        explicitlyInjectedAfterComplete = true;
        const files = findPublishContentScriptFiles();
        if (files.length === 0) {
          logger.error("HANDLE_PUBLISH_NO_CONTENT_SCRIPT_FILES_IN_MANIFEST", { tabId });
        } else {
          chrome.scripting
            .executeScript({ target: { tabId }, files })
            .then(() => logger.info("HANDLE_PUBLISH_CONTENT_SCRIPT_REINJECTED", { tabId, files }))
            .catch((err) => {
              // Non fatal en soi (l'injection declarative a peut-etre deja
              // suffi) -- mais si tabReadyTimeout finit par se declencher SANS
              // qu'aucun signal pret ne soit jamais arrive, cette raison
              // precise (fichier manquant, extension desynchronisee de
              // dist/...) est la cause la plus probable et merite un message
              // distinct du "Vinted a peut-etre change de structure" generique.
              reinjectFailedReason = errorMessage(err);
              logger.warn("HANDLE_PUBLISH_REINJECT_FAILED", errorDetails(err));
            });
        }
        // Note (2026-08-17) : l'injection best-effort de
        // publishCreateResponseCapture.ts qui vivait ici a ete SUPPRIMEE --
        // confirmee trop tardive lors d'un test live reel (0 capture malgre
        // une creation reussie). Remplacee par un content script declaratif
        // MONDE MAIN + document_start (voir manifest.config.ts), seul point
        // d'injection assez tot pour patcher fetch/XMLHttpRequest avant que
        // le bundle Vinted n'en capture sa propre reference native.
      }

      const vintedItemId = extractPublishedItemId(updatedTab.url);
      if (vintedItemId) {
        if (!settled) void finalizeSuccess(vintedItemId, updatedTab.url!);
        return;
      }

      // Mission "REPUBLICATION : PUBLICATION REUSSIE MAIS SUCCES NON DETECTE"
      // (2026-08-17), CAS B : preuve live directe -- apres un clic humain
      // reussi sur "Ajouter", Vinted redirige parfois vers /member/{userId}
      // (le profil du vendeur) plutot que vers /items/{nouvel_id}. Cette
      // navigation seule n'est JAMAIS une preuve de succes (demande
      // explicite) -- uniquement un signal qui declenche une reconciliation
      // ciblee (voir reconcilePostSubmitViaMemberRedirect), qui seule peut
      // aboutir a un settle({status:"success"}). N'attend que la navigation
      // soit STABLE (status:"complete") avant de demarrer, et ne demarre
      // qu'UNE seule fois par run (reconciliationStarted).
      if (changeInfo.status === "complete" && !reconciliationStarted) {
        const memberVintedUserId = extractMemberUserId(updatedTab.url);
        if (memberVintedUserId) {
          reconciliationStarted = true;
          logger.info("HANDLE_PUBLISH_MEMBER_REDIRECT_DETECTED", { tabId, memberVintedUserId, url: updatedTab.url });
          void reconcilePostSubmitViaMemberRedirect(memberVintedUserId);
        }
      }
    }

    // Mission "REPUBLICATION : PUBLICATION REUSSIE MAIS SUCCES NON DETECTE"
    // (2026-08-17) -- CAS B ci-dessus. Reutilise TEL QUEL l'infrastructure
    // Sync Vinted des Lots 1/2 (syncCoordinator.startAccountSync(), qui
    // correle a une VRAIE relecture wardrobe via l'injection declarative
    // organique de vinted-profile.ts sur /member/* -- voir manifest.config.ts)
    // : aucune deuxieme implementation de fetch wardrobe/recordListings.
    // `openTab` ne cree JAMAIS un nouvel onglet ici -- il RECHARGE l'onglet
    // de publication deja present sur /member/{userId}, ce qui garantit
    // deux choses a la fois : (1) une navigation FRAICHE et deterministe
    // (elimine la course possible entre l'injection organique du content
    // script -- deja potentiellement en cours au moment ou ce code s'execute
    // -- et l'enregistrement de la synchro en attente cote syncCoordinator,
    // qui doit imperativement precéder tout evenement ACCOUNT_DETECTED/
    // LISTINGS_DETECTED pour pouvoir s'y correler), et (2) un mecanisme de
    // retry reel (le content script ne se re-execute jamais sans une
    // NOUVELLE navigation -- un simple nouvel appel a startAccountSync()
    // SANS recharger attendrait indefiniment des evenements qui ne se
    // reproduiront jamais).
    //
    // Priorite de preuve (demande explicite) : (1) exactement UN nouveau
    // vinted_item_id absent avant la publication et present apres -> succes
    // direct ; (2) plusieurs nouveaux -> desambiguisation stricte par
    // titre+prix EXACTS (jamais un rapprochement flou) ; (3) aucun -> retry
    // borne (l'index wardrobe Vinted peut avoir un leger delai) ; (4) toujours
    // ambigu/absent apres tentatives -> erreur explicite, jamais un succes
    // invente. keepTabOpen:true sur ces deux derniers cas -- l'onglet reste
    // sur /member/{userId}, ou l'utilisateur peut verifier visuellement.
    async function reconcilePostSubmitViaMemberRedirect(memberVintedUserId: string): Promise<void> {
      if (!request.vintedAccountId) {
        logger.error("HANDLE_PUBLISH_RECONCILE_NO_ACCOUNT_ID", { tabId, memberVintedUserId });
        return; // Rien a comparer sans compte ResellOS connu -- laisse le timeout global trancher honnetement.
      }
      const vintedAccountId = request.vintedAccountId;
      const beforeIds = await beforeVintedItemIdsPromise;
      if (settled) return;

      for (let attempt = 1; attempt <= RECONCILE_MAX_ATTEMPTS; attempt++) {
        if (settled) return;
        if (attempt > 1) await delay(RECONCILE_RETRY_DELAY_MS);
        if (settled) return;

        logger.info("HANDLE_PUBLISH_RECONCILE_ATTEMPT", { tabId, attempt, memberVintedUserId, beforeCount: beforeIds.size });

        const syncResult = await startAccountSync(memberVintedUserId, () => {}, async (): Promise<OpenSyncTabResult> => {
          try {
            await chrome.tabs.reload(tabId);
            return { tabId };
          } catch (err) {
            return { tabId: null, error: errorMessage(err) };
          }
        });
        if (settled) return;

        if (!syncResult.ok) {
          logger.warn("HANDLE_PUBLISH_RECONCILE_SYNC_FAILED", {
            tabId,
            attempt,
            reason: syncResult.reason,
            error: syncResult.error,
          });
          if (syncResult.reason === "not_paired") break; // Pas de compte appairé -- réessayer ne changerait rien.
          continue;
        }

        const afterIds = await listKnownVintedItemIds(vintedAccountId);
        const newIds = [...afterIds].filter((id) => !beforeIds.has(id));
        logger.info("HANDLE_PUBLISH_RECONCILE_DIFF", {
          tabId,
          attempt,
          beforeCount: beforeIds.size,
          afterCount: afterIds.size,
          newIdsCount: newIds.length,
          newIds,
        });

        if (newIds.length === 1) {
          const [candidate] = await findListingsByVintedItemIds(vintedAccountId, newIds);
          if (candidate) {
            logger.info("HANDLE_PUBLISH_RECONCILE_RESOLVED", { tabId, attempt, vintedItemId: candidate.vintedItemId });
            await finalizeSuccess(candidate.vintedItemId, candidate.vintedUrl);
            return;
          }
          // Le vinted_item_id est reellement nouveau (diff avant/apres) mais
          // introuvable dans listings -- incoherence transitoire (ecriture
          // Supabase pas encore visible) : traite comme "pas encore trouve",
          // retente au lieu d'inventer un succes.
        } else if (newIds.length > 1) {
          const candidates = await findListingsByVintedItemIds(vintedAccountId, newIds);
          const normalizedRequestedTitle = payload.title.trim().toLowerCase();
          const matched = candidates.filter(
            (c) => c.title.trim().toLowerCase() === normalizedRequestedTitle && c.price === payload.price
          );
          if (matched.length === 1) {
            logger.info("HANDLE_PUBLISH_RECONCILE_RESOLVED_BY_TITLE_PRICE", {
              tabId,
              attempt,
              vintedItemId: matched[0].vintedItemId,
              candidateCount: candidates.length,
            });
            await finalizeSuccess(matched[0].vintedItemId, matched[0].vintedUrl);
            return;
          }
          // Ambigu, jamais un choix au hasard (demande explicite) : erreur
          // terminale immediate, pas de retry (retenter ne desambiguiserait
          // rien -- le meme ensemble d'annonces resterait candidat).
          logger.error("HANDLE_PUBLISH_RECONCILE_AMBIGUOUS", {
            tabId,
            attempt,
            newIds,
            candidateTitles: candidates.map((c) => ({ vintedItemId: c.vintedItemId, title: c.title, price: c.price })),
            matchedCount: matched.length,
          });
          settle(
            {
              status: "error",
              errorMessage:
                "Plusieurs nouvelles annonces ont été détectées sur ton compte Vinted -- impossible d'identifier celle-ci avec certitude. Vérifie manuellement sur Vinted, puis synchronise.",
            },
            { keepTabOpen: true }
          );
          return;
        }
        // newIds.length === 0 -- l'index wardrobe Vinted n'a peut-etre pas
        // encore ete mis a jour cote serveur -- boucle vers le prochain essai.
      }

      if (!settled) {
        logger.error("HANDLE_PUBLISH_RECONCILE_EXHAUSTED", { tabId, memberVintedUserId, attempts: RECONCILE_MAX_ATTEMPTS });
        settle(
          {
            status: "error",
            errorMessage:
              "La publication a probablement réussi sur Vinted (redirection vers ton profil détectée), mais ResellOS n'a pas pu identifier la nouvelle annonce avec certitude après plusieurs tentatives. Vérifie ton profil Vinted, puis synchronise manuellement.",
          },
          { keepTabOpen: true }
        );
      }
    }

    function onRemoved(removedTabId: number): void {
      if (removedTabId !== tabId) return;
      // Mission "PORT MESSAGE FERMÉ" (2026-08-11), item 5 : journalise TOUTE
      // fermeture de cet onglet, y compris celles initiees par settle()
      // lui-meme (byHandler:true) -- distingue "on l'a ferme nous-memes apres
      // une issue deja determinee" de "quelque chose d'externe (utilisateur,
      // navigateur, crash de page) l'a ferme en premier".
      logger.info("TAB_REMOVED", { tabId, purpose: TAB_PURPOSE, byHandler: tabClosedByHandler, at: Date.now() });
      if (tabClosedByHandler) return;
      settle({ status: "error", errorMessage: "Publication interrompue (onglet fermé)" });
    }

    function cleanup(): void {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
      clearTimeout(globalTimeout);
      clearTimeout(tabReadyTimeout);
    }

    // Mission "REPUBLICATION : CORRIGER LES DOUBLONS" (2026-08-17) : choke
    // point UNIQUE des DEUX chemins de succes (CAS A -- /items/{id} direct,
    // et CAS B -- reconciliation post-/member/{userId}) -- avant cette
    // mission, chacun appelait settle({status:"success",...}) directement,
    // sans jamais rattacher la ligne ResellOS ORIGINALE au nouvel item ni
    // supprimer l'ancienne annonce Vinted. Une republication n'est PAS une
    // creation independante : c'est un REMPLACEMENT (voir republishTransaction.ts
    // pour le detail complet de la transaction). B reste toujours confirmee
    // publiee ici (status:"success") -- meme si le rattachement/la suppression
    // de l'ancienne annonce echoue partiellement, ne jamais transformer un
    // succes Vinted reel en erreur ResellOS (voir resultPayload.cleanupRequired
    // pour ce cas, gere honnetement plutot que masque).
    async function finalizeSuccess(vintedItemId: string, vintedUrl: string): Promise<void> {
      if (settled || successFinalizationStarted) return;
      successFinalizationStarted = true;

      const oldVintedItemId =
        typeof (payload as { previousVintedItemId?: unknown }).previousVintedItemId === "string"
          ? ((payload as { previousVintedItemId?: string }).previousVintedItemId as string)
          : null;

      const transactionResult = await performRepublishReplaceTransaction(
        {
          listingId: request.listingId ?? null,
          vintedAccountId: request.vintedAccountId,
          oldVintedItemId,
          newVintedItemId: vintedItemId,
          newVintedUrl: vintedUrl,
        },
        undefined,
        onAwaitingOldListingDeletion
      );

      const resultPayload: Record<string, unknown> = { vintedItemId, vintedUrl };
      if (transactionResult.mergedDuplicateListingId) {
        resultPayload.mergedDuplicateListingId = transactionResult.mergedDuplicateListingId;
      }
      if (transactionResult.reason === "cleanup_required") {
        resultPayload.cleanupRequired = true;
        if (transactionResult.cleanupError) resultPayload.cleanupError = transactionResult.cleanupError;
      }

      settle({ status: "success", resultPayload });
    }

    function settle(outcome: RunActionOutcome, options?: { keepTabOpen?: boolean }): void {
      if (settled) return;
      settled = true;
      // Instrumentation live-driven (2026-08-11) : point de sortie UNIQUE de
      // ce Promise -- log ici, une seule fois par run, l'issue exacte quelle
      // que soit la branche d'origine (message d'erreur, timeout, onglet
      // ferme, echec d'envoi, ou succes reel) -- "l'etape exacte" demandee,
      // sans devoir chercher dans 5 call sites differents.
      logger.info("HANDLE_PUBLISH_SETTLE", { outcome, keepTabOpen: !!options?.keepTabOpen, publishTabReadyCount });
      cleanup();
      if (!options?.keepTabOpen) {
        // Mission "PORT MESSAGE FERMÉ" (2026-08-11), item 5 : le SEUL endroit
        // de ce handler qui ferme volontairement l'onglet principal -- loggue
        // la raison exacte (derivee de l'issue qui a declenche settle()) pour
        // repondre sans ambiguite a "qui ferme l'onglet, et pourquoi".
        logger.info("TAB_REMOVE_REQUEST", {
          tabId,
          purpose: TAB_PURPOSE,
          reason: outcome.status === "success" ? "publish_success" : outcome.status === "error" ? `error: ${outcome.errorMessage}` : outcome.status,
          at: Date.now(),
        });
        tabClosedByHandler = true;
        chrome.tabs.remove(tabId).catch(() => {});
      } else if (isRepublish) {
        // Mission "MODE BACKGROUND -- REPUBLICATION" (2026-08-19) : filet de
        // secours -- keepTabOpen:true signifie DEJA, sans aucun changement de
        // logique metier, "une intervention humaine est potentiellement
        // necessaire" (phase manuelle atteinte + timeout global, reconciliation
        // CAS B ambigue, ou CAS B epuisee -- les 3 seuls appelants de settle()
        // avec keepTabOpen:true, voir plus bas). Reutilise ce signal EXISTANT
        // tel quel, aucun nouveau signal introduit. Un onglet reellement
        // backgrounded (republish_listing) doit alors etre ramene au premier
        // plan pour que l'utilisateur puisse le voir/agir -- jamais sur un
        // succes normal (ce else n'est atteint que si keepTabOpen:true, donc
        // jamais sur "success" sans anomalie). Best-effort, comme les autres
        // chrome.tabs.update de ce fichier.
        chrome.tabs.update(tabId, { active: true }).catch((err) => {
          logger.error("HANDLE_PUBLISH_FALLBACK_ACTIVATE_TAB_FAILED", { tabId, error: errorMessage(err) });
        });
      }
      resolve(outcome);
    }

    const globalTimeout = setTimeout(() => {
      // keepTabOpen une fois la phase manuelle atteinte (voir commentaire
      // d'en-tete) : l'utilisateur peut encore etre en train de terminer sa
      // saisie, ne jamais lui retirer l'onglet sous les pieds.
      settle(
        {
          status: "error",
          errorMessage: reachedManualPhase
            ? "Délai dépassé en attendant ta validation sur Vinted. L'onglet reste ouvert -- termine la publication puis vérifie manuellement, ou réessaie."
            : "Délai dépassé : la préparation de la publication n'a pas abouti",
        },
        { keepTabOpen: reachedManualPhase }
      );
    }, GLOBAL_TIMEOUT_MS);

    // Si aucun PUBLISH_TAB_READY exploitable n'est jamais recu, l'echec est
    // honnete et precis plutot qu'un simple "delai depasse" generique --
    // meme discipline qu'editListing.ts::onTabReadyTimeout.
    const tabReadyTimeout = setTimeout(() => {
      logger.error("HANDLE_PUBLISH_NO_READY_SIGNAL", { tabId, timeoutMs: TAB_READY_TIMEOUT_MS, reinjectFailedReason });
      settle({
        status: "error",
        errorMessage: reinjectFailedReason
          ? `Le script d'automatisation n'a pas pu être chargé (${reinjectFailedReason}). L'extension chargée dans Chrome semble désynchronisée du dernier build -- reconstruis l'extension (npm run build) puis recharge-la depuis chrome://extensions avant de réessayer.`
          : "La page Vinted n'a pas confirmé être prête à temps (le script d'automatisation n'a jamais pu se lancer). Réessaie -- si le problème persiste, la page Vinted a peut-être changé de structure.",
      });
    }, TAB_READY_TIMEOUT_MS);

    chrome.runtime.onMessage.addListener(onMessage);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.onUpdated.addListener(onTabUpdated);
  });
}
