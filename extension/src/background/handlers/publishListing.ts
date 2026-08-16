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
  onPrefillSummary: (confirmed: string[], pending: string[]) => void = () => {}
): Promise<RunActionOutcome> {
  const payload = request.payload as unknown as PublishListingPayload;

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

  // Enrichissement de republish_listing (auto-completion depuis l'annonce
  // precedente) pas encore branche ici -- commit dedie separe, voir
  // enrichListing.ts. `payload` reste donc pour l'instant strictement celui
  // recu de l'app, sans modification.

  // Preuve directe du payload (inchange pour l'instant, voir commentaire
  // ci-dessus) juste avant qu'il ne serve a fetcher les photos et a
  // construire la commande PUBLISH_LISTING. juste avant qu'il ne
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

  let tab: chrome.tabs.Tab;
  try {
    // active:true (voir commentaire d'en-tete) : l'utilisateur doit voir
    // l'onglet pour terminer la publication lui-meme.
    tab = await chrome.tabs.create({ url: VINTED_NEW_LISTING_URL, active: true });
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

  return new Promise<RunActionOutcome>((resolve) => {
    let settled = false;
    let tabClosedByHandler = false;
    // Bascule des reception de PUBLISH_PREFILL_SUMMARY -- voir commentaire
    // d'en-tete (keepTabOpen sur timeout uniquement a partir de ce point).
    let reachedManualPhase = false;
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
      } else if (message.type === "PUBLISH_RESULT") {
        // N'arrive plus qu'en cas d'echec du remplissage automatise (session
        // expiree, page introuvable...) -- le chemin de succes ne passe plus
        // par ce message, voir onTabUpdated ci-dessous.
        settle(message.outcome);
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
              // Non fatal : l'injection declarative a peut-etre deja suffi
              // (PUBLISH_TAB_READY peut arriver independamment de cette
              // reinjection).
              logger.warn("HANDLE_PUBLISH_REINJECT_FAILED", errorDetails(err));
            });
        }
      }

      const vintedItemId = extractPublishedItemId(updatedTab.url);
      if (!vintedItemId) return;
      settle({ status: "success", resultPayload: { vintedItemId, vintedUrl: updatedTab.url! } });
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
      logger.error("HANDLE_PUBLISH_NO_READY_SIGNAL", { tabId, timeoutMs: TAB_READY_TIMEOUT_MS });
      settle({
        status: "error",
        errorMessage:
          "La page Vinted n'a pas confirmé être prête à temps (le script d'automatisation n'a jamais pu se lancer). Réessaie -- si le problème persiste, la page Vinted a peut-être changé de structure.",
      });
    }, TAB_READY_TIMEOUT_MS);

    chrome.runtime.onMessage.addListener(onMessage);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.onUpdated.addListener(onTabUpdated);
  });
}
