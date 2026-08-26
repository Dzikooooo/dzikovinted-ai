import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initPublishSyntheticClickPoc,
  resetPublishSyntheticClickPocForTests,
  SYNTHETIC_CLICK_TEST_WAIT_MS,
  type PublishSyntheticClickPocDeps,
} from "../publishSyntheticClickPoc";
import { PUBLISH_CREATE_RESPONSE_EVENT_NAME } from "../publishCreateResponseCapture";
import type { PriceValidationState } from "../formFill";

// Mission "ROUND SUIVANT -- POC DIAGNOSTIQUE DIRECT DU BOUTON AJOUTER"
// (2026-08-19) : couvre exactement les garanties de securite demandees --
// impossible a lancer involontairement (DEV gate), une seule tentative,
// aucun retry, aucune execution avant readiness stable, instrumentation
// correctement emise, aucun impact quand desactive.
//
// Mission "ROUND SUIVANT -- AUDIT FOCUS PRIX" (2026-08-19) : ajoute la
// couverture des 3 elements d'instrumentation diagnostique demandes --
// activeElement/priceState dans STARTED, et le listener passif sur le
// premier clic humain reel.

const SELECTOR = '[data-testid="upload-form-save-button"]';
const PRICE_SELECTOR = '[data-testid="price-input--input"]';

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

function makeDeps(overrides: Partial<PublishSyntheticClickPocDeps> = {}): {
  deps: PublishSyntheticClickPocDeps;
  infoLogs: Array<{ message: string; detail?: Record<string, unknown> }>;
  warnLogs: Array<{ message: string; detail?: Record<string, unknown> }>;
} {
  const infoLogs: Array<{ message: string; detail?: Record<string, unknown> }> = [];
  const warnLogs: Array<{ message: string; detail?: Record<string, unknown> }> = [];
  const deps: PublishSyntheticClickPocDeps = {
    isReadinessConfirmed: () => true,
    describeButtonState: () => {
      const btn = document.querySelector<HTMLButtonElement>(SELECTOR);
      return { found: !!btn, disabled: btn?.disabled ?? null, ariaDisabled: btn?.getAttribute("aria-disabled") ?? null };
    },
    describePriceState: () => stubPriceState(),
    log: {
      info: (message, detail) => infoLogs.push({ message, detail }),
      warn: (message, detail) => warnLogs.push({ message, detail }),
    },
    ...overrides,
  };
  return { deps, infoLogs, warnLogs };
}

function getTrigger(): (() => void) | undefined {
  return (window as unknown as { __resellosRunPublishSyntheticClickPoc?: () => void }).__resellosRunPublishSyntheticClickPoc;
}

function clearTrigger(): void {
  delete (window as unknown as { __resellosRunPublishSyntheticClickPoc?: () => void }).__resellosRunPublishSyntheticClickPoc;
}

// jsdom (comme tout navigateur reel) ne peut jamais produire isTrusted:true
// sur un evenement disptache par du script -- meme pattern deja etabli
// ailleurs dans ce projet (vinted-item-delete.test.ts) : on espionne
// document.addEventListener("click", ...) pour recuperer directement le
// callback reellement enregistre, puis on l'invoque avec un objet minimal
// {isTrusted, target}, jamais un vrai dispatchEvent().
function registeredClickListeners(addSpy: { mock: { calls: unknown[][] } }): Array<(e: MouseEvent) => void> {
  return addSpy.mock.calls.filter((c) => c[0] === "click").map((c) => c[1] as (e: MouseEvent) => void);
}

beforeEach(() => {
  resetPublishSyntheticClickPocForTests();
  document.body.innerHTML = "";
  clearTrigger();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  clearTrigger();
});

describe("initPublishSyntheticClickPoc -- isolation (impossible de lancer involontairement)", () => {
  it("n'expose rien du tout quand isEnabled=false (equivalent du seul build reellement distribue -- npm run build:beta, mode 'beta')", () => {
    const { deps } = makeDeps();
    initPublishSyntheticClickPoc(deps, false);
    expect(getTrigger()).toBeUndefined();
  });

  it("n'attache aucun listener document et n'appelle jamais describeButtonState quand isEnabled=false", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const { deps } = makeDeps();
    const describeSpy = vi.fn(deps.describeButtonState);
    initPublishSyntheticClickPoc({ ...deps, describeButtonState: describeSpy }, false);
    expect(addSpy).not.toHaveBeenCalled();
    expect(describeSpy).not.toHaveBeenCalled();
    addSpy.mockRestore();
  });

  it("expose bien le point d'entree quand isEnabled=true (equivalent de npm run build/npm run dev, jamais npm run build:beta)", () => {
    const { deps } = makeDeps();
    initPublishSyntheticClickPoc(deps, true);
    expect(typeof getTrigger()).toBe("function");
  });

  it("le defaut (aucun 3e argument) reflete import.meta.env.MODE !== 'beta' -- vrai sous Vitest (mode 'test'), donc expose le trigger sans override explicite", () => {
    const { deps } = makeDeps();
    initPublishSyntheticClickPoc(deps);
    expect(typeof getTrigger()).toBe("function");
  });
});

describe("publishSyntheticClickPoc -- readiness gate", () => {
  it("refuse de s'executer si la readiness n'est pas confirmee stable -- aucun log STARTED, aucun clic", async () => {
    makeButton(false);
    const { deps, infoLogs, warnLogs } = makeDeps({ isReadinessConfirmed: () => false });
    const describeSpy = vi.fn(deps.describeButtonState);
    initPublishSyntheticClickPoc({ ...deps, describeButtonState: describeSpy }, true);

    getTrigger()!();
    await Promise.resolve();

    expect(infoLogs.find((l) => l.message === "PUBLISH_SYNTHETIC_CLICK_TEST_STARTED")).toBeUndefined();
    expect(warnLogs.find((l) => l.message === "PUBLISH_SYNTHETIC_CLICK_TEST_BLOCKED_NOT_READY")).toBeDefined();
    expect(describeSpy).not.toHaveBeenCalled();
  });
});

describe("publishSyntheticClickPoc -- une seule tentative, aucun retry", () => {
  it("un second declenchement est refuse et journalise -- STARTED n'apparait qu'une fois", async () => {
    vi.useFakeTimers();
    makeButton(false);
    const { deps, infoLogs, warnLogs } = makeDeps();
    initPublishSyntheticClickPoc(deps, true);

    getTrigger()!();
    getTrigger()!(); // second appel immediat, avant meme la resolution du premier

    await vi.advanceTimersByTimeAsync(SYNTHETIC_CLICK_TEST_WAIT_MS);

    const startedLogs = infoLogs.filter((l) => l.message === "PUBLISH_SYNTHETIC_CLICK_TEST_STARTED");
    expect(startedLogs).toHaveLength(1);
    expect(warnLogs.find((l) => l.message === "PUBLISH_SYNTHETIC_CLICK_TEST_ALREADY_ATTEMPTED")).toBeDefined();
  });

  it("apres un premier resultat (succes ou echec), un nouvel appel reste bloque -- jamais rejoue automatiquement", async () => {
    vi.useFakeTimers();
    makeButton(false);
    const { deps, infoLogs, warnLogs } = makeDeps();
    initPublishSyntheticClickPoc(deps, true);

    getTrigger()!();
    await vi.advanceTimersByTimeAsync(SYNTHETIC_CLICK_TEST_WAIT_MS);
    expect(infoLogs.find((l) => l.message === "PUBLISH_SYNTHETIC_CLICK_TEST_RESULT")).toBeDefined();

    warnLogs.length = 0;
    getTrigger()!();
    await Promise.resolve();
    expect(warnLogs.find((l) => l.message === "PUBLISH_SYNTHETIC_CLICK_TEST_ALREADY_ATTEMPTED")).toBeDefined();
  });
});

describe("publishSyntheticClickPoc -- instrumentation emise", () => {
  it("STARTED reflete l'etat reel du bouton (found/disabled/ariaDisabled) et la methode synthetique", async () => {
    vi.useFakeTimers();
    makeButton(false, "false");
    const { deps, infoLogs } = makeDeps();
    initPublishSyntheticClickPoc(deps, true);

    getTrigger()!();
    await vi.advanceTimersByTimeAsync(SYNTHETIC_CLICK_TEST_WAIT_MS);

    const started = infoLogs.find((l) => l.message === "PUBLISH_SYNTHETIC_CLICK_TEST_STARTED");
    expect(started?.detail).toMatchObject({
      buttonFound: true,
      disabled: false,
      ariaDisabled: "false",
      readinessStable: true,
    });
    expect(typeof started?.detail?.syntheticMethod).toBe("string");
    expect(String(started?.detail?.syntheticMethod)).toContain("dispatchFullClick");
  });

  // Mission "ROUND SUIVANT -- AUDIT FOCUS PRIX" (2026-08-19).
  it("STARTED inclut un instantane activeElement/priceState juste avant le clic synthetique", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<input data-testid="price-input--input" /><button data-testid="upload-form-save-button">Ajouter</button>`;
    const priceInput = document.querySelector<HTMLInputElement>(PRICE_SELECTOR)!;
    priceInput.focus();
    const { deps, infoLogs } = makeDeps({ describePriceState: () => stubPriceState({ valid: false, domValue: "" }) });
    initPublishSyntheticClickPoc(deps, true);

    getTrigger()!();
    await vi.advanceTimersByTimeAsync(SYNTHETIC_CLICK_TEST_WAIT_MS);

    const started = infoLogs.find((l) => l.message === "PUBLISH_SYNTHETIC_CLICK_TEST_STARTED");
    expect(started?.detail?.activeElementIsPriceField).toBe(true);
    expect(String(started?.detail?.activeElementDescription)).toContain("price-input--input");
    expect(started?.detail?.priceState).toMatchObject({ valid: false, domValue: "" });
  });

  it("activeElementIsPriceField est false quand le focus n'est pas sur le champ prix", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<input data-testid="price-input--input" /><button data-testid="upload-form-save-button">Ajouter</button>`;
    const { deps, infoLogs } = makeDeps();
    initPublishSyntheticClickPoc(deps, true);

    getTrigger()!();
    await vi.advanceTimersByTimeAsync(SYNTHETIC_CLICK_TEST_WAIT_MS);

    const started = infoLogs.find((l) => l.message === "PUBLISH_SYNTHETIC_CLICK_TEST_STARTED");
    expect(started?.detail?.activeElementIsPriceField).toBe(false);
  });

  it("RESULT non ambigu quand aucune reponse de creation n'est jamais capturee (timeout) -- requestObserved:false", async () => {
    vi.useFakeTimers();
    makeButton(false);
    const { deps, infoLogs } = makeDeps();
    initPublishSyntheticClickPoc(deps, true);

    getTrigger()!();
    await vi.advanceTimersByTimeAsync(SYNTHETIC_CLICK_TEST_WAIT_MS);

    const result = infoLogs.find((l) => l.message === "PUBLISH_SYNTHETIC_CLICK_TEST_RESULT");
    expect(result?.detail).toMatchObject({
      documentClickReceived: true, // dispatchFullClick emet bien un "click" qui bubble jusqu'a document
      clickIsTrustedObserved: false, // jsdom ne peut jamais produire isTrusted:true sur un evenement scripte
      requestObserved: false,
      creationSucceeded: false,
      statusCode: null,
      datadomeObserved: null,
      navigatedAway: false,
    });
  });

  it("RESULT non ambigu quand la reponse de creation EST capturee avant le delai -- requestObserved:true", async () => {
    vi.useFakeTimers();
    makeButton(false);
    const { deps, infoLogs } = makeDeps();
    initPublishSyntheticClickPoc(deps, true);

    getTrigger()!();
    await vi.advanceTimersByTimeAsync(1000);

    // Simule ce que publishCreateResponseCapture.ts (monde MAIN) dispatcherait
    // reellement si le POST etait parti et avait reussi -- jamais un
    // dispatchEvent("click") ici, uniquement l'evenement de correlation deja
    // existant.
    document.dispatchEvent(
      new CustomEvent(PUBLISH_CREATE_RESPONSE_EVENT_NAME, {
        detail: { url: "https://www.vinted.fr/api/v2/item_upload/items", statusCode: 200, ok: true, bodyText: "{}", transport: "fetch" },
      })
    );

    await vi.advanceTimersByTimeAsync(SYNTHETIC_CLICK_TEST_WAIT_MS);

    const result = infoLogs.find((l) => l.message === "PUBLISH_SYNTHETIC_CLICK_TEST_RESULT");
    expect(result?.detail).toMatchObject({
      requestObserved: true,
      creationSucceeded: true,
      statusCode: 200,
    });
  });

  it("RESULT signale immediatement (sans attendre) quand le bouton est introuvable au moment du declenchement", async () => {
    document.body.innerHTML = ""; // aucun bouton
    const { deps, infoLogs, warnLogs } = makeDeps();
    initPublishSyntheticClickPoc(deps, true);

    getTrigger()!();
    await Promise.resolve();

    expect(infoLogs.find((l) => l.message === "PUBLISH_SYNTHETIC_CLICK_TEST_STARTED")?.detail).toMatchObject({ buttonFound: false });
    const result = warnLogs.find((l) => l.message === "PUBLISH_SYNTHETIC_CLICK_TEST_RESULT");
    expect(result?.detail).toMatchObject({ requestObserved: false, creationSucceeded: false, datadomeObserved: null });
  });

  it("retire proprement le listener 'click' temporaire du test synthetique apres resolution -- le listener de diagnostic humain (permanent) reste actif, ce n'est pas une fuite", async () => {
    vi.useFakeTimers();
    makeButton(false);
    const { deps } = makeDeps();
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    initPublishSyntheticClickPoc(deps, true);

    getTrigger()!();
    await vi.advanceTimersByTimeAsync(SYNTHETIC_CLICK_TEST_WAIT_MS);

    // 2 listeners "click" attaches au total : celui, permanent, du diagnostic
    // de clic humain (installe des l'activation du POC) + celui, temporaire,
    // du test synthetique lui-meme (retire a la fin de CETTE tentative).
    const clickAdds = addSpy.mock.calls.filter((c) => c[0] === "click");
    const clickRemoves = removeSpy.mock.calls.filter((c) => c[0] === "click");
    expect(clickAdds).toHaveLength(2);
    expect(clickRemoves).toHaveLength(1);

    const responseAdds = addSpy.mock.calls.filter((c) => c[0] === PUBLISH_CREATE_RESPONSE_EVENT_NAME);
    const responseRemoves = removeSpy.mock.calls.filter((c) => c[0] === PUBLISH_CREATE_RESPONSE_EVENT_NAME);
    expect(responseAdds.length).toBeGreaterThan(0);
    expect(responseRemoves).toHaveLength(responseAdds.length);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

describe("publishSyntheticClickPoc -- jamais un clic reel provoque", () => {
  it("n'appelle jamais .click() sur le bouton -- uniquement dispatchFullClick (pointer/mouse events)", async () => {
    vi.useFakeTimers();
    const btn = makeButton(false);
    const clickSpy = vi.spyOn(btn, "click");
    const { deps } = makeDeps();
    initPublishSyntheticClickPoc(deps, true);

    getTrigger()!();
    await vi.advanceTimersByTimeAsync(SYNTHETIC_CLICK_TEST_WAIT_MS);

    expect(clickSpy).not.toHaveBeenCalled();
  });
});

// Mission "ROUND SUIVANT -- AUDIT FOCUS PRIX" (2026-08-19) : listener passif
// sur le premier clic humain reel -- couvre exactement les garanties
// demandees : capture juste avant traitement, aucune modification de
// l'evenement, une seule capture, ignore le synthetique/les autres elements,
// fonctionne independamment du POC synthetique/de la readiness.
describe("installHumanClickDiagnostic (via initPublishSyntheticClickPoc)", () => {
  it("capture l'instantane au premier clic isTrusted:true sur le bouton Ajouter", () => {
    document.body.innerHTML = `<input data-testid="price-input--input" /><button data-testid="upload-form-save-button">Ajouter</button>`;
    const btn = document.querySelector<HTMLButtonElement>(SELECTOR)!;
    const addSpy = vi.spyOn(document, "addEventListener");
    const { deps, infoLogs } = makeDeps({ describePriceState: () => stubPriceState({ valid: false }) });
    initPublishSyntheticClickPoc(deps, true);

    const listener = registeredClickListeners(addSpy)[0];
    listener({ isTrusted: true, target: btn } as unknown as MouseEvent);

    const diag = infoLogs.find((l) => l.message === "PUBLISH_HUMAN_CLICK_DIAGNOSTIC");
    expect(diag).toBeDefined();
    expect(diag?.detail?.activeElementIsPriceField).toBe(false);
    expect(diag?.detail?.priceState).toMatchObject({ valid: false });
    addSpy.mockRestore();
  });

  it("ignore un clic isTrusted:false (synthetique) -- aucune capture", () => {
    document.body.innerHTML = `<button data-testid="upload-form-save-button">Ajouter</button>`;
    const btn = document.querySelector<HTMLButtonElement>(SELECTOR)!;
    const addSpy = vi.spyOn(document, "addEventListener");
    const { deps, infoLogs } = makeDeps();
    initPublishSyntheticClickPoc(deps, true);

    const listener = registeredClickListeners(addSpy)[0];
    listener({ isTrusted: false, target: btn } as unknown as MouseEvent);

    expect(infoLogs.find((l) => l.message === "PUBLISH_HUMAN_CLICK_DIAGNOSTIC")).toBeUndefined();
    addSpy.mockRestore();
  });

  it("ignore un clic isTrusted:true sur un AUTRE element -- aucune capture", () => {
    document.body.innerHTML = `<button data-testid="upload-form-save-button">Ajouter</button><button id="other">Autre</button>`;
    const other = document.getElementById("other")!;
    const addSpy = vi.spyOn(document, "addEventListener");
    const { deps, infoLogs } = makeDeps();
    initPublishSyntheticClickPoc(deps, true);

    const listener = registeredClickListeners(addSpy)[0];
    listener({ isTrusted: true, target: other } as unknown as MouseEvent);

    expect(infoLogs.find((l) => l.message === "PUBLISH_HUMAN_CLICK_DIAGNOSTIC")).toBeUndefined();
    addSpy.mockRestore();
  });

  it("ne capture qu'une seule fois -- un second clic humain reel n'emet pas un second log", () => {
    document.body.innerHTML = `<button data-testid="upload-form-save-button">Ajouter</button>`;
    const btn = document.querySelector<HTMLButtonElement>(SELECTOR)!;
    const addSpy = vi.spyOn(document, "addEventListener");
    const { deps, infoLogs } = makeDeps();
    initPublishSyntheticClickPoc(deps, true);

    const listener = registeredClickListeners(addSpy)[0];
    listener({ isTrusted: true, target: btn } as unknown as MouseEvent);
    listener({ isTrusted: true, target: btn } as unknown as MouseEvent);

    expect(infoLogs.filter((l) => l.message === "PUBLISH_HUMAN_CLICK_DIAGNOSTIC")).toHaveLength(1);
    addSpy.mockRestore();
  });

  it("retire son propre listener document apres la premiere capture", () => {
    document.body.innerHTML = `<button data-testid="upload-form-save-button">Ajouter</button>`;
    const btn = document.querySelector<HTMLButtonElement>(SELECTOR)!;
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { deps } = makeDeps();
    initPublishSyntheticClickPoc(deps, true);

    const listener = registeredClickListeners(addSpy)[0];
    listener({ isTrusted: true, target: btn } as unknown as MouseEvent);

    expect(removeSpy.mock.calls.some((c) => c[0] === "click" && c[1] === listener)).toBe(true);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("fonctionne independamment de isReadinessConfirmed -- capture meme si la readiness n'est jamais confirmee", () => {
    document.body.innerHTML = `<button data-testid="upload-form-save-button">Ajouter</button>`;
    const btn = document.querySelector<HTMLButtonElement>(SELECTOR)!;
    const addSpy = vi.spyOn(document, "addEventListener");
    const { deps, infoLogs } = makeDeps({ isReadinessConfirmed: () => false });
    initPublishSyntheticClickPoc(deps, true);

    const listener = registeredClickListeners(addSpy)[0];
    listener({ isTrusted: true, target: btn } as unknown as MouseEvent);

    expect(infoLogs.find((l) => l.message === "PUBLISH_HUMAN_CLICK_DIAGNOSTIC")).toBeDefined();
    addSpy.mockRestore();
  });
});
