import { describe, expect, it } from "vitest";
import { isFormReallyReadyToSubmit, isSaveButtonReady, type SaveButtonState } from "../publishReadiness";
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

  it("is permissive on a price field that couldn't be found (found:false, valid:true) -- never blocks readiness on an unobservable field", () => {
    const unobservablePrice: PriceValidationState = {
      found: false,
      domValue: null,
      parsedValue: null,
      validityValid: null,
      validationMessage: null,
      ariaInvalid: null,
      errorTextFound: false,
      valid: true,
    };
    expect(isFormReallyReadyToSubmit(readyButton(), unobservablePrice, true)).toBe(true);
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
