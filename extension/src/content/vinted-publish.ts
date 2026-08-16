// Injecte sur https://www.vinted.fr/items/new (voir manifest.config.ts).
// Phase 3.1 (publication) : remplit le formulaire de creation d'annonce
// Vinted a partir d'une commande recue du background. Premiere action
// d'ECRITURE reelle de l'extension (contrairement a vinted-profile.ts,
// purement lecture) - toujours declenchee par une commande explicite,
// jamais d'initiative propre (voir EXTENSION.md §8).
//
// REPUBLICATION ASSISTEE (2026-08-11, lot dedie) : ce script ne tente plus
// JAMAIS d'ouvrir le selecteur de categorie ni les pickers d'attributs
// (etat/taille/marque/couleur/matiere), et ne clique plus JAMAIS sur le
// bouton de soumission final. Deux raisons distinctes, verifiees separement :
// 1) resolveCategory() (formFill.ts) leve desormais inconditionnellement --
//    le trigger du panneau categorie exige un evenement isTrusted:true
//    (preuve directe A/B testee, voir son commentaire d'en-tete) : aucune
//    automatisation ne peut jamais l'ouvrir. Consequence en cascade,
//    documentee dans publishSelectors.ts : les triggers de brand/size/
//    condition/color/material N'EXISTENT MEME PAS dans le DOM tant qu'une
//    categorie FEUILLE n'a pas ete choisie -- ce script ne peut donc rien
//    tenter sur ces 5 champs tant que l'utilisateur n'a pas lui-meme
//    termine la navigation categorie.
// 2) Le clic final de soumission n'a jamais ete verifie en conditions
//    reelles (aucune publication n'a jamais ete tentee, voir l'historique
//    de ce fichier) -- exactement la meme classe de risque que le bouton
//    "Valider" de vinted-edit.ts (route de sauvegarde potentiellement
//    protegee par un anti-bot, voir son commentaire d'en-tete). Plutot que
//    de decouvrir ce risque en le declenchant automatiquement, la
//    publication reste desormais un clic 100% humain, exactement comme
//    edit_listing -- c'est handlePublishListing.ts (background) qui detecte
//    la reussite reelle, via chrome.tabs.onUpdated (navigation vers
//    /items/{id nouveau}), jamais ce content script (dont le contexte JS
//    est de toute facon detruit par une vraie navigation de page).
//
// Ce script se limite donc a : remplir les champs surs (titre, description,
// prix, photos -- aucun n'exige d'evenement isTrusted), relire chacun dans
// le DOM pour ne jamais annoncer confirme ce qui ne l'est pas reellement, et
// rapporter un etat des lieux honnete (PUBLISH_PREFILL_SUMMARY) avant de
// laisser la main a l'utilisateur.
//
// REPRISE POST-CATEGORIE (mission "FINIR LES CHAMPS MANQUANTS", 2026-08-11) :
// une fois que l'utilisateur a LUI-MEME choisi une categorie feuille (donc
// une fois les 5 triggers ci-dessus apparus dans le DOM), ce script tente
// alors -- en arriere-plan, best-effort -- de reprendre etat/taille/marque/
// couleur/matiere via selectMatchingOption()/readOptionTexts() (deja
// prouves en production sur edit_listing) : aucun de ces 5 triggers
// n'exige lui-meme isTrusted (seul celui de la categorie l'exige), voir
// watchForCategorySelectionAndPrefillAttributes() plus bas. Non verifie en
// live sur /items/new au moment ou ce commentaire est ecrit -- best-effort
// inconditionnel, retombe sur manuel a la moindre incertitude.
//
// Selecteurs verifies en direct le 2026-07-10 (compte matleshop) - voir
// publishSelectors.ts pour le detail et les points encore a confirmer en
// test live (comportement exact de l'upload photo, bandeau d'erreur Vinted).

import { waitForElement, waitForCondition, WaitTimeoutError, describeTimeout } from "./domWait";
import * as sel from "./publishSelectors";
import {
  PublishError,
  dispatchEscapeKey,
  dispatchFullClick,
  parsePriceToNumber,
  readOptionTexts,
  setNativeValue,
  typeIntoBrandSearchInput,
  verifyLoggedInAccount,
  type ReadOptionTextsStep,
} from "./formFill";
import {
  describeConditionTriggerAfterSelection,
  matchConditionOption,
  readConditionOptionCandidates,
} from "./conditionOptionReader";
import { readSizeOptionCandidates } from "./sizeOptionReader";
import { readColorOptionCandidates } from "./colorOptionReader";
import { describeMatchAttempt, matchOption, normalize } from "./matchOption";
import {
  describeExactMatchCandidate,
  describeExactMatchStructure,
  diffDropdownDomElements,
  matchesHumanClick,
  snapshotDropdownDom,
  type DropdownDomSnapshot,
} from "./attributeDropdownDiagnostics";
import {
  confirmTriggerValue,
  describeCategoryTriggerDom,
  detectCategorySelection,
  hasAnyAttributeTrigger,
  readAttributeTriggerPresence,
  readTriggerText,
  type CategoryDetectionMethod,
  type CategoryDetectionState,
} from "./categoryDetection";
import { computeManualFields, replaceManualPlaceholder } from "./publishFieldSummary";
import { reconstructPhotoFiles } from "./photoReconstruction";
import { describeAvailableFileInputs } from "./fileInputDiagnostics";
import { isContentCommand } from "../lib/messages";
import type { FetchedPhoto, PublishCommandResponse, PublishListingPayload, PublishStep, RunActionOutcome } from "../lib/messages";
import { errorMessage } from "../lib/errorMessage";
import { base64ToArrayBuffer, describeBinaryValue } from "../lib/binaryTransport";
import { logger } from "../background/logger";

// Marqueur de version DEV (audit "prefill partiel", retest 2026-08-11) :
// preuve directe, des l'injection du script, de quel bundle Chrome execute
// reellement dans cet onglet -- un content script deja injecte AVANT un
// rechargement de l'extension reste l'ANCIENNE version dans les onglets deja
// ouverts (Chrome ne re-injecte jamais dans un onglet existant sur simple
// "Recharger" cote chrome://extensions). Incrementer cette chaine a chaque
// changement notable de ce fichier pour que le prochain test live confirme
// sans ambiguite si le bundle actif est bien celui attendu.
const PUBLISH_CONTENT_VERSION = "2026-08-12-attribute-prefill-timeout-20000-v1";

// Mission "DIAGNOSTIC LIVE APRES REJET DES PHOTOS INVALIDES" (2026-08-11),
// item E : identifiant UNIQUE genere UNE SEULE FOIS a l'evaluation de CE
// module (const top-level -- dynamic import() met en cache le module PAR
// REALM/document JS : une reinjection du LOADER sur le MEME document renvoie
// l'instance DEJA importee sans reexecuter ce code, mais une VRAIE navigation
// qui remplace le document cree un realm neuf, donc un nouvel ID). Stable
// tant que ce document JS reste vivant -- inclus dans PUBLISH_TAB_READY,
// l'ACK PUBLISH_LISTING, RUN_PUBLISH_START/FINISHED et chaque PREFILL_*, pour
// prouver (au lieu de supposer) si le document qui a repondu a la commande
// est bien celui, in fine, visible et rempli par l'utilisateur.
const DOCUMENT_INSTANCE_ID = crypto.randomUUID();
console.log("[ResellOS] PUBLISH_CONTENT_VERSION", PUBLISH_CONTENT_VERSION, { href: location.href, documentInstanceId: DOCUMENT_INSTANCE_ID });
logger.info("PUBLISH_CONTENT_VERSION", { version: PUBLISH_CONTENT_VERSION, href: location.href, documentInstanceId: DOCUMENT_INSTANCE_ID });

// Mission "STOPPER LE DEBUG EN BOUCLE" (2026-08-12) : preuve directe demandee
// -- le rapport precedent annoncait un timeout de 20000ms, le test live a
// continue de montrer 8000ms. Deplace ici (avant tout usage) pour pouvoir
// etre inclus DES LE BOOT du script dans un marqueur impossible a confondre
// avec un bundle perime -- si le prochain test live montre encore 8000ms
// alors que CE log affiche bien configuredTriggerTimeoutMs:20000, la cause
// est necessairement hors de ce fichier (bundle non recharge cote Chrome,
// ancien onglet jamais ferme, etc.), jamais une erreur de propagation ici.
const ATTRIBUTE_TRIGGER_TIMEOUT_MS = 20000;
const REPUBLISH_BUILD_DIAGNOSTIC = {
  marker: "attribute-prefill-timeout-20000-v1",
  documentInstanceId: DOCUMENT_INSTANCE_ID,
  configuredTriggerTimeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS,
};
console.log("[ResellOS] REPUBLISH_BUILD_DIAGNOSTIC", REPUBLISH_BUILD_DIAGNOSTIC);
logger.info("REPUBLISH_BUILD_DIAGNOSTIC", REPUBLISH_BUILD_DIAGNOSTIC);

// Wrapper local : injecte documentInstanceId dans CHAQUE log de ce fichier,
// sans devoir modifier individuellement des dizaines de sites d'appel --
// purement diagnostique, aucun comportement metier modifie.
const docLog = {
  info: (message: string, detail?: Record<string, unknown>) => logger.info(message, { ...detail, documentInstanceId: DOCUMENT_INSTANCE_ID }),
  warn: (message: string, detail?: Record<string, unknown>) => logger.warn(message, { ...detail, documentInstanceId: DOCUMENT_INSTANCE_ID }),
  error: (message: string, detail?: Record<string, unknown>) => logger.error(message, { ...detail, documentInstanceId: DOCUMENT_INSTANCE_ID }),
};

// Mission "PORT MESSAGE FERMÉ" (2026-08-11), item 4 : detection PUREMENT
// OBSERVATIONNELLE (aucune ecriture, aucune reaction) du bandeau d'erreur
// generique de Vinted ("Désolé, une erreur s'est produite") -- seul moyen de
// savoir, sans rien supposer, si c'est CET onglet (/items/new) qui l'affiche
// et a quel instant exact par rapport a l'envoi de PUBLISH_LISTING. Le texte
// exact n'a jamais ete confirme cote Vinted (rapporte par l'utilisateur en
// direct) -- recherche donc un motif large ("erreur s'est produit"), pas une
// correspondance stricte, pour ne pas manquer une variante de formulation.
let vintedErrorBannerAlreadyLogged = false;
let vintedErrorCheckScheduled = false;
// Mission "CRASH INJECTION PHOTOS" (2026-08-11), item 10 : derniere etape
// PHOTO_* connue au moment ou le bandeau d'erreur Vinted apparait -- seul
// moyen de correler precisement LE crash a UNE etape de l'injection (avant
// input.files=, apres, avant/apres l'evenement change, ou totalement hors de
// cette sequence). Mis a jour par injectPhotosWithConfirmation() ci-dessous.
let lastPhotoInjectionStage: string | null = null;
// Mission "diagnostic final PHOTOS + CATEGORIE" (2026-08-11), item 4 : test
// live reel ou PUBLISH_DIAGNOSTIC_SUMMARY montrait lastPhotoInjectionStage
// bloque a "PHOTO_FILES_BUILT" SANS moyen de savoir si files.length valait 0
// (rejet total, retour explicite AVANT waitForElement(input) -- voir plus
// bas) ou un nombre > 0 (auquel cas le blocage serait ailleurs). Rendu
// visible dans le resume final pour trancher ce point sans deviner.
let lastFilesBuiltCount: number | null = null;
function checkForVintedErrorBanner(): void {
  vintedErrorCheckScheduled = false;
  if (vintedErrorBannerAlreadyLogged) return;
  if (/erreur s'est produit/i.test(document.body?.innerText ?? "")) {
    vintedErrorBannerAlreadyLogged = true;
    const input = document.querySelector<HTMLInputElement>(sel.ADD_PHOTOS_INPUT_SELECTOR);
    const grid = document.querySelector(sel.MEDIA_UPLOAD_GRID_SELECTOR);
    docLog.error("VINTED_ERROR_BANNER_DETECTED", {
      href: location.href,
      title: document.title,
      at: Date.now(),
      lastPhotoInjectionStage,
      photoInputFilesLength: input?.files?.length ?? null,
      mediaGridImageCount: grid ? grid.querySelectorAll("img").length : null,
    });
  }
}
// Coalesce en un seul scan par rafale de mutations -- innerText force un
// reflow, couteux si appele sur chaque mutation individuelle (le grid photo
// et les re-rendus React de Vinted peuvent en produire beaucoup d'un coup).
const vintedErrorObserver = new MutationObserver(() => {
  if (vintedErrorCheckScheduled || vintedErrorBannerAlreadyLogged) return;
  vintedErrorCheckScheduled = true;
  setTimeout(checkForVintedErrorBanner, 200);
});
vintedErrorObserver.observe(document.documentElement, { childList: true, subtree: true });

function reportProgress(step: PublishStep): void {
  chrome.runtime.sendMessage({ type: "PUBLISH_PROGRESS", step });
}

function reportResult(outcome: RunActionOutcome): void {
  chrome.runtime.sendMessage({ type: "PUBLISH_RESULT", outcome });
}

function reportPrefillSummary(confirmed: string[], pending: string[]): void {
  chrome.runtime.sendMessage({ type: "PUBLISH_PREFILL_SUMMARY", confirmed, pending });
}

// Remplit titre/description/prix et relit chacun dans le DOM juste apres
// ecriture -- ne rapporte "confirme" que ce qui a reellement ete verifie,
// jamais juste "tente" (voir setNativeValue, formFill.ts, deja utilise avec
// la meme discipline par vinted-edit.ts). Un champ non confirme est ajoute a
// `pending` plutot que de faire echouer toute la preparation : "l'echec d'un
// champ ne doit jamais empecher la preparation des autres" (demande
// explicite de ce lot).
async function fillTextFieldsWithConfirmation(
  payload: PublishListingPayload,
  confirmed: string[],
  pending: string[],
  stepTimestamps: Record<string, number>
): Promise<void> {
  try {
    const titleInput = await waitForElement<HTMLInputElement>(sel.TITLE_INPUT_SELECTOR);
    setNativeValue(titleInput, payload.title);
    const ok = titleInput.value === payload.title;
    docLog.info("PREFILL_TITLE", { payloadLength: payload.title.length, elementFound: true, valueAfterLength: titleInput.value.length, confirmed: ok });
    if (ok) confirmed.push("Titre");
    else pending.push("Titre");
  } catch (err) {
    docLog.error("PREFILL_TITLE_ELEMENT_NOT_FOUND", { error: errorMessage(err) });
    pending.push("Titre");
  }
  stepTimestamps.PREFILL_TITLE_DONE = Date.now();

  // Audit live-driven (2026-08-10, "prefill partiel") : une annonce
  // synchronisee passivement depuis le profil Vinted (recordListings,
  // extension/src/background/sync.ts) n'a JAMAIS de description en base --
  // ListingPayload (le message envoye par le content script de detection,
  // extension/src/lib/messages.ts) ne porte meme pas ce champ, contrairement
  // a recordSingleItemImport (import explicite d'un item precis, qui lit le
  // JSON-LD de la page). payload.description peut donc legitimement valoir
  // "" ici. Avant ce correctif, `"" === ""` etait compte comme "Description"
  // confirmee -- une fausse reussite (aucune ecriture reelle n'a eu lieu,
  // rien n'a ete "preremplis") exactement le risque signale section 7. Ne
  // JAMAIS annoncer confirme un champ que ResellOS n'a jamais eu.
  try {
    const descriptionInput = await waitForElement<HTMLTextAreaElement>(sel.DESCRIPTION_INPUT_SELECTOR);
    const payloadTrimmed = payload.description.trim();
    if (!payloadTrimmed) {
      docLog.warn("PREFILL_DESCRIPTION_EMPTY_PAYLOAD", { elementFound: true, elementType: descriptionInput.tagName });
      pending.push("Description");
    } else {
      const valueBefore = descriptionInput.value;
      setNativeValue(descriptionInput, payload.description);
      const valueAfter = descriptionInput.value;
      const ok = valueAfter === payload.description;
      docLog.info("PREFILL_DESCRIPTION", {
        payloadLength: payload.description.length,
        elementFound: true,
        elementType: descriptionInput.tagName,
        valueBeforeLength: valueBefore.length,
        valueAfterLength: valueAfter.length,
        confirmed: ok,
      });
      if (ok) confirmed.push("Description");
      else pending.push("Description");
    }
  } catch (err) {
    docLog.error("PREFILL_DESCRIPTION_ELEMENT_NOT_FOUND", { error: errorMessage(err) });
    pending.push("Description");
  }
  stepTimestamps.PREFILL_DESCRIPTION_DONE = Date.now();

  try {
    const priceInput = await waitForElement<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
    setNativeValue(priceInput, payload.price.toString());
    // Mission "REPUBLICATION FIDELE" (2026-08-11) : CAUSE CONFIRMEE -- test
    // live montrant "24,00 €" reellement affiche mais confirmed:false. Le
    // champ prix Vinted reformate sa valeur ("24" -> "24,00") en reaction
    // synchrone aux evenements input/change/blur (voir setNativeValue) --
    // une comparaison de chaines stricte contre "24" echoue alors a tort.
    // parsePriceToNumber() (deja live-testee cote vinted-edit.ts pour ce
    // meme champ) normalise les deux cotes avant de comparer.
    const ok = parsePriceToNumber(priceInput.value) === payload.price;
    docLog.info("PREFILL_PRICE", { payload: payload.price, elementFound: true, valueAfter: priceInput.value, confirmed: ok });
    if (ok) confirmed.push("Prix");
    else pending.push("Prix");
  } catch (err) {
    docLog.error("PREFILL_PRICE_ELEMENT_NOT_FOUND", { error: errorMessage(err) });
    pending.push("Prix");
  }
  stepTimestamps.PREFILL_PRICE_DONE = Date.now();
}

// CAUSE CONFIRMEE en test live (2026-08-10, audit "prefill partiel") :
// "Access to fetch at 'https://images1.vinted.net/...' from origin
// 'https://www.vinted.fr' has been blocked by CORS policy" -- un fetch()
// emis par CE content script s'execute avec le principal d'ORIGINE de la
// page hote (vinted.fr), soumis a SON CORS, quelle que soit la permission
// declaree dans le manifest de l'extension (host_permissions ne beneficie
// qu'aux fetch() emis depuis un contexte D'EXTENSION -- background/popup,
// jamais un content script). Le fetch est donc entierement deplace dans
// handlePublishListing.ts (background, voir son commentaire fetchPhoto) --
// ce script ne recoit plus que le RESULTAT deja tente (FetchedPhoto[],
// succes ou echec explicite par URL), ne fait plus jamais de reseau
// lui-meme. Best-effort, jamais bloquant pour le reste du remplissage (meme
// discipline que fillTextFieldsWithConfirmation) : un echec de fetch cote
// background ne fait jamais echouer titre/description/prix.
//
// Mission "CRASH INJECTION PHOTOS" (2026-08-11) : instrumentation exhaustive
// AJOUTEE ICI, aucune logique changee -- Vinted affiche desormais son propre
// bandeau d'erreur generique pendant/apres cette fonction (grid jamais
// confirmee), cause exacte encore inconnue. Chaque frontiere de la sequence
// FetchedPhoto[] -> ArrayBuffer -> File -> DataTransfer -> input.files ->
// evenement -> reaction DOM Vinted est desormais loggee separement pour
// localiser precisement OU le crash se produit, sans deviner. lastPhotoInjectionStage
// (module-level, voir plus haut) est mis a jour a chaque etape pour que
// VINTED_ERROR_BANNER_DETECTED puisse rapporter la derniere etape connue au
// moment exact ou le bandeau Vinted apparait. La reconstruction FetchedPhoto[]
// -> File[] elle-meme est desormais deleguee a photoReconstruction.ts (extrait
// pour rester testable en isolation, meme discipline que publishFieldSummary.ts).
async function injectPhotosWithConfirmation(
  photos: FetchedPhoto[],
  confirmed: string[],
  pending: string[],
  stepTimestamps: Record<string, number>
): Promise<void> {
  lastPhotoInjectionStage = "PHOTO_INJECTION_START";
  stepTimestamps.PHOTO_INJECTION_START = Date.now();
  docLog.info("PHOTO_INJECTION_START", { fetchedPhotosCount: photos.length });

  if (photos.length === 0) {
    docLog.warn("PREFILL_PHOTOS_EMPTY_PAYLOAD", {});
    stepTimestamps.PHOTO_INJECTION_DONE = Date.now();
    return;
  }

  const reconstructed = reconstructPhotoFiles(photos);
  const files: File[] = [];
  const perPhoto: Record<string, unknown>[] = [];
  // Mission "5 photos non reconnues comme images" (2026-08-11) : tableau de
  // validite demande explicitement -- Content-Type HTTP DECLARE (capture cote
  // background, voir fetchPhoto()) compare aux magic bytes REELS lus ici, par
  // photo. reconstructPhotoFiles() preserve l'ordre 1:1 avec `photos`, zip par
  // index plutot que par URL (URLs potentiellement dupliquees en theorie).
  // Mission "diagnostic final PHOTOS + CATEGORIE" (2026-08-11), item 2 :
  // 2 champs manquaient pour repondre EXACTEMENT a la liste demandee -- le
  // MIME final et la taille du File EFFECTIVEMENT construit (peut differer
  // du contentTypeHeader declare, voir CANONICAL_MIME dans
  // photoReconstruction.ts qui prefere le format SNIFFE). r.file est deja
  // 1:1 avec photos[i] (reconstructPhotoFiles ne reordonne/ne saute jamais
  // d'entree, voir son commentaire d'en-tete) -- jamais besoin de rezipper
  // par URL.
  const validityReport = reconstructed.map((r, i) => ({
    url: r.url,
    httpStatus: photos[i]?.httpStatus ?? null,
    contentTypeHeaderDeclared: photos[i]?.contentTypeHeader ?? null,
    contentLengthHeader: photos[i]?.contentLengthHeader ?? null,
    finalUrl: photos[i]?.finalUrl ?? null,
    redirected: photos[i]?.redirected ?? null,
    byteLength: r.byteLength,
    magicBytesHex: r.magicBytesHex,
    sniffedFormat: r.sniffedFormat,
    fileMimeType: r.file?.type ?? null,
    fileSize: r.file?.size ?? null,
    valid: r.file !== null,
  }));
  docLog.info("PHOTO_VALIDITY_REPORT", { report: validityReport });

  for (const r of reconstructed) {
    perPhoto.push({
      url: r.url,
      fileCreated: r.fileCreated,
      byteLength: r.byteLength,
      sniffedFormat: r.sniffedFormat,
      declaredMimeType: r.declaredMimeType,
      error: r.error,
    });
    if (r.file) {
      files.push(r.file);
    } else if (r.sniffedFormat === "unknown") {
      // Diagnostic uniquement (item 9) -- HTTP 200 ne garantit pas un
      // contenu image valide (page d'erreur HTML, reponse tronquee...).
      // Mission "5 photos non reconnues" : cette photo n'est PLUS injectee
      // (reconstructPhotoFiles() la rejette desormais explicitement, voir
      // son commentaire d'en-tete) -- un File issu d'octets non-image serait
      // garanti invalide cote Vinted.
      docLog.warn("PHOTO_CONTENT_NOT_RECOGNIZED_AS_IMAGE", {
        url: r.url,
        declaredMimeType: r.declaredMimeType,
        byteLength: r.byteLength,
        magicBytesHex: r.magicBytesHex,
      });
    }
  }
  docLog.info("PREFILL_PHOTOS_FETCH_RESULTS", { totalUrls: photos.length, filesCreated: files.length, perPhoto });
  lastPhotoInjectionStage = "PHOTO_FILES_BUILT";
  lastFilesBuiltCount = files.length;
  docLog.info("PHOTO_FILES_BUILT", {
    count: files.length,
    files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
  });

  if (files.length === 0) {
    pending.push("Photos");
    stepTimestamps.PHOTO_INJECTION_DONE = Date.now();
    return;
  }

  // Mission "diagnostic final PHOTOS + CATEGORIE" (2026-08-11), item 2/3 :
  // isole DELIBEREMENT de la sequence DataTransfer/change/grid plus bas --
  // un waitForElement(input) qui echoue ici est une cause RADICALEMENT
  // differente (selecteur perime, champ jamais rendu) d'un echec APRES avoir
  // trouve l'input (grid jamais confirmee malgre une assignation reussie).
  // Les confondre sous un seul PREFILL_PHOTOS_GRID_NOT_CONFIRMED (avant ce
  // correctif) rendait ce diagnostic precis impossible sans DevTools ouverts
  // au bon moment.
  let input: HTMLInputElement;
  try {
    input = await waitForElement<HTMLInputElement>(sel.ADD_PHOTOS_INPUT_SELECTOR);
  } catch (err) {
    docLog.error("PHOTO_INPUT_NOT_FOUND", {
      selector: sel.ADD_PHOTOS_INPUT_SELECTOR,
      href: location.href,
      error: errorMessage(err),
      availableFileInputs: describeAvailableFileInputs(),
    });
    pending.push("Photos");
    stepTimestamps.PHOTO_INJECTION_DONE = Date.now();
    return;
  }
  lastPhotoInjectionStage = "PHOTO_INPUT_FOUND";
  docLog.info("PHOTO_INPUT_FOUND", {
    selector: sel.ADD_PHOTOS_INPUT_SELECTOR,
    type: input.type,
    multiple: input.multiple,
    accept: input.accept,
  });

  try {
    const dataTransfer = new DataTransfer();
    files.forEach((file) => dataTransfer.items.add(file));
    lastPhotoInjectionStage = "PHOTO_DATATRANSFER_BUILT";
    docLog.info("PHOTO_DATATRANSFER_BUILT", { itemsCount: dataTransfer.items.length, filesCount: dataTransfer.files.length });

    lastPhotoInjectionStage = "PHOTO_BEFORE_ASSIGN_FILES";
    docLog.info("PHOTO_BEFORE_ASSIGN_FILES", {});
    input.files = dataTransfer.files;
    lastPhotoInjectionStage = "PHOTO_AFTER_ASSIGN_FILES";
    docLog.info("PHOTO_AFTER_ASSIGN_FILES", { inputFilesLength: input.files?.length ?? 0 });

    // Note (item A du rapport) : AUCUN evenement "input" n'est dispatche ici,
    // volontairement -- contrairement a setNativeValue() (formFill.ts) pour
    // les champs texte (input+change+blur), un <input type="file"> n'a pas
    // de convention "input" equivalente ; React ecoute "change" nativement
    // pour ce type de champ. Documente plutot que suppose : aucune nouvelle
    // logique ajoutee ce tour (voir rapport section A).
    lastPhotoInjectionStage = "PHOTO_BEFORE_CHANGE_EVENT";
    docLog.info("PHOTO_BEFORE_CHANGE_EVENT", {});
    input.dispatchEvent(new Event("change", { bubbles: true }));
    lastPhotoInjectionStage = "PHOTO_AFTER_CHANGE_EVENT";
    docLog.info("PHOTO_AFTER_CHANGE_EVENT", {});
    docLog.info("PREFILL_PHOTOS_INPUT_ASSIGNED", { elementFound: true, filesAssigned: input.files?.length ?? 0 });

    lastPhotoInjectionStage = "PHOTO_WAITING_FOR_GRID";
    await waitForCondition(() => {
      const grid = document.querySelector(sel.MEDIA_UPLOAD_GRID_SELECTOR);
      return !!grid && grid.querySelectorAll("img").length >= files.length;
    }, { timeoutMs: 30000 });

    const grid = document.querySelector(sel.MEDIA_UPLOAD_GRID_SELECTOR);
    const actualCount = grid ? grid.querySelectorAll("img").length : 0;
    lastPhotoInjectionStage = "PHOTO_GRID_STATE_AFTER_INJECTION";
    docLog.info("PHOTO_GRID_STATE_AFTER_INJECTION", { imageCount: actualCount, gridFound: !!grid });
    docLog.info("PREFILL_PHOTOS_GRID_CONFIRMED", { expected: files.length, actualInGrid: actualCount });
    confirmed.push(`Photos (${files.length})`);
  } catch (err) {
    const grid = document.querySelector(sel.MEDIA_UPLOAD_GRID_SELECTOR);
    const actualCount = grid ? grid.querySelectorAll("img").length : 0;
    const input = document.querySelector<HTMLInputElement>(sel.ADD_PHOTOS_INPUT_SELECTOR);
    lastPhotoInjectionStage = "PHOTO_GRID_STATE_AFTER_INJECTION";
    docLog.info("PHOTO_GRID_STATE_AFTER_INJECTION", { imageCount: actualCount, gridFound: !!grid, timedOut: true });
    docLog.error("PREFILL_PHOTOS_GRID_NOT_CONFIRMED", {
      expected: files.length,
      gridFound: !!grid,
      actualInGrid: actualCount,
      inputFilesLength: input?.files?.length ?? null,
      error: errorMessage(err),
    });
    pending.push("Photos");
  }
  stepTimestamps.PHOTO_INJECTION_DONE = Date.now();
}

// Mission "port message fermé" (2026-08-11), item 4 : protection idempotente
// minimale -- runPublish() peut en theorie etre invoque plusieurs fois dans
// le MEME document si le background finit par envoyer PUBLISH_LISTING plus
// d'une fois (ex. un futur bug de cablage, ou une reinjection qui redeclenche
// un ready + un nouvel envoi alors qu'un premier essai tourne deja). Pas de
// requestId disponible ici (PublishListingPayload n'en porte pas, contrairement
// a EditListingPayload.historyId) -- un simple garde "un seul a la fois dans
// CE document" suffit et reste dans l'esprit "pas de nouvelle architecture
// complexe" demande explicitement. Lu SYNCHRONEMENT par le listener
// (bootPublishContentScript, plus bas) pour decider duplicate:true/false dans
// l'ACK avant meme de lancer runPublish -- jamais un second run declenche.
let runPublishInvocationCount = 0;
let runPublishInFlight = false;

// Mission "FINIR LES CHAMPS MANQUANTS" (2026-08-11) : reprise automatique
// best-effort des attributs (etat/taille/marque/couleur/matiere) UNE FOIS
// que l'utilisateur a lui-meme choisi une categorie feuille sur /items/new.
// La categorie elle-meme reste 100% manuelle (isTrusted, voir
// formFill.ts::resolveCategory) -- rien de nouveau tente dessus ici. Reutilise
// TEL QUEL readOptionTexts()+matchOption() (formFill.ts/matchOption.ts),
// deja prouves en production sur edit_listing (vinted-edit.ts) via
// selectMatchingOption() -- mais NON VERIFIE EN LIVE sur /items/new
// specifiquement : les deux formulaires partagent vraisemblablement le meme
// composant Vinted (voir l'en-tete de formFill.ts), sans certitude absolue.
// Strictement best-effort et jamais bloquant : toute exception (trigger
// introuvable, timeout) ou absence de correspondance fiable retombe sur
// "manuel", jamais un clic hasardeux ni une valeur inventee.
const ATTRIBUTE_CONTROLS_WAIT_TIMEOUT_MS = 10 * 60 * 1000; // attente d'une action HUMAINE (choix de categorie) -- jamais un delai technique court.

interface AttributePickerSpec {
  logName: string;
  label: string;
  triggerSelector: string;
  contentSelector: string;
  value: string | null;
}

// Mission "CORRIGER LES ATTRIBUTS POST-CATEGORIE" (2026-08-12) : preuve live
// -- ETAT et TAILLE echouent en "trigger_not_found" (timeout 8000ms) alors
// que MARQUE (tentee ~16s+ plus tard dans la meme sequence) reussit. Widen
// UNIQUEMENT ce timeout precis (readOptionTexts appelee depuis la reprise
// post-categorie) : hypothese fondee sur cette sequence reelle (rendu
// possiblement asynchrone/tardif specifique a la categorie choisie cote
// Vinted), pas une supposition en l'air -- mais non confirmee tant que le
// prochain test live ne le prouve pas. Si l'hypothese est fausse (vrai
// mismatch de selecteur), TRIGGER_NOT_FOUND_DIAGNOSTIC ci-dessous le
// revelera au lieu de laisser l'echec muet.
// ATTRIBUTE_TRIGGER_TIMEOUT_MS est desormais declaree PLUS HAUT dans ce
// fichier (avant DOCUMENT_INSTANCE_ID) -- mission "STOPPER LE DEBUG EN
// BOUCLE" (2026-08-12) : deplacee pour pouvoir etre incluse des le boot dans
// REPUBLISH_BUILD_DIAGNOSTIC, preuve directe de la valeur reellement chargee
// par CE document, avant meme qu'une categorie soit choisie.

// Diagnostic pur (aucune decision dessus) : quand un trigger reste introuvable
// meme apres le delai elargi, liste les data-testid REELLEMENT presents dans
// le DOM a cet instant precis, filtres sur des mots-cles pertinents pour ne
// pas noyer le log -- revele si Vinted utilise un autre identifiant sur
// /items/new que celui documente dans publishSelectors.ts (copie depuis
// edit_listing), plutot que de deviner a l'aveugle.
const ATTRIBUTE_DIAGNOSTIC_KEYWORDS = ["condition", "etat", "size", "taille", "grid", "list", "attribute", "select", "content"];
function describeAvailableTestIds(): string[] {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-testid]"));
  return nodes
    .map((el) => el.getAttribute("data-testid") ?? "")
    .filter((id) => ATTRIBUTE_DIAGNOSTIC_KEYWORDS.some((kw) => id.toLowerCase().includes(kw)));
}

// Mission "REPUBLICATION VINTED : CORRIGER LES 5 ATTRIBUTS APRES CATEGORIE"
// (2026-08-12) : le catch ci-dessous n'ecrasait jusqu'ici TOUTES les causes
// d'echec sous le meme "trigger_not_found", alors que la preuve live montre
// (conditionTriggerFound/sizeTriggerFound/colorTriggerFound: true, cote
// diagnostic categorie) que le trigger existe reellement -- l'echec reel se
// produit PLUS TARD (ouverture du dropdown, lecture des options). "step"
// (via le nouveau callback onStep de readOptionTexts()) permet de savoir
// EXACTEMENT jusqu'ou on est alle avant l'exception, sans jamais deviner.
type AttributeStep = "not_started" | ReadOptionTextsStep;

// Mission "FINIR LA REPUBLICATION" (2026-08-13), item 6 : meme mecanisme de
// confirmation reelle que le chemin dedie Etat (deja valide live), applique
// ici au chemin GENERIQUE (Taille/Marque/Couleur/Matiere) -- constante
// separee de CONDITION_CONFIRMATION_TIMEOUT_MS pour ne RIEN modifier au
// chemin Etat lui-meme (hors perimetre de cette mission sauf regression
// prouvee), meme si la valeur est identique.
const ATTRIBUTE_CONFIRMATION_TIMEOUT_MS = 5000;

// Mission "IDENTIFIER ET CORRIGER LES DERNIERS BLOQUAGES DES ATTRIBUTS"
// (2026-08-12) : preuve live CONFIRMEE -- Etat/Taille/Couleur atteignent
// TOUS "trigger_click_attempted" (le timeout de 20000ms est confirme
// fonctionnel) mais n'atteignent JAMAIS "dropdown_content_found". Or
// "trigger_click_attempted" ne prouve QUE la tentative du clic, jamais que
// le dropdown s'est reellement ouvert. Capture donc l'etat REEL du DOM a
// plusieurs instants autour du clic synthetique (avant, immediatement
// apres, +100/+500/+1500ms) -- objectif : repondre factuellement "le clic
// n'ouvre rien" ou "le clic ouvre bien quelque chose mais on regarde le
// mauvais contentSelector", sans jamais deviner laquelle des deux est vraie.
const DROPDOWN_DIAGNOSTIC_DELAYS_MS = [100, 500, 1500];

// Renvoie desormais le snapshot (en plus de le loguer) -- l'appelant capture
// ainsi le matchingTestIds de la phase "before_click"/premier clic comme
// baseline pour ATTRIBUTE_DROPDOWN_DOM_DIFF ci-dessous, sans re-interroger le
// DOM une seconde fois pour la meme phase.
function logDropdownDiagnostic(
  spec: AttributePickerSpec,
  phase: string,
  source: "synthetic_click" | "human_click",
  extra?: Record<string, unknown>
): DropdownDomSnapshot {
  const snapshot = snapshotDropdownDom(spec.triggerSelector);
  docLog.info("ATTRIBUTE_DROPDOWN_DOM_DIAGNOSTIC", {
    field: spec.label,
    phase,
    source,
    triggerSelector: spec.triggerSelector,
    expectedContentSelector: spec.contentSelector,
    ...snapshot,
    ...extra,
  });
  return snapshot;
}

// Mission "IDENTIFIER FACTUELLEMENT LA STRUCTURE DOM REELLE" (2026-08-12) :
// preuve live -- clic humain sur Etat : matchingTestIds passe de 51 a 87
// (dropdown visiblement ouvert), mais visibleListboxCount/visibleOptionCount
// restent a 0 -- le heuristique role=listbox/role=option generique ne
// represente PAS la structure reelle de ce composant Vinted. Ce diagnostic
// identifie PRECISEMENT quels data-testid sont apparus (et disparus) depuis
// le baseline "before_click", avec le detail complet de chaque element
// nouveau -- objectif : reveler la vraie structure du dropdown Etat pour la
// comparer clic synthetique vs clic humain, sans changer aucun selecteur.
function logDropdownDiff(
  spec: AttributePickerSpec,
  phase: string,
  source: "synthetic_click" | "human_click",
  baselineTestIds: string[] | null
): void {
  if (!baselineTestIds) return;
  const diff = diffDropdownDomElements(baselineTestIds);
  docLog.info("ATTRIBUTE_DROPDOWN_DOM_DIFF", {
    field: spec.label,
    source,
    phase,
    addedTestIds: diff.addedTestIds,
    removedTestIds: diff.removedTestIds,
    addedElements: diff.addedElements,
  });
}

// Mission "DIAGNOSTIC FINAL CLIC HUMAIN + DROPDOWNS ATTRIBUTS" (2026-08-12) :
// preuve live -- Alexis a clique manuellement et reussi (Taille/Etat/Couleur
// selectionnes visuellement sur Vinted), mais ATTRIBUTE_HUMAN_CLICK_DIAGNOSTIC
// n'a produit AUCUN log. Audit de l'ancienne implementation
// (attachHumanClickComparisonListener, ci-dessus dans l'historique du
// fichier) : deux causes plausibles identifiees PAR LECTURE DE CODE, pas
// supposees en l'air --
// 1) REFERENCE STALE : le trigger etait resolu UNE SEULE FOIS a l'attache
//    (juste apres l'echec du clic synthetique, ~20s avant le clic humain
//    reel), et le listener etait attache a CETTE instance DOM precise. Si
//    Vinted/React remonte ce composant entre-temps (tres commun pour ce
//    type de widget controle, deja observe indirectement avec le trigger
//    categorie), le nouveau noeud ne porte plus notre listener -- un clic
//    humain sur le NOUVEAU noeud ne peut structurellement jamais le
//    declencher, meme si le selecteur matche toujours visuellement le meme
//    element pour l'utilisateur.
// 2) PROPAGATION : le listener ecoutait en phase bulle (comportement par
//    defaut d'addEventListener) sur le trigger lui-meme. Si Vinted attache
//    son PROPRE gestionnaire de clic sur un enfant du trigger et appelle
//    stopPropagation() (tres courant pour ce type de composant "select"
//    afin de gerer proprement le clic exterieur qui referme le menu), notre
//    listener ne recoit jamais l'evenement, quel que soit l'element cible.
//
// Les deux sont plausibles et non exclusifs -- corrige les DEUX a la fois
// avec l'architecture demandee : un SEUL listener document-level, phase
// CAPTURE (s'execute avant toute stopPropagation() en phase bulle, et avant
// la plupart des stopPropagation() en phase capture posees plus bas dans
// l'arbre), qui RE-INTERROGE le DOM au moment meme du clic (jamais une
// reference conservee) et determine l'appartenance via `.contains()` --
// insensible a un remplacement du noeud trigger entre l'attache et le clic,
// tant que le SELECTEUR continue de matcher.
const HUMAN_CLICK_WATCH_TIMEOUT_MS = 5 * 60 * 1000; // borne mais large : le temps qu'Alexis remarque et agisse manuellement.

function watchForHumanClick(spec: AttributePickerSpec): void {
  let settled = false;
  // Objet mutable plutot qu'une variable `let timer` reassignee : evite tout
  // souci d'ordre de declaration entre cleanup() (qui la lit) et
  // setTimeout() (qui l'assigne) plus bas dans la fonction, tout en restant
  // une seule affectation reelle (ESLint prefer-const sur `timer` lui-meme).
  const timerHandle: { current: ReturnType<typeof setTimeout> | null } = { current: null };

  function cleanup(): void {
    settled = true;
    if (timerHandle.current) clearTimeout(timerHandle.current);
    document.removeEventListener("click", handleClick, true);
  }

  function snapshotAndLog(eventName: string, extra: Record<string, unknown>): DropdownDomSnapshot {
    const snapshot = snapshotDropdownDom(spec.triggerSelector);
    docLog.info(eventName, {
      documentInstanceId: DOCUMENT_INSTANCE_ID,
      field: spec.label,
      triggerSelector: spec.triggerSelector,
      ...snapshot,
      ...extra,
    });
    return snapshot;
  }

  function handleClick(event: MouseEvent): void {
    if (settled) return;
    // Filtre en amont : ignore tout clic non-humain (y compris nos propres
    // dispatchFullClick() sur D'AUTRES champs) -- seul un event.isTrusted:true
    // constitue une comparaison valide avec les phases synthetiques.
    if (!event.isTrusted) return;

    // Re-interroge le DOM MAINTENANT (matchesHumanClick, pure, testee
    // isolement) plutot que d'utiliser une reference conservee -- insensible
    // a un remplacement du noeud trigger depuis l'attache de ce listener.
    const target = event.target instanceof Node ? event.target : null;
    const { triggerFoundAtClickTime, triggerContainsEventTarget } = matchesHumanClick(spec.triggerSelector, target);
    if (!triggerContainsEventTarget) return; // clic humain ailleurs sur la page -- pas ce champ, on continue d'ecouter

    cleanup();

    const eventTargetEl = event.target instanceof HTMLElement ? event.target : null;
    // Baseline capturee ICI (etat du DOM au moment meme du clic humain, AVANT
    // toute reaction Vinted) -- les deux diagnostics suivants (+100/+500ms)
    // sont diffes contre CETTE reference pour reveler precisement quels
    // data-testid apparaissent suite au clic reel.
    const baseline = snapshotAndLog("ATTRIBUTE_HUMAN_CLICK_DIAGNOSTIC", {
      eventIsTrusted: event.isTrusted,
      eventTargetTag: eventTargetEl?.tagName ?? null,
      eventTargetTestId: eventTargetEl?.getAttribute("data-testid") ?? null,
      triggerFoundAtClickTime,
      triggerContainsEventTarget,
      phase: "human_click",
    });
    setTimeout(() => {
      snapshotAndLog("ATTRIBUTE_HUMAN_CLICK_DOM_AFTER_100MS", {});
      logDropdownDiff(spec, "human_click_plus_100ms", "human_click", baseline.matchingTestIds);
    }, 100);
    setTimeout(() => {
      snapshotAndLog("ATTRIBUTE_HUMAN_CLICK_DOM_AFTER_500MS", {});
      logDropdownDiff(spec, "human_click_plus_500ms", "human_click", baseline.matchingTestIds);
    }, 500);
  }

  timerHandle.current = setTimeout(cleanup, HUMAN_CLICK_WATCH_TIMEOUT_MS);
  document.addEventListener("click", handleClick, true);
}

async function attemptAttributePrefill(spec: AttributePickerSpec, confirmed: string[], pending: string[]): Promise<void> {
  if (!spec.value) {
    docLog.info(spec.logName, { label: spec.label, outcome: "no_value" });
    replaceManualPlaceholder(pending, spec.label, `${spec.label} : donnée manquante (à choisir sur Vinted)`);
    return;
  }

  let lastStep: AttributeStep = "not_started";
  // Mission "IDENTIFIER FACTUELLEMENT LA STRUCTURE DOM REELLE" (2026-08-12) :
  // baseline capturee UNE FOIS a "before_click" (avant toute interaction) --
  // chaque diagnostic ulterieur (synthetique OU humain) est diffe contre
  // CETTE meme reference, pour que les deux sequences restent directement
  // comparables.
  let baselineTestIds: string[] | null = null;
  const onStep = (step: ReadOptionTextsStep, detail: Record<string, unknown>) => {
    lastStep = step;
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step, ...detail });

    if (step === "trigger_found") {
      const snapshot = logDropdownDiagnostic(spec, "before_click", "synthetic_click");
      baselineTestIds = snapshot.matchingTestIds;
    }
    if (step === "trigger_click_attempted") {
      logDropdownDiagnostic(spec, "immediately_after_click", "synthetic_click");
      logDropdownDiff(spec, "immediately_after_click", "synthetic_click", baselineTestIds);
      for (const delayMs of DROPDOWN_DIAGNOSTIC_DELAYS_MS) {
        setTimeout(() => {
          logDropdownDiagnostic(spec, `click_plus_${delayMs}ms`, "synthetic_click");
          logDropdownDiff(spec, `click_plus_${delayMs}ms`, "synthetic_click", baselineTestIds);
        }, delayMs);
      }
    }
  };

  try {
    // Mission "STOPPER LE DEBUG EN BOUCLE" (2026-08-12) : preuve directe de
    // la valeur REELLEMENT transmise a readOptionTexts() a CET appel precis
    // -- si le prochain test live montre encore 8000ms dans l'erreur alors
    // que ce log affiche bien triggerTimeoutMs:20000, la perte se produit
    // DANS readOptionTexts()/waitForElement() (voir READ_OPTION_TEXTS_CONFIG,
    // formFill.ts), jamais ici. Mission "CORRIGER LES 5 ATTRIBUTS" : BUG REEL
    // trouve et corrige dans readOptionTexts() -- le wait du CONTENU du
    // dropdown ne recevait jamais ce timeout (toujours 8000ms par defaut),
    // meme quand celui-ci en demandait 20000. Corrige dans formFill.ts, les
    // deux waits partagent desormais le meme timeout -- CONFIRME EN LIVE
    // fonctionnel (mission "IDENTIFIER ET CORRIGER LES DERNIERS BLOQUAGES").
    docLog.info("ATTRIBUTE_PREFILL_ATTEMPT_CONFIG", {
      field: spec.label,
      triggerSelector: spec.triggerSelector,
      contentSelector: spec.contentSelector,
      triggerTimeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS,
    });
    const { items, texts } = await readOptionTexts(spec.triggerSelector, spec.contentSelector, ATTRIBUTE_TRIGGER_TIMEOUT_MS, onStep);
    const match = matchOption(spec.value, texts);
    if (!match) {
      const diagnostic = describeMatchAttempt(spec.value, texts);
      docLog.warn(spec.logName, { label: spec.label, value: spec.value, optionsCount: texts.length, outcome: "no_reliable_match" });
      docLog.warn("ATTRIBUTE_MATCH_DIAGNOSTIC", { field: spec.label, ...diagnostic });

      // Mission item F (mission precedente) : preuve live -- MARQUE rapporte
      // exactMatches.length===2 ("multiple_exact_matches_ambiguous"), deux
      // <li> visibles/non-caches avec des boundingClientRect differents --
      // PAS une copie cachee evidente. Mission "DIAGNOSTIC FINAL CLIC HUMAIN"
      // (2026-08-12), item 6 : ajoute les details STRUCTURELS (parent, <ul>
      // englobant, ancetres, section proche) pour determiner si ResellOS
      // agrege deux LISTES differentes (desktop/mobile, groupes distincts...)
      // -- toujours aucune deduplication tentee ici, seulement l'observation.
      if (diagnostic.reason === "multiple_exact_matches_ambiguous") {
        texts.forEach((text, idx) => {
          if (diagnostic.exactMatches.includes(text)) {
            docLog.warn("ATTRIBUTE_MATCH_DUPLICATE_CANDIDATE_DIAGNOSTIC", {
              field: spec.label,
              ...describeExactMatchCandidate(items[idx], idx, text, normalize(text)),
              ...describeExactMatchStructure(items[idx]),
            });
          }
        });

        // Mission "FIX LIVE-GROUNDED : TAILLE + COULEUR" (2026-08-13), item 8 :
        // UNE seule information precise manquait encore pour trancher le
        // doublon MARQUE ("Polo Ralph Lauren" x2, closestUlClassName partageant
        // seulement un PREFIXE commun, nearbySectionText null pour les deux --
        // aucune de ces preuves n'etablit si les deux <li> appartiennent au
        // MEME <ul> (rendu duplique dans une seule liste) ou a deux <ul>
        // reellement distincts (deux sections/layouts separes). Comparaison
        // par IDENTITE de reference (===) sur closest("ul"), purement
        // observationnelle -- AUCUNE nouvelle heuristique de deduplication,
        // aucun Set(text), aucune decision prise ici.
        const ambiguousIndexes = texts
          .map((text, idx) => (diagnostic.exactMatches.includes(text) ? idx : -1))
          .filter((idx) => idx !== -1);
        const closestUls = ambiguousIndexes.map((idx) => items[idx].closest("ul"));
        const uniqueUls = new Set(closestUls.filter((ul): ul is HTMLUListElement => ul !== null));
        docLog.warn("ATTRIBUTE_MATCH_DUPLICATE_IDENTITY_DIAGNOSTIC", {
          field: spec.label,
          ambiguousCandidateCount: ambiguousIndexes.length,
          closestUlFoundCount: closestUls.filter((ul) => ul !== null).length,
          allCandidatesShareSameClosestUl: uniqueUls.size === 1 && closestUls.every((ul) => ul !== null),
          uniqueClosestUlCount: uniqueUls.size,
        });
      }

      document.body.click(); // ferme le picker sans rien selectionner (aucune valeur inventee)
      replaceManualPlaceholder(
        pending,
        spec.label,
        `${spec.label} : ${spec.value} (aucune correspondance fiable sur Vinted -- à choisir toi-même)`
      );
      return;
    }
    const index = texts.indexOf(match);
    items[index].click();
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: "option_clicked", matched: match });

    // Mission "FINIR LA REPUBLICATION" (2026-08-13), item 6 : jusqu'ici ce
    // chemin generique (Taille/Marque/Couleur/Matiere) rapportait
    // outcome:"confirmed" des l'instant du clic, sans jamais relire le
    // trigger -- contrairement au chemin dedie Etat (deja valide live), qui
    // relit reellement le trigger apres le clic avant de confirmer. Meme
    // mecanisme applique ici : readTriggerText() + normalize(), confirmed
    // UNIQUEMENT si le trigger affiche effectivement la valeur choisie.
    let triggerTextAfterClick: string | null = null;
    let triggerConfirmed = false;
    try {
      await waitForCondition(
        () => {
          triggerTextAfterClick = readTriggerText(spec.triggerSelector);
          if (!triggerTextAfterClick) return false;
          const normalizedTrigger = normalize(triggerTextAfterClick);
          const normalizedMatch = normalize(match);
          return normalizedTrigger === normalizedMatch || normalizedTrigger.includes(normalizedMatch);
        },
        { timeoutMs: ATTRIBUTE_CONFIRMATION_TIMEOUT_MS, description: `trigger displays the selected ${spec.label}` }
      );
      triggerConfirmed = true;
    } catch {
      triggerTextAfterClick = readTriggerText(spec.triggerSelector);
    }

    if (triggerConfirmed) {
      docLog.info(spec.logName, { label: spec.label, value: spec.value, matched: match, triggerTextAfterClick, outcome: "confirmed" });
      replaceManualPlaceholder(pending, spec.label, null);
      confirmed.push(spec.label);
    } else {
      docLog.warn(spec.logName, {
        label: spec.label,
        value: spec.value,
        matched: match,
        triggerTextAfterClick,
        outcome: "click_not_confirmed_in_trigger",
      });
      replaceManualPlaceholder(
        pending,
        spec.label,
        `${spec.label} : ${spec.value} (sélection tentée mais non confirmée sur Vinted -- vérifie toi-même)`
      );
    }
  } catch (err) {
    // outcome derive du DERNIER pas reellement franchi -- "trigger_not_found"
    // ne s'affiche desormais QUE si le trigger n'a jamais ete trouve ("not_started").
    // Toute autre valeur (ex. "failed_after_trigger_click_attempted") signifie
    // sans ambiguite que le trigger EXISTAIT et a ete clique, mais que le
    // contenu du dropdown n'est jamais apparu -- CAUSE EXACTE (isTrusted vs
    // contentSelector errone vs portal) encore NON CONFIRMEE, voir
    // ATTRIBUTE_DROPDOWN_DOM_DIAGNOSTIC ci-dessus pour la trancher au
    // prochain test live.
    const outcome = lastStep === "not_started" ? "trigger_not_found" : `failed_after_${lastStep}`;
    docLog.warn(spec.logName, { label: spec.label, value: spec.value, outcome, lastStep, error: errorMessage(err) });
    docLog.warn("TRIGGER_NOT_FOUND_DIAGNOSTIC", {
      field: spec.label,
      lastStep,
      searchedTriggerSelector: spec.triggerSelector,
      searchedContentSelector: spec.contentSelector,
      matchingTestIdsPresentInDom: describeAvailableTestIds(),
    });
    if (lastStep !== "not_started") {
      watchForHumanClick(spec);
    }
    replaceManualPlaceholder(pending, spec.label, `${spec.label} : ${spec.value} (à sélectionner sur Vinted)`);
  }
}

// Mission "FIX REEL DU PICKER ETAT SUR /items/new" (2026-08-12) : ROOT CAUSE
// CONFIRMEE EN LIVE -- le clic synthetique OUVRE reellement le dropdown Etat
// (37 nouveaux data-testid apres le clic, voir ATTRIBUTE_DROPDOWN_DOM_DIFF),
// mais readOptionTexts() attendait CATEGORY_DROPDOWN_CONTENT_SELECTOR, un
// conteneur qui n'existe PAS pour ce picker precis -- sa structure reelle est
// une liste plate de [data-testid="condition-{id}"] individuels (voir
// conditionOptionReader.ts pour le detail complet de cette preuve). Chemin
// DEDIE (pas une modification de readOptionTexts()/selectMatchingOption(),
// qui restent inchanges -- edit_listing non affecte) : ouvre le trigger avec
// EXACTEMENT le meme mecanisme deja prouve (dispatchFullClick), puis attend
// l'apparition d'AU MOINS UN conteneur condition-{id} (signal reellement
// observe, plutot que le contentSelector qui n'apparait jamais).
//
// Mission "FIX FINAL ETAT : MATCHER LE CONTAINER REEL" (2026-08-13) : test
// live suivant -- condition-{id}-title/-content sont illisibles (null) pour
// TOUS les candidats reels testes, l'hypothese "-title porte le libelle
// court" est infirmee. Le matching utilise desormais matchConditionOption()
// (conditionOptionReader.ts) : prefixe normalise du texte COMPLET du
// conteneur contre la valeur ResellOS deja connue -- match UNIQUEMENT si
// exactement un candidat correspond, jamais un choix "au plus proche".
// matchOption()/readOptionTexts()/selectMatchingOption() restent totalement
// inchanges (edit_listing non affecte). Puis clique l'element cliquable
// reel, PUIS relit le trigger pour confirmer reellement l'affichage --
// outcome:"confirmed" uniquement si le trigger affiche effectivement la
// valeur choisie.
type ConditionStep = "not_started" | "trigger_found" | "trigger_click_attempted" | "options_found";
const CONDITION_CONFIRMATION_TIMEOUT_MS = 5000;
// Mission "FINALISER ETAT : CONFIRMATION POST-SELECTION" (2026-08-13) : delais
// de capture du diagnostic CONDITION_TRIGGER_AFTER_SELECTION_DIAGNOSTIC,
// demandes explicitement ("+100ms / +500ms si necessaire").
const CONDITION_TRIGGER_DIAGNOSTIC_DELAYS_MS = [100, 500];

async function attemptConditionPrefill(spec: AttributePickerSpec, confirmed: string[], pending: string[]): Promise<void> {
  if (!spec.value) {
    docLog.info(spec.logName, { label: spec.label, outcome: "no_value" });
    replaceManualPlaceholder(pending, spec.label, `${spec.label} : donnée manquante (à choisir sur Vinted)`);
    return;
  }

  let lastStep: ConditionStep = "not_started";
  let baselineTestIds: string[] | null = null;

  try {
    const trigger = await waitForElement<HTMLElement>(spec.triggerSelector, { timeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS });
    lastStep = "trigger_found";
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: lastStep });
    const baselineSnapshot = logDropdownDiagnostic(spec, "before_click", "synthetic_click");
    baselineTestIds = baselineSnapshot.matchingTestIds;

    dispatchFullClick(trigger);
    lastStep = "trigger_click_attempted";
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: lastStep });
    logDropdownDiagnostic(spec, "immediately_after_click", "synthetic_click");
    logDropdownDiff(spec, "immediately_after_click", "synthetic_click", baselineTestIds);
    for (const delayMs of DROPDOWN_DIAGNOSTIC_DELAYS_MS) {
      setTimeout(() => {
        logDropdownDiagnostic(spec, `click_plus_${delayMs}ms`, "synthetic_click");
        logDropdownDiff(spec, `click_plus_${delayMs}ms`, "synthetic_click", baselineTestIds);
      }, delayMs);
    }

    // Signal REELLEMENT observe en live (contrairement a CATEGORY_DROPDOWN_CONTENT_SELECTOR,
    // qui n'apparait jamais pour ce picker) -- au moins un conteneur d'option
    // logique present dans le DOM.
    await waitForCondition(() => readConditionOptionCandidates().length > 0, {
      timeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS,
      description: "condition option containers appear",
    });
    lastStep = "options_found";
    const candidates = readConditionOptionCandidates();
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: lastStep, optionsCount: candidates.length });

    // Strategie dediee Etat (mission "FIX FINAL ETAT", 2026-08-13) : match par
    // PREFIXE normalise du texte COMPLET du conteneur (containerText) contre
    // la valeur ResellOS deja connue -- condition-{id}-title est illisible en
    // live pour tous les candidats testes, aucun libelle court independant
    // n'est extrait. UNIQUE PREFIX MATCH ONLY : 0 ou plusieurs candidats
    // compatibles => manuel, jamais un choix devine.
    const matchResult = matchConditionOption(spec.value, candidates);
    if (matchResult.reason !== "unique_match" || !matchResult.matched) {
      docLog.warn(spec.logName, {
        label: spec.label,
        value: spec.value,
        optionsCount: candidates.length,
        outcome: matchResult.reason === "ambiguous_match" ? "ambiguous_match" : "no_reliable_match",
      });
      docLog.warn("CONDITION_MATCH_DIAGNOSTIC", {
        field: spec.label,
        requestedValue: spec.value,
        normalizedRequestedValue: normalize(spec.value),
        reason: matchResult.reason,
        candidates: candidates.map((c) => ({ containerTestId: c.containerTestId, containerText: c.containerText })),
        matchingCandidateTestIds: matchResult.matchingCandidates.map((c) => c.containerTestId),
      });
      document.body.click(); // ferme le picker sans rien selectionner (aucune valeur inventee)
      replaceManualPlaceholder(
        pending,
        spec.label,
        `${spec.label} : ${spec.value} (aucune correspondance fiable sur Vinted -- à choisir toi-même)`
      );
      return;
    }

    const matchedCandidate = matchResult.matched;
    docLog.info(`${spec.logName}_STEP`, {
      field: spec.label,
      step: "option_match_found",
      requestedValue: spec.value,
      matchedTestId: matchedCandidate.containerTestId,
    });

    matchedCandidate.container.click();
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: "option_clicked", matchedTestId: matchedCandidate.containerTestId });

    // Mission "FINALISER ETAT : CONFIRMATION POST-SELECTION" (2026-08-13) :
    // preuve live -- matching/clic corrects (matchedTestId:"condition-2"),
    // mais readTriggerText() renvoie null sur le trigger apres selection.
    // AUCUNE propriete DOM n'est encore prouvee fiable pour lire la valeur
    // reellement selectionnee -- ce diagnostic capture TOUTES les sources
    // plausibles (valeur d'input, attributs aria, texte du parent, etc.) en
    // une seule fois, immediatement puis a +100ms/+500ms (les frameworks
    // reactifs peuvent re-render apres le clic), pour trancher au prochain
    // test live SANS deviner. Purement observationnel : ne remplace pas
    // readTriggerText() tant qu'aucune source n'est prouvee (voir plus bas).
    docLog.info("CONDITION_TRIGGER_AFTER_SELECTION_DIAGNOSTIC", {
      field: spec.label,
      timing: "immediately_after_click",
      ...describeConditionTriggerAfterSelection(spec.triggerSelector),
    });
    for (const delayMs of CONDITION_TRIGGER_DIAGNOSTIC_DELAYS_MS) {
      setTimeout(() => {
        docLog.info("CONDITION_TRIGGER_AFTER_SELECTION_DIAGNOSTIC", {
          field: spec.label,
          timing: `click_plus_${delayMs}ms`,
          ...describeConditionTriggerAfterSelection(spec.triggerSelector),
        });
      }, delayMs);
    }

    // CONFIRMATION REELLE demandee explicitement : outcome:"confirmed"
    // uniquement si le trigger Etat affiche effectivement la valeur choisie
    // apres le clic -- jamais suppose seulement parce que le clic a ete
    // envoye (contrairement au chemin generique, qui n'a jamais verifie
    // cela jusqu'ici).
    // Comparaison contre spec.value (la valeur courte ResellOS deja connue),
    // PAS contre matchedCandidate.containerText (texte concatene libelle+
    // description) -- le trigger, une fois la selection appliquee, est cense
    // afficher le libelle court, pas le texte complet de l'option.
    const requestedValue = spec.value;
    let triggerTextAfterClick: string | null = null;
    let triggerConfirmed = false;
    try {
      await waitForCondition(
        () => {
          triggerTextAfterClick = readTriggerText(spec.triggerSelector);
          if (!triggerTextAfterClick) return false;
          const normalizedTrigger = normalize(triggerTextAfterClick);
          const normalizedRequested = normalize(requestedValue);
          return normalizedTrigger === normalizedRequested || normalizedTrigger.includes(normalizedRequested);
        },
        { timeoutMs: CONDITION_CONFIRMATION_TIMEOUT_MS, description: "trigger displays the selected condition" }
      );
      triggerConfirmed = true;
    } catch {
      triggerTextAfterClick = readTriggerText(spec.triggerSelector);
    }

    if (triggerConfirmed) {
      docLog.info(spec.logName, {
        label: spec.label,
        value: spec.value,
        matchedTestId: matchedCandidate.containerTestId,
        triggerTextAfterClick,
        outcome: "confirmed",
      });
      replaceManualPlaceholder(pending, spec.label, null);
      confirmed.push(spec.label);
    } else {
      docLog.warn(spec.logName, {
        label: spec.label,
        value: spec.value,
        matchedTestId: matchedCandidate.containerTestId,
        triggerTextAfterClick,
        outcome: "click_not_confirmed_in_trigger",
      });
      replaceManualPlaceholder(
        pending,
        spec.label,
        `${spec.label} : ${spec.value} (sélection tentée mais non confirmée sur Vinted -- vérifie toi-même)`
      );
    }
  } catch (err) {
    const outcome = lastStep === "not_started" ? "trigger_not_found" : `failed_after_${lastStep}`;
    docLog.warn(spec.logName, { label: spec.label, value: spec.value, outcome, lastStep, error: errorMessage(err) });
    docLog.warn("TRIGGER_NOT_FOUND_DIAGNOSTIC", {
      field: spec.label,
      lastStep,
      searchedTriggerSelector: spec.triggerSelector,
      searchedContentSelector: spec.contentSelector,
      matchingTestIdsPresentInDom: describeAvailableTestIds(),
    });
    if (lastStep !== "not_started") {
      watchForHumanClick(spec);
    }
    replaceManualPlaceholder(pending, spec.label, `${spec.label} : ${spec.value} (à sélectionner sur Vinted)`);
  }
}

// Mission "FIX LIVE-GROUNDED : TAILLE + COULEUR" (2026-08-13) : preuve live
// directe (fournie par l'utilisateur, dump console reel) pour Taille
// (size-group-{n}-grid-option-{id}, role=checkbox, voir sizeOptionReader.ts)
// et Couleur (color-{id}, role=button, voir colorOptionReader.ts). Meme
// architecture DEDIEE que le picker Etat (module separe par champ, reader
// pur/testable sans mock chrome), mais chemin de selection/confirmation
// FACTORISE ici (contrairement a attemptConditionPrefill) car strictement
// identique entre Taille et Couleur -- seule la fonction de lecture des
// candidats differe. matchOption() (INCHANGE) fait tout le travail de
// matching : exact-match-first garantit "L" != "XL"/"XXL" et "Bleu" !=
// "Bleu clair"/"Marine" sans logique supplementaire (voir les readers pour
// le detail de cette preuve). readOptionTexts()/selectMatchingOption()
// (formFill.ts) et attemptAttributePrefill() (Marque/Matiere, generique)
// restent totalement inchanges -- edit_listing non affecte.
type DedicatedPickerStep = "not_started" | "trigger_found" | "trigger_click_attempted" | "options_found";

interface DedicatedPickerCandidate {
  containerTestId: string;
  container: HTMLElement;
  label: string;
}

async function attemptDedicatedPickerPrefill(
  spec: AttributePickerSpec,
  readCandidates: () => DedicatedPickerCandidate[],
  confirmed: string[],
  pending: string[]
): Promise<void> {
  if (!spec.value) {
    docLog.info(spec.logName, { label: spec.label, outcome: "no_value" });
    replaceManualPlaceholder(pending, spec.label, `${spec.label} : donnée manquante (à choisir sur Vinted)`);
    return;
  }

  let lastStep: DedicatedPickerStep = "not_started";
  let baselineTestIds: string[] | null = null;

  try {
    const trigger = await waitForElement<HTMLElement>(spec.triggerSelector, { timeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS });
    lastStep = "trigger_found";
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: lastStep });
    const baselineSnapshot = logDropdownDiagnostic(spec, "before_click", "synthetic_click");
    baselineTestIds = baselineSnapshot.matchingTestIds;

    dispatchFullClick(trigger);
    lastStep = "trigger_click_attempted";
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: lastStep });
    logDropdownDiagnostic(spec, "immediately_after_click", "synthetic_click");
    logDropdownDiff(spec, "immediately_after_click", "synthetic_click", baselineTestIds);
    for (const delayMs of DROPDOWN_DIAGNOSTIC_DELAYS_MS) {
      setTimeout(() => {
        logDropdownDiagnostic(spec, `click_plus_${delayMs}ms`, "synthetic_click");
        logDropdownDiff(spec, `click_plus_${delayMs}ms`, "synthetic_click", baselineTestIds);
      }, delayMs);
    }

    // Signal REELLEMENT observe en live (comme pour Etat) -- au moins un
    // conteneur d'option canonique present dans le DOM.
    await waitForCondition(() => readCandidates().length > 0, {
      timeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS,
      description: `${spec.label} option containers appear`,
    });
    lastStep = "options_found";
    const candidates = readCandidates();
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: lastStep, optionsCount: candidates.length });

    // matchOption() INCHANGE -- exact-match-first, jamais de fuzzy dangereux
    // (voir sizeOptionReader.ts/colorOptionReader.ts pour la preuve que ceci
    // suffit a garantir un match exact strict pour ces deux champs).
    const labels = candidates.map((c) => c.label);
    const match = matchOption(spec.value, labels);
    if (!match) {
      const diagnostic = describeMatchAttempt(spec.value, labels);
      docLog.warn(spec.logName, { label: spec.label, value: spec.value, optionsCount: labels.length, outcome: "no_reliable_match" });
      docLog.warn("ATTRIBUTE_MATCH_DIAGNOSTIC", { field: spec.label, ...diagnostic });
      document.body.click(); // ferme le picker sans rien selectionner (aucune valeur inventee)
      replaceManualPlaceholder(
        pending,
        spec.label,
        `${spec.label} : ${spec.value} (aucune correspondance fiable sur Vinted -- à choisir toi-même)`
      );
      return;
    }

    const matchedCandidate = candidates.find((c) => c.label === match)!;
    docLog.info(`${spec.logName}_STEP`, {
      field: spec.label,
      step: "option_match_found",
      requestedValue: spec.value,
      matchedTestId: matchedCandidate.containerTestId,
    });

    matchedCandidate.container.click();
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: "option_clicked", matchedTestId: matchedCandidate.containerTestId });

    // Mission "LIVE RETEST RESULTS -- FIX SIZE/COLOR CONFIRMATION + COLOR
    // DROPDOWN CLOSURE" (2026-08-13) : preuve live directe -- pour Taille et
    // Couleur, le trigger est un <input> dont readTriggerText() (textContent)
    // est structurellement TOUJOURS vide, alors que le diagnostic
    // field-specific montre valueProperty correctement rempli ("L"/"Bleu").
    // Le clic/matching fonctionnaient deja -- seule la source de lecture de
    // confirmation etait fausse. confirmTriggerValue() (categoryDetection.ts,
    // pure/testable) encode l'ordre de preuve DOM-grounded minimal demande :
    // .value en EGALITE STRICTE si le trigger est un <input> (jamais
    // .includes() -- "XL".includes("L") confirmerait faussement "L" depuis
    // "XL", regression explicitement interdite), sinon repli EXISTANT
    // INCHANGE (readTriggerText(), egal-ou-contient -- comportement deja
    // utilise par Etat/le chemin generique, jamais touche).
    let triggerTextAfterClick: string | null = null;
    let triggerConfirmed = false;
    try {
      await waitForCondition(
        () => {
          const result = confirmTriggerValue(spec.triggerSelector, match);
          triggerTextAfterClick = result.observedValue;
          return result.confirmed;
        },
        { timeoutMs: ATTRIBUTE_CONFIRMATION_TIMEOUT_MS, description: `trigger displays the selected ${spec.label}` }
      );
      triggerConfirmed = true;
    } catch {
      triggerTextAfterClick = confirmTriggerValue(spec.triggerSelector, match).observedValue;
    }

    if (triggerConfirmed) {
      // Mission item 4 : preuve live -- apres une selection Couleur reussie,
      // le dropdown restait ouvert ; un Echap manuel l'a ferme SANS
      // deselectionner. Fermeture UNIQUEMENT apres confirmation reelle
      // (jamais avant), et UNIQUEMENT si le picker est reellement encore
      // ouvert (readCandidates() reutilise le MEME reader dedie deja
      // valide -- aucun nouveau diagnostic, aucun delai arbitraire). Si le
      // picker s'est deja referme seul (ex. Taille, non observe en live
      // comme restant ouvert), readCandidates().length === 0 et cette etape
      // est un no-op silencieux -- jamais un Echap "au cas ou".
      const stillOpen = readCandidates().length > 0;
      let dropdownClosed: boolean | null = null;
      if (stillOpen) {
        dispatchEscapeKey(trigger);
        try {
          await waitForCondition(() => readCandidates().length === 0, {
            timeoutMs: ATTRIBUTE_CONFIRMATION_TIMEOUT_MS,
            description: `${spec.label} option picker closes after Escape`,
          });
          dropdownClosed = true;
        } catch {
          dropdownClosed = false;
        }
        docLog.info(`${spec.logName}_STEP`, {
          field: spec.label,
          step: "dropdown_closure_attempted",
          wasStillOpen: stillOpen,
          closedAfterEscape: dropdownClosed,
        });
      }

      docLog.info(spec.logName, {
        label: spec.label,
        value: spec.value,
        matchedTestId: matchedCandidate.containerTestId,
        triggerTextAfterClick,
        dropdownWasStillOpen: stillOpen,
        dropdownClosedAfterEscape: dropdownClosed,
        outcome: "confirmed",
      });
      replaceManualPlaceholder(pending, spec.label, null);
      confirmed.push(spec.label);
    } else {
      // Mission item 6 : ne fabrique pas une confirmation -- readTriggerText()
      // n'est PAS prouve fiable pour ce trigger precis. Diagnostic
      // field-specific minimal, reutilise TEL QUEL depuis le module Etat
      // (fonction deja generique, parametree par triggerSelector -- aucune
      // modification de son code ni de son usage pour Etat) pour determiner
      // au prochain test live QUELLE propriete porte reellement la valeur
      // selectionnee sur ce trigger. outcome reste honnetement
      // "click_not_confirmed_in_trigger" -- la selection Vinted a peut-etre
      // reussi visuellement, mais ce n'est pas mensonger de le dire tant que
      // ce n'est pas prouve.
      docLog.warn(spec.logName, {
        label: spec.label,
        value: spec.value,
        matchedTestId: matchedCandidate.containerTestId,
        triggerTextAfterClick,
        outcome: "click_not_confirmed_in_trigger",
      });
      docLog.warn(`${spec.logName}_TRIGGER_AFTER_SELECTION_DIAGNOSTIC`, {
        field: spec.label,
        ...describeConditionTriggerAfterSelection(spec.triggerSelector),
      });
      replaceManualPlaceholder(
        pending,
        spec.label,
        `${spec.label} : ${spec.value} (sélection tentée mais non confirmée sur Vinted -- vérifie toi-même)`
      );
    }
  } catch (err) {
    const outcome = lastStep === "not_started" ? "trigger_not_found" : `failed_after_${lastStep}`;
    docLog.warn(spec.logName, { label: spec.label, value: spec.value, outcome, lastStep, error: errorMessage(err) });
    docLog.warn("TRIGGER_NOT_FOUND_DIAGNOSTIC", {
      field: spec.label,
      lastStep,
      searchedTriggerSelector: spec.triggerSelector,
      searchedContentSelector: spec.contentSelector,
      matchingTestIdsPresentInDom: describeAvailableTestIds(),
    });
    if (lastStep !== "not_started") {
      watchForHumanClick(spec);
    }
    replaceManualPlaceholder(pending, spec.label, `${spec.label} : ${spec.value} (à sélectionner sur Vinted)`);
  }
}

function attemptSizePrefill(spec: AttributePickerSpec, confirmed: string[], pending: string[]): Promise<void> {
  return attemptDedicatedPickerPrefill(spec, readSizeOptionCandidates, confirmed, pending);
}

function attemptColorPrefill(spec: AttributePickerSpec, confirmed: string[], pending: string[]): Promise<void> {
  return attemptDedicatedPickerPrefill(spec, readColorOptionCandidates, confirmed, pending);
}

// Mission "BRAND SEARCH INPUT LOCATOR" (2026-08-16) : preuve live directe --
// BRAND_DROPDOWN_TRIGGER_SELECTOR ("brand-select-dropdown-input") est
// readonly, uniquement l'affichage de la valeur choisie ; il ne recoit
// JAMAIS de frappe, meme humaine reelle (diagnostic dedie, listener
// document/capture : aucun keydown/beforeinput/input/keyup dessus alors que
// Vinted emettait bien /api/v2/item_upload/brands?keyword=... et filtrait
// visiblement). C'est la cause racine des 3 echecs precedents (setNativeValue
// bloc, frappe caractere par caractere, +keydown/keyup) : mauvais element
// cible depuis le debut, pas une sequence d'evenements insuffisante.
//
// Le vrai champ de recherche est #brand-search-input
// (BRAND_SEARCH_INPUT_SELECTOR, publishSelectors.ts), un input SEPARE monte
// dans brand-select-dropdown-content une fois le dropdown ouvert -- meme
// architecture que CATEGORY_SEARCH_INPUT_SELECTOR (jamais exercee), mais
// ICI CONFIRMEE EN DIRECT. typeIntoBrandSearchInput() (formFill.ts) y
// applique la technique CONFIRMEE EN DIRECT sur ce champ precis (setter
// natif + un seul InputEvent("input")).
//
// Le resultat filtre n'est pas selectionne via le <li> (verifie en direct,
// li.click() ne selectionne rien) mais via la Cell interactive qu'il
// contient (role="button", aria-label=<nom exact>) -- BRAND_RESULT_CELL_SELECTOR.
// L'id numerique de cette Cell (ex. "brand-4273") N'EST PAS stable d'une
// marque a l'autre : le matching se fait exclusivement sur aria-label, via
// matchOption() (normalize() = trim+lowercase+sans diacritiques, inchange),
// jamais sur l'id ni sur une position/index. Comme avant : aucune
// correspondance fiable => MANUAL_REQUIRED, jamais de selection approximative.
//
// matchOption()/readOptionTexts()/selectMatchingOption() restent totalement
// inchanges (edit_listing non affecte). Etat/Taille/Couleur non touches.
type BrandStep =
  | "not_started"
  | "trigger_found"
  | "trigger_click_attempted"
  | "options_found"
  | "search_input_typed"
  | "filter_settled";
const BRAND_SEARCH_FILTER_TIMEOUT_MS = 5000;

async function attemptBrandPrefill(spec: AttributePickerSpec, confirmed: string[], pending: string[]): Promise<void> {
  if (!spec.value) {
    docLog.info(spec.logName, { label: spec.label, outcome: "no_value" });
    replaceManualPlaceholder(pending, spec.label, `${spec.label} : donnée manquante (à choisir sur Vinted)`);
    return;
  }

  let lastStep: BrandStep = "not_started";

  try {
    const trigger = await waitForElement<HTMLElement>(spec.triggerSelector, { timeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS });
    lastStep = "trigger_found";
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: lastStep });

    dispatchFullClick(trigger);
    lastStep = "trigger_click_attempted";
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: lastStep });

    const content = await waitForElement<HTMLElement>(spec.contentSelector, { timeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS });
    lastStep = "options_found";
    const baselineCount = content.querySelectorAll(sel.BRAND_RESULT_CELL_SELECTOR).length;
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: lastStep, optionsCount: baselineCount });

    // Localise le VRAI champ de recherche (distinct du trigger readonly) --
    // essaie l'id d'abord, puis le data-testid en repli si Vinted venait a
    // changer l'un des deux. Ne suppose jamais sa presence sans verification
    // DOM reelle (waitForElement, jamais un delai fixe).
    let searchInput: HTMLInputElement | null = null;
    try {
      searchInput = await waitForElement<HTMLInputElement>(sel.BRAND_SEARCH_INPUT_SELECTOR, {
        root: content,
        timeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS,
      });
    } catch {
      try {
        searchInput = await waitForElement<HTMLInputElement>(sel.BRAND_SEARCH_INPUT_FALLBACK_SELECTOR, {
          root: content,
          timeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS,
        });
      } catch {
        searchInput = null;
      }
    }

    if (!searchInput) {
      // Champ de recherche introuvable pour cette execution precise --
      // aucune frappe tentee. Repli honnete : continue avec la lecture NON
      // filtree (comportement identique a l'ancien chemin generique, jamais
      // pire), le matching exact plus bas reste la garde reelle.
      docLog.warn("BRAND_SEARCH_INPUT_NOT_FOUND", { field: spec.label });
    } else {
      typeIntoBrandSearchInput(searchInput, spec.value);
      lastStep = "search_input_typed";
      docLog.info(`${spec.logName}_STEP`, {
        field: spec.label,
        step: lastStep,
        typedValue: spec.value,
        domValueAfterTyping: searchInput.value,
      });

      // Mission "IGNORER LE CREUX TRANSITOIRE 52 -> 0" (2026-08-16) : preuve
      // live directe (instrumentation temporaire, retiree apres validation) --
      // Vinted vide la liste a 0 IMMEDIATEMENT apres l'InputEvent, PENDANT le
      // chargement, avant de la repeupler avec les resultats filtres.
      // L'ancienne condition ("length !== baselineCount") etait donc
      // satisfaite par ce creux transitoire lui-meme (0 !== 52) et ne prouvait
      // jamais qu'un resultat etait reellement arrive -- cause racine
      // confirmee en direct (optionsCount:0 partout au moment du matching,
      // meme reference `content`, donc PAS une reference stale ni un mauvais
      // scope). Remplace par une condition qui attend l'etat reellement
      // utile : au moins une Cell dont aria-label correspond EXACTEMENT (meme
      // normalize() que matchOption(), deja importee dans ce fichier) a la
      // valeur recherchee. Re-interroge document.querySelector(spec.contentSelector)
      // A CHAQUE evaluation plutot que la fermeture sur `content` -- le
      // diagnostic montre sameContentNode:true pour ce test precis, mais rien
      // ne garantit que ce soit toujours vrai (securite gratuite, meme
      // discipline que la lecture finale ci-dessous). root volontairement
      // omis (defaut document) : coherent avec la re-interrogation
      // document-wide plutot qu'un scope fige sur l'ancien noeud `content`.
      try {
        await waitForCondition(
          () => {
            const currentContent = document.querySelector<HTMLElement>(spec.contentSelector);
            if (!currentContent) return false;
            const currentCells = Array.from(currentContent.querySelectorAll<HTMLElement>(sel.BRAND_RESULT_CELL_SELECTOR));
            return currentCells.some((cell) => normalize(cell.getAttribute("aria-label") ?? "") === normalize(spec.value as string));
          },
          {
            timeoutMs: BRAND_SEARCH_FILTER_TIMEOUT_MS,
            description: "exact brand Cell (aria-label match) appears after typed search text",
          }
        );
        lastStep = "filter_settled";
        docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: lastStep });
      } catch {
        // Signal inexploitable : aucune Cell exacte n'est apparue dans le
        // delai imparti -- journalise et CONTINUE avec la liste telle qu'elle
        // est plutot que d'abandonner. Le matching qui suit (matchOption(),
        // inchange) reste la garde reelle contre toute ambiguite residuelle
        // -- aucune valeur inventee dans tous les cas (MANUAL_REQUIRED si
        // rien de fiable).
        docLog.warn("BRAND_SEARCH_FILTER_NOT_CONFIRMED", {
          field: spec.label,
          baselineCount,
          currentCount: content.querySelectorAll(sel.BRAND_RESULT_CELL_SELECTOR).length,
        });
      }
    }

    // Securite supplementaire (pas un changement d'architecture) : re-interroge
    // le dropdown DEPUIS document au moment de constituer le tableau final de
    // Cells, plutot que de dependre de `content` (capture avant la frappe).
    // Le diagnostic de cette mission montre sameContentNode:true pour ce test
    // precis, mais rien ne garantit que ce soit toujours vrai -- repli sur
    // `content` si le selecteur ne matche plus rien (jamais pire que l'ancien
    // comportement).
    const matchingContent = document.querySelector<HTMLElement>(spec.contentSelector) ?? content;
    const cells = Array.from(matchingContent.querySelectorAll<HTMLElement>(sel.BRAND_RESULT_CELL_SELECTOR));
    const labels = cells.map((cell) => (cell.getAttribute("aria-label") ?? "").trim());
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: "options_read_after_filter_attempt", optionsCount: labels.length });

    const match = matchOption(spec.value, labels);
    if (!match) {
      const diagnostic = describeMatchAttempt(spec.value, labels);
      docLog.warn(spec.logName, { label: spec.label, value: spec.value, optionsCount: labels.length, outcome: "no_reliable_match" });
      docLog.warn("ATTRIBUTE_MATCH_DIAGNOSTIC", { field: spec.label, ...diagnostic });
      if (diagnostic.reason === "multiple_exact_matches_ambiguous") {
        labels.forEach((text, idx) => {
          if (diagnostic.exactMatches.includes(text)) {
            docLog.warn("ATTRIBUTE_MATCH_DUPLICATE_CANDIDATE_DIAGNOSTIC", {
              field: spec.label,
              ...describeExactMatchCandidate(cells[idx], idx, text, normalize(text)),
              ...describeExactMatchStructure(cells[idx]),
            });
          }
        });
      }
      document.body.click(); // ferme le picker sans rien selectionner (aucune valeur inventee)
      replaceManualPlaceholder(
        pending,
        spec.label,
        `${spec.label} : ${spec.value} (aucune correspondance fiable sur Vinted -- à choisir toi-même)`
      );
      return;
    }

    const index = labels.indexOf(match);
    cells[index].click();
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: "option_clicked", matched: match });

    // Meme mecanisme de confirmation reelle que Taille/Couleur/Etat --
    // confirmTriggerValue() (categoryDetection.ts, deja pure/testee)
    // reutilise TELLE QUELLE : .value en egalite stricte si le trigger est
    // un <input> (le cas ici, deja confirme), sinon repli textContent
    // existant.
    let triggerTextAfterClick: string | null = null;
    let triggerConfirmed = false;
    try {
      await waitForCondition(
        () => {
          const result = confirmTriggerValue(spec.triggerSelector, match);
          triggerTextAfterClick = result.observedValue;
          return result.confirmed;
        },
        { timeoutMs: ATTRIBUTE_CONFIRMATION_TIMEOUT_MS, description: `trigger displays the selected ${spec.label}` }
      );
      triggerConfirmed = true;
    } catch {
      triggerTextAfterClick = confirmTriggerValue(spec.triggerSelector, match).observedValue;
    }

    if (triggerConfirmed) {
      docLog.info(spec.logName, { label: spec.label, value: spec.value, matched: match, triggerTextAfterClick, outcome: "confirmed" });
      replaceManualPlaceholder(pending, spec.label, null);
      confirmed.push(spec.label);
    } else {
      docLog.warn(spec.logName, {
        label: spec.label,
        value: spec.value,
        matched: match,
        triggerTextAfterClick,
        outcome: "click_not_confirmed_in_trigger",
      });
      replaceManualPlaceholder(
        pending,
        spec.label,
        `${spec.label} : ${spec.value} (sélection tentée mais non confirmée sur Vinted -- vérifie toi-même)`
      );
    }
  } catch (err) {
    const outcome = lastStep === "not_started" ? "trigger_not_found" : `failed_after_${lastStep}`;
    docLog.warn(spec.logName, { label: spec.label, value: spec.value, outcome, lastStep, error: errorMessage(err) });
    docLog.warn("TRIGGER_NOT_FOUND_DIAGNOSTIC", {
      field: spec.label,
      lastStep,
      searchedTriggerSelector: spec.triggerSelector,
      searchedContentSelector: spec.contentSelector,
      matchingTestIdsPresentInDom: describeAvailableTestIds(),
    });
    if (lastStep !== "not_started") {
      watchForHumanClick(spec);
    }
    replaceManualPlaceholder(pending, spec.label, `${spec.label} : ${spec.value} (à sélectionner sur Vinted)`);
  }
}

// Mission "CORRIGER LA DETECTION POST-SELECTION MANUELLE DE CATEGORIE"
// (2026-08-12) : preuve live directe -- categoryTriggerFound:true en
// permanence, mais currentCategoryText reste null AVANT ET APRES une
// selection humaine reelle ("Polos" visible sur Vinted, jamais capture par
// readTriggerText()). La lecture texte du trigger categorie ne fonctionne
// donc pas (cause exacte non confirmee sans capture DOM -- voir
// CATEGORY_TRIGGER_DOM_DIAGNOSTIC, categoryDetection.ts). En revanche, la
// TRANSITION "aucun trigger d'attribut present -> au moins un present" EST
// observee de facon fiable au meme instant (0 sur les 5 -> 5 sur 5). Detection
// desormais a DEUX chemins (detectCategorySelection(), categoryDetection.ts),
// dans cet ordre de priorite -- voir son en-tete pour le detail :
// 1) category_value_changed (chemin direct, fonctionnera sans autre
//    modification ici si readTriggerText() se met un jour a lire une vraie
//    valeur -- rien de devine, la lecture actuelle reste inchangee).
// 2) attribute_controls_appeared (repli structurel, valide par la preuve
//    live elle-meme) -- protection explicite contre le faux positif "les
//    attributs existaient deja au demarrage" (voir hadAnyAttributeTrigger
//    capture AVANT toute attente ci-dessous).
const ATTRIBUTE_TRIGGER_SELECTORS = {
  brand: sel.BRAND_DROPDOWN_TRIGGER_SELECTOR,
  size: sel.SIZE_GRID_TRIGGER_SELECTOR,
  condition: sel.CONDITION_LIST_TRIGGER_SELECTOR,
  color: sel.COLOR_DROPDOWN_TRIGGER_SELECTOR,
  material: sel.MATERIAL_LIST_TRIGGER_SELECTOR,
};

async function watchForCategorySelectionAndPrefillAttributes(
  payload: PublishListingPayload,
  confirmed: string[],
  pending: string[]
): Promise<void> {
  docLog.info("CATEGORY_MANUAL_REQUIRED", { category: payload.category || null });

  const initialCategoryText = readTriggerText(sel.CATEGORY_DROPDOWN_TRIGGER_SELECTOR);
  const initialAttributesPresent = readAttributeTriggerPresence(ATTRIBUTE_TRIGGER_SELECTORS);
  const initialHadAnyAttributeTrigger = hasAnyAttributeTrigger(initialAttributesPresent);
  docLog.info("CATEGORY_WATCH_START", {
    documentInstanceId: DOCUMENT_INSTANCE_ID,
    initialCategoryText,
    initialCategoryValue: initialCategoryText,
    initialHadAnyAttributeTrigger,
  });
  if (import.meta.env.DEV) {
    docLog.info("CATEGORY_TRIGGER_DOM_DIAGNOSTIC", { ...describeCategoryTriggerDom(sel.CATEGORY_DROPDOWN_TRIGGER_SELECTOR) });
  }

  // Deduplique : ne journalise CATEGORY_DOM_CHANGE que si l'etat observe a
  // reellement change depuis le dernier log -- evite de spammer a chaque
  // mutation brute (le panneau categorie peut muter tres frequemment pendant
  // la navigation de l'utilisateur dans l'arbre).
  let lastLoggedStateKey: string | null = null;
  function checkAndLogDomState(): CategoryDetectionState {
    const categoryText = readTriggerText(sel.CATEGORY_DROPDOWN_TRIGGER_SELECTOR);
    const attributesPresent = readAttributeTriggerPresence(ATTRIBUTE_TRIGGER_SELECTORS);
    const stateKey = JSON.stringify({ categoryText, ...attributesPresent });
    if (stateKey !== lastLoggedStateKey) {
      lastLoggedStateKey = stateKey;
      docLog.info("CATEGORY_DOM_CHANGE", {
        currentCategoryText: categoryText,
        currentCategoryValue: categoryText,
        categoryTriggerFound: !!document.querySelector(sel.CATEGORY_DROPDOWN_TRIGGER_SELECTOR),
        ...attributesPresent,
      });
    }
    return { categoryText, attributesPresent };
  }

  let detectionMethod: CategoryDetectionMethod | null = null;
  try {
    await waitForCondition(
      () => {
        const state = checkAndLogDomState();
        const method = detectCategorySelection(state, {
          categoryText: initialCategoryText,
          hadAnyAttributeTrigger: initialHadAnyAttributeTrigger,
        });
        if (method) detectionMethod = method;
        return method !== null;
      },
      { timeoutMs: ATTRIBUTE_CONTROLS_WAIT_TIMEOUT_MS, description: "category selected (direct value or attribute controls appearing)" }
    );
  } catch (err) {
    docLog.info("CATEGORY_SELECTION_NOT_DETECTED", { error: errorMessage(err), initialCategoryText, initialHadAnyAttributeTrigger });
    return;
  }

  const currentCategoryText = readTriggerText(sel.CATEGORY_DROPDOWN_TRIGGER_SELECTOR);
  docLog.info("CATEGORY_SELECTION_DETECTED", {
    previousValue: initialCategoryText,
    currentValue: currentCategoryText,
    detectionMethod,
  });
  if (import.meta.env.DEV) {
    docLog.info("CATEGORY_TRIGGER_DOM_DIAGNOSTIC", { ...describeCategoryTriggerDom(sel.CATEGORY_DROPDOWN_TRIGGER_SELECTOR) });
  }

  // Si le chemin direct a deja detecte (categoryText a change), les
  // attributs peuvent ne pas encore etre rendus -- attente separee comme
  // avant. Si c'est le repli structurel qui a detecte (attribute_controls_appeared),
  // cette attente resout immediatement (predicat deja vrai au premier check),
  // conformement a la demande explicite de ne plus attendre pour rien une
  // fois le repli satisfait.
  try {
    await waitForCondition(() => hasAnyAttributeTrigger(readAttributeTriggerPresence(ATTRIBUTE_TRIGGER_SELECTORS)), {
      timeoutMs: ATTRIBUTE_CONTROLS_WAIT_TIMEOUT_MS,
      description: "any attribute control trigger appears",
    });
  } catch (err) {
    docLog.warn("ATTRIBUTE_CONTROLS_NOT_DETECTED", { error: errorMessage(err) });
    return;
  }

  docLog.info("ATTRIBUTE_CONTROLS_AVAILABLE", {});

  // Mission "FIX REEL DU PICKER ETAT SUR /items/new" (2026-08-12) : Etat
  // utilise desormais un chemin DEDIE (attemptConditionPrefill) au lieu du
  // reader generique -- root cause confirmee en live, voir son en-tete.
  // contentSelector conserve dans le spec pour les logs de diagnostic
  // existants (expectedContentSelector) mais n'est plus utilise pour
  // attendre un contenu -- readConditionOptionCandidates() lit directement
  // les conteneurs condition-{id}.
  await attemptConditionPrefill(
    {
      logName: "PREFILL_CONDITION",
      label: "État",
      triggerSelector: sel.CONDITION_LIST_TRIGGER_SELECTOR,
      contentSelector: sel.CATEGORY_DROPDOWN_CONTENT_SELECTOR,
      value: payload.condition || null,
    },
    confirmed,
    pending
  );
  // Mission "FIX LIVE-GROUNDED : TAILLE + COULEUR" (2026-08-13) : Taille
  // utilise desormais un chemin DEDIE (attemptSizePrefill) au lieu du reader
  // generique -- structure DOM canonique confirmee en live (size-group-{n}-
  // grid-option-{id}), voir sizeOptionReader.ts. contentSelector conserve
  // dans le spec uniquement pour les logs de diagnostic existants
  // (expectedContentSelector), plus utilise pour attendre un contenu.
  await attemptSizePrefill(
    {
      logName: "PREFILL_SIZE",
      label: "Taille",
      triggerSelector: sel.SIZE_GRID_TRIGGER_SELECTOR,
      contentSelector: sel.CATEGORY_DROPDOWN_CONTENT_SELECTOR,
      value: payload.size,
    },
    confirmed,
    pending
  );
  // Mission "BRAND SEARCH-FILTER FLOW" (2026-08-13) : Marque utilise
  // desormais un chemin DEDIE (attemptBrandPrefill) qui tape le texte
  // recherche AVANT de lire les options -- root cause de l'ambiguite
  // (2 <ul> distincts) confirmee en live : elle disparait une fois le champ
  // filtre manuellement. NEED LIVE RETEST : l'efficacite de setNativeValue()
  // sur CE champ precis n'est pas encore prouvee.
  await attemptBrandPrefill(
    {
      logName: "PREFILL_BRAND",
      label: "Marque",
      triggerSelector: sel.BRAND_DROPDOWN_TRIGGER_SELECTOR,
      contentSelector: sel.BRAND_DROPDOWN_CONTENT_SELECTOR,
      value: payload.brand,
    },
    confirmed,
    pending
  );
  // Mission "FIX LIVE-GROUNDED : TAILLE + COULEUR" (2026-08-13) : Couleur
  // utilise desormais un chemin DEDIE (attemptColorPrefill) au lieu du
  // reader generique -- structure DOM canonique confirmee en live
  // (color-{id}, exclut suggested-color-* et color-{id}--*), voir
  // colorOptionReader.ts.
  await attemptColorPrefill(
    {
      logName: "PREFILL_COLOR",
      label: "Couleur",
      triggerSelector: sel.COLOR_DROPDOWN_TRIGGER_SELECTOR,
      contentSelector: sel.CATEGORY_DROPDOWN_CONTENT_SELECTOR,
      value: payload.color,
    },
    confirmed,
    pending
  );
  await attemptAttributePrefill(
    {
      logName: "PREFILL_MATERIAL",
      label: "Matière",
      triggerSelector: sel.MATERIAL_LIST_TRIGGER_SELECTOR,
      contentSelector: sel.CATEGORY_DROPDOWN_CONTENT_SELECTOR,
      value: payload.material,
    },
    confirmed,
    pending
  );

  docLog.info("ATTRIBUTE_PREFILL_SUMMARY", { confirmed, pending });
  reportPrefillSummary(confirmed, pending);
}

// Mission "diagnostic final PHOTOS + CATEGORIE" (2026-08-11), item 1 : un
// seul log synthetique, serialisable, en fin de run -- remplace le besoin de
// recouper manuellement une dizaine d'entrees DevTools repliees. confirmed/
// pending/stepTimestamps sont desormais declares ICI (plus dans
// runPublishOnce) pour rester lisibles dans le `finally`, meme en cas
// d'echec precoce (ex. TITLE_INPUT introuvable, avant meme les photos).
async function runPublish(payload: PublishListingPayload, photos: FetchedPhoto[]): Promise<void> {
  runPublishInvocationCount += 1;
  runPublishInFlight = true;
  docLog.info("RUN_PUBLISH_START", { runPublishInvocationCount, href: location.href });
  const stepTimestamps: Record<string, number> = { RUN_PUBLISH_START: Date.now() };
  const confirmed: string[] = [];
  const pending: string[] = [];
  try {
    await runPublishOnce(payload, photos, confirmed, pending, stepTimestamps);
  } finally {
    stepTimestamps.RUN_PUBLISH_FINISHED = Date.now();
    runPublishInFlight = false;
    docLog.info("RUN_PUBLISH_FINISHED", { runPublishInvocationCount, href: location.href });
    docLog.info("PUBLISH_DIAGNOSTIC_SUMMARY", {
      documentInstanceId: DOCUMENT_INSTANCE_ID,
      href: location.href,
      runPublishInvocationCount,
      title: { attempted: true, success: confirmed.includes("Titre") },
      description: { attempted: true, success: confirmed.includes("Description") },
      price: { attempted: true, success: confirmed.includes("Prix"), value: payload.price },
      photos: {
        attempted: photos.length > 0,
        success: confirmed.some((c) => c.startsWith("Photos")),
        count: photos.length,
        // Mission "diagnostic final PHOTOS + CATEGORIE" (2026-08-11), item 4 :
        // distingue "le fetch background a echoue" (photosFetchedSuccessfully
        // bas) de "le fetch a reussi mais reconstructPhotoFiles a tout rejete"
        // (filesBuiltCount a 0 malgre photosFetchedSuccessfully > 0) -- sans
        // ca, lastPhotoInjectionStage:"PHOTO_FILES_BUILT" seul ne permet pas
        // de savoir si files.length valait 0 (retour explicite AVANT
        // PHOTO_INPUT_FOUND) ou si le blocage est ailleurs.
        photosFetchedSuccessfully: photos.filter((p) => p.arrayBuffer !== null).length,
        filesBuiltCount: lastFilesBuiltCount,
      },
      // Categorie : JAMAIS automatisee sur ce formulaire (voir l'en-tete du
      // fichier + formFill.ts::resolveCategory) -- Vinted exige un clic
      // isTrusted:true reel pour ouvrir ce selecteur, preuve directe A/B
      // testee le 2026-07-26, aucune exception depuis. Rapporte ici pour que
      // "Sélectionne une catégorie" ne soit plus jamais relu comme un echec :
      // c'est le comportement attendu par design, pas une consequence des
      // photos ni un bug a corriger.
      category: {
        attemptedByAutomation: false,
        value: payload.category,
        reason: "category_requires_manual_selection (isTrusted, voir formFill.ts::resolveCategory)",
      },
      lastPhotoInjectionStage,
      vintedErrorBannerDetected: vintedErrorBannerAlreadyLogged,
      stepTimestamps,
    });
  }
}

async function runPublishOnce(
  payload: PublishListingPayload,
  photos: FetchedPhoto[],
  confirmed: string[],
  pending: string[],
  stepTimestamps: Record<string, number>
): Promise<void> {
  // Instrumentation live-driven (2026-08-10) : ce que ResellOS croit savoir
  // de l'annonce AVANT toute ecriture DOM -- permet de prouver si une
  // valeur visible cote Vinted (ex. categorie/marque deja affichees) vient
  // reellement du payload envoye par ce script (qui ne touche jamais ces
  // deux champs, voir l'en-tete du fichier) ou d'une suggestion Vinted
  // independante. Longueurs plutot que contenu complet pour
  // titre/description (pas utile de journaliser le texte entier).
  docLog.info("PREFILL_PAYLOAD_SUMMARY", {
    titleLength: payload.title.length,
    descriptionLength: payload.description.length,
    price: payload.price,
    imageCount: payload.imageUrls.length,
    category: payload.category,
    brand: payload.brand,
    size: payload.size,
    condition: payload.condition,
    color: payload.color,
    material: payload.material,
  });

  try {
    reportProgress("connecting");
    await waitForElement(sel.TITLE_INPUT_SELECTOR);
    await verifyLoggedInAccount(payload.expectedVintedUsername);

    reportProgress("filling_form");
    await fillTextFieldsWithConfirmation(payload, confirmed, pending, stepTimestamps);

    reportProgress("uploading_photos");
    await injectPhotosWithConfirmation(photos, confirmed, pending, stepTimestamps);

    pending.push(...computeManualFields(payload));
    reportPrefillSummary(confirmed, pending);

    // Mission "FINIR LES CHAMPS MANQUANTS" (2026-08-11) : jamais attendue ici
    // (fire-and-forget, "void") -- runPublishOnce()/runPublish() se terminent
    // normalement tout de suite apres, AUCUN changement au moment ou
    // runPublishInFlight repasse a false ni a RUN_PUBLISH_FINISHED (document
    // lifecycle deja valide, volontairement non touche). Cette reprise tourne
    // en arriere-plan, potentiellement plusieurs minutes (le temps que
    // l'utilisateur choisisse sa categorie), et rappelle reportPrefillSummary()
    // elle-meme une fois terminee pour mettre a jour la modale dynamiquement.
    void watchForCategorySelectionAndPrefillAttributes(payload, confirmed, pending);

    // A partir d'ici, plus aucune ecriture DOM synchrone ni aucun clic
    // automatique garanti -- l'utilisateur termine lui-meme la categorie (et,
    // sauf correspondance fiable trouvee ci-dessus, les attributs restants),
    // la taille du colis, puis clique reellement sur le bouton de soumission
    // Vinted. handlePublishListing.ts (background) surveille la navigation
    // reelle de l'onglet pour detecter une reussite authentique ; ce content
    // script n'a rien d'autre a faire de bloquant.
    reportProgress("publishing");
  } catch (err) {
    if (err instanceof WaitTimeoutError) {
      // Une session expirée redirige typiquement vers une page de
      // connexion - heuristique sur l'URL, a confirmer/affiner en test live
      // (motif exact de la page de login Vinted non observé durant
      // l'analyse, aucune déconnexion testée).
      const looksLikeLoginPage = /\/(login|auth)/i.test(location.pathname);
      reportResult({
        status: "error",
        errorMessage: looksLikeLoginPage
          ? "Session Vinted expirée, reconnecte-toi sur vinted.fr"
          : describeTimeout(err),
      });
      return;
    }
    if (err instanceof PublishError) {
      reportResult({ status: "error", errorMessage: err.message });
      return;
    }
    console.error("[ResellOS][Publish] echec inattendu (objet complet)", err);
    reportResult({ status: "error", errorMessage: errorMessage(err) });
  }
}

// Mission "PORT MESSAGE FERMÉ" (2026-08-11) -- CAUSE CONFIRMEE en test live :
// "Receiving end does not exist" (premiers essais) PUIS "message port closed"
// repete, meme APRES status:"complete", et JAMAIS un seul
// CONTENT_SCRIPT_MESSAGE_RECEIVED cote background (relaye pourtant via
// RELAY_LOG_ENTRY, voir logger.ts -- absence confirmee, pas juste invisible).
// Comparaison directe avec EDIT_LISTING (vinted-edit.ts/editListing.ts) :
// SON caller n'attend PAS de reponse a chrome.tabs.sendMessage comme signal
// de disponibilite -- il attend un signal explicite POUSSE par le content
// script (EDIT_TAB_READY) AVANT tout envoi de la commande metier, avec
// reinjection EXPLICITE (chrome.scripting.executeScript) a chaque navigation
// reelle "complete" (CAUSE RACINE #2 documentee dans editListing.ts : le
// document qui a envoye le signal pret peut deja avoir ete remplace par une
// redirection interne Vinted au moment de la reponse). PUBLISH_LISTING, lui,
// etait envoye en aveugle (retry a duree fixe) des la creation de l'onglet --
// exactement la course que EDIT_TAB_READY a ete concu pour eliminer. Meme
// correctif applique ici : PUBLISH_TAB_READY, poussee par CE content script
// des que son listener est enregistre, jamais une reponse a sendMessage.
//
// Garde d'idempotence (meme raison que __resellosEditBooted, vinted-edit.ts) :
// une reinjection explicite (voir handlePublishListing.ts) peut atterrir sur
// le MEME document qu'une injection declarative deja executee -- n'enregistre
// le listener et n'envoie PUBLISH_TAB_READY qu'une seule fois par document,
// jamais deux listeners actifs en parallele dans le meme document.
const publishGlobalScope = window as unknown as { __resellosPublishBooted?: boolean };
if (publishGlobalScope.__resellosPublishBooted) {
  docLog.info("PUBLISH_BOOT_SKIPPED_ALREADY_BOOTED", { href: location.href });
} else {
  publishGlobalScope.__resellosPublishBooted = true;
  bootPublishContentScript();
}

function bootPublishContentScript(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Loggue TOUT message recu ICI, AVANT le filtre isContentCommand -- si
    // isContentCommand rejetait un message (structure inattendue, echec de
    // (dé)serialisation d'un gros ArrayBuffer...), l'ancienne position du log
    // (apres le filtre) ne l'aurait JAMAIS montre, faussant le diagnostic
    // "listener jamais atteint" vs "message atteint mais rejete".
    docLog.info("CONTENT_SCRIPT_MESSAGE_RECEIVED_RAW", { hasType: typeof message === "object" && message !== null && "type" in message, href: location.href });
    if (!isContentCommand(message)) return false;
    docLog.info("CONTENT_SCRIPT_MESSAGE_RECEIVED", { messageType: message.type, href: location.href });
    if (message.type === "PUBLISH_LISTING") {
      // CAUSE CONFIRMEE en test live (2026-08-11, mission "ACK PUBLISH_LISTING
      // MANQUANT") : ce listener ne repondait JAMAIS (ni sendResponse, ni
      // return true) -- "message port closed before a response was received."
      // cote background, alors meme que la commande avait bien ete recue et
      // runPublish() deja demarre. Desormais un ACK SYNCHRONE explicite,
      // AVANT tout travail long : distingue "commande remise" (ce message) de
      // "republication terminee" (toujours PUBLISH_RESULT/onTabUpdated,
      // jamais confondus, voir handlePublishListing.ts). duplicate:true si un
      // runPublish() est deja en cours dans ce document -- accepte proprement
      // SANS en relancer un second (voir runPublishInFlight ci-dessus).
      const duplicate = runPublishInFlight;
      const response: PublishCommandResponse = { ok: true, accepted: true, duplicate, documentInstanceId: DOCUMENT_INSTANCE_ID };
      sendResponse(response);
      docLog.info("PUBLISH_COMMAND_ACCEPTED", { ...response });
      if (duplicate) {
        docLog.warn("RUN_PUBLISH_DUPLICATE_IGNORED", { runPublishInvocationCount, href: location.href });
      } else {
        // Mission "PREUVE LIVE PRECISE -- TRANSPORT BINAIRE PHOTOS" (2026-08-11) :
        // CAUSE CONFIRMEE -- voir binaryTransport.ts. message.photos arrive ICI
        // sous forme "sur le fil" (arrayBufferBase64, string) -- decode en
        // ArrayBuffer reel AVANT tout autre traitement, pour que
        // reconstructPhotoFiles() (photoReconstruction.ts) recoive exactement
        // ce qu'il recevait avant la regression de transport, sans lui-meme
        // etre modifie. PHOTO_BINARY_AFTER_RECEIVE (demande explicitement)
        // journalise l'etat REEL de chaque ArrayBuffer juste apres decodage,
        // pour comparaison directe avec PHOTO_BINARY_BEFORE_SEND (background).
        const decodedPhotos: FetchedPhoto[] = message.photos.map((photo, index) => {
          const { arrayBufferBase64, ...rest } = photo;
          const arrayBuffer = arrayBufferBase64 ? base64ToArrayBuffer(arrayBufferBase64) : null;
          const descriptor = describeBinaryValue(arrayBuffer);
          docLog.info("PHOTO_BINARY_AFTER_RECEIVE", {
            index,
            constructorName: descriptor.constructorName,
            isArrayBuffer: descriptor.isArrayBuffer,
            isUint8Array: descriptor.isUint8Array,
            byteLength: descriptor.byteLength,
            length: descriptor.length,
            keys: descriptor.keys,
            first16BytesHex: descriptor.first16BytesHex,
          });
          return { ...rest, arrayBuffer };
        });
        void runPublish(message.payload, decodedPhotos);
      }
    }
    // false : la reponse (le cas echeant) a deja ete envoyee SYNCHRONEMENT
    // ci-dessus -- jamais besoin de garder le port ouvert pendant tout le
    // workflow de publication (categorie/photos/attributs/clic humain), qui
    // continue de communiquer via les evenements PUBLISH_PROGRESS/
    // PUBLISH_PREFILL_SUMMARY/PUBLISH_RESULT existants (fire-and-forget,
    // canal distinct).
    return false;
  });

  // Signal de disponibilite (voir commentaire ci-dessus) -- envoye juste
  // apres l'enregistrement du listener, pour que handlePublishListing.ts
  // sache exactement quand il est sur d'obtenir une reponse, plutot que de
  // deviner via un retry aveugle a duree fixe.
  chrome.runtime.sendMessage({ type: "PUBLISH_TAB_READY", documentInstanceId: DOCUMENT_INSTANCE_ID });
  docLog.info("PUBLISH_TAB_READY_SENT", { href: location.href });
}
