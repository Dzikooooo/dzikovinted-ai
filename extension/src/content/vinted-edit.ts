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
  fillTextFields,
  resolveCategory,
  selectMatchingOption,
  verifyLoggedInAccount,
} from "./formFill";
import { isContentCommand } from "../lib/messages";
import type { EditListingPayload, PublishStep, RunActionOutcome } from "../lib/messages";
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
  log(historyId, "bouton de sauvegarde trouve", { disabled: saveButton.disabled, text: saveButton.textContent });
  await waitForCondition(() => !saveButton.disabled && saveButton.getAttribute("aria-disabled") !== "true");
  log(historyId, "bouton de sauvegarde pret (non disabled), clic");
  saveButton.click();
  stage(historyId, "save_clicked");
  log(historyId, "en attente de confirmation Vinted (redirection vers /items/{id} attendue, jusqu'a 20s)");

  // Une sauvegarde d'edition redirige probablement vers /items/{id} (la
  // fiche, pas /new) -- meme predicat que la creation, suffisant puisque
  // l'id est deja connu (payload.vintedItemId) et sert uniquement a
  // confirmer que Vinted a bien traite la soumission.
  await waitForCondition(() => /\/items\/\d+/.test(location.pathname), { timeoutMs: 20000 });
  stage(historyId, "confirmation_received", { pathname: location.pathname });
  log(historyId, "confirmation Vinted recue (redirection detectee apres soumission)", { pathname: location.pathname });

  const match = location.pathname.match(/\/items\/(\d+)/);
  if (!match) {
    throw new PublishError("vinted_validation_error", "Vinted n'a pas confirmé la mise à jour de l'annonce");
  }
  return { vintedItemId: match[1], vintedUrl: location.href };
}

async function runEdit(payload: EditListingPayload): Promise<void> {
  const historyId = payload.historyId;
  log(historyId, "runEdit demarre", { vintedItemId: payload.vintedItemId, price: payload.price, url: location.href });
  try {
    reportProgress("connecting");
    await waitForElement(sel.TITLE_INPUT_SELECTOR);
    stage(historyId, "form_detected", { titleSelectorFound: true });
    log(historyId, "champ titre detecte, page consideree chargee");
    await verifyLoggedInAccount(payload.expectedVintedUsername);
    log(historyId, "compte connecte verifie", { expected: payload.expectedVintedUsername });

    reportProgress("filling_form");

    const priceInputBeforeWrite = document.querySelector<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
    log(historyId, "formulaire detecte, champ prix avant ecriture (ancienne valeur)", {
      trouve: !!priceInputBeforeWrite,
      ancienneValeur: priceInputBeforeWrite?.value ?? "(champ introuvable)",
      nouvelleValeurPrevue: payload.price,
    });

    // Champs texte (titre/description/prix) remplis en un bloc par
    // fillTextFields -- verification de lecture immediatement apres pour
    // prouver que l'ecriture a reellement pris (pas juste "envoyee").
    await fillTextFields(payload);
    const priceInputAfterWrite = document.querySelector<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
    stage(historyId, "Remplissage du prix", {
      valeurAttendue: payload.price,
      valeurLueDansLeDom: priceInputAfterWrite?.value ?? "(champ introuvable)",
      ecritureConfirmee: priceInputAfterWrite?.value === String(payload.price),
    });
    log(historyId, "champ prix apres ecriture + evenements input/change/blur declenches (nouvelle valeur)", {
      valeurAttendue: payload.price,
      valeurLueDansLeDom: priceInputAfterWrite?.value ?? "(champ introuvable)",
    });
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
    const descriptionInputAfterWrite = document.querySelector<HTMLTextAreaElement>(sel.DESCRIPTION_INPUT_SELECTOR);
    stage(historyId, "Remplissage description", {
      valeurAttendue: payload.description,
      valeurLueDansLeDom: descriptionInputAfterWrite?.value ?? "(champ introuvable)",
      ecritureConfirmee: descriptionInputAfterWrite?.value === payload.description,
    });

    log(historyId, "resolution categorie", { categorie: payload.category });
    await resolveCategory(payload.category);
    log(historyId, "selection etat", { etat: payload.condition });
    await selectMatchingOption(sel.CONDITION_LIST_TRIGGER_SELECTOR, payload.condition, { required: true });
    log(historyId, "selection taille", { taille: payload.size });
    await selectMatchingOption(sel.SIZE_GRID_TRIGGER_SELECTOR, payload.size, { required: false });
    log(historyId, "selection marque", { marque: payload.brand });
    await selectMatchingOption(sel.BRAND_DROPDOWN_TRIGGER_SELECTOR, payload.brand, { required: false });
    log(historyId, "selection couleur", { couleur: payload.color });
    await selectMatchingOption(sel.COLOR_DROPDOWN_TRIGGER_SELECTOR, payload.color, { required: false });
    log(historyId, "selection matiere", { matiere: payload.material });
    await selectMatchingOption(sel.MATERIAL_LIST_TRIGGER_SELECTOR, payload.material, { required: false });

    // Relecture finale juste avant soumission : confirme que rien
    // (navigation dans les pickers, re-render React...) n'a fait revenir
    // le prix a son ancienne valeur entre l'ecriture et le clic sur
    // Enregistrer.
    const priceInputBeforeSubmit = document.querySelector<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
    log(historyId, "champ prix juste avant soumission (derniere verification)", {
      valeurAttendue: payload.price,
      valeurLueDansLeDom: priceInputBeforeSubmit?.value ?? "(champ introuvable)",
    });

    reportProgress("publishing");
    const { vintedItemId, vintedUrl } = await submitEdit(historyId);
    log(historyId, "soumission confirmee", { vintedItemId, vintedUrl });

    stage(historyId, "Retour vers ResellOS", { vintedItemId, vintedUrl });
    reportResult({ status: "success", resultPayload: { vintedItemId, vintedUrl } });
  } catch (err) {
    if (err instanceof WaitTimeoutError) {
      const looksLikeLoginPage = /\/(login|auth)/i.test(location.pathname);
      log(historyId, "echec : timeout d'attente DOM", { message: err.message, looksLikeLoginPage });
      reportResult({
        status: "error",
        errorMessage: looksLikeLoginPage
          ? "Session Vinted expirée, reconnecte-toi sur vinted.fr"
          : "La page Vinted n'a pas répondu à temps",
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

function bootEditContentScript(): void {
  chrome.runtime.onMessage.addListener((message) => {
    console.log("[ResellOS][Edit] message recu par le content script", message);
    if (!isContentCommand(message)) return false;
    if (message.type === "EDIT_LISTING") {
      stage(message.payload.historyId, "edit_payload_received");
      log(message.payload.historyId, "commande EDIT_LISTING reconnue, demarrage runEdit", {
        vintedItemId: message.payload.vintedItemId,
      });
      void runEdit(message.payload);
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
