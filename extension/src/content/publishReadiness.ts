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

// Mission "ROUND READY UX" (2026-08-19) : isFormReallyReadyToSubmit() ci-dessus
// reste INCHANGEE (aucune condition metier ajoutee/retiree) -- ce qui suit est
// une couche de STABILITE temporelle purement ajoutee par-dessus, pour la
// meme raison qui a motive watchForCategorySelectionAndPrefillAttributes/
// waitForCondition ailleurs dans ce fichier : une lecture DOM instantanee
// peut capturer un etat transitoire qui ne survit pas au prochain cycle de
// rendu React. Jusqu'ici, seul le temps de reaction humain (l'utilisateur
// doit remarquer l'ecran puis cliquer) absorbait implicitement ce risque ;
// ce filet disparait des qu'on veut rendre le signal plus proactif (highlight
// visuel). evaluateReadinessStability() exige donc que isFormReallyReadyToSubmit()
// reste continuellement vrai pendant READINESS_STABILITY_WINDOW_MS avant de
// declarer le formulaire "stable" -- toute reevaluation fausse remet la
// fenetre a zero (pas de moyenne, pas de tolerance).
export const READINESS_STABILITY_WINDOW_MS = 750;

export interface ReadinessStabilityState {
  // Horodatage (Date.now()) du debut de la sequence continue actuelle de
  // "vrai" -- null tant que la derniere evaluation connue etait fausse (ou
  // avant la toute premiere evaluation).
  stableSinceMs: number | null;
}

export const INITIAL_READINESS_STABILITY_STATE: ReadinessStabilityState = { stableSinceMs: null };

export interface ReadinessStabilityEvaluation {
  nextState: ReadinessStabilityState;
  // true uniquement lorsque isReadyNow est vrai ET que la fenetre continue
  // depuis stableSinceMs a atteint/depasse READINESS_STABILITY_WINDOW_MS.
  isStable: boolean;
}

export function evaluateReadinessStability(
  isReadyNow: boolean,
  nowMs: number,
  prevState: ReadinessStabilityState
): ReadinessStabilityEvaluation {
  if (!isReadyNow) {
    return { nextState: { stableSinceMs: null }, isStable: false };
  }
  const stableSinceMs = prevState.stableSinceMs ?? nowMs;
  const isStable = nowMs - stableSinceMs >= READINESS_STABILITY_WINDOW_MS;
  return { nextState: { stableSinceMs }, isStable };
}
