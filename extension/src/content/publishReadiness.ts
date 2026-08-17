// Mission "REPUBLICATION VINTED : BUG PRIX + FAUX READY_TO_SUBMIT" (2026-08-16) :
// logique de decision PURE (aucun acces DOM/chrome ici) -- extraite pour
// rester testable en isolation, meme discipline que categoryDetection.ts/
// matchOption.ts. vinted-publish.ts reste seul responsable d'interroger le
// DOM (fraichement a chaque evaluation, jamais une reference figee) pour
// produire les etats consommes ici.
//
// CAUSE CONFIRMEE en test live : le bouton "Ajouter" seul peut rester
// non-disabled alors qu'un champ affiche encore une erreur de validation
// bloquante ("24,00 €" reellement affiche dans le champ prix, mais Vinted
// affichait simultanement "Le champ prix doit être supérieur ou égal à
// 1.0" -- ResellOS annoncait pourtant "Tout est prêt"). isSaveButtonReady()
// seul ne prouve donc PAS que le formulaire est reellement soumissible.
//
// Signal supplementaire volontairement MINIMAL : uniquement le prix, seul
// champ pour lequel ce faux positif a ete prouve en direct -- jamais un
// second moteur de validation generique qui re-verifierait tous les champs
// (hors perimetre explicitement demande).
//
// Mission "FIABILISER L'IMPORT PHOTOS" (2026-08-17) : MEME classe de faux
// positif que le prix, prouvee en direct pour les photos -- le bouton
// "Ajouter" de Vinted n'exige qu'AU MOINS une photo, jamais exactement N.
// Un import partiel (1/5 confirme en test live) laissait donc le bouton
// cliquable et PUBLISH_READY_TO_SUBMIT partait quand meme. `photosImported`
// est desormais un troisieme signal OBLIGATOIRE, aussi strict que le prix :
// `null` (import pas encore termine) et `false` (confirmedCount !==
// expectedCount, voir photoImportVerification.ts) bloquent tous les deux --
// seul un import REELLEMENT confirme complet laisse passer.
import type { PriceValidationState } from "./formFill";

export interface SaveButtonState {
  found: boolean;
  disabled: boolean | null;
  ariaDisabled: string | null;
  textContent: string | null;
}

export function isSaveButtonReady(state: SaveButtonState): boolean {
  return state.found && state.disabled === false && state.ariaDisabled !== "true";
}

export function isFormReallyReadyToSubmit(
  buttonState: SaveButtonState,
  priceState: PriceValidationState,
  photosImported: boolean | null
): boolean {
  return isSaveButtonReady(buttonState) && priceState.valid && photosImported === true;
}
