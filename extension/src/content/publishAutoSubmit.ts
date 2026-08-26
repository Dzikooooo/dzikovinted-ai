// Mission "AUTOMATISER ENTIEREMENT LA REPUBLICATION -- SUBMIT AUTOMATIQUE"
// (2026-08-19). Suite directe du POC diagnostique (publishSyntheticClickPoc.ts,
// preuve live : dispatchFullClick() sur SAVE_BUTTON_SELECTOR declenche
// reellement POST /api/v2/item_upload/items -> 200 sur /items/new) et de
// l'audit qui a suivi (CAS A/B/C de handlers/publishListing.ts detectent deja
// un succes de creation INDEPENDAMMENT de l'origine du clic -- rien a changer
// cote detection). Ce module est le SEUL morceau manquant : remplacer
// l'attente d'un clic humain par UNE tentative automatique, dans les memes
// conditions que celles deja exigees pour PUBLISH_READY_TO_SUBMIT.
//
// ISOLATION VOLONTAIRE vis-a-vis du POC (demande explicite, ne jamais
// fusionner) :
//  - Aucun import de/vers publishSyntheticClickPoc.ts, aucun etat partage
//    (pocAttempted reste strictement local a ce fichier-la).
//  - Rien n'est expose sur `window` ici -- ce module n'est appelable que
//    depuis vinted-publish.ts (import direct), jamais depuis la console.
//  - Log names distincts (AUTO_SUBMIT_*, jamais PUBLISH_SYNTHETIC_CLICK_*).
//
// PORTEE (decision explicite de ce round) : republish_listing UNIQUEMENT --
// isRepublishPayload() ci-dessous est la seule porte d'entree pour decider
// si ce mecanisme doit meme etre tente ; vinted-publish.ts ne l'invoque que
// si elle renvoie true. publish_listing (premiere publication) reste 100%
// clic humain, sans exception, jusqu'a une decision explicite ulterieure de
// generalisation.
//
// UNE SEULE TENTATIVE (demande explicite, aucun retry) : autoSubmitAttempted
// est mis a `true` de facon SYNCHRONE, avant toute validation -- un appel
// qui echoue la revalidation (bouton disparu, prix redevenu invalide, photos
// pas confirmees) consomme quand meme "la" tentative ; aucun second appel ne
// peut jamais re-tenter, meme si l'etat redevient favorable ensuite. Reset
// uniquement via resetPublishAutoSubmitForTests() (jamais appele par un vrai
// flow -- une vraie navigation recree de toute facon un document/realm neuf,
// donc un nouveau module avec ce flag a `false` naturellement).
//
// STALENESS REACT (demande explicite) : le bouton n'est JAMAIS pris depuis
// un etat capture plus tot (ex. la closure qui a determine que la readiness
// est stable) -- re-resolu ici via document.querySelector juste avant
// dispatchFullClick(), et l'integralite des 4 conditions (bouton
// trouve+enabled, prix valide, photos confirmees) est revalidee de facon
// SYNCHRONE dans ce meme appel, a partir de deps qui relisent l'etat REEL au
// moment de l'appel (jamais des valeurs figees passees en parametre).
//
// AUCUNE nouvelle detection de succes/echec ici (voir l'audit) : CAS A/B/C
// (handlers/publishListing.ts) restent totalement inchanges et continuent de
// fonctionner exactement comme pour un clic humain -- ce module se contente
// de produire UN clic, rien d'autre. Un echec (bouton introuvable, etat
// redevenu invalide, ou un submit qui aboutit a une reponse non-2xy/
// validation_error cote Vinted) ne fait RIEN de plus que journaliser :
// aucune fermeture d'onglet, aucune suppression, le mecanisme de fallback
// existant (attente humaine, highlight, timeout global) reste seul maitre
// de la suite -- par construction, puisque performRepublishReplaceTransaction()
// (donc toute suppression de l'ancienne annonce) n'est jamais atteignable
// que via une preuve positive CAS A/B/C, jamais depuis ce module.

import { dispatchFullClick, type PriceValidationState } from "./formFill";
import { SAVE_BUTTON_SELECTOR } from "./publishSelectors";
import type { SaveButtonState } from "./publishReadiness";
import type { PublishListingPayload } from "../lib/messages";

export interface PublishAutoSubmitDeps {
  describeButtonState: () => SaveButtonState;
  describePriceState: () => PriceValidationState;
  // Relit l'etat REEL (photoImportOutcome, vinted-publish.ts) au moment de
  // l'appel -- jamais une valeur `boolean | null` figee passee depuis le
  // tick qui a determine la readiness stable.
  isPhotosImported: () => boolean;
  log: {
    info: (message: string, detail?: Record<string, unknown>) => void;
    warn: (message: string, detail?: Record<string, unknown>) => void;
  };
}

// Republication : seul cas ou previousVintedItemId est peuple sur le payload
// (voir handlers/publishListing.ts, meme convention exacte -- champ present
// a l'execution mais absent du type PublishListingPayload lui-meme, ajoute
// par l'app uniquement pour republish_listing). publish_listing ne le porte
// jamais.
export function isRepublishPayload(payload: PublishListingPayload): boolean {
  return typeof (payload as { previousVintedItemId?: unknown }).previousVintedItemId === "string";
}

function isButtonReady(state: SaveButtonState): boolean {
  return state.found && state.disabled === false && state.ariaDisabled !== "true";
}

let autoSubmitAttempted = false;

// Jamais appelee par un vrai flow -- uniquement pour reinitialiser l'etat
// entre deux tests (meme convention que resetPublishSyntheticClickPocForTests).
export function resetPublishAutoSubmitForTests(): void {
  autoSubmitAttempted = false;
}

// Point d'entree unique. Appelee UNIQUEMENT par vinted-publish.ts, UNIQUEMENT
// depuis la branche "readiness stable" de watchForPublishReadiness(), et
// UNIQUEMENT si isRepublishPayload(payload) est vrai pour la commande en
// cours -- ce module ne verifie pas lui-meme le type de publication, cette
// decision appartient a l'appelant.
export function attemptAutomaticRepublishSubmit(deps: PublishAutoSubmitDeps): void {
  if (autoSubmitAttempted) {
    deps.log.warn("AUTO_SUBMIT_ALREADY_ATTEMPTED", {
      reason: "une tentative automatique a deja eu lieu dans ce document -- jamais rejouee",
    });
    return;
  }
  // Synchrone, AVANT toute validation -- voir le commentaire d'en-tete
  // "UNE SEULE TENTATIVE" : cette ligne EST la garantie de non-retry, pas
  // seulement une protection contre un double appel accidentel.
  autoSubmitAttempted = true;

  const buttonState = deps.describeButtonState();
  const priceState = deps.describePriceState();
  const photosImported = deps.isPhotosImported();

  const buttonReady = isButtonReady(buttonState);
  const priceValid = priceState.valid;

  // Re-resolu ICI, APRES les 3 lectures d'etat ci-dessus et JUSTE AVANT
  // dispatchFullClick() -- jamais avant (voir le test "bouton remplace par
  // React", scenario 5 : describeButtonState() peut elle-meme provoquer/
  // observer un re-render qui remplace le noeud DOM). Une resolution plus
  // precoce risquerait de cibler un bouton deja detache par React entre la
  // lecture d'etat et le clic.
  const btn = document.querySelector<HTMLButtonElement>(SAVE_BUTTON_SELECTOR);

  if (!btn || !buttonReady || !priceValid || !photosImported) {
    deps.log.warn("AUTO_SUBMIT_SKIPPED_STALE_STATE", {
      buttonFound: !!btn,
      buttonReady,
      priceValid,
      photosImported,
      reason: "l'etat a change entre la readiness stable et cette revalidation -- fallback humain existant inchange",
    });
    return;
  }

  deps.log.info("AUTO_SUBMIT_TRIGGERED", {
    buttonFound: buttonState.found,
    disabled: buttonState.disabled,
    ariaDisabled: buttonState.ariaDisabled,
    priceState,
    photosImported,
    syntheticMethod: "dispatchFullClick (formFill.ts) -- meme methode deja validee en direct par le POC diagnostique",
  });

  dispatchFullClick(btn);
}
