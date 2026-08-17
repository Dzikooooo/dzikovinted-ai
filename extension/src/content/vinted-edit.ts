// Injecte sur https://www.vinted.fr/items/{id}/edit (voir
// manifest.config.ts). Modification d'une annonce EXISTANTE (Partie 4,
// sprint extension V1) : remplit uniquement les champs texte/attributs
// (titre+SKU deja concatene par l'appelant, description, prix, categorie,
// marque, taille, etat, couleur, matiere) -- AUCUNE photo (limite V1
// validee avec l'utilisateur, le widget photo du formulaire d'edition
// n'est pas verifie en direct). Toujours declenche par une commande
// explicite (bouton "Enregistrer et mettre a jour sur Vinted" dans
// ResellOS), jamais d'initiative propre.
//
// URL /items/{id}/edit confirmee en direct le 2026-07-13 (redirection avec
// ref_url preserve pour un visiteur non authentifie -- la route existe
// reellement). Le CONTENU du formulaire (selecteurs) n'a en revanche pas pu
// etre verifie sans authentification comme proprietaire de l'annonce :
// reutilise les selecteurs de publishSelectors.ts par hypothese (meme
// composant Vinted que la creation) -- a reconfirmer lors du premier test
// live reel (voir EXTENSION.md).
//
// DECISION D'ARCHITECTURE (2026-07-25, validation reelle en conditions de
// production, diagnostic complet -- voir EXTENSION.md pour le detail) : la
// soumission reste un CLIC MANUEL de l'utilisateur, pas une automatisation
// silencieuse. Preuves accumulees au fil du diagnostic :
// - Un clic synthetique (element.click(), puis sequence complete pointerdown
//   -> mousedown -> pointerup -> mouseup -> click) atteint bien document
//   (confirme) mais ne declenche jamais la requete de sauvegarde.
// - La vraie requete (PUT https://www.vinted.fr/api/v2/item_upload/items/{id})
//   n'a ete capturee qu'apres un clic REEL (isTrusted:true) -- coherent avec
//   un handler cote Vinted qui exige un evenement de confiance.
//   Reponse retournee avec l'en-tete "x-datadome: protected" (le seul appel
//   de toute la session a porter cet en-tete) -- cette route est
//   explicitement protegee par un service anti-bot. Rejouer cette requete
//   depuis l'extension reviendrait a tenter de contourner cette protection,
//   ce que l'utilisateur a explicitement decide de ne pas faire pour
//   l'instant. Un chantier dedie a l'automatisation silencieuse pourra
//   rouvrir cette question une fois la beta stabilisee.
// L'onglet d'edition s'ouvre donc au premier plan (voir handleEditListing.ts,
// active:true) et le pipeline attend un clic reel de l'utilisateur sur
// "Valider" (voir WAITING_FOR_MANUAL_CLICK dans submitEdit()).

import { waitForElement, waitForCondition, WaitTimeoutError, describeTimeout } from "./domWait";
import * as sel from "./publishSelectors";
import {
  PublishError,
  parsePriceToNumber,
  resolveCategory,
  selectMatchingOption,
  setNativeValue,
  typeIntoPriceField,
  verifyLoggedInAccount,
} from "./formFill";
import { isContentCommand } from "../lib/messages";
import type { EditListingPayload, EditableFieldName, PublishStep, RunActionOutcome, VerifyEditFieldsPayload } from "../lib/messages";
import { errorMessage } from "../lib/errorMessage";
// logger (2026-07-22, demande explicite -- audit branche titre) : le
// content script tourne dans la page Vinted, son console.log n'est visible
// que dans les DevTools DE CET ONGLET, ouvertes exactement au bon moment --
// s'est avere a plusieurs reprises trop difficile a capturer en temps utile.
// chrome.storage.local (permission "storage" deja accordee) est accessible
// depuis un content script exactement comme depuis le service worker --
// reutilise directement le meme logger PERSISTE (chrome.storage.local, cle
// "resellos_log") plutot que d'inventer un second mecanisme : un seul point
// de lecture (chrome.storage.local.get('resellos_log')) couvre desormais
// AUSSI les etapes du content script, pas seulement celles du background.
import { logger } from "../background/logger";

// Journalisation par etape avec l'identifiant d'action unique (demande
// utilisateur, 2026-07-13/14, diagnostic prix non reporte sur Vinted) --
// prefixe "[ResellOS][Edit]" (+ historyId quand connu) pour correler avec
// les logs du background/de l'app pour le meme run. `console.log` (pas le
// logger de l'extension, reserve au background/service worker) : ce
// fichier tourne dans le contexte de la page Vinted elle-meme, visible
// dans les DevTools DE CET ONGLET PRECIS (pas celui du service worker, ni
// celui de l'app ResellOS) -- point de confusion possible lors du
// diagnostic du 2026-07-14 ("chrome-extension://invalid/" en boucle sans
// aucun log [ResellOS][Edit] visible).
function log(historyId: string | undefined, message: string, detail?: unknown): void {
  const tag = historyId ? `[ResellOS][Edit][${historyId}]` : "[ResellOS][Edit]";
  console.log(tag, message, detail ?? "");
}

// Marqueurs d'etape correles au schema de pipeline demande explicitement
// le 2026-07-15 -- prefixe grep-able [PIPELINE], horodatage relatif au
// chargement du script pour mesurer precisement ou le temps passe.
const scriptBootAt = performance.now();
function stage(historyId: string | undefined, name: string, detail?: unknown): void {
  const elapsedMs = Math.round(performance.now() - scriptBootAt);
  console.log(`[ResellOS][PIPELINE][${historyId ?? "?"}] ${name} (+${elapsedMs}ms)`, detail ?? "");
}

// Etiquettes EXACTES demandees le 2026-07-16 pour l'audit du comportement
// DANS la page Vinted apres reception de EDIT_LISTING (EDIT_RECEIVED,
// FORM_FOUND, PRICE_FIELD_FOUND, PRICE_SET, SAVE_BUTTON_FOUND,
// SAVE_CLICKED, SAVE_CONFIRMED -- INPUT_EVENT/CHANGE_EVENT/BLUR_EVENT
// sont loguees directement dans formFill.ts::setNativeValue, seul endroit
// qui declenche reellement ces evenements). Prefixe [STEP], distinct de
// [PIPELINE]/[Edit] deja existants -- but unique : reponse deterministe a
// "quelle est la premiere etape qui ne se produit jamais", jamais une
// reformulation des logs deja presents.
function mark(historyId: string | undefined, tag: string, detail?: unknown): void {
  console.log(`[ResellOS][STEP][${historyId ?? "?"}] ${tag}`, detail ?? "");
}

// Le champ prix affiche une valeur FORMATEE par Vinted (ex: "98,00 €"),
// jamais la chaine brute envoyee ("98") -- une comparaison d'egalite de
// chaines serait donc toujours fausse meme apres une ecriture/sauvegarde
// parfaitement reussie. Normalise les deux cotes en nombre avant de
// comparer (utilise a la fois pour la confirmation d'ecriture juste apres
// la frappe, et pour la verification post-sauvegarde reelle).
// isBrandLocked (2026-07-25, cause racine reelle du 2e echec confirme sur le
// champ marque) : Vinted affiche le bandeau natif "Certaines marques ne
// peuvent être modifiées qu'en supprimant et en ajoutant à nouveau
// l'article." sur CETTE annonce -- observe directement par l'utilisateur
// dans l'onglet reel apres le correctif dispatchFullClick (qui reste
// correct pour le MECANISME d'ouverture, voir formFill.ts, mais un champ
// verrouille cote Vinted ne reagit a aucune sequence de clic). Deux signaux
// redondants, aucun ne necessitant un nouveau releve manuel de data-testid :
// l'etat disabled/aria-disabled du trigger, et la presence litterale du
// texte d'avertissement Vinted (normalise pour tolerer apostrophe courbe vs
// droite) n'importe ou dans la page.
function isBrandLocked(): boolean {
  const trigger = document.querySelector<HTMLInputElement>(sel.BRAND_DROPDOWN_TRIGGER_SELECTOR);
  const triggerDisabled = !!trigger && (trigger.disabled === true || trigger.getAttribute("aria-disabled") === "true");
  const bodyText = (document.body.textContent ?? "").replace(/[‘’]/g, "'");
  const noticeVisible = bodyText.includes("peuvent être modifiées qu'en supprimant");
  return triggerDisabled || noticeVisible;
}

// Log inconditionnel, tout premier statement execute par ce module --
// s'il n'apparait PAS dans la console de l'onglet Vinted d'edition, le
// content script lui-meme n'a jamais ete injecte/execute (probleme de
// pattern matching manifest ou de chargement du chunk CRXJS), distinct
// d'un probleme "message jamais recu" (ou le script tourne mais
// n'entend rien).
console.log("[ResellOS][Edit] content script loaded", { url: location.href, at: new Date().toISOString() });
stage(undefined, "content_script_injected (injection declarative document_idle)");

// Garde d'idempotence (2026-07-15, cause racine #2) : handleEditListing.ts
// peut desormais REINJECTER explicitement ce script via
// chrome.scripting.executeScript une fois la navigation reellement
// terminee (voir son commentaire d'en-tete), en plus de l'injection
// declarative normale. Si les deux atterrissent sur le MEME document
// (cas frequent quand il n'y a pas eu de redirection reelle), n'enregistre
// le listener et n'envoie EDIT_TAB_READY qu'une seule fois -- deux
// listeners actifs risqueraient de declencher runEdit() deux fois en
// parallele (double soumission).
const globalScope = window as unknown as { __resellosEditBooted?: boolean };
if (globalScope.__resellosEditBooted) {
  console.log("[ResellOS][Edit] deja demarre dans ce document (reinjection ignoree, listener existant conserve)");
} else {
  globalScope.__resellosEditBooted = true;
  bootEditContentScript();
}

function reportProgress(step: PublishStep): void {
  chrome.runtime.sendMessage({ type: "PUBLISH_PROGRESS", step });
}

function reportResult(outcome: RunActionOutcome): void {
  chrome.runtime.sendMessage({ type: "PUBLISH_RESULT", outcome });
}

// INSTRUMENTATION (2026-07-18, demande explicite) : compteur d'invocations
// de runEdit() PAR DOCUMENT. __resellosEditBooted garantit un seul
// enregistrement de listener par document, mais NE garantit PAS qu'un
// document deja booted ne recoive/traite pas une SECONDE commande
// EDIT_LISTING (ex. un EDIT_TAB_READY duplique cote background qui
// redeclenche attemptSend() alors que le premier runEdit() tourne encore).
// Un compteur > 1 ici serait la preuve directe d'un double-declenchement,
// ce qui expliquerait a la fois le "message port closed" (sur le premier
// envoi, dont ce document a fini par etre remplace) ET le timeout
// waitForElement rapporte ensuite (le second essai tournant sur un
// document deja navigue hors du formulaire).
let runEditInvocationCount = 0;

async function submitEdit(historyId: string | undefined, vintedItemId: string): Promise<{ vintedItemId: string; vintedUrl: string }> {
  // Hypothese : le formulaire d'edition partage le meme bouton de
  // sauvegarde que la creation -- a reconfirmer en test live (peut-etre
  // "Enregistrer" plutot que "Ajouter" sur l'edition).
  const saveButton = await waitForElement<HTMLButtonElement>(sel.SAVE_BUTTON_SELECTOR);
  mark(historyId, "SAVE_BUTTON_FOUND", { disabled: saveButton.disabled, text: saveButton.textContent });
  logger.info(`[${historyId}] SAVE_BUTTON_FOUND`, { disabled: saveButton.disabled, text: saveButton.textContent });
  log(historyId, "bouton de sauvegarde trouve", { disabled: saveButton.disabled, text: saveButton.textContent });
  await waitForCondition(() => !saveButton.disabled && saveButton.getAttribute("aria-disabled") !== "true", {
    description: "bouton de sauvegarde devient cliquable (non disabled)",
  });
  log(historyId, "bouton de sauvegarde pret (non disabled), en attente du clic utilisateur");

  // Soumission par clic MANUEL de l'utilisateur (decision d'architecture du
  // 2026-07-25, voir commentaire d'en-tete du fichier) : un clic synthetique
  // n'a jamais declenche la requete de sauvegarde de Vinted (route protegee
  // par un service anti-bot, confirme en test reel) -- l'onglet est ouvert
  // au premier plan (handleEditListing.ts, active:true) et ce pipeline
  // attend simplement que l'utilisateur clique lui-meme sur "Valider".
  mark(historyId, "WAITING_FOR_MANUAL_CLICK");
  logger.info(`[${historyId}] WAITING_FOR_MANUAL_CLICK`, {
    instruction: "Clique maintenant sur le bouton Valider dans cet onglet (jusqu'a 60s)",
  });
  stage(historyId, "waiting_for_manual_click");
  log(historyId, "en attente d'un clic utilisateur sur Valider (jusqu'a 60s)");

  // CAUSE RACINE demontree en test reel le 2026-07-16 ("faux succes",
  // ResellOS revenu a l'ancien prix apres coup) : l'ancien predicat
  // /\/items\/\d+/ n'excluait PAS "/edit" -- il matchait donc DEJA l'URL
  // de depart /items/{id}/edit des le tout premier essai synchrone de
  // waitForCondition (avant meme que le clic ait pu produire un effet),
  // faisant passer SAVE_CLICKED pour une confirmation instantanee sans
  // qu'aucune sauvegarde reelle n'ait pu avoir lieu. Corrige : exclut
  // explicitement "/edit". IMPORTANT : meme corrige, cette navigation
  // seule n'est PAS une preuve suffisante ("un simple clic sur Enregistrer
  // ne suffit pas", demande explicite) -- runEdit() ne rapporte plus de
  // succes ici, seulement EDIT_SAVE_SUBMITTED ; la verification reelle
  // (relecture de la valeur) a lieu dans une PHASE SEPAREE orchestree par
  // handleEditListing.ts (voir son commentaire d'en-tete).
  //
  // CAUSE RACINE #2 demontree en test reel le 2026-07-18 (instrumentation
  // background tab_updated, prix reellement confirme a 93 sur Vinted) :
  // apres sauvegarde, Vinted redirige en realite vers /member/{userId}
  // (le profil du vendeur), PAS vers /items/{id} comme suppose ici depuis
  // le debut -- l'ancien predicat ne matchait donc JAMAIS cette
  // destination reelle. Pire : c'est une VRAIE navigation de haut niveau
  // (deux cycles Loading->complete distincts observes cote background),
  // qui detruit entierement ce document et l'execution de runEdit() en
  // cours AVANT que son propre timeout de 20000ms n'ait pu se declencher
  // -- aucune exception, aucun message, rien n'est jamais envoye. Cote
  // background, ca se voit comme un delai global de 120000ms sans le
  // moindre message intermediaire (editListingDispatchCount:1,
  // verifyFieldsDispatchCount:0, finalPhase:"editing"). Corrige en
  // acceptant desormais aussi /member/\d+ comme preuve de navigation
  // reelle hors du formulaire.
  // timeoutMs porte a 60000ms (2026-07-25) : l'ancien 20000ms etait
  // dimensionne pour un clic automatique quasi instantane -- avec un clic
  // utilisateur reel, il faut laisser le temps de remarquer l'onglet et
  // de cliquer.
  await waitForCondition(
    () => {
      const path = location.pathname;
      return !path.includes("/edit") && (/\/items\/\d+/.test(path) || /\/member\/\d+/.test(path));
    },
    {
      timeoutMs: 60000,
      description:
        "navigation hors de /edit apres le clic utilisateur sur Valider (vers l'article ou le profil vendeur -- PAS une preuve de sauvegarde reelle, juste que Vinted a redirige)",
    }
  );
  stage(historyId, "navigation_away_from_edit_detected", { pathname: location.pathname });
  log(historyId, "navigation hors de /edit detectee (pas encore une preuve de sauvegarde reelle)", { pathname: location.pathname });

  // vintedItemId connu depuis le payload, jamais re-derive de l'URL de
  // destination : la redirection reelle vers /member/{userId} ne porte
  // plus l'id de l'article dans son chemin, contrairement a l'ancienne
  // hypothese -- inutile et desormais impossible de le re-extraire d'une
  // URL qui ne le contient pas forcement.
  return { vintedItemId, vintedUrl: `https://www.vinted.fr/items/${vintedItemId}` };
}

async function runEdit(payload: EditListingPayload): Promise<void> {
  const historyId = payload.historyId;
  runEditInvocationCount += 1;
  mark(historyId, "RUN_EDIT_INVOKED", { runEditInvocationCount, url: location.href });
  if (runEditInvocationCount > 1) {
    console.error(
      `[ResellOS][Edit] ALERTE : runEdit() invoque ${runEditInvocationCount} fois dans ce meme document -- double declenchement confirme`,
      { historyId, url: location.href }
    );
  }
  const changed = new Set<EditableFieldName>(payload.changedFields);
  function isChanged(field: EditableFieldName): boolean {
    return changed.has(field);
  }
  function skip(field: EditableFieldName): void {
    mark(historyId, `${field.toUpperCase()}_SKIPPED (non modifie)`);
    log(historyId, `champ "${field}" non modifie, ignore (aucune attente DOM)`);
  }

  log(historyId, "runEdit demarre", {
    vintedItemId: payload.vintedItemId,
    price: payload.price,
    changedFields: payload.changedFields,
    url: location.href,
  });
  try {
    reportProgress("connecting");
    // BUG REEL confirme le 2026-07-16 en auditant action_log directement :
    // les 3 tentatives reelles suivant le correctif du champ prix ont TOUTES
    // echoue ici (current_step: "connecting"), avant meme d'ecrire quoi que
    // ce soit -- le delai par defaut (8000ms) est insuffisant pour le tout
    // premier chargement d'un onglet fraichement cree (chrome.tabs.create +
    // injection declarative + hydratation Vinted), contrairement a une page
    // deja ouverte. Porte a 20000ms, coherent avec les autres attentes de
    // chargement de ce fichier (submitEdit, handleVerifyEditFields).
    //
    // FAUX ECHEC demontre le 2026-07-17 (Vinted et ResellOS confirmes tous
    // deux a 96 euros malgre un message d'echec) : title--input reste plus
    // lent/instable a apparaitre que les autres champs sur cette page --
    // meme corrige a 20000ms, l'attendre INCONDITIONNELLEMENT (y compris
    // pour une edition prix-seul, ou le titre n'est jamais touche) restait
    // un point de defaillance evitable. "price only -> attendre uniquement
    // price-input, jamais title-input" (demande explicite) : le signal de
    // "formulaire pret" utilise desormais le champ REELLEMENT modifie
    // (meme logique deja appliquee a handleVerifyEditFields), pas un champ
    // fixe non lie a l'edition en cours.
    const formReadySelector = isChanged("price")
      ? sel.PRICE_INPUT_SELECTOR
      : isChanged("title")
        ? sel.TITLE_INPUT_SELECTOR
        : isChanged("description")
          ? sel.DESCRIPTION_INPUT_SELECTOR
          : sel.TITLE_INPUT_SELECTOR;
    // Delai porte a 30000ms (2026-07-18), mesure en direct plutot que
    // devine : sur cette page, le HTML/DOM finit de charger tres vite
    // (domComplete ~1s) mais le champ prix n'apparait reellement qu'apres
    // ~8.8s (l'app cote client doit d'abord recuperer les donnees de
    // l'annonce existante avant de rendre le formulaire pre-rempli) --
    // confirme par mesure directe (sessionStorage horodatant un reload,
    // independant de toute latence d'outillage). ~9s de baseline sur un
    // budget de 20s ne laissait quasiment aucune marge face a la variance
    // reelle de Vinted (charge, reseau) -- explique les echecs
    // intermittents observes. waitForElement() resout DES que le champ
    // apparait (MutationObserver, jamais un sleep fixe) -- 30000ms est un
    // PLAFOND de securite absorbant la variance, pas une attente
    // supplementaire : un cas normal (~9s) continue de resoudre en ~9s.
    await waitForElement(formReadySelector, { timeoutMs: 30000 });
    mark(historyId, "FORM_FOUND", { formReadySelector });
    stage(historyId, "form_detected", { formReadySelector });
    log(historyId, "champ de reference detecte, page consideree chargee", { formReadySelector });
    await verifyLoggedInAccount(payload.expectedVintedUsername);
    log(historyId, "compte connecte verifie", { expected: payload.expectedVintedUsername });

    reportProgress("filling_form");

    // BUG REEL trouve en test reel le 2026-07-16 : un simple changement de
    // prix declenchait quand meme resolveCategory() (et toutes les autres
    // selections d'attributs), qui ouvrait le panneau categorie et
    // attendait son contenu -- jamais necessaire pour ce champ, jamais
    // rempli sur l'edit page ou la categorie est deja definie. Chaque
    // champ est desormais traite UNIQUEMENT s'il figure dans
    // payload.changedFields ; sinon aucune attente DOM n'est declenchee du
    // tout pour ce champ (juste un log explicite).
    //
    // try/catch DEDIE au remplissage (2026-07-25, mode diagnostic minimal --
    // demande explicite suite a l'echec du champ marque) : distinct du
    // catch englobant plus bas, qui continue de couvrir FORM_FOUND/
    // verifyLoggedInAccount et submitEdit() sans aucun changement. Un echec
    // ICI precis (avant tout clic sur "Valider") ne rapporte plus
    // PUBLISH_RESULT -- il envoie EDIT_FIELD_FILL_FAILED, le seul signal qui
    // indique a handleEditListing.ts de laisser l'onglet Vinted ouvert
    // plutot que de le fermer, pour permettre l'inspection manuelle du DOM
    // reel (ex. le vrai data-testid du conteneur d'options d'un picker).
    try {
    if (isChanged("price")) {
      const priceInputBeforeWrite = document.querySelector<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
      mark(historyId, "PRICE_FIELD_FOUND", { trouve: !!priceInputBeforeWrite, ancienneValeur: priceInputBeforeWrite?.value ?? null });
      log(historyId, "formulaire detecte, champ prix avant ecriture (ancienne valeur)", {
        trouve: !!priceInputBeforeWrite,
        ancienneValeur: priceInputBeforeWrite?.value ?? "(champ introuvable)",
        nouvelleValeurPrevue: payload.price,
      });
      const priceInput = await waitForElement<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
      // typeIntoPriceField (pas setNativeValue) : BUG REEL demontre en test
      // manuel direct le 2026-07-16 -- une ecriture en bloc ("98" en un
      // seul coup) vide silencieusement ce champ precis au lieu de le
      // reformater, faisant echouer la soumission sans erreur visible. La
      // frappe caractere par caractere reproduit fidelement une vraie
      // saisie et produit correctement "98,00 €". Voir formFill.ts.
      await typeIntoPriceField(priceInput, payload.price.toString());
      const priceInputAfterWrite = document.querySelector<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
      // La comparaison ne peut plus etre une egalite stricte de chaines :
      // le champ affiche desormais une valeur FORMATEE ("98,00 €"), pas la
      // chaine brute envoyee ("98") -- parsePriceToNumber() normalise les
      // deux cotes avant de comparer.
      const ecritureConfirmee = parsePriceToNumber(priceInputAfterWrite?.value ?? null) === payload.price;
      mark(historyId, "PRICE_SET", {
        valeurAttendue: payload.price,
        valeurLueDansLeDom: priceInputAfterWrite?.value ?? null,
        ecritureConfirmee,
      });
      stage(historyId, "Remplissage du prix", {
        valeurAttendue: payload.price,
        valeurLueDansLeDom: priceInputAfterWrite?.value ?? "(champ introuvable)",
        ecritureConfirmee,
      });
    } else {
      skip("price");
    }

    if (isChanged("title")) {
      // INSTRUMENTATION PERSISTEE (2026-07-22, demande explicite -- audit
      // branche titre) : les deux derniers runs titre n'ont jamais atteint
      // verification_result_received cote background (editListingDispatchCount
      // 1 et 2, verifyFieldsDispatchCount 0, URL toujours /edit) -- preuve
      // que quelque chose echoue AVANT meme EDIT_SAVE_SUBMITTED, dans cette
      // branche ou dans submitEdit(). Chaque etape ci-dessous est desormais
      // persistee (chrome.storage.local), pas seulement loguee dans la
      // console de cet onglet (difficile a capturer au bon moment).
      const titleInput = await waitForElement<HTMLInputElement>(sel.TITLE_INPUT_SELECTOR);
      logger.info(`[${historyId}] TITLE_FIELD_FOUND`, {
        selecteur: sel.TITLE_INPUT_SELECTOR,
        ancienneValeur: titleInput.value,
        nouvelleValeurPrevue: payload.title,
      });
      mark(historyId, "TITLE_FIELD_FOUND", { ancienneValeur: titleInput.value });

      setNativeValue(titleInput, payload.title, (eventName, detail) => {
        logger.info(`[${historyId}] TITLE_${eventName.toUpperCase()}_EVENT`, detail);
      });

      const titleInputAfterWrite = document.querySelector<HTMLInputElement>(sel.TITLE_INPUT_SELECTOR);
      const ecritureConfirmee = titleInputAfterWrite?.value === payload.title;
      logger.info(`[${historyId}] TITLE_VALUE_SET`, {
        valeurAttendue: payload.title,
        valeurLueDansLeDom: titleInputAfterWrite?.value ?? null,
        ecritureConfirmee,
      });
      mark(historyId, "TITLE_SET", { ecritureConfirmee, valeurLueDansLeDom: titleInputAfterWrite?.value ?? null });
      stage(historyId, "Remplissage titre", {
        valeurAttendue: payload.title,
        valeurLueDansLeDom: titleInputAfterWrite?.value ?? "(champ introuvable)",
        ecritureConfirmee,
      });
      log(historyId, "champ titre apres ecriture (lecture DOM immediate)", {
        valeurAttendue: payload.title,
        valeurLueDansLeDom: titleInputAfterWrite?.value ?? "(champ introuvable)",
      });
    } else {
      skip("title");
    }

    if (isChanged("description")) {
      const descriptionInput = await waitForElement<HTMLTextAreaElement>(sel.DESCRIPTION_INPUT_SELECTOR);
      setNativeValue(descriptionInput, payload.description);
      const descriptionInputAfterWrite = document.querySelector<HTMLTextAreaElement>(sel.DESCRIPTION_INPUT_SELECTOR);
      stage(historyId, "Remplissage description", {
        valeurAttendue: payload.description,
        valeurLueDansLeDom: descriptionInputAfterWrite?.value ?? "(champ introuvable)",
        ecritureConfirmee: descriptionInputAfterWrite?.value === payload.description,
      });
    } else {
      skip("description");
    }

    if (isChanged("category")) {
      log(historyId, "resolution categorie", { categorie: payload.category });
      await resolveCategory(payload.category);
    } else {
      skip("category");
    }
    if (isChanged("condition")) {
      log(historyId, "selection etat", { etat: payload.condition });
      // contentSelector non verifie pour l'etat (reutilise celui de la
      // categorie, comportement inchange par rapport a avant le 2026-07-25 --
      // a corriger avec le vrai data-testid quand ce champ sera teste).
      await selectMatchingOption(sel.CONDITION_LIST_TRIGGER_SELECTOR, sel.CATEGORY_DROPDOWN_CONTENT_SELECTOR, payload.condition, { required: true });
    } else {
      skip("condition");
    }
    if (isChanged("size")) {
      log(historyId, "selection taille", { taille: payload.size });
      // contentSelector non verifie pour la taille (idem etat ci-dessus).
      await selectMatchingOption(sel.SIZE_GRID_TRIGGER_SELECTOR, sel.CATEGORY_DROPDOWN_CONTENT_SELECTOR, payload.size, { required: false });
    } else {
      skip("size");
    }
    if (isChanged("brand")) {
      if (isBrandLocked()) {
        // Ne tente jamais le clic sur un champ verrouille par Vinted -- voir
        // isBrandLocked() ci-dessus pour la preuve. Leve directement une
        // PublishError dediee, interceptee plus bas dans le catch(fillErr)
        // pour ne PAS emprunter le chemin EDIT_FIELD_FILL_FAILED (ce n'est
        // pas un echec de remplissage a diagnostiquer, c'est une restriction
        // Vinted connue et attendue).
        throw new PublishError(
          "brand_locked",
          "Vinted ne permet pas de modifier la marque de cet article directement : il faut supprimer l'annonce puis la republier avec la nouvelle marque."
        );
      }
      log(historyId, "selection marque", { marque: payload.brand });
      // BRAND_DROPDOWN_CONTENT_SELECTOR verifie en direct le 2026-07-25
      // (cause racine du timeout reel sur ce champ, voir publishSelectors.ts).
      await selectMatchingOption(sel.BRAND_DROPDOWN_TRIGGER_SELECTOR, sel.BRAND_DROPDOWN_CONTENT_SELECTOR, payload.brand, { required: false });
    } else {
      skip("brand");
    }
    if (isChanged("color")) {
      log(historyId, "selection couleur", { couleur: payload.color });
      // contentSelector non verifie pour la couleur (idem etat/taille ci-dessus).
      await selectMatchingOption(sel.COLOR_DROPDOWN_TRIGGER_SELECTOR, sel.CATEGORY_DROPDOWN_CONTENT_SELECTOR, payload.color, { required: false });
    } else {
      skip("color");
    }
    if (isChanged("material")) {
      log(historyId, "selection matiere", { matiere: payload.material });
      // contentSelector non verifie pour la matiere (idem etat/taille/couleur ci-dessus).
      await selectMatchingOption(sel.MATERIAL_LIST_TRIGGER_SELECTOR, sel.CATEGORY_DROPDOWN_CONTENT_SELECTOR, payload.material, { required: false });
    } else {
      skip("material");
    }
    } catch (fillErr) {
      // brand_locked (2026-07-25) : PAS un echec de remplissage a
      // diagnostiquer -- une restriction Vinted connue et attendue pour
      // cette annonce precise (voir isBrandLocked() plus haut). Chemin
      // d'erreur normal (PUBLISH_RESULT/settle, onglet ferme normalement),
      // distinct du mode diagnostic EDIT_FIELD_FILL_FAILED ci-dessous qui
      // reste reserve aux echecs de remplissage reellement inexpliques.
      if (fillErr instanceof PublishError && fillErr.code === "brand_locked") {
        mark(historyId, "ECHEC : marque verrouillee par Vinted pour cette annonce (suppression + republication requises)");
        log(historyId, "marque verrouillee par Vinted -- pas un echec de remplissage, onglet ferme normalement", { message: fillErr.message });
        reportResult({ status: "error", errorMessage: fillErr.message });
        return;
      }
      const message =
        fillErr instanceof WaitTimeoutError
          ? describeTimeout(fillErr)
          : fillErr instanceof PublishError
            ? fillErr.message
            : errorMessage(fillErr);
      logger.error(`[${historyId}] EDIT_FIELD_FILL_FAILED`, {
        errorType: fillErr instanceof WaitTimeoutError ? "WaitTimeoutError" : fillErr instanceof PublishError ? "PublishError" : "inattendue",
        message,
      });
      mark(historyId, "ECHEC : remplissage d'un champ avant soumission (onglet laisse ouvert pour diagnostic)", { message });
      log(historyId, "echec de remplissage avant soumission -- onglet Vinted laisse ouvert pour diagnostic", { message });
      chrome.runtime.sendMessage({ type: "EDIT_FIELD_FILL_FAILED", errorMessage: message });
      return;
    }

    // Relecture finale juste avant soumission : confirme que rien
    // (navigation dans les pickers, re-render React...) n'a fait revenir
    // le prix a son ancienne valeur entre l'ecriture et le clic sur
    // Enregistrer. Uniquement pertinent si le prix a reellement ete
    // modifie.
    if (isChanged("price")) {
      const priceInputBeforeSubmit = document.querySelector<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
      log(historyId, "champ prix juste avant soumission (derniere verification)", {
        valeurAttendue: payload.price,
        valeurLueDansLeDom: priceInputBeforeSubmit?.value ?? "(champ introuvable)",
      });
    }

    reportProgress("publishing");
    const { vintedItemId, vintedUrl } = await submitEdit(historyId, payload.vintedItemId);
    logger.info(`[${historyId}] SUBMIT_EDIT_RESULT`, { ok: true, vintedItemId, vintedUrl });
    log(historyId, "soumission soumise, navigation hors de /edit detectee -- verification reelle a venir", { vintedItemId, vintedUrl });

    // "Une edition ne peut etre consideree comme reussie que si une preuve
    // reelle est obtenue apres sauvegarde" (demande explicite 2026-07-16) :
    // ne rapporte plus le succes ici. handleEditListing.ts orchestre la
    // suite (renavigation + relecture) et c'est SEULEMENT
    // EDIT_VERIFICATION_RESULT, envoye par la PHASE DE VERIFICATION
    // separee (voir handleVerifyEditFields ci-dessous), qui determine le
    // resultat final transmis a ResellOS.
    mark(historyId, "SENDING_EDIT_SAVE_SUBMITTED", { vintedItemId, vintedUrl, currentUrl: location.href });
    chrome.runtime.sendMessage({ type: "EDIT_SAVE_SUBMITTED", vintedItemId, vintedUrl });
  } catch (err) {
    // CONTENT_SCRIPT_ERROR (2026-07-22, demande explicite -- audit branche
    // titre) : marqueur PERSISTE UNIQUE couvrant les 3 branches ci-dessous
    // (WaitTimeoutError, PublishError, inattendue) -- point de reponse
    // direct a "quelle erreur exacte remonte du content script avant que
    // RUN_ACTION passe en error", sans devoir capturer la console de
    // l'onglet au bon moment.
    logger.error(`[${historyId}] CONTENT_SCRIPT_ERROR`, {
      errorType: err instanceof WaitTimeoutError ? "WaitTimeoutError" : err instanceof PublishError ? "PublishError" : "inattendue",
      message: errorMessage(err),
      runEditInvocationCount,
      url: location.href,
    });
    if (err instanceof WaitTimeoutError) {
      const looksLikeLoginPage = /\/(login|auth)/i.test(location.pathname);
      // runEditInvocationCount ici est LA preuve directe recherchee : si ce
      // catch se declenche sur la 2e+ invocation dans ce document (ou un
      // document distinct du tout premier), c'est qu'un second EDIT_LISTING
      // a bien ete dispatche pendant/apres un premier essai deja en cours
      // (ou deja termine avec succes) -- pas un probleme de selecteur.
      mark(historyId, "ECHEC : timeout d'attente DOM", { message: err.message, looksLikeLoginPage, runEditInvocationCount, url: location.href });
      log(historyId, "echec : timeout d'attente DOM", { message: err.message, looksLikeLoginPage, runEditInvocationCount });
      reportResult({
        status: "error",
        // describeTimeout() (domWait.ts) inclut toujours err.message (le
        // selecteur exact pour waitForElement, la description pour
        // waitForCondition depuis le 2026-07-16) en second plan -- demande
        // explicite d'alors : "je veux savoir precisement laquelle de ces
        // etapes ne se produit jamais". Reformate simplement (Cycle B,
        // 2026-07-24) pour qu'un non-technicien comprenne la premiere
        // partie du message, sans rien retirer du detail technique.
        errorMessage: looksLikeLoginPage
          ? "Session Vinted expirée, reconnecte-toi sur vinted.fr"
          : describeTimeout(err),
      });
      return;
    }
    if (err instanceof PublishError) {
      log(historyId, "echec : erreur de remplissage", { code: err.code, message: err.message });
      reportResult({ status: "error", errorMessage: err.message });
      return;
    }
    console.error("[ResellOS][Edit] echec inattendu (objet complet)", err);
    log(historyId, "echec : erreur inattendue", err);
    reportResult({ status: "error", errorMessage: errorMessage(err) });
  }
}

// Phase de verification (2026-07-16) : ce content script est reinjecte
// (nouvelle navigation vers la MEME page /edit, orchestree par
// handleEditListing.ts) specifiquement pour relire les valeurs REELLES
// des champs texte modifies et les comparer a ce qui etait demande --
// "preuve acceptable" #3 explicitement requise ("rechargement de la page
// d'edition et lecture du champ prix egal a la valeur demandee"). Seuls
// title/description/price sont verifiables ainsi (memes selecteurs que
// l'ecriture, lecture directe et non ambigue) -- les selecteurs
// d'attributs (categorie/marque/taille/etat/couleur/matiere) n'ont pas de
// mecanisme de relecture fiable equivalent, limite explicitement
// documentee, pas silencieusement ignoree.
async function handleVerifyEditFields(historyId: string | undefined, payload: VerifyEditFieldsPayload): Promise<void> {
  try {
    // BUG REEL demontre en test reel le 2026-07-16 : attendre INCONDITIONNELLEMENT
    // le titre pour detecter que la page est chargee echouait par timeout (8000ms
    // puis 20000ms) alors meme que le prix, lui, avait deja ete reellement
    // sauvegarde sur Vinted (confirme visuellement par l'utilisateur : 97 €
    // affiche sur Vinted) -- le champ titre peut mettre plus longtemps a
    // apparaitre/hydrater que les autres, et n'a aucune raison d'etre attendu si
    // seul le prix a change. "Ne jamais attendre un champ absent de
    // changedFields" (demande explicite) : le signal de "page chargee" utilise
    // desormais le PREMIER champ REELLEMENT verifie (present dans
    // payload.expected), jamais un champ non modifie.
    const loadDetectorSelector =
      payload.expected.price !== undefined
        ? sel.PRICE_INPUT_SELECTOR
        : payload.expected.title !== undefined
          ? sel.TITLE_INPUT_SELECTOR
          : payload.expected.description !== undefined
            ? sel.DESCRIPTION_INPUT_SELECTOR
            : sel.TITLE_INPUT_SELECTOR;
    // Delai porte a 30000ms (2026-07-18) -- meme mesure en direct que
    // FORM_FOUND dans runEdit() (baseline reelle ~8.8s pour ce champ sur
    // cette page, domComplete lui-meme ~1s), meme raisonnement : plafond
    // de securite absorbant la variance reelle de Vinted, pas un sleep
    // fixe -- waitForElement() resout des l'apparition reelle du champ.
    await waitForElement(loadDetectorSelector, { timeoutMs: 30000 });
    log(historyId, "verification : formulaire recharge, page consideree chargee", { loadDetectorSelector });

    const details: Record<string, { expected: string; actual: string | null; matches: boolean }> = {};

    if (payload.expected.price !== undefined) {
      const priceInput = document.querySelector<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
      const actual = priceInput?.value ?? null;
      // Comparaison numerique, pas d'egalite stricte de chaines -- le champ
      // prix affiche une valeur FORMATEE par Vinted ("98,00 €"), jamais la
      // chaine brute demandee ("98"), voir parsePriceToNumber().
      details.price = { expected: payload.expected.price, actual, matches: parsePriceToNumber(actual) === parsePriceToNumber(payload.expected.price) };
    }
    if (payload.expected.title !== undefined) {
      const titleInput = document.querySelector<HTMLInputElement>(sel.TITLE_INPUT_SELECTOR);
      const actual = titleInput?.value ?? null;
      // .trim() (2026-07-27, bug reel confirme) : Vinted retire les espaces
      // en debut/fin a la sauvegarde -- une egalite stricte sur la chaine
      // brute saisie par l'utilisateur (qui peut contenir un espace de fin
      // anodin) declarait a tort la sauvegarde non confirmee alors que
      // Vinted avait reellement enregistre la bonne valeur.
      details.title = { expected: payload.expected.title, actual, matches: (actual?.trim() ?? null) === payload.expected.title.trim() };
    }
    if (payload.expected.description !== undefined) {
      const descriptionInput = document.querySelector<HTMLTextAreaElement>(sel.DESCRIPTION_INPUT_SELECTOR);
      const actual = descriptionInput?.value ?? null;
      details.description = { expected: payload.expected.description, actual, matches: (actual?.trim() ?? null) === payload.expected.description.trim() };
    }

    const matches = Object.values(details).every((d) => d.matches);
    mark(historyId, matches ? "SAVE_CONFIRMED" : "SAVE_NOT_CONFIRMED (valeur reelle differente)", details);
    log(historyId, "verification terminee", { matches, details });
    mark(historyId, "SENDING_EDIT_VERIFICATION_RESULT", { matches, currentUrl: location.href });
    chrome.runtime.sendMessage({ type: "EDIT_VERIFICATION_RESULT", matches, details });
  } catch (err) {
    console.error("[ResellOS][Edit] verification : echec inattendu (objet complet)", err);
    log(historyId, "verification : echec inattendu, considere comme non confirme", errorMessage(err));
    mark(historyId, "SENDING_EDIT_VERIFICATION_RESULT (apres echec)", { currentUrl: location.href, error: errorMessage(err) });
    chrome.runtime.sendMessage({
      type: "EDIT_VERIFICATION_RESULT",
      matches: false,
      details: { _error: { expected: "(verification)", actual: `echec : ${errorMessage(err)}`, matches: false } },
    });
  }
}

let messageReceivedCount = 0;

function bootEditContentScript(): void {
  chrome.runtime.onMessage.addListener((message) => {
    messageReceivedCount += 1;
    console.log("[ResellOS][Edit] message recu par le content script", { messageReceivedCount, message, url: location.href });
    if (!isContentCommand(message)) return false;
    if (message.type === "EDIT_LISTING") {
      mark(message.payload.historyId, "EDIT_RECEIVED", { vintedItemId: message.payload.vintedItemId, price: message.payload.price });
      stage(message.payload.historyId, "edit_payload_received");
      log(message.payload.historyId, "commande EDIT_LISTING reconnue, demarrage runEdit", {
        vintedItemId: message.payload.vintedItemId,
      });
      void runEdit(message.payload);
    }
    if (message.type === "VERIFY_EDIT_FIELDS") {
      log(message.payload.historyId, "commande VERIFY_EDIT_FIELDS reconnue", { expected: message.payload.expected });
      void handleVerifyEditFields(message.payload.historyId, message.payload);
    }
    return false;
  });

  // Signal de disponibilite (CAUSE RACINE #1, voir commentaire
  // ContentReport dans messages.ts) : envoye juste apres l'enregistrement
  // du listener ci-dessus, pour que handleEditListing.ts sache exactement
  // quand il est sur d'obtenir une reponse, plutot que de deviner via un
  // retry aveugle a duree fixe.
  chrome.runtime.sendMessage({ type: "EDIT_TAB_READY" });
  stage(undefined, "Signal EDIT_TAB_READY envoye au background");
}
