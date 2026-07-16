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

import { waitForElement, waitForCondition, WaitTimeoutError } from "./domWait";
import * as sel from "./publishSelectors";
import {
  PublishError,
  resolveCategory,
  selectMatchingOption,
  setNativeValue,
  verifyLoggedInAccount,
} from "./formFill";
import { isContentCommand } from "../lib/messages";
import type { EditListingPayload, EditableFieldName, PublishStep, RunActionOutcome, VerifyEditFieldsPayload } from "../lib/messages";
import { errorMessage } from "../lib/errorMessage";

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

async function submitEdit(historyId: string | undefined): Promise<{ vintedItemId: string; vintedUrl: string }> {
  // Hypothese : le formulaire d'edition partage le meme bouton de
  // sauvegarde que la creation -- a reconfirmer en test live (peut-etre
  // "Enregistrer" plutot que "Ajouter" sur l'edition).
  const saveButton = await waitForElement<HTMLButtonElement>(sel.SAVE_BUTTON_SELECTOR);
  mark(historyId, "SAVE_BUTTON_FOUND", { disabled: saveButton.disabled, text: saveButton.textContent });
  log(historyId, "bouton de sauvegarde trouve", { disabled: saveButton.disabled, text: saveButton.textContent });
  await waitForCondition(() => !saveButton.disabled && saveButton.getAttribute("aria-disabled") !== "true", {
    description: "bouton de sauvegarde devient cliquable (non disabled)",
  });
  log(historyId, "bouton de sauvegarde pret (non disabled), clic");
  saveButton.click();
  mark(historyId, "SAVE_CLICKED");
  stage(historyId, "save_clicked");
  log(historyId, "en attente de navigation hors de /edit (jusqu'a 20s)");

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
  await waitForCondition(() => /\/items\/\d+/.test(location.pathname) && !location.pathname.includes("/edit"), {
    timeoutMs: 20000,
    description: "navigation hors de /edit apres clic sur Enregistrer (PAS une preuve de sauvegarde reelle, juste que Vinted a redirige)",
  });
  stage(historyId, "navigation_away_from_edit_detected", { pathname: location.pathname });
  log(historyId, "navigation hors de /edit detectee (pas encore une preuve de sauvegarde reelle)", { pathname: location.pathname });

  const match = location.pathname.match(/\/items\/(\d+)/);
  if (!match) {
    throw new PublishError("vinted_validation_error", "Vinted n'a pas confirmé la mise à jour de l'annonce");
  }
  return { vintedItemId: match[1], vintedUrl: location.href };
}

async function runEdit(payload: EditListingPayload): Promise<void> {
  const historyId = payload.historyId;
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
    await waitForElement(sel.TITLE_INPUT_SELECTOR);
    mark(historyId, "FORM_FOUND");
    stage(historyId, "form_detected", { titleSelectorFound: true });
    log(historyId, "champ titre detecte, page consideree chargee");
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

    if (isChanged("price")) {
      const priceInputBeforeWrite = document.querySelector<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
      mark(historyId, "PRICE_FIELD_FOUND", { trouve: !!priceInputBeforeWrite, ancienneValeur: priceInputBeforeWrite?.value ?? null });
      log(historyId, "formulaire detecte, champ prix avant ecriture (ancienne valeur)", {
        trouve: !!priceInputBeforeWrite,
        ancienneValeur: priceInputBeforeWrite?.value ?? "(champ introuvable)",
        nouvelleValeurPrevue: payload.price,
      });
      const priceInput = await waitForElement<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
      setNativeValue(priceInput, payload.price.toString());
      const priceInputAfterWrite = document.querySelector<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
      mark(historyId, "PRICE_SET", {
        valeurAttendue: payload.price,
        valeurLueDansLeDom: priceInputAfterWrite?.value ?? null,
        ecritureConfirmee: priceInputAfterWrite?.value === String(payload.price),
      });
      stage(historyId, "Remplissage du prix", {
        valeurAttendue: payload.price,
        valeurLueDansLeDom: priceInputAfterWrite?.value ?? "(champ introuvable)",
        ecritureConfirmee: priceInputAfterWrite?.value === String(payload.price),
      });
    } else {
      skip("price");
    }

    if (isChanged("title")) {
      const titleInput = await waitForElement<HTMLInputElement>(sel.TITLE_INPUT_SELECTOR);
      setNativeValue(titleInput, payload.title);
      const titleInputAfterWrite = document.querySelector<HTMLInputElement>(sel.TITLE_INPUT_SELECTOR);
      stage(historyId, "Remplissage titre", {
        valeurAttendue: payload.title,
        valeurLueDansLeDom: titleInputAfterWrite?.value ?? "(champ introuvable)",
        ecritureConfirmee: titleInputAfterWrite?.value === payload.title,
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
      await selectMatchingOption(sel.CONDITION_LIST_TRIGGER_SELECTOR, payload.condition, { required: true });
    } else {
      skip("condition");
    }
    if (isChanged("size")) {
      log(historyId, "selection taille", { taille: payload.size });
      await selectMatchingOption(sel.SIZE_GRID_TRIGGER_SELECTOR, payload.size, { required: false });
    } else {
      skip("size");
    }
    if (isChanged("brand")) {
      log(historyId, "selection marque", { marque: payload.brand });
      await selectMatchingOption(sel.BRAND_DROPDOWN_TRIGGER_SELECTOR, payload.brand, { required: false });
    } else {
      skip("brand");
    }
    if (isChanged("color")) {
      log(historyId, "selection couleur", { couleur: payload.color });
      await selectMatchingOption(sel.COLOR_DROPDOWN_TRIGGER_SELECTOR, payload.color, { required: false });
    } else {
      skip("color");
    }
    if (isChanged("material")) {
      log(historyId, "selection matiere", { matiere: payload.material });
      await selectMatchingOption(sel.MATERIAL_LIST_TRIGGER_SELECTOR, payload.material, { required: false });
    } else {
      skip("material");
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
    const { vintedItemId, vintedUrl } = await submitEdit(historyId);
    log(historyId, "soumission soumise, navigation hors de /edit detectee -- verification reelle a venir", { vintedItemId, vintedUrl });

    // "Une edition ne peut etre consideree comme reussie que si une preuve
    // reelle est obtenue apres sauvegarde" (demande explicite 2026-07-16) :
    // ne rapporte plus le succes ici. handleEditListing.ts orchestre la
    // suite (renavigation + relecture) et c'est SEULEMENT
    // EDIT_VERIFICATION_RESULT, envoye par la PHASE DE VERIFICATION
    // separee (voir handleVerifyEditFields ci-dessous), qui determine le
    // resultat final transmis a ResellOS.
    chrome.runtime.sendMessage({ type: "EDIT_SAVE_SUBMITTED", vintedItemId, vintedUrl });
  } catch (err) {
    if (err instanceof WaitTimeoutError) {
      const looksLikeLoginPage = /\/(login|auth)/i.test(location.pathname);
      mark(historyId, "ECHEC : timeout d'attente DOM", { message: err.message, looksLikeLoginPage });
      log(historyId, "echec : timeout d'attente DOM", { message: err.message, looksLikeLoginPage });
      reportResult({
        status: "error",
        // Inclut desormais err.message (qui contient le selecteur exact
        // pour waitForElement, et la description pour waitForCondition
        // depuis le 2026-07-16) directement dans le message visible cote
        // ResellOS -- demande explicite : "je veux savoir precisement
        // laquelle de ces etapes ne se produit jamais", pas seulement dans
        // la console de l'onglet Vinted.
        errorMessage: looksLikeLoginPage
          ? "Session Vinted expirée, reconnecte-toi sur vinted.fr"
          : `La page Vinted n'a pas répondu à temps (${err.message})`,
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
    await waitForElement(sel.TITLE_INPUT_SELECTOR);
    log(historyId, "verification : formulaire recharge, page consideree chargee");

    const details: Record<string, { expected: string; actual: string | null }> = {};

    if (payload.expected.price !== undefined) {
      const priceInput = document.querySelector<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
      details.price = { expected: payload.expected.price, actual: priceInput?.value ?? null };
    }
    if (payload.expected.title !== undefined) {
      const titleInput = document.querySelector<HTMLInputElement>(sel.TITLE_INPUT_SELECTOR);
      details.title = { expected: payload.expected.title, actual: titleInput?.value ?? null };
    }
    if (payload.expected.description !== undefined) {
      const descriptionInput = document.querySelector<HTMLTextAreaElement>(sel.DESCRIPTION_INPUT_SELECTOR);
      details.description = { expected: payload.expected.description, actual: descriptionInput?.value ?? null };
    }

    const matches = Object.values(details).every((d) => d.actual === d.expected);
    mark(historyId, matches ? "SAVE_CONFIRMED" : "SAVE_NOT_CONFIRMED (valeur reelle differente)", details);
    log(historyId, "verification terminee", { matches, details });
    chrome.runtime.sendMessage({ type: "EDIT_VERIFICATION_RESULT", matches, details });
  } catch (err) {
    console.error("[ResellOS][Edit] verification : echec inattendu (objet complet)", err);
    log(historyId, "verification : echec inattendu, considere comme non confirme", errorMessage(err));
    chrome.runtime.sendMessage({
      type: "EDIT_VERIFICATION_RESULT",
      matches: false,
      details: { _error: { expected: "(verification)", actual: `echec : ${errorMessage(err)}` } },
    });
  }
}

function bootEditContentScript(): void {
  chrome.runtime.onMessage.addListener((message) => {
    console.log("[ResellOS][Edit] message recu par le content script", message);
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
