// Injecte sur https://www.vinted.fr/items/new (voir manifest.config.ts).
// Phase 3.1 (publication) : remplit le formulaire de creation d'annonce
// Vinted a partir d'une commande recue du background. Premiere action
// d'ECRITURE reelle de l'extension (contrairement a vinted-profile.ts,
// purement lecture) - toujours declenchee par une commande explicite,
// jamais d'initiative propre (voir EXTENSION.md §8).
//
// REPUBLICATION ASSISTEE (2026-08-11, lot dedie) : ce script ne clique
// jamais sur le bouton de soumission final -- jamais verifie en conditions
// reelles (aucune publication n'a jamais ete tentee via un clic automatise,
// voir l'historique de ce fichier), meme classe de risque que le bouton
// "Valider" de vinted-edit.ts (route potentiellement protegee par un
// anti-bot). La publication reste donc un clic 100% humain -- c'est
// handlePublishListing.ts (background) qui detecte la reussite reelle, via
// chrome.tabs.onUpdated (navigation vers /items/{id nouveau}), jamais ce
// content script (dont le contexte JS est de toute facon detruit par une
// vraie navigation de page).
//
// CATEGORIE -- historique puis mise a jour (2026-08-16) : jusqu'a cette
// date, resolveCategory() (formFill.ts) levait inconditionnellement car le
// trigger du panneau categorie exigeait un evenement isTrusted:true (preuve
// A/B testee a l'epoque) -- ce script ne tentait donc JAMAIS d'ouvrir le
// selecteur de categorie, laissant les 5 pickers d'attributs (etat/taille/
// marque/couleur/matiere, qui n'existent dans le DOM qu'apres une categorie
// FEUILLE choisie) inaccessibles tant que l'utilisateur n'avait pas
// lui-meme termine la navigation categorie. Un retest live du 2026-08-16 a
// prouve que ce blocage isTrusted n'est PLUS reproductible sur le DOM
// actuel (dispatchFullClick() ouvre desormais le panneau normalement) --
// attemptCategoryPrefill() tente donc maintenant la selection automatique
// en premier (recherche + desambiguisation par genre, voir categoryMatch.ts
// et categoryOptionReader.ts), et ne retombe sur l'attente manuelle
// (watchForCategorySelectionAndPrefillAttributes()) qu'en cas d'echec ou
// d'ambiguite -- jamais de choix invente, MANUAL_REQUIRED implicite via le
// retour `false` dans ce cas.
//
// Ce script se limite donc a : remplir les champs surs (titre, description,
// prix, photos -- aucun n'exige d'evenement isTrusted), tenter la categorie
// et les attributs qui en dependent avec relecture DOM systematique (jamais
// annoncer confirme ce qui ne l'est pas reellement), et rapporter un etat
// des lieux honnete (PUBLISH_PREFILL_SUMMARY) avant de laisser la main a
// l'utilisateur pour la taille du colis et la soumission finale.
//
// Selecteurs verifies en direct le 2026-07-10 (compte matleshop) - voir
// publishSelectors.ts pour le detail et les points encore a confirmer en
// test live (comportement exact de l'upload photo, bandeau d'erreur Vinted).

import { waitForElement, waitForCondition, WaitTimeoutError, describeTimeout } from "./domWait";
import * as sel from "./publishSelectors";
import {
  PublishError,
  describePriceValidationState,
  dispatchEscapeKey,
  dispatchFullClick,
  parsePriceToNumber,
  setNativeValue,
  typeIntoBrandSearchInput,
  typeIntoPriceField,
  verifyLoggedInAccount,
  type PriceValidationState,
} from "./formFill";
import {
  evaluateReadinessStability,
  isFormReallyReadyToSubmit,
  INITIAL_READINESS_STABILITY_STATE,
  type ReadinessStabilityState,
  type SaveButtonState,
} from "./publishReadiness";
import { watchAndHighlightSaveButton } from "./publishReadinessHighlight";
import { initPublishSyntheticClickPoc } from "./publishSyntheticClickPoc";
import { initAttributeCommitEventRecorder } from "./attributeCommitEventRecorder";
import { attemptAutomaticRepublishSubmit, isRepublishPayload } from "./publishAutoSubmit";
import {
  describeConditionTriggerAfterSelection,
  matchConditionOption,
  readConditionOptionCandidates,
} from "./conditionOptionReader";
import { readSizeOptionCandidates } from "./sizeOptionReader";
import { readColorOptionCandidates, isColorCandidateChecked, resolveColorOptionByTestId } from "./colorOptionReader";
import { matchMaterialOption, readMaterialOptionCandidates } from "./materialOptionReader";
import { parseMaterials } from "./materials";
import { readCategoryResultCells, readCategoryResultCellsDetailed, describeCategoryContainer } from "./categoryOptionReader";
import { readLabeledOptionCells, readLabeledOptionCellsDetailed, describePickerContainer } from "./pickerCellReader";
import { deriveCategorySearchTerm, describeCategoryMatchAttempt, matchCategoryResult } from "./categoryMatch";
import { describeMatchAttempt, matchOption, normalize } from "./matchOption";
import {
  describeExactMatchCandidate,
  describeExactMatchStructure,
  diffDropdownDomElements,
  isVisible,
  matchesHumanClick,
  snapshotDropdownDom,
  type DropdownDomSnapshot,
} from "./attributeDropdownDiagnostics";
import { openBrandDropdownWithRetry, BRAND_OPEN_MAX_ATTEMPTS } from "./brandDropdownOpen";
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
import { computeManualFields, PACKAGE_SIZE_LABELS, replaceManualPlaceholder } from "./publishFieldSummary";
import { reconstructPhotoFiles } from "./photoReconstruction";
import { describeAvailableFileInputs } from "./fileInputDiagnostics";
import { importPhotosWithVerification, type PhotoImportOutcome } from "./photoImportVerification";
import {
  PUBLISH_CREATE_RESPONSE_CAPTURE_INSTALLED_ATTR,
  PUBLISH_CREATE_RESPONSE_EVENT_NAME,
  summarizePricePayload,
} from "./publishCreateResponseCapture";
import { PRICE_PAYLOAD_PATCHED_EVENT } from "./priceMainWorldWriter";
import type { PublishCreateResponseCapture } from "./publishCreateResponseCapture";
import { clickPackageSizeRadio, findAlreadyCheckedPackageSize, readPackageSizeCellSnapshots } from "./packageSizeSelection";
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
// Mission "FIABILISER L'IMPORT PHOTOS" (2026-08-17) : consulte par
// watchForPublishReadiness() -- PUBLISH_READY_TO_SUBMIT ne doit JAMAIS partir
// tant que ceci ne vaut pas {status:"confirmed", confirmedCount===expectedCount}.
// `null` = import pas encore termine (etat initial) -- traite comme "pas
// pret", jamais comme "pret par defaut" (voir publishReadiness.ts).
let photoImportOutcome: PhotoImportOutcome | null = null;
// Mission "REPUBLICATION 100% UNATTENDED -- COMMIT MARQUE/COULEUR" (2026-08-19) :
// CAUSE CONFIRMEE en test live -- le POST reel /api/v2/item_upload/items
// contenait brand_id:null/color_ids:[] malgre un DOM visuel correct (trigger
// affichant "Polo Ralph Lauren", aria-checked="true" sur "Bleu") : la
// confirmation DOM (valeur du trigger / aria-checked) ne prouve PAS a elle
// seule que Vinted a reellement committe la valeur cote formulaire -- meme
// classe de faux positif que le bug prix/photos deja corrige (memes missions
// "REPUBLICATION VINTED : BUG PRIX + FAUX READY_TO_SUBMIT"/"FIABILISER
// L'IMPORT PHOTOS"). `null` = prefill Marque/Couleur pas encore termine (etat
// initial) -- traite comme "pas pret", jamais suppose pret par defaut, meme
// discipline exacte que photoImportOutcome ci-dessus. Mis a jour par
// attemptBrandPrefill()/attemptColorPrefill(), consulte par
// watchForPublishReadiness() (readiness ET auto-submit) ci-dessous.
let brandCommitConfirmed: boolean | null = null;
let colorCommitConfirmed: boolean | null = null;
// Mission "ROUND PRIX + COLIS -- CORRECTIF NaN" (2026-08-19) : meme
// discipline exacte que brandCommitConfirmed/colorCommitConfirmed ci-dessus
// -- CAUSE CONFIRMEE en test live que rien ne bloquait PUBLISH_READY_TO_SUBMIT/
// AUTO_SUBMIT_TRIGGERED quand la Taille du colis n'etait jamais reellement
// confirmee (checkedAfterClick resté false, ou cellule jamais trouvee).
// `null` = pas encore tentee, traite comme "pas pret". Mis a jour par
// selectPackageSizeWithConfirmation(), consulte par watchForPublishReadiness()
// ci-dessous.
let packageSizeCommitConfirmed: boolean | null = null;
// Mission "ROUND SUIVANT -- POC DIAGNOSTIQUE DIRECT DU BOUTON AJOUTER"
// (2026-08-19) : consulte UNIQUEMENT par publishSyntheticClickPoc.ts (DEV
// only, jamais par le flow normal) pour refuser toute tentative avant que la
// readiness soit reellement CONFIRMEE STABLE -- reflete exactement le meme
// instant que l'envoi de PUBLISH_READY_TO_SUBMIT ci-dessous, jamais une
// nouvelle logique de lecture d'etat.
let publishReadyToSubmitConfirmed = false;
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

// Mission "ROUND PACKAGE SIZE -- implementation production" (2026-08-18) :
// selection REELLE de la "Taille du colis", activee apres validation live
// exhaustive (voir packageSizeSelection.ts pour le detail des methodes
// precedemment testees et rejetees). payload.packageSize est une valeur
// EXPLICITEMENT confirmee par l'utilisateur avant chaque publication
// (PublishConfirmationModal.tsx, jamais une valeur devinee cote extension --
// voir l'audit de cette mission) -- ce n'est donc jamais un "mapping
// invente", uniquement l'application d'une decision humaine deja actee.
//
// Mission "ROUND PRIX + COLIS -- DIAGNOSTIC" (2026-08-19) : timeout etendu
// (PACKAGE_SIZE_CELLS_TIMEOUT_MS, ci-dessous) -- a l'epoque, hypothese non
// prouvee que Chromium depriorise le rendu des onglets active:false. Mission
// "ROUND PRIX + COLIS -- FIX ORDRE FLOW COLIS" (2026-08-20) : cette
// hypothese est INVALIDEE par une preuve live directe (cellule reellement
// presente dans le DOM apres rendu, alors que ResellOS timeoutait encore) --
// la cause reelle est un bug d'ORDRE dans runPublishOnce() (le colis etait
// attendu AVANT meme que la resolution categorie/attributs ne commence, voir
// le commentaire au-dessus de l'appel a watchForCategorySelectionAndPrefillAttributes()
// dans runPublishOnce()), desormais corrige. Ce timeout de 20000ms reste
// neanmoins une tolerance raisonnable (rendu background toujours possiblement
// plus lent) -- inchange, ne touche pas au flow d'onglets lui-meme.
//
// Mission "ROUND PRIX + COLIS -- COMPORTEMENT FINAL" (2026-08-19) : PREUVE
// LIVE CONFIRMEE sur un polo reel -- index 1/Petit : checked:true ET
// recommended:true ; index 2/Moyen et index 3/Grand : les deux false. Vinted
// pre-selectionne donc REELLEMENT sa recommandation via le radio natif
// (`checked`), pas seulement un badge visuel. Comportement final : lecture
// d'un instantane DOM complet (readPackageSizeCellSnapshots(),
// packageSizeSelection.ts) des que les cellules existent, TOUJOURS journalise
// (PACKAGE_SIZE_DOM_SNAPSHOT), purement observationnel au sens ou il ne
// declenche jamais de clic lui-meme. Si un radio est DEJA reellement coche
// (findAlreadyCheckedPackageSize -- `.checked` structurel, jamais juste le
// texte "Recommandé"), ResellOS NE CLIQUE RIEN et adopte cet etat comme seule
// source de verite -- meme si `payload.packageSize` (heuristique app-side,
// voir PublishConfirmationModal.tsx) demandait autre chose. Seulement si
// AUCUN radio n'est deja coche, le comportement historique s'applique
// (clickPackageSizeRadio sur la valeur demandee). Si rien n'est coche mais
// qu'une option porte "Recommandé", cette info reste uniquement journalisee
// (snapshot) -- ne declenche toujours aucun clic automatique cote ResellOS
// dans ce cas precis, HORS PERIMETRE explicitement exclu de ce round.
//
// Ne considere JAMAIS la selection reussie sur le seul fait que .click() n'a
// pas leve d'exception (voir clickPackageSizeRadio, packageSizeSelection.ts) :
// seule la relecture de `radio.checked` juste apres l'appel fait foi. En cas
// d'echec (radio introuvable, valeur invalide/absente, ou checked reste
// false apres le clic), retombe sur le comportement securise historiquement
// en place : un rappel manuel explicite dans `pending`, JAMAIS une selection
// arbitraire (ex. jamais "Petit" par defaut).
const PACKAGE_SIZE_CELLS_TIMEOUT_MS = 20000;

// Libelle FR propre pour le message utilisateur quand Vinted a deja
// selectionne -- jamais le texte DOM brut (qui peut concatener "Petit" et
// "Recommandé" sans separateur selon la structure reelle de la cellule).
// `actual.label` (texte DOM brut) reste journalise integralement dans
// PACKAGE_SIZE_SELECT_RESULT pour le diagnostic, seul ce libelle controle
// est utilise dans le message affiche a l'utilisateur.
const PACKAGE_SIZE_INDEX_LABELS: Record<1 | 2 | 3, string> = {
  1: PACKAGE_SIZE_LABELS.small,
  2: PACKAGE_SIZE_LABELS.medium,
  3: PACKAGE_SIZE_LABELS.large,
};

async function selectPackageSizeWithConfirmation(
  payload: PublishListingPayload,
  confirmed: string[],
  pending: string[]
): Promise<void> {
  const label = PACKAGE_SIZE_LABELS[payload.packageSize] ?? String(payload.packageSize);
  try {
    await waitForElement(sel.PACKAGE_SIZE_CELL_SELECTOR(1), { timeoutMs: PACKAGE_SIZE_CELLS_TIMEOUT_MS });
  } catch (err) {
    docLog.warn("PACKAGE_SIZE_SELECT_CELLS_NOT_FOUND", { requestedLabel: label, error: errorMessage(err) });
    pending.push(`Taille du colis : ${label} demandé -- ResellOS n'a pas trouvé ce champ, sélectionne-le toi-même sur Vinted`);
    packageSizeCommitConfirmed = false;
    return;
  }

  // Instantane DOM complet, purement observationnel -- log unique demande
  // explicitement, TOUJOURS emis des que les cellules existent (avant toute
  // decision), jamais conditionne au succes/echec de la suite.
  const snapshots = readPackageSizeCellSnapshots();
  docLog.info("PACKAGE_SIZE_DOM_SNAPSHOT", { requestedValue: payload.packageSize, requestedLabel: label, cells: snapshots });

  // Vinted a-t-il DEJA reellement selectionne une taille lui-meme (etat
  // structurel .checked, jamais un badge visuel seul) ? Si oui, ne jamais
  // ecraser -- confirme cet etat reel tel quel, quelle que soit la valeur
  // demandee par ResellOS.
  const alreadyCheckedIndex = findAlreadyCheckedPackageSize(snapshots);
  if (alreadyCheckedIndex !== null) {
    const actual = snapshots.find((s) => s.index === alreadyCheckedIndex)!;
    const actualCleanLabel = PACKAGE_SIZE_INDEX_LABELS[alreadyCheckedIndex];
    docLog.info("PACKAGE_SIZE_SELECT_RESULT", {
      requestedLabel: label,
      requestedIndex: null,
      radioFound: true,
      checkedAfterClick: true,
      outcome: "already_selected_by_vinted",
      actualIndex: alreadyCheckedIndex,
      actualLabel: actual.label, // texte DOM brut, diagnostic uniquement
      actualCleanLabel,
      recommended: actual.recommended,
    });
    // Message utilisateur : le libelle CONTROLE ("Petit"/"Moyen"/"Grand"),
    // jamais "Moyen demandé" quand Vinted avait deja selectionne autre chose
    // (demande explicite) -- et jamais le texte DOM brut potentiellement
    // concatene avec "Recommandé".
    confirmed.push(`Taille du colis : ${actualCleanLabel} (déjà sélectionné par Vinted)`);
    packageSizeCommitConfirmed = true;
    return;
  }

  const outcome = clickPackageSizeRadio(payload.packageSize);
  docLog.info("PACKAGE_SIZE_SELECT_RESULT", { requestedLabel: label, ...outcome });
  if (outcome.checkedAfterClick === true) {
    confirmed.push(`Taille du colis : ${label}`);
    packageSizeCommitConfirmed = true;
  } else {
    pending.push(`Taille du colis : ${label} demandé -- la sélection automatique a échoué, sélectionne-la toi-même sur Vinted`);
    packageSizeCommitConfirmed = false;
  }
}

// Mission "REPUBLICATION VINTED : BUG PRIX + FAUX READY_TO_SUBMIT" (2026-08-16) :
// meme ordre de grandeur que les autres delais de confirmation de ce fichier
// (ATTRIBUTE_CONFIRMATION_TIMEOUT_MS plus bas) -- laisse le temps a un
// eventuel re-render/debounce de validation Vinted apres la frappe simulee,
// sans jamais bloquer indefiniment.
const PRICE_CONFIRMATION_TIMEOUT_MS = 5000;
// Mission "STABILISATION ECRITURE PRIX" (2026-08-25) : delai de la
// re-verification de stabilite. Volontairement plus long que le snapshot
// `plus_200ms` de typeIntoPriceField (formFill.ts) qui avait revele le NaN --
// on veut observer APRES le re-render, pas pendant.
const PRICE_STABILITY_DELAY_MS = 600;

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

    // Mission "ROUND PRIX + COLIS -- CORRECTIF NaN" (2026-08-19) : CAUSE
    // CONFIRMEE en test live -- "NaN €" affiche sur Vinted apres
    // republication. payload.price.toString() etait appele SANS jamais
    // verifier que payload.price est un nombre fini -- NaN.toString() reussit
    // silencieusement ("NaN"), tape lettre par lettre par typeIntoPriceField(),
    // que Vinted affiche ensuite tel quel ("NaN €"). parsePriceToNumber()
    // (formFill.ts, deja source unique de verite pour LIRE l'etat DOM) est
    // desormais reutilisee pour VALIDER payload.price AVANT toute frappe --
    // jamais deux logiques de parsing divergentes. Rejette NaN/Infinity/
    // null/undefined/vide : dans ce cas, AUCUNE frappe n'est jamais tentee
    // (jamais de "NaN"/"Infinity" tape a l'aveugle), rappel manuel honnête.
    const normalizedPrice = parsePriceToNumber(payload.price);
    if (normalizedPrice === null) {
      docLog.error("PREFILL_PRICE_INVALID_INPUT", { rawPrice: payload.price });
      pending.push("Prix");
      stepTimestamps.PREFILL_PRICE_DONE = Date.now();
      return;
    }

    // Mission "REPUBLICATION VINTED : BUG PRIX + FAUX READY_TO_SUBMIT"
    // (2026-08-16) : CAUSE CONFIRMEE -- setNativeValue() ecrit la valeur en UN
    // SEUL bloc (une seule paire setter+evenements), exactement le mecanisme
    // deja documente comme insuffisant pour CE MEME champ prix cote edit_listing
    // (voir typeIntoPriceField ci-dessous, deja live-prouvee sur
    // vinted-edit.ts::submitEdit avec le meme appel `payload.price.toString()`)
    // -- Vinted semble exiger un flux de frappes incrementales pour que son
    // masque de devise recalcule correctement son etat interne, meme quand
    // l'affichage se reformate cosmetiquement en "24,00 €" apres un bloc
    // unique. Helper deja eprouve reutilise tel quel, aucune duplication --
    // seul l'ARGUMENT change (normalizedPrice, jamais payload.price brut).
    await typeIntoPriceField(priceInput, String(normalizedPrice), DOCUMENT_INSTANCE_ID);

    // La comparaison de VALEUR AFFICHEE seule ne prouve plus rien (preuve live
    // directe : "24,00 €" affiche ET rejete simultanement par Vinted --
    // "Le champ prix doit être supérieur ou égal à 1.0"). describePriceValidationState()
    // (formFill.ts) agrege la valeur ET l'etat de validation REEL du champ --
    // re-interroge a chaque evaluation (waitForCondition), jamais une lecture
    // synchrone unique juste apres l'ecriture (le re-render/la validation de
    // Vinted peut etre asynchrone). Compare desormais a normalizedPrice
    // (jamais payload.price brut) -- coherent avec la valeur reellement tapee.
    let lastPriceState: PriceValidationState = describePriceValidationState(priceInput);
    let priceAccepted = false;
    try {
      await waitForCondition(
        () => {
          const freshInput = document.querySelector<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
          lastPriceState = describePriceValidationState(freshInput);
          return lastPriceState.parsedValue === normalizedPrice && lastPriceState.valid;
        },
        {
          timeoutMs: PRICE_CONFIRMATION_TIMEOUT_MS,
          description: "prix reellement accepte par Vinted (valeur ET validite reelle, pas seulement l'affichage)",
        }
      );
      priceAccepted = true;
    } catch {
      // lastPriceState porte deja le dernier etat reellement observe.
    }

    // Mission "STABILISATION ECRITURE PRIX" (2026-08-25) : waitForCondition
    // RESOUT des que la condition est vraie -- un prix correct a l'instant du
    // controle pouvait donc etre declare accepte, puis devenir "NaN €" au
    // re-render React suivant (mecanisme demontre par la trace
    // PRICE_INPUT_WRITE_STEP : DOM correct jusqu'apres blur, NaN a +200ms).
    //
    // On revalide donc APRES le re-render, une seule fois, sans jamais
    // reecrire quoi que ce soit : ce n'est pas un retry qui lutte contre
    // React, c'est une preuve de STABILITE. Un prix qui ne survit pas au
    // re-render n'a jamais ete reellement accepte -- le declarer confirme
    // produirait exactement le faux positif que ce round elimine.
    if (priceAccepted) {
      await new Promise((resolve) => setTimeout(resolve, PRICE_STABILITY_DELAY_MS));
      const stableInput = document.querySelector<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
      const stableState = describePriceValidationState(stableInput);
      const stillCorrect = stableState.parsedValue === normalizedPrice && stableState.valid;
      docLog.info("PREFILL_PRICE_STABILITY_CHECK", {
        normalizedPrice,
        delayMs: PRICE_STABILITY_DELAY_MS,
        ...stableState,
        stable: stillCorrect,
      });
      if (!stillCorrect) {
        priceAccepted = false;
        lastPriceState = stableState;
      }
    }

    docLog.info("PREFILL_PRICE", { payload: payload.price, normalizedPrice, elementFound: true, ...lastPriceState, confirmed: priceAccepted });
    if (priceAccepted) confirmed.push("Prix");
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

  // Mission "FIABILISER L'IMPORT PHOTOS" (2026-08-17) : `expectedCount` est
  // TOUJOURS le nombre reel de photos de l'annonce SOURCE (photos.length,
  // deja fige AVANT reconstruction) -- jamais files.length, qui peut deja
  // etre inferieur si le fetch CDN (background) ou le sniff magic-bytes
  // ci-dessus a deja perdu des photos. C'est exactement ce qui permettait
  // avant ce correctif a un import partiel de se faire passer pour complet :
  // l'ancienne verification n'exigeait jamais plus que files.length,
  // JAMAIS le compte reel attendu par l'annonce source. Voir
  // photoImportVerification.ts pour la logique complete (retries bornes,
  // jamais de reinjection -- evite tout risque de doublon).
  const expectedCount = photos.length;

  async function injectFilesIntoVintedInput(filesToInject: File[]): Promise<void> {
    // Mission "diagnostic final PHOTOS + CATEGORIE" (2026-08-11), item 2/3 :
    // isole DELIBEREMENT de la sequence DataTransfer/change plus bas -- un
    // waitForElement(input) qui echoue ici est une cause RADICALEMENT
    // differente (selecteur perime, champ jamais rendu) d'un echec APRES
    // avoir trouve l'input.
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
      throw err;
    }
    lastPhotoInjectionStage = "PHOTO_INPUT_FOUND";
    docLog.info("PHOTO_INPUT_FOUND", {
      selector: sel.ADD_PHOTOS_INPUT_SELECTOR,
      type: input.type,
      multiple: input.multiple,
      accept: input.accept,
    });

    const dataTransfer = new DataTransfer();
    filesToInject.forEach((file) => dataTransfer.items.add(file));
    lastPhotoInjectionStage = "PHOTO_DATATRANSFER_BUILT";
    docLog.info("PHOTO_DATATRANSFER_BUILT", { itemsCount: dataTransfer.items.length, filesCount: dataTransfer.files.length });

    lastPhotoInjectionStage = "PHOTO_BEFORE_ASSIGN_FILES";
    docLog.info("PHOTO_BEFORE_ASSIGN_FILES", {});
    input.files = dataTransfer.files;
    lastPhotoInjectionStage = "PHOTO_AFTER_ASSIGN_FILES";
    docLog.info("PHOTO_AFTER_ASSIGN_FILES", { inputFilesLength: input.files?.length ?? 0 });

    // Note (item A du rapport original) : AUCUN evenement "input" n'est
    // dispatche ici, volontairement -- contrairement a setNativeValue()
    // (formFill.ts) pour les champs texte (input+change+blur), un
    // <input type="file"> n'a pas de convention "input" equivalente ; React
    // ecoute "change" nativement pour ce type de champ.
    lastPhotoInjectionStage = "PHOTO_BEFORE_CHANGE_EVENT";
    docLog.info("PHOTO_BEFORE_CHANGE_EVENT", {});
    input.dispatchEvent(new Event("change", { bubbles: true }));
    lastPhotoInjectionStage = "PHOTO_AFTER_CHANGE_EVENT";
    docLog.info("PHOTO_AFTER_CHANGE_EVENT", {});
    docLog.info("PREFILL_PHOTOS_INPUT_ASSIGNED", { elementFound: true, filesAssigned: input.files?.length ?? 0 });
  }

  function countGridThumbnails(): number {
    const grid = document.querySelector(sel.MEDIA_UPLOAD_GRID_SELECTOR);
    return grid ? grid.querySelectorAll("img").length : 0;
  }

  lastPhotoInjectionStage = "PHOTO_WAITING_FOR_GRID";
  const outcome = await importPhotosWithVerification(
    files,
    expectedCount,
    {
      countDomThumbnails: countGridThumbnails,
      injectFiles: injectFilesIntoVintedInput,
      waitForDomCountOrTimeout: (expected, timeoutMs) =>
        waitForCondition(() => countGridThumbnails() >= expected, { timeoutMs }).catch(() => {
          // Timeout de CETTE tentative -- jamais fatal ici, l'appelant relit
          // toujours countDomThumbnails() juste apres pour l'etat REEL.
        }),
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      onExpected: (detail) => docLog.info("PHOTO_IMPORT_EXPECTED", detail),
      onAttempt: (detail) => docLog.info("PHOTO_IMPORT_ATTEMPT", detail),
      onDomCount: (detail) => docLog.info("PHOTO_IMPORT_DOM_COUNT", detail),
      onRetry: (detail) => docLog.warn("PHOTO_IMPORT_RETRY", detail),
      onConfirmed: (result) => docLog.info("PHOTO_IMPORT_CONFIRMED", { ...result }),
      onFailed: (result) => docLog.error("PHOTO_IMPORT_FAILED", { ...result }),
    },
    // Rien a injecter et rien a attendre : si le fetch/reconstruction en
    // amont n'a produit AUCUN fichier alors que l'annonce en attend au
    // moins un, aucune verification DOM repetee ne peut jamais combler ce
    // manque -- une seule tentative suffit a le constater (evite ~30s
    // d'attente pure pour un cas deja perdu avant meme d'atteindre le DOM).
    files.length === 0 && expectedCount > 0 ? { maxAttempts: 1 } : {}
  );

  photoImportOutcome = outcome;
  lastPhotoInjectionStage = "PHOTO_GRID_STATE_AFTER_INJECTION";
  docLog.info("PHOTO_GRID_STATE_AFTER_INJECTION", { imageCount: outcome.confirmedCount, expected: outcome.expectedCount, status: outcome.status });

  if (outcome.status === "confirmed") {
    confirmed.push(`Photos (${outcome.confirmedCount})`);
  } else {
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

    // Mission "AUDIT DIVERGENCE READY_TO_SUBMIT", volet Etat (2026-08-16) :
    // CAUSE CONFIRMEE EN LIVE via CONDITION_TRIGGER_AFTER_SELECTION_DIAGNOSTIC
    // (desormais retire, son role est termine) -- immediately_after_click
    // montrait valueProperty/valueAttribute vides ("") mais click_plus_100ms
    // et click_plus_500ms montraient tous deux "Très bon état" : le clic
    // fonctionne bel et bien, Vinted ecrit reellement la valeur dans le
    // trigger, mais seulement APRES un re-render asynchrone -- l'ancienne
    // lecture immediate de readTriggerText() (textContent, de toute facon
    // documente comme toujours vide pour ce trigger precis) ne pouvait donc
    // jamais confirmer, quelle que soit sa duree d'attente. Remplace par
    // confirmTriggerValue() (categoryDetection.ts, pure/testee) -- MEME
    // mecanisme deja utilise et prouve pour Marque/Taille/Couleur (voir
    // attemptDedicatedPickerPrefill ci-dessous) : re-interroge le trigger
    // DEPUIS document a CHAQUE evaluation de waitForCondition (jamais une
    // reference figee), lit .value en egalite stricte normalisee si le
    // trigger est reellement un <input> (confirme en live ci-dessus),
    // sinon repli sur textContent -- reutilise a l'identique, aucune
    // duplication de logique.
    const requestedValue = spec.value;
    let triggerTextAfterClick: string | null = null;
    let triggerConfirmed = false;
    try {
      await waitForCondition(
        () => {
          const result = confirmTriggerValue(spec.triggerSelector, requestedValue);
          triggerTextAfterClick = result.observedValue;
          return result.confirmed;
        },
        {
          timeoutMs: CONDITION_CONFIRMATION_TIMEOUT_MS,
          description: "trigger displays the selected condition (re-queried each check, .value then textContent fallback)",
        }
      );
      triggerConfirmed = true;
    } catch {
      triggerTextAfterClick = confirmTriggerValue(spec.triggerSelector, requestedValue).observedValue;
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
    // Mission "AUDIT DIVERGENCE READY_TO_SUBMIT", volet Marque (2026-08-16) :
    // renomme depuis "TRIGGER_NOT_FOUND_DIAGNOSTIC" -- preuve live directe
    // (Etat puis Marque) que ce bloc catch se declenche aussi bien quand le
    // trigger est reellement introuvable (lastStep:"not_started") QUE quand
    // il a ete trouve ET clique mais qu'une etape ULTERIEURE echoue
    // (ex. lastStep:"trigger_click_attempted", outcome:"failed_after_
    // trigger_click_attempted") -- l'ancien nom affirmait a tort la premiere
    // cause a chaque fois. `outcome`/`lastStep` (deja loggues juste au-dessus)
    // restent la seule source de verite sur CE qui a reellement echoue.
    docLog.warn("ATTRIBUTE_STEP_FAILURE_DIAGNOSTIC", {
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
    // Mission "AUDIT DIVERGENCE READY_TO_SUBMIT", volet Marque (2026-08-16) :
    // renomme depuis "TRIGGER_NOT_FOUND_DIAGNOSTIC" -- preuve live directe
    // (Etat puis Marque) que ce bloc catch se declenche aussi bien quand le
    // trigger est reellement introuvable (lastStep:"not_started") QUE quand
    // il a ete trouve ET clique mais qu'une etape ULTERIEURE echoue
    // (ex. lastStep:"trigger_click_attempted", outcome:"failed_after_
    // trigger_click_attempted") -- l'ancien nom affirmait a tort la premiere
    // cause a chaque fois. `outcome`/`lastStep` (deja loggues juste au-dessus)
    // restent la seule source de verite sur CE qui a reellement echoue.
    docLog.warn("ATTRIBUTE_STEP_FAILURE_DIAGNOSTIC", {
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

// Mission "CAUSE COULEUR CONFIRMEE LIVE" (2026-08-19) : implementation DEDIEE
// (n'appelle plus attemptDedicatedPickerPrefill -- Taille reste sur ce chemin
// partage, inchange) car la preuve structurelle de selection differe
// desormais fondamentalement : aria-checked==="true" sur le candidat
// lui-meme, jamais la valeur du trigger (voir colorOptionReader.ts pour la
// preuve live complete). "Ne considere jamais la couleur confirmee sur la
// seule valeur du trigger" (demande explicite) -- confirmTriggerValue()
// n'est plus jamais appelee ici.
async function attemptColorPrefill(spec: AttributePickerSpec, confirmed: string[], pending: string[]): Promise<void> {
  if (!spec.value) {
    docLog.info(spec.logName, { label: spec.label, outcome: "no_value" });
    replaceManualPlaceholder(pending, spec.label, `${spec.label} : donnée manquante (à choisir sur Vinted)`);
    colorCommitConfirmed = true; // rien a prouver -- aucune valeur demandee
    return;
  }

  let lastStep: DedicatedPickerStep = "not_started";

  try {
    const trigger = await waitForElement<HTMLElement>(spec.triggerSelector, { timeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS });
    lastStep = "trigger_found";
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: lastStep });

    dispatchFullClick(trigger);
    lastStep = "trigger_click_attempted";
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: lastStep });

    // Signal reellement observe en live : au moins un checkbox d'option
    // canonique (filter-grid-option-{id}) present dans le DOM.
    await waitForCondition(() => readColorOptionCandidates().length > 0, {
      timeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS,
      description: `${spec.label} option checkboxes appear`,
    });
    lastStep = "options_found";
    const candidates = readColorOptionCandidates();
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: lastStep, optionsCount: candidates.length });

    // matchOption() INCHANGE -- exact-match-first, jamais de fuzzy dangereux.
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
      colorCommitConfirmed = false;
      return;
    }

    const matchedCandidate = candidates.find((c) => c.label === match)!;
    docLog.info(`${spec.logName}_STEP`, {
      field: spec.label,
      step: "option_match_found",
      requestedValue: spec.value,
      matchedTestId: matchedCandidate.containerTestId,
    });

    if (isColorCandidateChecked(matchedCandidate)) {
      // Deja coche (etat par defaut Vinted, ou tentative precedente reussie)
      // -- ne JAMAIS re-cliquer, un second clic decocherait (meme discipline
      // que Matiere).
      docLog.info(spec.logName, {
        label: spec.label,
        value: spec.value,
        matchedTestId: matchedCandidate.containerTestId,
        outcome: "already_checked",
      });
      replaceManualPlaceholder(pending, spec.label, null);
      confirmed.push(spec.label);
      colorCommitConfirmed = true;
      return;
    }

    // Mission "CAUSE COULEUR CONFIRMEE LIVE -- doublon DOM" (2026-08-19) :
    // re-resolution EXPLICITE par data-testid canonique juste avant le clic
    // -- jamais matchedCandidate.container conserve depuis le matching (voir
    // resolveColorOptionByTestId(), colorOptionReader.ts). Absence
    // structurellement impossible ici (le candidat vient d'etre lu, aucun
    // await entre les deux), mais traitee honnêtement comme un echec plutot
    // que de risquer un crash sur .click() d'un null.
    const freshClickTarget = resolveColorOptionByTestId(matchedCandidate.containerTestId);
    if (!freshClickTarget) {
      docLog.warn(spec.logName, {
        label: spec.label,
        value: spec.value,
        matchedTestId: matchedCandidate.containerTestId,
        outcome: "click_target_not_found",
      });
      replaceManualPlaceholder(
        pending,
        spec.label,
        `${spec.label} : ${spec.value} (sélection tentée mais non confirmée sur Vinted -- vérifie toi-même)`
      );
      colorCommitConfirmed = false;
      return;
    }
    freshClickTarget.click();
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: "option_clicked", matchedTestId: matchedCandidate.containerTestId });

    // Preuve de confirmation UNIQUE : aria-checked==="true" sur le candidat
    // re-resolu FRAICHEMENT (jamais matchedCandidate.container conserve --
    // un re-render React pourrait l'avoir remplace). Timeout dépassé => pas
    // de fausse confirmation, jamais un succès inventé.
    let ariaCheckedConfirmed = false;
    try {
      await waitForCondition(
        () => {
          const fresh = readColorOptionCandidates().find((c) => c.containerTestId === matchedCandidate.containerTestId);
          return !!fresh && isColorCandidateChecked(fresh);
        },
        { timeoutMs: ATTRIBUTE_CONFIRMATION_TIMEOUT_MS, description: `${spec.label} checkbox aria-checked becomes true` }
      );
      ariaCheckedConfirmed = true;
    } catch {
      // rien -- lastPriceState-style, l'echec est gere honnêtement ci-dessous.
    }

    if (!ariaCheckedConfirmed) {
      docLog.warn(spec.logName, {
        label: spec.label,
        value: spec.value,
        matchedTestId: matchedCandidate.containerTestId,
        outcome: "click_not_confirmed",
      });
      replaceManualPlaceholder(
        pending,
        spec.label,
        `${spec.label} : ${spec.value} (sélection tentée mais non confirmée sur Vinted -- vérifie toi-même)`
      );
      colorCommitConfirmed = false;
      return;
    }

    // Mission "REPUBLICATION 100% UNATTENDED -- COMMIT MARQUE/COULEUR"
    // (2026-08-19) : CAUSE CONFIRMEE en test live -- meme apres ce correctif
    // aria-checked, le POST reel contenait toujours color_ids:[]. Hypothese
    // retenue (widget "filter-grid-option-*" -- vraisemblablement un
    // composant de FILTRE reutilise, jamais concu pour un formulaire) :
    // Escape est tres majoritairement une convention "annuler" pour ce type
    // de composant, pas "appliquer" -- il a pu discretement invalider une
    // selection encore locale/non committee. Remplace par un clic REEL en
    // dehors du panneau (document.body.click(), deja la convention de
    // fermeture utilisee ailleurs dans ce fichier pour un picker sans
    // selection) -- geste le plus proche de ce qu'un humain fait
    // naturellement en passant au champ suivant. Non prouve en direct (le
    // diagnostic evenementiel A/B a ete interrompu avant d'obtenir la preuve
    // definitive) -- c'est pourquoi la re-verification post-fermeture
    // ci-dessous ne fait JAMAIS confiance a cette fermeture sans preuve.
    const stillOpen = readColorOptionCandidates().length > 0;
    let dropdownClosed: boolean | null = null;
    if (stillOpen) {
      document.body.click();
      try {
        await waitForCondition(() => readColorOptionCandidates().length === 0, {
          timeoutMs: ATTRIBUTE_CONFIRMATION_TIMEOUT_MS,
          description: `${spec.label} option picker closes after clicking away`,
        });
        dropdownClosed = true;
      } catch {
        dropdownClosed = false;
      }
      docLog.info(`${spec.logName}_STEP`, {
        field: spec.label,
        step: "dropdown_closure_attempted",
        wasStillOpen: stillOpen,
        closedAfterClickAway: dropdownClosed,
      });
    }

    // "Ne considere jamais le DOM visuel comme preuve suffisante" (demande
    // explicite) : re-resout l'option APRES la fermeture et re-verifie
    // aria-checked une SECONDE fois -- si le candidat existe encore mais que
    // aria-checked est retombe a false, la fermeture a bien fait perdre la
    // selection (meme classe de faux positif que l'ancien bug trigger.value)
    // -- ne jamais declarer confirme dans ce cas. Si le candidat a disparu du
    // DOM (picker reellement demonte), la preuve PRE-fermeture
    // (ariaCheckedConfirmed, deja vraie) reste la seule source de verite
    // disponible -- jamais re-exigee sur un noeud qui n'existe plus.
    const afterCloseCandidate = readColorOptionCandidates().find((c) => c.containerTestId === matchedCandidate.containerTestId);
    const ariaCheckedAfterClose = afterCloseCandidate ? isColorCandidateChecked(afterCloseCandidate) : null;
    const lostAfterClose = afterCloseCandidate !== undefined && ariaCheckedAfterClose === false;

    if (lostAfterClose) {
      docLog.warn(spec.logName, {
        label: spec.label,
        value: spec.value,
        matchedTestId: matchedCandidate.containerTestId,
        ariaCheckedConfirmed,
        dropdownWasStillOpen: stillOpen,
        dropdownClosedAfterClickAway: dropdownClosed,
        ariaCheckedAfterClose,
        outcome: "confirmed_before_close_but_lost_after_close",
      });
      replaceManualPlaceholder(
        pending,
        spec.label,
        `${spec.label} : ${spec.value} (sélection perdue après fermeture du panneau -- vérifie toi-même)`
      );
      colorCommitConfirmed = false;
      return;
    }

    docLog.info(spec.logName, {
      label: spec.label,
      value: spec.value,
      matchedTestId: matchedCandidate.containerTestId,
      ariaCheckedConfirmed,
      dropdownWasStillOpen: stillOpen,
      dropdownClosedAfterClickAway: dropdownClosed,
      candidateStillInDomAfterClose: !!afterCloseCandidate,
      ariaCheckedAfterClose,
      outcome: "confirmed",
    });
    replaceManualPlaceholder(pending, spec.label, null);
    confirmed.push(spec.label);
    colorCommitConfirmed = true;
  } catch (err) {
    const outcome = lastStep === "not_started" ? "trigger_not_found" : `failed_after_${lastStep}`;
    docLog.warn(spec.logName, { label: spec.label, value: spec.value, outcome, lastStep, error: errorMessage(err) });
    docLog.warn("ATTRIBUTE_STEP_FAILURE_DIAGNOSTIC", {
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
    colorCommitConfirmed = false;
  }
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
// contient. Lu via readLabeledOptionCellsDetailed() (pickerCellReader.ts,
// partage avec la Categorie) et non plus un selecteur en dur : le contrat
// initial '[role="button"][aria-label]' a disparu du DOM Vinted le
// 2026-08-27 (meme panne, memes dix jours d'ecart, que la Categorie), et le
// champ etait silencieusement saute -- optionsCount:0 sans jamais atteindre
// MANUAL_REQUIRED, puisqu'aucune valeur n'etait meme lue.
// L'id numerique de cette Cell (ex. "brand-4273") N'EST PAS stable d'une
// marque a l'autre : le matching se fait exclusivement sur le libelle, via
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
    brandCommitConfirmed = true; // rien a prouver -- aucune valeur demandee
    return;
  }

  let lastStep: BrandStep = "not_started";

  try {
    await waitForElement<HTMLElement>(spec.triggerSelector, { timeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS });
    lastStep = "trigger_found";
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: lastStep });

    const content = await openBrandDropdownWithRetry({
      triggerSelector: spec.triggerSelector,
      contentSelector: spec.contentSelector,
      searchInputSelector: sel.BRAND_SEARCH_INPUT_SELECTOR,
      log: docLog,
    });
    lastStep = "trigger_click_attempted";
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: lastStep });

    if (!content) {
      throw new Error(`Brand dropdown never opened after ${BRAND_OPEN_MAX_ATTEMPTS} attempts`);
    }
    lastStep = "options_found";
    const baselineCount = readLabeledOptionCells(content).length;
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
            const currentCells = readLabeledOptionCells(currentContent);
            return currentCells.some((cell) => normalize(cell.label) === normalize(spec.value as string));
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
          currentCount: readLabeledOptionCells(content).length,
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
    // Lecteur resilient partage avec la Categorie (pickerCellReader.ts) : le
    // selecteur '[role="button"][aria-label]' a disparu des Cells le
    // 2026-08-27 (meme panne exactement que la Categorie dix jours plus tot),
    // laissant ce champ silencieusement saute (optionsCount:0, jamais atteint
    // le MANUAL_REQUIRED car aucune valeur n'etait meme lue).
    const read = readLabeledOptionCellsDetailed(matchingContent);
    const cells = read.options.map((option) => option.element);
    const labels = read.options.map((option) => option.label);
    docLog.info(`${spec.logName}_STEP`, {
      field: spec.label,
      step: "options_read_after_filter_attempt",
      strategy: read.strategy,
      optionsCount: labels.length,
    });

    if (labels.length === 0) {
      // Photographie structurelle : sans elle, on ne peut qu'essayer un
      // selecteur de plus a l'aveugle au prochain changement de balisage.
      docLog.warn("BRAND_CONTAINER_SHAPE", {
        field: spec.label,
        containerSelector: spec.contentSelector,
        usedFallbackContainer: matchingContent === content,
        ...describePickerContainer(matchingContent),
      });
    }

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
      brandCommitConfirmed = false;
      return;
    }

    const index = labels.indexOf(match);
    // Mission "REPUBLICATION 100% UNATTENDED -- COMMIT MARQUE/COULEUR"
    // (2026-08-19) : dispatchFullClick() (sequence complete pointerdown->
    // mousedown->pointerup->mouseup->click) remplace le .click() simple --
    // essai a faible risque, jamais prouve necessaire en direct (le
    // diagnostic evenementiel A/B a ete interrompu), mais deja la methode
    // standard de ce projet pour un clic de selection reel. Le vrai
    // correctif cible ci-dessous est la fermeture explicite du panneau,
    // jusqu'ici totalement absente pour Marque (contrairement a Etat/Taille/
    // Couleur/Matiere).
    dispatchFullClick(cells[index]);
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

    if (!triggerConfirmed) {
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
      brandCommitConfirmed = false;
      return;
    }

    // Mission "REPUBLICATION 100% UNATTENDED -- COMMIT MARQUE/COULEUR"
    // (2026-08-19) : CAUSE CONFIRMEE en test live -- brand_id/brand
    // restaient null dans le POST reel malgre EXACTEMENT cette confirmation
    // (trigger affichant "Polo Ralph Lauren"). Audit : attemptBrandPrefill()
    // ne fermait/ne quittait JAMAIS le panneau de recherche apres le clic --
    // seule difference structurelle identifiee avec Etat/Taille (dont le
    // MEME clic simple ferme ET committe). Ferme reellement le panneau
    // (clic reel en dehors, meme convention que le cas "aucune correspondance"
    // ci-dessus) puis RE-VERIFIE le trigger une seconde fois -- "ne considere
    // jamais le DOM visuel comme preuve suffisante" (demande explicite) :
    // si la fermeture fait elle-meme reverter la valeur (meme classe de faux
    // positif que l'ancien bug Couleur), ne jamais declarer confirme.
    const brandContent = document.querySelector<HTMLElement>(spec.contentSelector);
    const stillOpen = !!brandContent && isVisible(brandContent);
    let dropdownClosed: boolean | null = null;
    if (stillOpen) {
      document.body.click();
      try {
        await waitForCondition(
          () => {
            const current = document.querySelector<HTMLElement>(spec.contentSelector);
            return !current || !isVisible(current);
          },
          { timeoutMs: ATTRIBUTE_CONFIRMATION_TIMEOUT_MS, description: `${spec.label} search panel closes after clicking away` }
        );
        dropdownClosed = true;
      } catch {
        dropdownClosed = false;
      }
      docLog.info(`${spec.logName}_STEP`, {
        field: spec.label,
        step: "dropdown_closure_attempted",
        wasStillOpen: stillOpen,
        closedAfterClickAway: dropdownClosed,
      });
    }

    const postCloseConfirmation = confirmTriggerValue(spec.triggerSelector, match);
    if (!postCloseConfirmation.confirmed) {
      docLog.warn(spec.logName, {
        label: spec.label,
        value: spec.value,
        matched: match,
        triggerTextAfterClick,
        dropdownWasStillOpen: stillOpen,
        dropdownClosedAfterClickAway: dropdownClosed,
        triggerValueAfterClose: postCloseConfirmation.observedValue,
        outcome: "confirmed_before_close_but_lost_after_close",
      });
      replaceManualPlaceholder(
        pending,
        spec.label,
        `${spec.label} : ${spec.value} (sélection perdue après fermeture du panneau -- vérifie toi-même)`
      );
      brandCommitConfirmed = false;
      return;
    }

    docLog.info(spec.logName, {
      label: spec.label,
      value: spec.value,
      matched: match,
      triggerTextAfterClick,
      dropdownWasStillOpen: stillOpen,
      dropdownClosedAfterClickAway: dropdownClosed,
      triggerValueAfterClose: postCloseConfirmation.observedValue,
      outcome: "confirmed",
    });
    replaceManualPlaceholder(pending, spec.label, null);
    confirmed.push(spec.label);
    brandCommitConfirmed = true;
  } catch (err) {
    const outcome = lastStep === "not_started" ? "trigger_not_found" : `failed_after_${lastStep}`;
    docLog.warn(spec.logName, { label: spec.label, value: spec.value, outcome, lastStep, error: errorMessage(err) });
    // Mission "AUDIT DIVERGENCE READY_TO_SUBMIT", volet Marque (2026-08-16) :
    // renomme depuis "TRIGGER_NOT_FOUND_DIAGNOSTIC" -- preuve live directe
    // (Etat puis Marque) que ce bloc catch se declenche aussi bien quand le
    // trigger est reellement introuvable (lastStep:"not_started") QUE quand
    // il a ete trouve ET clique mais qu'une etape ULTERIEURE echoue
    // (ex. lastStep:"trigger_click_attempted", outcome:"failed_after_
    // trigger_click_attempted") -- l'ancien nom affirmait a tort la premiere
    // cause a chaque fois. `outcome`/`lastStep` (deja loggues juste au-dessus)
    // restent la seule source de verite sur CE qui a reellement echoue.
    docLog.warn("ATTRIBUTE_STEP_FAILURE_DIAGNOSTIC", {
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
    brandCommitConfirmed = false;
  }
}

// Mission "MATIERE : MULTI-SELECT" (2026-08-16) : chemin DEDIE pour Matiere,
// distinct de AttributePickerSpec (les 4 autres champs ne portent qu'une
// seule valeur `.value`) -- Vinted accepte reellement PLUSIEURS matieres
// cochees simultanement (preuve live directe, voir materialOptionReader.ts
// pour le detail complet). `materials` DOIT deja etre une liste de valeurs
// ATOMIQUES au moment de l'appel (voir le site d'appel dans runPublish(),
// qui applique desormais parseMaterials() en defense sur chaque source --
// mission "MATIERE : BUG MATCHING", 2026-08-16) : cette fonction ne
// redecoupe plus rien elle-meme, elle fait confiance a son appelant UNIQUE.
interface MaterialPickerSpec {
  logName: string;
  label: string;
  triggerSelector: string;
  contentSelector: string;
  materials: string[];
}

type MaterialSelectionOutcome = "confirmed" | "already_checked" | "no_match" | "ambiguous" | "click_not_confirmed" | "open_failed";

interface MaterialSelectionResult {
  requested: string;
  outcome: MaterialSelectionOutcome;
}

// Meme timeout que la confirmation trigger des 4 autres champs (5000ms) --
// mecanisme different (checkbox.checked plutot qu'une valeur de trigger)
// mais meme ordre de grandeur, aucune raison connue d'en vouloir un distinct.
const MATERIAL_CHECKBOX_CONFIRMATION_TIMEOUT_MS = ATTRIBUTE_CONFIRMATION_TIMEOUT_MS;

// Mission "MATIERE : BUG MATCHING" (2026-08-16) : deduplique la liste FINALE
// de matieres demandees (insensible a la casse) -- necessaire car le site
// d'appel applique desormais parseMaterials() sur chaque source
// independamment (payload.materials[i] OU le repli payload.material), ce qui
// peut produire des doublons entre elements si deux sources se chevauchent
// (ex. jamais observe en pratique aujourd'hui, mais defensif et gratuit).
function dedupeMaterialsCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

async function attemptMaterialPrefill(spec: MaterialPickerSpec, confirmed: string[], pending: string[]): Promise<void> {
  if (spec.materials.length === 0) {
    // Meme raisonnement que l'ancien chemin generique (attemptAttributePrefill,
    // retire par cette mission) : computeManualFields() (publishFieldSummary.ts)
    // a DEJA pousse le bon message dans `pending` AVANT que cette fonction ne
    // s'execute (Matiere fait partie de OPTIONAL_ON_VINTED_LABELS). Ne touche
    // jamais `pending` dans ce cas.
    docLog.info(spec.logName, { label: spec.label, outcome: "no_value" });
    return;
  }

  const results: MaterialSelectionResult[] = [];

  try {
    const trigger = await waitForElement<HTMLElement>(spec.triggerSelector, { timeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS });
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: "trigger_found" });

    dispatchFullClick(trigger);
    docLog.info(`${spec.logName}_STEP`, { field: spec.label, step: "trigger_click_attempted" });

    // Signal reellement observe en live (meme discipline que les 4 autres
    // champs) : au moins une checkbox d'option canonique presente dans le DOM.
    await waitForCondition(() => readMaterialOptionCandidates().length > 0, {
      timeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS,
      description: `${spec.label} option checkboxes appear`,
    });
    docLog.info(`${spec.logName}_STEP`, {
      field: spec.label,
      step: "options_found",
      optionsCount: readMaterialOptionCandidates().length,
    });

    // Une matiere DEJA consommee (matchee, avec succes ou non) par une
    // iteration precedente n'est plus jamais un candidat valide pour la
    // suivante -- jamais un double-usage de la meme checkbox pour deux
    // valeurs demandees distinctes.
    const usedCandidateIds = new Set<string>();

    for (const requested of spec.materials) {
      // Re-interroge le DOM a CHAQUE matiere (jamais une reference conservee
      // entre iterations) -- si Vinted re-rend le panneau entre deux
      // selections (jamais observe pour Matiere specifiquement, mais deja le
      // cas prouve pour Marque), une reference perimee ne serait jamais
      // detectee silencieusement.
      const freshCandidates = readMaterialOptionCandidates().filter((c) => !usedCandidateIds.has(c.id));
      const matchResult = matchMaterialOption(requested, freshCandidates);

      if (matchResult.reason === "no_match") {
        docLog.warn(spec.logName, { label: spec.label, requested, outcome: "no_reliable_match" });
        results.push({ requested, outcome: "no_match" });
        continue;
      }
      if (matchResult.reason === "ambiguous_match") {
        docLog.warn(spec.logName, {
          label: spec.label,
          requested,
          outcome: "ambiguous_match",
          candidateCount: matchResult.matchingCandidates.length,
        });
        results.push({ requested, outcome: "ambiguous" });
        continue;
      }

      const candidate = matchResult.matched!;
      usedCandidateIds.add(candidate.id);

      if (candidate.checkbox.checked) {
        // Deja cochee (etat par defaut Vinted, ou tentative precedente
        // reussie) -- ne JAMAIS re-cliquer, un second clic decocherait.
        docLog.info(spec.logName, { label: spec.label, requested, matchedId: candidate.id, outcome: "already_checked" });
        results.push({ requested, outcome: "already_checked" });
        continue;
      }

      dispatchFullClick(candidate.checkbox);
      try {
        await waitForCondition(
          () => {
            // Re-interroge FRAIS depuis document par id -- jamais la
            // reference `candidate.checkbox` conservee, qui pourrait etre
            // devenue perimee si Vinted a re-rendu le panneau apres le clic.
            const fresh = document.querySelector<HTMLInputElement>(`[data-testid="material-checkbox-${candidate.id}--input"]`);
            return !!fresh && fresh.checked;
          },
          {
            timeoutMs: MATERIAL_CHECKBOX_CONFIRMATION_TIMEOUT_MS,
            description: `checkbox for "${requested}" (material-checkbox-${candidate.id}) is checked`,
          }
        );
        docLog.info(spec.logName, { label: spec.label, requested, matchedId: candidate.id, outcome: "confirmed" });
        results.push({ requested, outcome: "confirmed" });
      } catch {
        docLog.warn(spec.logName, { label: spec.label, requested, matchedId: candidate.id, outcome: "click_not_confirmed" });
        results.push({ requested, outcome: "click_not_confirmed" });
      }
    }
  } catch (err) {
    // Le trigger/panneau n'a jamais pu etre ouvert -- TOUTES les matieres
    // demandees deviennent manuelles, jamais une selection partielle
    // inventee.
    docLog.warn(spec.logName, {
      label: spec.label,
      requestedMaterials: spec.materials,
      outcome: "open_failed",
      error: errorMessage(err),
    });
    docLog.warn("ATTRIBUTE_STEP_FAILURE_DIAGNOSTIC", {
      field: spec.label,
      lastStep: "trigger_or_content_not_found",
      searchedTriggerSelector: spec.triggerSelector,
      searchedContentSelector: spec.contentSelector,
      matchingTestIdsPresentInDom: describeAvailableTestIds(),
    });
    // Adaptateur structurel vers AttributePickerSpec -- watchForHumanClick()
    // ne lit que label/triggerSelector (voir son en-tete), `value` n'est
    // jamais utilise a l'interieur, uniquement requis par la signature
    // partagee avec les 4 autres champs.
    watchForHumanClick({ logName: spec.logName, label: spec.label, triggerSelector: spec.triggerSelector, contentSelector: spec.contentSelector, value: null });
    for (const requested of spec.materials) results.push({ requested, outcome: "open_failed" });
  }

  docLog.info("ATTRIBUTE_PREFILL_MATERIAL_SUMMARY", { label: spec.label, requested: spec.materials, results });

  const failed = results.filter((r) => r.outcome !== "confirmed" && r.outcome !== "already_checked");
  if (failed.length === 0) {
    // Mission "REPUBLICATION VINTED : BUG PRIX + FAUX READY_TO_SUBMIT"
    // (2026-08-16), etape 5 (polish) : preuve live -- Coton + Polyester bien
    // confirmes (checkbox.checked pour chacun, deja verifie ci-dessus), mais
    // le panneau Matiere peut rester visuellement ouvert. Fermeture
    // UNIQUEMENT apres que TOUTES les matieres demandees sont deja
    // confirmees/deja cochees (confirmed.push() a deja eu lieu juste en
    // dessous -- cette fermeture est un pur polish visuel, JAMAIS utilisee
    // comme preuve de confirmation). Meme mecanisme deja live-valide pour
    // Couleur (Escape, re-verifie via le MEME reader dedie, jamais un delai
    // arbitraire) : readMaterialOptionCandidates().length > 0 signale que le
    // panneau est reellement encore ouvert -- si Vinted l'a deja referme
    // seul (jamais observe pour Matiere), no-op silencieux.
    const trigger = document.querySelector<HTMLElement>(spec.triggerSelector);
    const stillOpen = readMaterialOptionCandidates().length > 0;
    let dropdownClosed: boolean | null = null;
    if (trigger && stillOpen) {
      dispatchEscapeKey(trigger);
      try {
        await waitForCondition(() => readMaterialOptionCandidates().length === 0, {
          timeoutMs: MATERIAL_CHECKBOX_CONFIRMATION_TIMEOUT_MS,
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
    replaceManualPlaceholder(pending, spec.label, null);
    confirmed.push(spec.label);
    return;
  }

  const descriptions = failed.map((r) => {
    switch (r.outcome) {
      case "ambiguous":
        return `${r.requested} (correspondance ambiguë sur Vinted -- à choisir toi-même)`;
      case "no_match":
        return `${r.requested} (aucune correspondance fiable sur Vinted -- à choisir toi-même)`;
      case "open_failed":
        return `${r.requested} (panneau non ouvert -- à sélectionner toi-même)`;
      default:
        return `${r.requested} (sélection tentée mais non confirmée sur Vinted -- vérifie toi-même)`;
    }
  });
  replaceManualPlaceholder(pending, spec.label, `${spec.label} : ${descriptions.join(", ")}`);
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

const CATEGORY_LABEL = "Catégorie";
const CATEGORY_SEARCH_FILTER_TIMEOUT_MS = 5000;
const CATEGORY_SELECTION_CONFIRM_TIMEOUT_MS = 8000;

// Mission "AUTOMATISATION CATEGORIE" (2026-08-16) : tentative AUTOMATIQUE de
// selection de categorie, appelee en tout premier depuis
// watchForCategorySelectionAndPrefillAttributes() ci-dessous, avant tout
// repli manuel. Miroir structurel d'attemptBrandPrefill() (meme sequence :
// ouvrir -> localiser le vrai champ de recherche -> taper -> attendre une
// PREUVE POSITIVE, jamais un simple changement de compte -- voir son
// en-tete pour l'historique du bug "creux transitoire N -> 0" que cette
// meme discipline evite ici -- -> relire -> matcher -> cliquer -> confirmer)
// mais avec sa propre logique de recherche/desambiguisation (categoryMatch.ts)
// et de lecture DOM (categoryOptionReader.ts), le picker categorie n'etant
// pas un simple picker a options plates comme Marque (resultats ambigus
// selon la branche de genre, voir categoryMatch.ts). Renvoie true seulement
// si la categorie est reellement selectionnee ET confirmee -- false dans
// tous les autres cas (aucune valeur ni categorie inventee), laissant
// l'appelant retomber integralement sur l'attente manuelle existante.
//
// Confirmation post-clic : le texte du trigger categorie est deja documente
// comme non lisible pour ce champ precis (categoryTriggerFound:true mais
// texte toujours null, voir CATEGORY_SELECTION_DETECTED plus bas) --
// confirmTriggerValue() (utilise par Marque/Taille/Etat/Couleur) est donc
// inutilisable ici. Le signal reutilise est celui DEJA etabli et eprouve
// par la detection manuelle existante : l'apparition d'au moins un trigger
// d'attribut (hasAnyAttributeTrigger), qui ne se produit qu'apres une
// vraie selection de categorie FEUILLE cote Vinted -- jamais une simple
// fermeture de dropdown, jamais un setTimeout.
async function attemptCategoryPrefill(
  payload: PublishListingPayload,
  confirmed: string[],
  pending: string[]
): Promise<boolean> {
  if (!payload.category) {
    docLog.info("PREFILL_CATEGORY", { label: CATEGORY_LABEL, outcome: "no_value" });
    return false;
  }

  // Capture AVANT tout clic -- si des triggers d'attribut existent deja a
  // ce point (etat inattendu ici, cette fonction s'execute avant tout autre
  // traitement de categorie), le signal de confirmation plus bas ne peut
  // plus prouver que NOTRE clic en est la cause : jamais suppose, voir plus
  // bas.
  const initialHadAnyAttributeTrigger = hasAnyAttributeTrigger(readAttributeTriggerPresence(ATTRIBUTE_TRIGGER_SELECTORS));

  try {
    const trigger = await waitForElement<HTMLElement>(sel.CATEGORY_DROPDOWN_TRIGGER_SELECTOR, {
      timeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS,
    });
    dispatchFullClick(trigger);
    docLog.info("PREFILL_CATEGORY_STEP", { field: CATEGORY_LABEL, step: "trigger_click_attempted" });

    const content = await waitForElement<HTMLElement>(sel.CATEGORY_DROPDOWN_CONTENT_SELECTOR, {
      timeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS,
    });

    const searchInput = await waitForElement<HTMLInputElement>(sel.CATEGORY_SEARCH_INPUT_SELECTOR, {
      root: content,
      timeoutMs: ATTRIBUTE_TRIGGER_TIMEOUT_MS,
    });

    const { searchTerm, genderHint } = deriveCategorySearchTerm(payload.category);
    if (!searchTerm) {
      docLog.warn("PREFILL_CATEGORY", { label: CATEGORY_LABEL, value: payload.category, outcome: "no_search_term" });
      document.body.click(); // ferme le picker sans rien selectionner
      return false;
    }

    // Meme technique native-setter + InputEvent que Marque -- reutilisee
    // TELLE QUELLE (deja generique, aucune logique specifique a la marque
    // dans son implementation, voir formFill.ts) plutot que dupliquee.
    typeIntoBrandSearchInput(searchInput, searchTerm);
    docLog.info("PREFILL_CATEGORY_STEP", {
      field: CATEGORY_LABEL,
      step: "search_input_typed",
      searchTerm,
      genderHint,
      domValueAfterTyping: searchInput.value,
    });

    try {
      await waitForCondition(
        () => {
          const currentContent = document.querySelector<HTMLElement>(sel.CATEGORY_DROPDOWN_CONTENT_SELECTOR);
          if (!currentContent) return false;
          // Deux sorties acceptables (2026-08-26). Avant, l'attente n'admettait
          // QUE la correspondance exacte du titre : quand le lecteur ne voyait
          // rien du tout, elle expirait puis on relisait dans le vide, et le
          // diagnostic accusait le matching alors que le probleme etait la
          // LECTURE. Repartir des que des candidats sont lisibles laisse le
          // matching (et son diagnostic) juger sur des donnees reelles.
          const cells = readCategoryResultCells(currentContent);
          if (cells.length === 0) return false;
          return cells.some((cell) => normalize(cell.title) === normalize(searchTerm)) || cells.length > 0;
        },
        {
          timeoutMs: CATEGORY_SEARCH_FILTER_TIMEOUT_MS,
          description: "readable category result cells appear after typed search text",
        }
      );
    } catch {
      // Signal inexploitable dans le delai imparti -- continue avec la
      // liste telle qu'elle est, le matching qui suit reste la garde reelle
      // (aucune valeur inventee dans tous les cas).
      docLog.warn("CATEGORY_SEARCH_FILTER_NOT_CONFIRMED", { field: CATEGORY_LABEL, searchTerm });
    }

    const matchingContent = document.querySelector<HTMLElement>(sel.CATEGORY_DROPDOWN_CONTENT_SELECTOR) ?? content;
    const read = readCategoryResultCellsDetailed(matchingContent);
    const cells = read.cells;
    docLog.info("PREFILL_CATEGORY_STEP", {
      field: CATEGORY_LABEL,
      step: "options_read_after_filter_attempt",
      // Quelle strategie a repondu : "cell_role_button" = le DOM est celui
      // documente ; toute autre valeur signale que Vinted a change son
      // balisage et que le selecteur de reference doit etre mis a jour.
      strategy: read.strategy,
      optionsCount: cells.length,
      titles: cells.map((cell) => cell.title),
      breadcrumbs: cells.map((cell) => cell.breadcrumb),
    });

    if (cells.length === 0) {
      // Photographie structurelle du conteneur reellement inspecte : sans
      // elle, on ne peut qu'essayer un selecteur de plus a l'aveugle. Emise
      // uniquement dans ce cas precis, jamais en fonctionnement normal.
      docLog.warn("CATEGORY_CONTAINER_SHAPE", {
        field: CATEGORY_LABEL,
        containerSelector: sel.CATEGORY_DROPDOWN_CONTENT_SELECTOR,
        usedFallbackContainer: matchingContent === content,
        ...describeCategoryContainer(matchingContent),
      });
    }

    const matchIndex = matchCategoryResult(cells, payload.category);
    if (matchIndex === null) {
      docLog.warn("PREFILL_CATEGORY", {
        label: CATEGORY_LABEL,
        value: payload.category,
        optionsCount: cells.length,
        outcome: "no_reliable_match",
      });
      docLog.warn("CATEGORY_MATCH_DIAGNOSTIC", { ...describeCategoryMatchAttempt(cells, payload.category) });
      document.body.click(); // ferme le picker sans rien selectionner
      return false;
    }

    const matched = cells[matchIndex];
    // dispatchFullClick et NON element.click() (2026-08-26, echec live sur la
    // republication : le panneau s'ouvrait, la recherche filtrait bien, mais
    // aucune sous-categorie ne se selectionnait).
    //
    // element.click() natif ne dispatch QUE "click" -- jamais pointerdown/
    // mousedown/pointerup/mouseup. C'est EXACTEMENT la panne deja diagnostiquee
    // et corrigee le 2026-07-25 sur le champ Marque (voir formFill.ts::
    // dispatchFullClick) : les composants du design system "core" de Vinted
    // ouvrent/valident frequemment sur mousedown, pas sur click. La Cell de
    // resultat categorie est un <div role="button"> du MEME design system, mais
    // etait restee sur le clic natif -- seul appel de ce genre encore en place
    // dans ce fichier.
    dispatchFullClick(matched.element);
    docLog.info("PREFILL_CATEGORY_STEP", {
      field: CATEGORY_LABEL,
      step: "option_clicked",
      clickMethod: "dispatchFullClick",
      matched: { title: matched.title, breadcrumb: matched.breadcrumb },
    });

    if (initialHadAnyAttributeTrigger) {
      docLog.warn("PREFILL_CATEGORY", { label: CATEGORY_LABEL, value: payload.category, outcome: "confirmation_signal_unusable" });
      return false;
    }

    try {
      await waitForCondition(() => hasAnyAttributeTrigger(readAttributeTriggerPresence(ATTRIBUTE_TRIGGER_SELECTORS)), {
        timeoutMs: CATEGORY_SELECTION_CONFIRM_TIMEOUT_MS,
        description: "attribute controls appear after automatic category selection",
      });
    } catch {
      docLog.warn("PREFILL_CATEGORY", {
        label: CATEGORY_LABEL,
        value: payload.category,
        matched: matched.title,
        outcome: "click_not_confirmed",
      });
      return false;
    }

    docLog.info("PREFILL_CATEGORY", {
      label: CATEGORY_LABEL,
      value: payload.category,
      matched: { title: matched.title, breadcrumb: matched.breadcrumb },
      outcome: "confirmed",
    });
    replaceManualPlaceholder(pending, CATEGORY_LABEL, null);
    confirmed.push(CATEGORY_LABEL);
    return true;
  } catch (err) {
    docLog.warn("PREFILL_CATEGORY", { label: CATEGORY_LABEL, value: payload.category, outcome: "error", error: errorMessage(err) });
    return false;
  }
}

// Mission "CLIC FINAL + CONFIRMATION POST-PUBLICATION" (2026-08-16) : preuve
// deja etablie sur le MEME composant Vinted (vinted-edit.ts::submitEdit,
// 2026-07-25, meme SAVE_BUTTON_SELECTOR "upload-form-save-button") -- un
// clic synthetique n'a JAMAIS declenche la vraie requete de sauvegarde,
// route protegee par un service anti-bot (reponse portant
// "x-datadome: protected") qui exige un evenement isTrusted:true. Decision
// deja actee de ne pas contourner cette protection -- ce script ne clique
// donc JAMAIS ce bouton. Il se contente de DETECTER de facon fiable que
// Vinted lui-meme considere le formulaire soumissible (bouton non-disabled,
// MEME lecture deja live-validee sur le formulaire d'edition :
// !saveButton.disabled && aria-disabled !== "true"), pour que l'app puisse
// inviter l'utilisateur a cliquer au bon moment plutot que de le laisser
// deviner.
//
// Source de verite volontairement UNIQUE : l'etat REEL du bouton Vinted,
// jamais `pending` (liste STATIQUE calculee une seule fois par
// reportPrefillSummary(), qui ne se met jamais a jour si l'utilisateur
// corrige ensuite lui-meme un champ ambigu directement sur Vinted --
// s'appuyer dessus ferait ne JAMAIS declencher ce signal dans le cas le
// plus courant, une correspondance automatique ratee puis corrigee a la
// main). Vinted connait ses propres champs reellement obligatoires pour LA
// categorie choisie ; ResellOS ne les devine pas.
// Mission "AUDIT DIVERGENCE READY_TO_SUBMIT" (2026-08-16) : preuve live --
// le formulaire Vinted etait reellement complet (bouton "Ajouter" visible et
// actif) mais PUBLISH_READY_TO_SUBMIT n'a jamais ete envoye. Cause la plus
// probable identifiee par relecture de code (jamais prouvee en live avant ce
// correctif, donc verifiable via les logs ci-dessous au prochain test) :
// l'ancienne version capturait `saveButton` UNE SEULE FOIS via
// waitForElement(), puis interrogeait cette MEME reference pour toujours --
// exactement la classe de bug deja rencontree et corrigee a plusieurs
// reprises ailleurs dans ce fichier (categorie, marque : "re-interroge le
// DOM a chaque evaluation, jamais une reference figee"). Si Vinted remplace
// le noeud du bouton lors d'un re-render (tres probable, son etat
// disabled/enabled depend de tout le formulaire), la reference capturee
// devient orpheline et son `.disabled` ne change plus jamais, meme si un
// NOUVEAU bouton, bien reel et actif, existe desormais dans le DOM live.
// Corrige en re-interrogeant `document.querySelector(SAVE_BUTTON_SELECTOR)`
// A CHAQUE evaluation, jamais une reference fixee en dehors du predicat.
//
// Instrumentation demandee explicitement (found/disabled/aria-disabled/
// texte/etat DOM a chaque check) : dedupliquee sur changement d'etat reel
// (meme discipline que checkAndLogDomState() pour la categorie) pour rester
// exploitable sans spam, mais capture bien CHAQUE etat distinct traverse.
function describeSaveButtonState(): SaveButtonState {
  const btn = document.querySelector<HTMLButtonElement>(sel.SAVE_BUTTON_SELECTOR);
  if (!btn) return { found: false, disabled: null, ariaDisabled: null, textContent: null };
  return {
    found: true,
    disabled: btn.disabled,
    ariaDisabled: btn.getAttribute("aria-disabled"),
    textContent: btn.textContent?.trim() ?? null,
  };
}

// Mission "REPUBLICATION VINTED : BUG PRIX + FAUX READY_TO_SUBMIT" (2026-08-16) :
// CAUSE CONFIRMEE en test live -- le bouton "Ajouter" (isSaveButtonReady
// seul) peut rester non-disabled alors que Vinted affiche encore une erreur
// de validation bloquante sur le prix ("24,00 €" reellement affiche, ET "Le
// champ prix doit être supérieur ou égal à 1.0" affiche simultanement).
// PUBLISH_READY_TO_SUBMIT n'est plus envoye sur le seul etat du bouton :
// isFormReallyReadyToSubmit() (publishReadiness.ts, pure/testee) exige EN
// PLUS que describePriceValidationState() (formFill.ts, MEME fonction que la
// confirmation de remplissage ci-dessus -- source unique de verite) ne
// rapporte aucune erreur reellement affichee sur le prix. Re-interroge le
// prix FRAICHEMENT a chaque evaluation (jamais une reference figee), meme
// discipline que le bouton lui-meme.
function checkPriceState(): PriceValidationState {
  return describePriceValidationState(document.querySelector<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR));
}

// Mission "ROUND READY UX" (2026-08-19) : intervalle de sondage utilise
// pour verifier la STABILITE de isFormReallyReadyToSubmit() (voir
// evaluateReadinessStability() dans publishReadiness.ts). Remplace l'ancien
// waitForCondition()/MutationObserver -- celui-ci ne se re-declenche que sur
// une mutation DOM, donc jamais capable a lui seul de detecter "rien n'a
// bouge depuis 750ms" (l'absence de mutation, une fois l'etat pret atteint,
// ne produirait plus aucune reevaluation). Un sondage periodique, largement
// plus fin que la fenetre de 750ms visee, est necessaire pour mesurer le
// temps ecoule independamment des mutations.
const READINESS_POLL_INTERVAL_MS = 100;

// Mission "SUBMIT AUTOMATIQUE -- REPUBLICATION" (2026-08-19) : isRepublish
// decide en amont (isRepublishPayload(payload), voir runPublishOnce) si la
// tentative automatique (publishAutoSubmit.ts) doit meme etre proposee --
// publish_listing (isRepublish:false) reste 100% clic humain, sans aucune
// exception, decision explicite de ce round.
async function watchForPublishReadiness(isRepublish: boolean): Promise<void> {
  let lastLoggedStateKey: string | null = null;
  function checkAndLogReadinessState(): {
    buttonState: SaveButtonState;
    priceState: PriceValidationState;
    photosImported: boolean | null;
    brandCommitConfirmed: boolean | null;
    colorCommitConfirmed: boolean | null;
    packageSizeCommitConfirmed: boolean | null;
  } {
    const buttonState = describeSaveButtonState();
    const priceState = checkPriceState();
    // Mission "FIABILISER L'IMPORT PHOTOS" (2026-08-17) : troisieme signal
    // OBLIGATOIRE, meme discipline que le prix -- `photoImportOutcome` est mis
    // a jour par injectPhotosWithConfirmation() (photoImportVerification.ts,
    // confirmedCount === expectedCount strictement). `null` (pas encore
    // termine) et un import echoue sont TOUS LES DEUX traites comme "pas
    // pret", jamais un succes suppose par defaut.
    const photosImported = photoImportOutcome === null ? null : photoImportOutcome.status === "confirmed";
    const stateKey = JSON.stringify({
      buttonState,
      priceState,
      photosImported,
      brandCommitConfirmed,
      colorCommitConfirmed,
      packageSizeCommitConfirmed,
    });
    if (stateKey !== lastLoggedStateKey) {
      lastLoggedStateKey = stateKey;
      docLog.info("SAVE_READINESS_STATE", {
        selector: sel.SAVE_BUTTON_SELECTOR,
        buttonState,
        priceState,
        photosImported,
        photoImportOutcome,
        brandCommitConfirmed,
        colorCommitConfirmed,
        packageSizeCommitConfirmed,
      });
    }
    return { buttonState, priceState, photosImported, brandCommitConfirmed, colorCommitConfirmed, packageSizeCommitConfirmed };
  }

  // Mission "ROUND READY UX" (2026-08-19) : isFormReallyReadyToSubmit()
  // elle-meme reste totalement inchangee (aucune condition metier touchee).
  // Ce qui change : PUBLISH_READY_TO_SUBMIT n'est plus envoye des la premiere
  // evaluation vraie, mais seulement une fois cette meme evaluation restee
  // vraie CONTINUELLEMENT pendant READINESS_STABILITY_WINDOW_MS (evaluateReadinessStability(),
  // publishReadiness.ts, pure/testee -- toute reevaluation fausse remet la
  // fenetre a zero). Objectif : rendre le highlight visuel qui suit (voir
  // watchAndHighlightSaveButton()) fiable, sans jamais toucher au clic
  // "Ajouter" lui-meme, qui reste et doit rester un vrai clic humain.
  let stability: ReadinessStabilityState = INITIAL_READINESS_STABILITY_STATE;
  const startedAt = Date.now();

  await new Promise<void>((resolve) => {
    function cleanup(): void {
      clearInterval(intervalId);
    }
    function tick(): void {
      const {
        buttonState,
        priceState,
        photosImported,
        brandCommitConfirmed: brandReady,
        colorCommitConfirmed: colorReady,
        packageSizeCommitConfirmed: packageSizeReady,
      } = checkAndLogReadinessState();
      // Mission "REPUBLICATION 100% UNATTENDED -- COMMIT MARQUE/COULEUR"
      // (2026-08-19) : isFormReallyReadyToSubmit() elle-meme reste
      // INCHANGEE (aucune condition metier retiree ni sa propre suite de
      // tests touchee) -- Marque/Couleur sont ajoutes ICI, au point d'appel,
      // exactement la meme discipline "signal supplementaire en couche" deja
      // utilisee pour photosImported (mission "FIABILISER L'IMPORT PHOTOS").
      // `null` (prefill Marque/Couleur pas encore termine) et `false`
      // (tentative faite, jamais confirmee -- y compris apres re-verification
      // post-fermeture) sont TOUS LES DEUX traites comme "pas pret" : seul
      // `true` explicite laisse passer. CAUSE CONFIRMEE en test live -- le
      // POST reel contenait brand_id:null/color_ids:[] malgre bouton+prix+
      // photos deja tous valides, preuve que ces 3 signaux seuls ne
      // suffisent structurellement pas.
      //
      // Mission "ROUND PRIX + COLIS -- CORRECTIF NaN" (2026-08-19) : meme
      // discipline exacte pour packageSizeReady -- CAUSE CONFIRMEE en test
      // live que la Taille du colis pouvait rester non confirmee
      // (`checkedAfterClick` jamais vrai, ou cellule jamais trouvee) sans que
      // rien ne bloque PUBLISH_READY_TO_SUBMIT/AUTO_SUBMIT_TRIGGERED.
      const isReadyNow =
        isFormReallyReadyToSubmit(buttonState, priceState, photosImported) &&
        brandReady === true &&
        colorReady === true &&
        packageSizeReady === true;
      const evaluation = evaluateReadinessStability(isReadyNow, Date.now(), stability);
      stability = evaluation.nextState;
      if (evaluation.isStable) {
        cleanup();
        publishReadyToSubmitConfirmed = true;
        docLog.info("PUBLISH_READY_TO_SUBMIT", checkAndLogReadinessState());
        chrome.runtime.sendMessage({ type: "PUBLISH_READY_TO_SUBMIT" });
        // Fire-and-forget, purement DOM/cosmetique -- jamais de clic
        // synthetique (voir en-tete de publishReadinessHighlight.ts). Reste
        // actif meme quand la tentative automatique ci-dessous a lieu : sert
        // de filet de secours si cette tentative echoue sa revalidation ou
        // n'aboutit pas (voir publishAutoSubmit.ts).
        watchAndHighlightSaveButton();
        // Mission "SUBMIT AUTOMATIQUE -- REPUBLICATION" (2026-08-19) :
        // republish_listing UNIQUEMENT (decision explicite de ce round,
        // isRepublish decide par l'appelant de watchForPublishReadiness).
        // Aucune nouvelle detection de succes/echec ici -- CAS A/B/C
        // (handlers/publishListing.ts) restent inchanges, voir l'audit.
        if (isRepublish) {
          attemptAutomaticRepublishSubmit({
            describeButtonState: describeSaveButtonState,
            describePriceState: checkPriceState,
            isPhotosImported: () => photoImportOutcome !== null && photoImportOutcome.status === "confirmed",
            log: docLog,
          });
        }
        resolve();
        return;
      }
      if (Date.now() - startedAt >= ATTRIBUTE_CONTROLS_WAIT_TIMEOUT_MS) {
        cleanup();
        docLog.warn("PUBLISH_READY_NOT_DETECTED", {
          error: `délai dépassé (${ATTRIBUTE_CONTROLS_WAIT_TIMEOUT_MS}ms)`,
          lastObservedState: checkAndLogReadinessState(),
        });
        resolve();
      }
    }
    const intervalId = setInterval(tick, READINESS_POLL_INTERVAL_MS);
    tick(); // etat initial, avant toute attente
  });
}

async function watchForCategorySelectionAndPrefillAttributes(
  payload: PublishListingPayload,
  confirmed: string[],
  pending: string[]
): Promise<void> {
  const categoryAutoSelected = await attemptCategoryPrefill(payload, confirmed, pending);
  let categoryDetected = categoryAutoSelected;
  if (categoryAutoSelected) {
    docLog.info("CATEGORY_AUTO_SELECTED", { category: payload.category || null });
  } else {
    categoryDetected = await waitForManualCategorySelectionAndConfirm(payload);
  }
  // Ni l'essai automatique ni l'attente manuelle n'ont detecte de selection
  // (timeout des 10 minutes atteint) -- s'arrete ici, exactement comme avant
  // cette mission (return immediat sur CATEGORY_SELECTION_NOT_DETECTED).
  // Sans cette garde, l'attente d'attributs ci-dessous rejouerait un second
  // timeout de 10 minutes pour rien (aucune categorie choisie => aucun
  // trigger d'attribut ne peut jamais apparaitre).
  if (!categoryDetected) return;

  // Que la categorie ait ete resolue automatiquement ou manuellement, cette
  // attente resout immediatement dans le premier cas (predicat deja vrai --
  // confirme a l'interieur d'attemptCategoryPrefill()) et se comporte
  // exactement comme avant dans le second (attente reelle jusqu'a ce que
  // l'utilisateur termine sa navigation manuelle).
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
  // Mission "MATIERE : MULTI-SELECT" (2026-08-16) : chemin DEDIE
  // (attemptMaterialPrefill) au lieu du reader generique -- preuve live
  // directe (diagnostic fourni par l'utilisateur, pas un script ResellOS)
  // que le conteneur reel est "category-material-multi-list-content"
  // (JAMAIS CATEGORY_DROPDOWN_CONTENT_SELECTOR, que l'ancien code reutilisait
  // a tort) et que Vinted accepte reellement PLUSIEURS matieres cochees
  // simultanement -- voir materialOptionReader.ts pour le detail complet de
  // cette preuve. `payload.materials` (tableau derive cote app, voir
  // src/lib/materials.ts::parseMaterials) est la source prioritaire ; repli
  // sur `payload.material` seul si `materials` est absent/vide --
  // retro-compatibilite avec tout appelant qui ne peuplerait pas encore ce
  // nouveau champ.
  //
  // Mission "MATIERE : BUG MATCHING" (2026-08-16) -- CAUSE EXACTE prouvee en
  // live : ce repli enveloppait auparavant `payload.material` BRUT (jamais
  // decoupe) dans un tableau a UN SEUL element -- si la chaine source
  // contenait deja plusieurs matieres jointes ("Coton, Polyester", ex. un
  // appelant pas encore aligne sur payload.materials), attemptMaterialPrefill()
  // ne recevait qu'UNE seule "matiere" logique ("Coton, Polyester" entier),
  // qui ne matchait evidemment aucune option Vinted reelle
  // (outcome:"no_reliable_match" confirme en direct). parseMaterials()
  // (./materials.ts, miroir de src/lib/materials.ts) est desormais applique
  // en DEFENSE sur CHAQUE element -- que la source soit deja un tableau
  // correctement scinde (cas nominal, flatMap devient un no-op par element)
  // OU le repli scalaire brut -- jamais suppose deja atomique.
  const requestedMaterials = dedupeMaterialsCaseInsensitive(
    payload.materials && payload.materials.length > 0
      ? payload.materials.flatMap((m) => parseMaterials(m))
      : parseMaterials(payload.material)
  );
  await attemptMaterialPrefill(
    {
      logName: "PREFILL_MATERIAL",
      label: "Matière",
      triggerSelector: sel.MATERIAL_LIST_TRIGGER_SELECTOR,
      contentSelector: sel.MATERIAL_LIST_CONTENT_SELECTOR,
      materials: requestedMaterials,
    },
    confirmed,
    pending
  );

  docLog.info("ATTRIBUTE_PREFILL_SUMMARY", { confirmed, pending });
  reportPrefillSummary(confirmed, pending);
}

// Mission "CORRIGER LA DETECTION POST-SELECTION MANUELLE DE CATEGORIE"
// (2026-08-12), extraite telle quelle de watchForCategorySelectionAndPrefillAttributes()
// (2026-08-16) pour isoler l'attente manuelle du nouvel essai automatique
// qui la precede desormais -- AUCUN changement de comportement ici, meme
// logique, memes logs, meme timeout. Renvoie desormais un booleen (detection
// reussie ou non) plutot que rien, pour que l'appelant sache s'il doit
// enchainer sur l'attente des attributs ou s'arreter net (voir son en-tete).
async function waitForManualCategorySelectionAndConfirm(payload: PublishListingPayload): Promise<boolean> {
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
    return false;
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
  // L'attente de "au moins un trigger d'attribut" et la suite (Etat/Taille/
  // Marque/Couleur/Matiere) vivent desormais dans l'appelant
  // (watchForCategorySelectionAndPrefillAttributes()) -- commune aux deux
  // chemins (auto ET manuel), voir son en-tete.
  return true;
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
        // Mission "FIABILISER L'IMPORT PHOTOS" (2026-08-17) : etat REEL au
        // sens du nouvel invariant (confirmedCount === expectedCount sur les
        // vignettes Vinted, pas seulement "des fichiers ont ete envoyes") --
        // voir photoImportVerification.ts. `success` ci-dessus reste derive
        // de la MEME source de verite (confirmed.push ne se produit que sur
        // outcome.status==="confirmed").
        importOutcome: photoImportOutcome,
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

    // Mission "ROUND PRIX + COLIS -- FIX ORDRE FLOW COLIS" (2026-08-20) :
    // CAUSE CONFIRMEE en test live -- PACKAGE_SIZE_SELECT_CELLS_NOT_FOUND
    // (timeout 20000ms) en mode background, alors que le DOM contenait
    // reellement la cellule une fois la page rendue (preuve live directe :
    // 1-package-size--cell present, package_type_selector_1--input
    // checked:true, recommended:true). L'hypothese precedente ("Chromium
    // depriorise le rendu des onglets background", voir l'ancien commentaire
    // au-dessus de PACKAGE_SIZE_CELLS_TIMEOUT_MS) est donc INVALIDEE par
    // cette preuve -- la vraie cause est un bug d'ORDRE : selectPackageSizeWithConfirmation()
    // etait AWAITED ICI, AVANT MEME que watchForCategorySelectionAndPrefillAttributes()
    // (qui pilote attemptCategoryPrefill() puis les 5 pickers d'attributs) ne
    // soit invoquee -- elle vivait plus bas, en fire-and-forget ("void"),
    // demarree SEULEMENT APRES le retour (succes ou timeout) du colis. Or le
    // widget colis, exactement comme les 5 pickers d'attributs (voir l'en-tete
    // de ce fichier), n'existe dans le DOM qu'apres qu'une categorie FEUILLE
    // soit choisie -- attendre le colis avant meme que la resolution de
    // categorie ait commence est structurellement voue a l'echec, quel que
    // soit le timeout choisi. En foreground, cela passait probablement
    // inapercu : l'utilisateur, en observant l'onglet, choisissait souvent la
    // categorie a la main PENDANT l'import photos (qui peut prendre plusieurs
    // secondes) -- aucune fenetre equivalente n'existe en mode background
    // (personne ne regarde ni n'agit sur l'onglet). Desormais AWAITED ici,
    // dans l'ordre demande explicitement : categorie/attributs resolus (auto
    // ou manuel, y compris l'echec/timeout de cette resolution -- safe a
    // attendre, chaque attempt*Prefill() interne catch deja ses propres
    // erreurs et ne rejette jamais) AVANT toute tentative de lecture/
    // selection du colis.
    await watchForCategorySelectionAndPrefillAttributes(payload, confirmed, pending);

    await selectPackageSizeWithConfirmation(payload, confirmed, pending);

    pending.push(...computeManualFields(payload));
    reportPrefillSummary(confirmed, pending);

    // Mission "CLIC FINAL + CONFIRMATION POST-PUBLICATION" (2026-08-16) :
    // demarre en fire-and-forget ("void") -- se contente d'attendre que le
    // bouton Vinted lui-meme devienne cliquable, quelle que soit la facon
    // dont le formulaire y arrive (automatise ou entierement corrige a la
    // main par l'utilisateur). Voir son en-tete pour le detail.
    // isRepublishPayload() (publishAutoSubmit.ts) decide ICI, une seule fois,
    // si la tentative de submit automatique doit meme etre proposee plus bas
    // dans watchForPublishReadiness() -- publish_listing (false) en est
    // exclu par construction.
    void watchForPublishReadiness(isRepublishPayload(payload));

    // A partir d'ici, plus aucune ecriture DOM synchrone ni aucun clic
    // automatique garanti -- l'utilisateur termine lui-meme les eventuels
    // champs restes en manuel, puis clique reellement sur le bouton de
    // soumission Vinted. handlePublishListing.ts (background) surveille la
    // navigation reelle de l'onglet pour detecter une reussite authentique ;
    // ce content script n'a rien d'autre a faire de bloquant.
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
  // Mission "DIAGNOSTIC INJECTION/PACKAGING" (2026-08-16) : point de repere
  // MINIMAL confirmant que ce fichier a reellement ete execute -- distinct de
  // PUBLISH_TAB_READY_SENT plus bas (qui suppose deja que l'enregistrement du
  // listener a reussi). Utile pour distinguer "le fichier ne s'est jamais
  // charge du tout" (aucun log ici) de "charge mais bloque avant l'envoi".
  docLog.info("PUBLISH_CONTENT_SCRIPT_BOOTING", { href: location.href, documentInstanceId: DOCUMENT_INSTANCE_ID });
  // Mission "ROUND SUIVANT -- POC DIAGNOSTIQUE DIRECT DU BOUTON AJOUTER"
  // (2026-08-19) : no-op en dehors d'un build DEV (voir en-tete de
  // publishSyntheticClickPoc.ts) -- n'expose jamais rien dans un build
  // production/beta reellement distribue.
  initPublishSyntheticClickPoc({
    isReadinessConfirmed: () => publishReadyToSubmitConfirmed,
    describeButtonState: describeSaveButtonState,
    describePriceState: checkPriceState,
    log: docLog,
  });
  // Mission "ROUND DIAGNOSTIC MARQUE/COULEUR -- COMMIT REEL" (2026-08-19) :
  // meme discipline d'isolation que le POC ci-dessus -- window.
  // __resellosRecordAttributeCommitEvents("brand"|"color", windowMs?),
  // jamais auto-declenche, purement observationnel.
  initAttributeCommitEventRecorder({ log: docLog });
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

  // Mission "AUTOMATISER ENTIEREMENT LA REPUBLICATION" (2026-08-17) :
  // relais PUREMENT DIAGNOSTIQUE et temporaire -- publishCreateResponseCapture.ts
  // (injecte separement, monde MAIN, voir handlePublishListing.ts) dispatche
  // cet evenement CustomEvent sur `document` des qu'il observe une vraie
  // reponse de POST /api/v2/item_upload/items ; ce content script (monde
  // ISOLATED, meme document) peut l'ecouter -- mecanisme standard de pont
  // MAIN<->ISOLATED. Relaye tel quel au background pour journalisation
  // uniquement, aucune decision metier ne depend encore de cet evenement.
  // Mission "INJECTION DU PRIX DANS LE PAYLOAD" (2026-08-26) : toute
  // substitution faite par le patch du monde MAIN est journalisee ICI, en
  // clair. Une modification de requete sortante ne doit jamais etre
  // silencieuse -- si ce log n'apparait pas, aucun payload n'a ete touche.
  document.addEventListener(PRICE_PAYLOAD_PATCHED_EVENT, (event) => {
    const detail = (event as CustomEvent<Record<string, unknown>>).detail;
    let inline: string;
    try {
      inline = JSON.stringify(detail);
    } catch {
      inline = String(detail);
    }
    docLog.warn(`PRICE_PAYLOAD_PATCHED ${inline}`, detail);
  });

  document.addEventListener(PUBLISH_CREATE_RESPONSE_EVENT_NAME, (event) => {
    const detail = (event as CustomEvent<PublishCreateResponseCapture>).detail;
    // Mission "PAYLOAD DU PRIX" (2026-08-26) : deux manques rendaient ce log
    // inexploitable pour diagnostiquer le 400.
    //   1. `bodyText` (le corps de la REPONSE, donc le message d'erreur exact
    //      du serveur) n'etait envoye qu'au background -- absent d'ici.
    //   2. Le detail partait en second argument console, donc en objet
    //      depliable dont la reference meurt avec l'onglet (meme probleme que
    //      la sonde prix). Il est desormais serialise DANS le message.
    // `pricePayload` extrait toutes les cles evoquant un prix du body envoye :
    // c'est la preuve directe de ce que Vinted a recu, plutot qu'une deduction
    // depuis l'erreur affichee.
    const captureDetail = {
      url: detail.url,
      statusCode: detail.statusCode,
      ok: detail.ok,
      transport: detail.transport,
      requestMethod: detail.requestMethod,
      requestContentType: detail.requestContentType,
      requestBodyType: detail.requestBodyType,
      pricePayload: summarizePricePayload(detail.requestBodyText),
      responseBodyText: detail.bodyText,
      requestBodyText: detail.requestBodyText,
    };
    let captureInline: string;
    try {
      captureInline = JSON.stringify(captureDetail);
    } catch {
      captureInline = String(captureDetail);
    }
    docLog.info(`PUBLISH_CREATE_RESPONSE_EVENT_RECEIVED ${captureInline}`, captureDetail);
    chrome.runtime.sendMessage({
      type: "PUBLISH_CREATE_RESPONSE_CAPTURED",
      url: detail.url,
      statusCode: detail.statusCode,
      ok: detail.ok,
      bodyText: detail.bodyText,
      transport: detail.transport,
      requestMethod: detail.requestMethod,
      requestContentType: detail.requestContentType,
      requestBodyText: detail.requestBodyText,
      requestBodyType: detail.requestBodyType,
    });
  });

  // Mission "AUTOMATISER ENTIEREMENT LA REPUBLICATION" (2026-08-17), audit
  // post-echec du 1er test live : verifie l'attribut DOM pose par
  // publishCreateResponseCapture.ts (installe en document_start, monde
  // MAIN -- voir manifest.config.ts) pour distinguer, au prochain test,
  // "instrumentation jamais installee" (attribut absent, ex. build pas
  // rechargee, entree manifest cassee) de "installee mais transport non
  // intercepte" (attribut present, mais toujours 0 capture). document_idle
  // survient TOUJOURS apres document_start, donc aucune course possible
  // ici -- contrairement a un CustomEvent, un attribut DOM persiste et peut
  // etre lu a tout moment sans destinataire deja enregistre au prealable.
  const createCaptureInstalled = document.documentElement.hasAttribute(PUBLISH_CREATE_RESPONSE_CAPTURE_INSTALLED_ATTR);
  // Mission "DIAGNOSTIC CAPTURE_MISSING" (2026-08-24) : url/documentInstanceId/
  // readyState remontes AVEC le statut -- purement diagnostic, aucun
  // changement de comportement. Permet au prochain test reel de savoir sur
  // QUEL document l'attribut manquait (meme instance de document que le
  // premier remplissage, ou une nouvelle ?).
  const captureStatusContext = {
    url: location.href,
    documentInstanceId: DOCUMENT_INSTANCE_ID,
    readyState: document.readyState,
  };
  docLog.info("PUBLISH_CREATE_RESPONSE_CAPTURE_STATUS_CHECKED", { installed: createCaptureInstalled, ...captureStatusContext });
  chrome.runtime.sendMessage({
    type: "PUBLISH_CREATE_RESPONSE_CAPTURE_STATUS",
    installed: createCaptureInstalled,
    ...captureStatusContext,
  });

  // Signal de disponibilite (voir commentaire ci-dessus) -- envoye juste
  // apres l'enregistrement du listener, pour que handlePublishListing.ts
  // sache exactement quand il est sur d'obtenir une reponse, plutot que de
  // deviner via un retry aveugle a duree fixe.
  chrome.runtime.sendMessage({ type: "PUBLISH_TAB_READY", documentInstanceId: DOCUMENT_INSTANCE_ID });
  docLog.info("PUBLISH_TAB_READY_SENT", { href: location.href });
}
