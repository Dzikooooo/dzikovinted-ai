import { describe, expect, it } from "vitest";
import {
  evaluateReadinessStability,
  isFormReallyReadyToSubmit,
  isSaveButtonReady,
  INITIAL_READINESS_STABILITY_STATE,
  READINESS_STABILITY_WINDOW_MS,
  type SaveButtonState,
} from "../publishReadiness";
import type { PriceValidationState } from "../formFill";

// Mission "REPUBLICATION VINTED : BUG PRIX + FAUX READY_TO_SUBMIT" (2026-08-16) :
// preuve live directe -- le bouton "Ajouter" seul (isSaveButtonReady) rapportait
// deja "pret" alors que Vinted affichait encore une erreur de validation prix
// bloquante ; ResellOS envoyait donc PUBLISH_READY_TO_SUBMIT a tort. Ces tests
// couvrent les scenarios C et D de la mission : C (une erreur bloquante
// subsiste => interdit) et D (bouton + validation reelle OK => autorise).

function readyButton(): SaveButtonState {
  return { found: true, disabled: false, ariaDisabled: null, textContent: "Ajouter" };
}

function disabledButton(): SaveButtonState {
  return { found: true, disabled: true, ariaDisabled: null, textContent: "Ajouter" };
}

function validPrice(): PriceValidationState {
  return { found: true, domValue: "24,00 €", parsedValue: 24, validityValid: true, validationMessage: null, ariaInvalid: null, errorTextFound: false, valid: true };
}

function invalidPrice(): PriceValidationState {
  return {
    found: true,
    domValue: "24,00 €",
    parsedValue: 24,
    validityValid: false,
    validationMessage: "Le champ prix doit être supérieur ou égal à 1.0",
    ariaInvalid: null,
    errorTextFound: true,
    valid: false,
  };
}

describe("isSaveButtonReady", () => {
  it("is true only when found, not disabled, and aria-disabled isn't 'true'", () => {
    expect(isSaveButtonReady(readyButton())).toBe(true);
  });

  it("is false when the button is disabled", () => {
    expect(isSaveButtonReady(disabledButton())).toBe(false);
  });

  it("is false when the button isn't found at all", () => {
    expect(isSaveButtonReady({ found: false, disabled: null, ariaDisabled: null, textContent: null })).toBe(false);
  });

  it("is false when aria-disabled is 'true' even if disabled is false", () => {
    expect(isSaveButtonReady({ found: true, disabled: false, ariaDisabled: "true", textContent: "Ajouter" })).toBe(false);
  });
});

describe("isFormReallyReadyToSubmit", () => {
  // Scenario C de la mission : le bouton est non-disabled (l'ANCIEN seul
  // signal), mais Vinted affiche encore une erreur de validation prix
  // bloquante -- ne doit JAMAIS etre considere pret. C'est EXACTEMENT le bug
  // live rapporte ("24,00 €" affiche + "Le champ prix doit être supérieur ou
  // égal à 1.0" + ResellOS annoncait pourtant "Tout est prêt").
  it("scenario C: button ready but the price still shows a blocking Vinted error -- FORBIDDEN", () => {
    expect(isFormReallyReadyToSubmit(readyButton(), invalidPrice(), true)).toBe(false);
  });

  // Scenario D : bouton pret ET prix reellement valide ET photos confirmees -- autorise.
  it("scenario D: button ready AND price genuinely valid AND photos confirmed -- ALLOWED", () => {
    expect(isFormReallyReadyToSubmit(readyButton(), validPrice(), true)).toBe(true);
  });

  it("stays forbidden when the button itself isn't ready, even if the price is valid", () => {
    expect(isFormReallyReadyToSubmit(disabledButton(), validPrice(), true)).toBe(false);
  });

  it("stays forbidden when both the button and the price are not ready", () => {
    expect(isFormReallyReadyToSubmit(disabledButton(), invalidPrice(), true)).toBe(false);
  });

  // Mission "BUG CONFIRME -- readiness prix faussement positive" (2026-08-19) :
  // isFormReallyReadyToSubmit() elle-meme reste une simple lecture de
  // priceState.valid (aucune condition metier ajoutee ici) -- mais
  // describePriceValidationState() (formFill.ts, seule source reelle de ce
  // priceState) ne produit plus JAMAIS found:false avec valid:true (le prix
  // est obligatoire dans ce flow). Ce test verifie donc desormais le
  // comportement reel bout en bout : un prix non observable est traite comme
  // NON pret, jamais suppose valide par defaut.
  it("stays forbidden on a price field that couldn't be found -- price is mandatory, never assumed valid by default", () => {
    const unobservablePrice: PriceValidationState = {
      found: false,
      domValue: null,
      parsedValue: null,
      validityValid: null,
      validationMessage: null,
      ariaInvalid: null,
      errorTextFound: false,
      valid: false,
    };
    expect(isFormReallyReadyToSubmit(readyButton(), unobservablePrice, true)).toBe(false);
  });

  // Mission "FIABILISER L'IMPORT PHOTOS" (2026-08-17) : bug live reproductible
  // -- 1/5 photos confirmees, bouton "Ajouter" quand meme cliquable (Vinted
  // n'exige qu'au moins une photo), ResellOS invitait quand meme a publier.
  it("stays forbidden when photos are not yet confirmed (null -- import still in progress), even if button and price are ready", () => {
    expect(isFormReallyReadyToSubmit(readyButton(), validPrice(), null)).toBe(false);
  });

  it("stays forbidden when photo import genuinely failed (false -- confirmedCount !== expectedCount), even if button and price are ready", () => {
    expect(isFormReallyReadyToSubmit(readyButton(), validPrice(), false)).toBe(false);
  });
});

// Mission "ROUND READY UX" (2026-08-19) : evaluateReadinessStability() est la
// couche AJOUTEE par-dessus isFormReallyReadyToSubmit() (inchangee, voir
// au-dessus) -- exige 750ms CONTINUS de "vrai" avant de declarer "stable",
// toute reevaluation fausse remettant la fenetre a zero. Purement une
// fonction de temps/etat, testee ici independamment de tout DOM/chrome.
describe("evaluateReadinessStability", () => {
  it("readiness vraie pendant <750ms puis fausse : jamais stable, timer remis a zero", () => {
    const t0 = 1_000_000;
    const step1 = evaluateReadinessStability(true, t0, INITIAL_READINESS_STABILITY_STATE);
    expect(step1.isStable).toBe(false);
    expect(step1.nextState.stableSinceMs).toBe(t0);

    const step2 = evaluateReadinessStability(true, t0 + 400, step1.nextState);
    expect(step2.isStable).toBe(false);
    expect(step2.nextState.stableSinceMs).toBe(t0); // fenetre inchangee, toujours vraie en continu

    const step3 = evaluateReadinessStability(false, t0 + 600, step2.nextState);
    expect(step3.isStable).toBe(false);
    expect(step3.nextState.stableSinceMs).toBeNull(); // remise a zero explicite
  });

  it("readiness vraie en continu pendant ≥750ms : stable UNE SEULE FOIS (au premier franchissement)", () => {
    const t0 = 2_000_000;
    const start = evaluateReadinessStability(true, t0, INITIAL_READINESS_STABILITY_STATE);
    expect(start.isStable).toBe(false);

    const before = evaluateReadinessStability(true, t0 + 749, start.nextState);
    expect(before.isStable).toBe(false); // 749ms < fenetre : pas encore stable

    const atThreshold = evaluateReadinessStability(true, t0 + READINESS_STABILITY_WINDOW_MS, before.nextState);
    expect(atThreshold.isStable).toBe(true); // exactement 750ms : stable (>=, pas >)

    // Une evaluation ULTERIEURE, toujours vraie, reste "stable" a chaque
    // appel (la fonction elle-meme est pure et sans effet de bord de
    // deduplication -- c'est a l'appelant, dans vinted-publish.ts, de
    // n'envoyer PUBLISH_READY_TO_SUBMIT qu'une seule fois en arretant le
    // sondage des le premier isStable:true, jamais a evaluateReadinessStability()
    // de le garantir elle-meme).
    const after = evaluateReadinessStability(true, t0 + READINESS_STABILITY_WINDOW_MS + 200, atThreshold.nextState);
    expect(after.isStable).toBe(true);
  });

  it("un retour a false PENDANT la fenetre remet le timer a zero -- il faut de nouveau 750ms complets depuis ce nouveau départ", () => {
    const t0 = 3_000_000;
    let state = INITIAL_READINESS_STABILITY_STATE;

    state = evaluateReadinessStability(true, t0, state).nextState;
    state = evaluateReadinessStability(true, t0 + 400, state).nextState;

    // Redevient faux a 500ms, avant d'avoir atteint 750ms.
    const reset = evaluateReadinessStability(false, t0 + 500, state);
    expect(reset.isStable).toBe(false);
    expect(reset.nextState.stableSinceMs).toBeNull();
    state = reset.nextState;

    // Redevient vrai a 600ms -- un NOUVEAU depart, pas une reprise de
    // l'ancienne fenetre : 750ms de plus doivent s'ecouler depuis CE point,
    // pas depuis le tout premier "vrai" a t0.
    state = evaluateReadinessStability(true, t0 + 600, state).nextState;
    const notYetStableAfterOldWindow = evaluateReadinessStability(true, t0 + 600 + 749, state);
    expect(notYetStableAfterOldWindow.isStable).toBe(false);

    const stableAfterNewWindow = evaluateReadinessStability(true, t0 + 600 + READINESS_STABILITY_WINDOW_MS, notYetStableAfterOldWindow.nextState);
    expect(stableAfterNewWindow.isStable).toBe(true);
  });

  it("juste avant le seuil (749ms) : pas encore stable", () => {
    const t0 = 4_000_000;
    const start = evaluateReadinessStability(true, t0, INITIAL_READINESS_STABILITY_STATE);
    const almost = evaluateReadinessStability(true, t0 + READINESS_STABILITY_WINDOW_MS - 1, start.nextState);
    expect(almost.isStable).toBe(false);
  });

  it("isReadyNow:false des la toute premiere evaluation (aucun etat prealable) : jamais stable", () => {
    const result = evaluateReadinessStability(false, 5_000_000, INITIAL_READINESS_STABILITY_STATE);
    expect(result.isStable).toBe(false);
    expect(result.nextState.stableSinceMs).toBeNull();
  });
});
