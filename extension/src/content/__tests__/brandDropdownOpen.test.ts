import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openBrandDropdownWithRetry, type BrandDropdownOpenLogger } from "../brandDropdownOpen";

// Mission "ROBUSTESSE OUVERTURE MARQUE" (2026-08-16) : jsdom n'implemente pas
// de layout reel -- offsetParent/getClientRects() restent toujours
// "invisibles" par defaut, meme stub que colorOptionReader.test.ts/
// sizeOptionReader.test.ts/conditionOptionReader.test.ts.
function markVisible(el: HTMLElement): void {
  Object.defineProperty(el, "offsetParent", { get: () => document.body, configurable: true });
}

const TRIGGER_SELECTOR = '[data-testid="brand-select-dropdown-input"]';
const CONTENT_SELECTOR = '[data-testid="brand-select-dropdown-content"]';
const SEARCH_INPUT_SELECTOR = "#brand-search-input";

function makeLogger(): BrandDropdownOpenLogger & { infoCalls: Array<[string, Record<string, unknown> | undefined]>; warnCalls: Array<[string, Record<string, unknown> | undefined]> } {
  const infoCalls: Array<[string, Record<string, unknown> | undefined]> = [];
  const warnCalls: Array<[string, Record<string, unknown> | undefined]> = [];
  return {
    info: vi.fn((message: string, detail?: Record<string, unknown>) => {
      infoCalls.push([message, detail]);
    }),
    warn: vi.fn((message: string, detail?: Record<string, unknown>) => {
      warnCalls.push([message, detail]);
    }),
    infoCalls,
    warnCalls,
  };
}

function appendContentWithSearchInput(): HTMLElement {
  const content = document.createElement("div");
  content.setAttribute("data-testid", "brand-select-dropdown-content");
  const search = document.createElement("input");
  search.id = "brand-search-input";
  content.appendChild(search);
  document.body.appendChild(content);
  return content;
}

describe("openBrandDropdownWithRetry", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  // Cas 1 : ouverture reussie au 1er essai -- preuve live directe reproduite
  // (dispatchFullClick sur le trigger ouvre reellement le panneau).
  it("succeeds on the first attempt when the click opens the panel immediately", async () => {
    const trigger = document.createElement("input");
    trigger.setAttribute("data-testid", "brand-select-dropdown-input");
    markVisible(trigger);
    document.body.appendChild(trigger);
    trigger.addEventListener("click", () => appendContentWithSearchInput());

    const log = makeLogger();
    const result = await openBrandDropdownWithRetry({
      triggerSelector: TRIGGER_SELECTOR,
      contentSelector: CONTENT_SELECTOR,
      searchInputSelector: SEARCH_INPUT_SELECTOR,
      log,
      maxAttempts: 3,
      attemptTimeoutMs: 500,
    });

    expect(result).not.toBeNull();
    expect(result?.getAttribute("data-testid")).toBe("brand-select-dropdown-content");
    // Une seule tentative necessaire -- aucun log d'echec.
    expect(log.warnCalls).toEqual([]);
    expect(log.infoCalls.filter(([msg]) => msg === "BRAND_OPEN_ATTEMPT")).toHaveLength(1);
    expect(log.infoCalls.filter(([msg]) => msg === "BRAND_OPEN_RESULT")).toHaveLength(1);
  });

  // Cas 2 : le 1er essai echoue (etat transitoire -- le clic ne produit
  // rien), le trigger est REMPLACE par un nouveau noeud (simule un
  // re-render Vinted), le 2e essai reussit -- preuve que le trigger est
  // bien RE-INTERROGE depuis document a chaque tentative, jamais une
  // reference conservee de la 1ere tentative.
  it("retries with a freshly re-queried trigger when the first attempt fails after a Vinted-like re-render, and succeeds on the second", async () => {
    const staleTrigger = document.createElement("input");
    staleTrigger.setAttribute("data-testid", "brand-select-dropdown-input");
    markVisible(staleTrigger);
    document.body.appendChild(staleTrigger);

    let freshTrigger: HTMLElement | null = null;
    staleTrigger.addEventListener("click", () => {
      // Simule un re-render Vinted : le trigger existant est remplace par un
      // NOUVEAU noeud distinct -- ne produit AUCUN contenu lui-meme (1er
      // essai doit echouer).
      staleTrigger.remove();
      freshTrigger = document.createElement("input");
      freshTrigger.setAttribute("data-testid", "brand-select-dropdown-input");
      markVisible(freshTrigger);
      freshTrigger.addEventListener("click", () => appendContentWithSearchInput());
      document.body.appendChild(freshTrigger);
    });

    const log = makeLogger();
    const result = await openBrandDropdownWithRetry({
      triggerSelector: TRIGGER_SELECTOR,
      contentSelector: CONTENT_SELECTOR,
      searchInputSelector: SEARCH_INPUT_SELECTOR,
      log,
      maxAttempts: 3,
      attemptTimeoutMs: 300,
    });

    expect(result).not.toBeNull();
    // La reference clique a la 2e tentative n'est PAS le trigger d'origine --
    // preuve directe du re-query.
    expect(freshTrigger).not.toBeNull();
    expect(freshTrigger).not.toBe(staleTrigger);
    expect(document.querySelector(TRIGGER_SELECTOR)).toBe(freshTrigger);

    const attempts = log.infoCalls.filter(([msg]) => msg === "BRAND_OPEN_ATTEMPT");
    expect(attempts).toHaveLength(2);
    // Ordre chronologique reel : le 1er essai (echec) est loggue via warn(),
    // le 2e (succes) via info() -- deux flux distincts, jamais melanges par
    // numero d'appel brut.
    const failureResults = log.warnCalls.filter(([msg]) => msg === "BRAND_OPEN_RESULT");
    const successResults = log.infoCalls.filter(([msg]) => msg === "BRAND_OPEN_RESULT");
    expect(failureResults).toHaveLength(1);
    expect(successResults).toHaveLength(1);
    expect(failureResults[0][1]?.attempt).toBe(1);
    expect(failureResults[0][1]?.success).toBe(false);
    expect(successResults[0][1]?.attempt).toBe(2);
    expect(successResults[0][1]?.success).toBe(true);
  });

  // Cas 3 : toutes les tentatives echouent -- fallback propre (null), jamais
  // une boucle infinie, jamais un contenu invente.
  it("returns null after all bounded attempts fail, without looping indefinitely", async () => {
    const trigger = document.createElement("input");
    trigger.setAttribute("data-testid", "brand-select-dropdown-input");
    markVisible(trigger);
    document.body.appendChild(trigger);
    // Le clic ne produit jamais rien -- aucun content, aucun search input.

    const log = makeLogger();
    const result = await openBrandDropdownWithRetry({
      triggerSelector: TRIGGER_SELECTOR,
      contentSelector: CONTENT_SELECTOR,
      searchInputSelector: SEARCH_INPUT_SELECTOR,
      log,
      maxAttempts: 3,
      attemptTimeoutMs: 50,
    });

    expect(result).toBeNull();
    expect(log.infoCalls.filter(([msg]) => msg === "BRAND_OPEN_ATTEMPT")).toHaveLength(3);
    const failureResults = log.warnCalls.filter(([msg]) => msg === "BRAND_OPEN_RESULT");
    expect(failureResults).toHaveLength(3);
    expect(failureResults.every(([, detail]) => detail?.success === false)).toBe(true);
  });

  // Cas 4 : aucune double-selection/double-recherche -- ce module s'arrete
  // des qu'UN content valide est trouve, jamais plus d'un clic par
  // tentative, jamais de tentative supplementaire une fois reussi.
  it("clicks the trigger exactly once per attempt and stops immediately on the first successful attempt -- never over-clicks or over-retries", async () => {
    const trigger = document.createElement("input");
    trigger.setAttribute("data-testid", "brand-select-dropdown-input");
    markVisible(trigger);
    document.body.appendChild(trigger);
    const clickHandler = vi.fn(() => appendContentWithSearchInput());
    trigger.addEventListener("click", clickHandler);

    const log = makeLogger();
    const result = await openBrandDropdownWithRetry({
      triggerSelector: TRIGGER_SELECTOR,
      contentSelector: CONTENT_SELECTOR,
      searchInputSelector: SEARCH_INPUT_SELECTOR,
      log,
      maxAttempts: 3,
      attemptTimeoutMs: 500,
    });

    expect(result).not.toBeNull();
    expect(clickHandler).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll(CONTENT_SELECTOR)).toHaveLength(1);
    expect(document.querySelectorAll(SEARCH_INPUT_SELECTOR)).toHaveLength(1);
  });

  // Verifie que le trigger connecte/visible est bien controle AVANT le clic
  // -- un trigger absent (ou present mais non visible, ex. offsetParent
  // null sous jsdom sans le stub markVisible) n'est JAMAIS clique : chaque
  // tentative echoue proprement avec la raison explicite, jamais de clic
  // sur un noeud null/detache, jamais de plantage.
  it("never clicks a trigger that is absent or not visible -- fails cleanly with an explicit reason on every attempt", async () => {
    // Aucun trigger n'est jamais ajoute au DOM -- les 3 tentatives doivent
    // toutes echouer sur le meme garde-fou, sans jamais tenter de clic.
    const log = makeLogger();
    const result = await openBrandDropdownWithRetry({
      triggerSelector: TRIGGER_SELECTOR,
      contentSelector: CONTENT_SELECTOR,
      searchInputSelector: SEARCH_INPUT_SELECTOR,
      log,
      maxAttempts: 3,
      attemptTimeoutMs: 50,
    });

    expect(result).toBeNull();
    const failureResults = log.warnCalls.filter(([msg]) => msg === "BRAND_OPEN_RESULT");
    expect(failureResults).toHaveLength(3);
    expect(failureResults.every(([, detail]) => detail?.reason === "trigger_absent_or_not_visible")).toBe(true);
    expect(document.querySelectorAll(CONTENT_SELECTOR)).toHaveLength(0);
  });
});
