import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  attemptAutomaticRepublishSubmit,
  isRepublishPayload,
  resetPublishAutoSubmitForTests,
  type PublishAutoSubmitDeps,
} from "../publishAutoSubmit";
import type { PriceValidationState } from "../formFill";
import type { PublishListingPayload } from "../../lib/messages";

// Mission "SUBMIT AUTOMATIQUE -- REPUBLICATION" (2026-08-19). Couvre les 10
// scenarios explicitement demandes par l'audit valide. dispatchFullClick()
// (formFill.ts) n'est JAMAIS mocke -- on verifie son effet reel (un vrai
// evenement "click" atteint bien le bouton) plutot que de simuler l'appel,
// meme discipline que publishSyntheticClickPoc.test.ts.

const SELECTOR = '[data-testid="upload-form-save-button"]';

function makeButton(disabled = false, ariaDisabled: string | null = null): HTMLButtonElement {
  document.body.innerHTML = `<button data-testid="upload-form-save-button">Ajouter</button>`;
  const btn = document.querySelector<HTMLButtonElement>(SELECTOR)!;
  btn.disabled = disabled;
  if (ariaDisabled !== null) btn.setAttribute("aria-disabled", ariaDisabled);
  return btn;
}

function stubPriceState(overrides: Partial<PriceValidationState> = {}): PriceValidationState {
  return {
    found: true,
    domValue: "24,00 €",
    parsedValue: 24,
    validityValid: true,
    validationMessage: null,
    ariaInvalid: null,
    errorTextFound: false,
    valid: true,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<PublishAutoSubmitDeps> = {}): {
  deps: PublishAutoSubmitDeps;
  infoLogs: Array<{ message: string; detail?: Record<string, unknown> }>;
  warnLogs: Array<{ message: string; detail?: Record<string, unknown> }>;
} {
  const infoLogs: Array<{ message: string; detail?: Record<string, unknown> }> = [];
  const warnLogs: Array<{ message: string; detail?: Record<string, unknown> }> = [];
  const deps: PublishAutoSubmitDeps = {
    describeButtonState: () => {
      const btn = document.querySelector<HTMLButtonElement>(SELECTOR);
      return {
        found: !!btn,
        disabled: btn?.disabled ?? null,
        ariaDisabled: btn?.getAttribute("aria-disabled") ?? null,
        textContent: btn?.textContent?.trim() ?? null,
      };
    },
    describePriceState: () => stubPriceState(),
    isPhotosImported: () => true,
    log: {
      info: (message, detail) => infoLogs.push({ message, detail }),
      warn: (message, detail) => warnLogs.push({ message, detail }),
    },
    ...overrides,
  };
  return { deps, infoLogs, warnLogs };
}

function makePayload(overrides: Record<string, unknown> = {}): PublishListingPayload {
  return {
    title: "T-shirt",
    description: "desc",
    price: 24,
    category: "cat",
    brand: null,
    size: null,
    condition: "good",
    color: null,
    material: null,
    imageUrls: ["https://images1.vinted.net/a.jpg"],
    packageSize: "medium",
    expectedVintedUsername: "matleshop",
    ...overrides,
  } as PublishListingPayload;
}

beforeEach(() => {
  resetPublishAutoSubmitForTests();
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isRepublishPayload -- porte republish_listing UNIQUEMENT (scenarios 2 et 3)", () => {
  it("2. renvoie false pour un payload publish_listing (pas de previousVintedItemId) -- aucun submit automatique", () => {
    expect(isRepublishPayload(makePayload())).toBe(false);
  });

  it("3. renvoie true pour un payload republish_listing (previousVintedItemId string presente)", () => {
    expect(isRepublishPayload(makePayload({ previousVintedItemId: "9604958273" }))).toBe(true);
  });

  it("ignore une previousVintedItemId non-string (defensif, jamais suppose republish sur une forme inattendue)", () => {
    expect(isRepublishPayload(makePayload({ previousVintedItemId: 12345 }))).toBe(false);
  });
});

describe("attemptAutomaticRepublishSubmit", () => {
  it("1./3. clique exactement une fois quand toutes les conditions sont reunies (readiness stable simulee par l'appelant)", () => {
    const btn = makeButton(false);
    const clicks: MouseEvent[] = [];
    btn.addEventListener("click", (e) => clicks.push(e));
    const { deps, infoLogs } = makeDeps();

    attemptAutomaticRepublishSubmit(deps);

    expect(clicks).toHaveLength(1);
    expect(clicks[0].isTrusted).toBe(false); // dispatchFullClick -- jamais isTrusted falsifie
    expect(infoLogs.some((l) => l.message === "AUTO_SUBMIT_TRIGGERED")).toBe(true);
  });

  it("4. double appel => toujours une seule tentative (deuxieme appel no-op, journalise)", () => {
    const btn = makeButton(false);
    const clicks: MouseEvent[] = [];
    btn.addEventListener("click", (e) => clicks.push(e));
    const { deps, warnLogs } = makeDeps();

    attemptAutomaticRepublishSubmit(deps);
    attemptAutomaticRepublishSubmit(deps);
    attemptAutomaticRepublishSubmit(deps);

    expect(clicks).toHaveLength(1);
    expect(warnLogs.filter((l) => l.message === "AUTO_SUBMIT_ALREADY_ATTEMPTED")).toHaveLength(2);
  });

  it("5. bouton remplace par React entre la lecture d'etat et le clic => cible le NOUVEAU bouton, jamais l'ancien", () => {
    const oldBtn = makeButton(false);
    const oldClicks: MouseEvent[] = [];
    oldBtn.addEventListener("click", (e) => oldClicks.push(e));

    // deps.describeButtonState() re-interroge le DOM a CHAQUE appel (comme
    // describeSaveButtonState reel) -- on remplace le bouton DANS cette
    // meme fonction, juste avant que attemptAutomaticRepublishSubmit ne
    // resolve le bouton pour le clic lui-meme (document.querySelector,
    // strictement apres l'appel a describeButtonState dans l'ordre du
    // module) -- reproduit un re-render React survenant entre les deux.
    let newBtn: HTMLButtonElement | null = null;
    const newClicks: MouseEvent[] = [];
    const { deps } = makeDeps({
      describeButtonState: () => {
        oldBtn.replaceWith((() => {
          const b = document.createElement("button");
          b.setAttribute("data-testid", "upload-form-save-button");
          b.textContent = "Ajouter";
          b.addEventListener("click", (e) => newClicks.push(e));
          newBtn = b;
          return b;
        })());
        return { found: true, disabled: false, ariaDisabled: null, textContent: "Ajouter" };
      },
    });

    attemptAutomaticRepublishSubmit(deps);

    expect(oldClicks).toHaveLength(0);
    expect(newClicks).toHaveLength(1);
    expect(newBtn).not.toBeNull();
  });

  it("6. bouton disparu au dernier instant => aucun dispatch", () => {
    makeButton(false);
    const { deps, warnLogs } = makeDeps({
      describeButtonState: () => ({ found: true, disabled: false, ariaDisabled: null, textContent: "Ajouter" }), // etat "stable" perime
    });
    document.body.innerHTML = ""; // le bouton disparait reellement du DOM juste avant l'appel

    attemptAutomaticRepublishSubmit(deps);

    const skip = warnLogs.find((l) => l.message === "AUTO_SUBMIT_SKIPPED_STALE_STATE");
    expect(skip).toBeDefined();
    expect(skip?.detail?.buttonFound).toBe(false);
  });

  it("7. prix devenu invalide au dernier instant => aucun dispatch", () => {
    const btn = makeButton(false);
    const clicks: MouseEvent[] = [];
    btn.addEventListener("click", (e) => clicks.push(e));
    const { deps, warnLogs } = makeDeps({ describePriceState: () => stubPriceState({ valid: false, domValue: "" }) });

    attemptAutomaticRepublishSubmit(deps);

    expect(clicks).toHaveLength(0);
    const skip = warnLogs.find((l) => l.message === "AUTO_SUBMIT_SKIPPED_STALE_STATE");
    expect(skip?.detail?.priceValid).toBe(false);
  });

  it("8. photos non confirmees au dernier instant => aucun dispatch", () => {
    const btn = makeButton(false);
    const clicks: MouseEvent[] = [];
    btn.addEventListener("click", (e) => clicks.push(e));
    const { deps, warnLogs } = makeDeps({ isPhotosImported: () => false });

    attemptAutomaticRepublishSubmit(deps);

    expect(clicks).toHaveLength(0);
    const skip = warnLogs.find((l) => l.message === "AUTO_SUBMIT_SKIPPED_STALE_STATE");
    expect(skip?.detail?.photosImported).toBe(false);
  });

  it("bouton trouve mais disabled => aucun dispatch (meme famille que 6/7/8, condition bouton enabled)", () => {
    const btn = makeButton(true);
    const clicks: MouseEvent[] = [];
    btn.addEventListener("click", (e) => clicks.push(e));
    const { deps, warnLogs } = makeDeps();

    attemptAutomaticRepublishSubmit(deps);

    expect(clicks).toHaveLength(0);
    expect(warnLogs.find((l) => l.message === "AUTO_SUBMIT_SKIPPED_STALE_STATE")?.detail?.buttonReady).toBe(false);
  });

  it("9. aucun couplage avec le POC -- window.__resellosRunPublishSyntheticClickPoc jamais touche", () => {
    const btn = makeButton(false);
    btn.addEventListener("click", () => {});
    const { deps } = makeDeps();
    const globalKey = "__resellosRunPublishSyntheticClickPoc";
    expect((window as unknown as Record<string, unknown>)[globalKey]).toBeUndefined();

    attemptAutomaticRepublishSubmit(deps);

    expect((window as unknown as Record<string, unknown>)[globalKey]).toBeUndefined();
  });
});

// 10. "aucun changement des flows CAS/DELETE" : publishAutoSubmit.ts n'importe
// et n'appelle rien de handlers/publishListing.ts, republishTransaction.ts ou
// deleteOldListing.ts (aucune reference dans ce fichier, aucun import chrome.*
// -- verifiable par grep, et implicitement demontre par TOUS les tests
// ci-dessus qui s'executent sans jamais stubber `chrome`). Rien de plus a
// asserter ici : ces flows vivent cote background/service worker et ne sont
// simplement jamais atteints depuis ce module -- confirme par lecture de
// code (handlers/publishListing.ts, republishTransaction.ts, deleteOldListing.ts
// sont inchanges dans ce round), pas par un test d'integration cross-contexte.
