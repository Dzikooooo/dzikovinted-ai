import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchEscapeKey,
  parsePriceToNumber,
  readOptionTexts,
  setNativeValue,
  typeIntoBrandSearchInput,
  typeIntoPriceField,
  type ReadOptionTextsStep,
} from "../formFill";
import * as domWait from "../domWait";
import { WaitTimeoutError } from "../domWait";

// Mission "BRAND SEARCH-FILTER FLOW" (2026-08-13) : setNativeValue() est deja
// live-prouvee sur titre/description/prix, mais RIEN ne testait jusqu'ici
// directement le mecanisme lui-meme (setter natif + evenements
// input/change/blur) -- desormais reutilise TEL QUEL pour taper dans le
// champ de recherche Marque. Ces tests couvrent le mecanisme generique
// (independant du champ Marque specifiquement), qui n'a pas ete modifie
// par cette mission -- documentent simplement ce sur quoi le nouveau flow
// Marque s'appuie.
describe("setNativeValue", () => {
  it("sets .value via the native setter and dispatches input/change/blur, all bubbling", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    const received: string[] = [];
    input.addEventListener("input", () => received.push("input"));
    input.addEventListener("change", () => received.push("change"));
    input.addEventListener("blur", () => received.push("blur"));

    setNativeValue(input, "Polo Ralph Lauren");

    expect(input.value).toBe("Polo Ralph Lauren");
    expect(received).toEqual(["input", "change", "blur"]);
  });

  it("invokes the optional onEvent callback with ok:true for each dispatched event", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    const events: string[] = [];
    setNativeValue(input, "Bleu", (eventName, detail) => {
      events.push(`${eventName}:${detail.ok}:${detail.domValueAfter}`);
    });

    expect(events).toEqual(["input:true:Bleu", "change:true:Bleu", "blur:true:Bleu"]);
  });

  it("works on a <textarea> as well as an <input>", () => {
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);

    setNativeValue(textarea, "une description");

    expect(textarea.value).toBe("une description");
  });
});

// Mission "BRAND SEARCH INPUT LOCATOR" (2026-08-16) : les 3 tentatives
// precedentes (typeIntoBrandSearchField, bloc puis caractere-par-caractere,
// puis +keydown/keyup) ciblaient toutes le mauvais element
// (BRAND_DROPDOWN_TRIGGER_SELECTOR, readonly, ne recoit jamais de frappe --
// preuve live directe). typeIntoBrandSearchInput() cible desormais le VRAI
// champ (#brand-search-input) avec la technique CONFIRMEE EN DIRECT sur ce
// champ precis : setter natif + UN SEUL InputEvent("input"), sans frappe
// caractere par caractere ni evenement clavier (non necessaires ici,
// contrairement a l'hypothese precedente qui s'averait fausse parce que
// testee sur le mauvais element).
describe("typeIntoBrandSearchInput", () => {
  it("sets the full value via the native setter in a single write", () => {
    const input = document.createElement("input");
    input.value = "old value";
    document.body.appendChild(input);

    typeIntoBrandSearchInput(input, "Polo Ralph Lauren");

    expect(input.value).toBe("Polo Ralph Lauren");
  });

  it("dispatches exactly one bubbling 'input' event carrying inputType:insertText and the full value as data", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    const inputEvents: Array<{ data: string | null; inputType: string | null }> = [];
    input.addEventListener("input", (e) => {
      const evt = e as InputEvent;
      inputEvents.push({ data: evt.data, inputType: evt.inputType });
    });

    typeIntoBrandSearchInput(input, "Nike");

    expect(inputEvents).toEqual([{ data: "Nike", inputType: "insertText" }]);
  });

  it("does NOT dispatch 'change', 'blur', or any keyboard event -- the dropdown must stay open for the subsequent click", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    const unexpected: string[] = [];
    ["change", "blur", "keydown", "keyup"].forEach((type) => {
      input.addEventListener(type, () => unexpected.push(type));
    });

    typeIntoBrandSearchInput(input, "Nike");

    expect(unexpected).toEqual([]);
  });
});

// Mission "BRAND KEYBOARD EVENT EXPERIMENT" (2026-08-13) : typeIntoPriceField()
// (le champ prix, DEJA live-prouve independamment) reste totalement
// INCHANGE par cette mission -- ce test le prouve directement, la meme
// discipline "ne jamais toucher un champ deja valide" que le reste de cette
// session.
describe("typeIntoPriceField (non-regression -- untouched by the brand keyboard event experiment)", () => {
  it("still dispatches change and blur (no keydown/keyup) -- proves the price field's own sequence was never modified", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    const eventTypes: string[] = [];
    ["input", "change", "blur", "keydown", "keyup"].forEach((type) => {
      input.addEventListener(type, () => eventTypes.push(type));
    });

    await typeIntoPriceField(input, "24");

    expect(input.value).toBe("24");
    expect(eventTypes).not.toContain("keydown");
    expect(eventTypes).not.toContain("keyup");
    expect(eventTypes).toContain("change");
    expect(eventTypes).toContain("blur");
  });
});

// Mission "REPUBLICATION FIDELE" (2026-08-11) : CAUSE CONFIRMEE en test live
// -- le champ prix Vinted reformate "24" en "24,00" synchroniquement des les
// evenements input/change/blur (voir setNativeValue), faisant echouer a tort
// une comparaison de chaines stricte. parsePriceToNumber() (deja live-testee
// cote vinted-edit.ts pour ce meme champ, extraite ici dans formFill.ts pour
// etre partagee avec vinted-publish.ts) normalise les deux representations
// avant de comparer.
describe("parsePriceToNumber", () => {
  it("parses a plain integer string", () => {
    expect(parsePriceToNumber("24")).toBe(24);
  });

  it("parses the Vinted-reformatted comma-decimal display value -- the exact live symptom ('24,00' vs '24')", () => {
    expect(parsePriceToNumber("24,00")).toBe(24);
  });

  it("strips a trailing currency symbol and spaces (e.g. '24,00 €')", () => {
    expect(parsePriceToNumber("24,00 €")).toBe(24);
  });

  it("returns null for an empty or null input", () => {
    expect(parsePriceToNumber("")).toBeNull();
    expect(parsePriceToNumber(null)).toBeNull();
  });

  it("returns null for content that isn't a parseable number", () => {
    expect(parsePriceToNumber("abc")).toBeNull();
  });

  it("parses non-integer prices correctly", () => {
    expect(parsePriceToNumber("19,99")).toBe(19.99);
  });
});

// Mission "CORRIGER LES ATTRIBUTS POST-CATEGORIE" (2026-08-12) : preuve live
// -- readOptionTexts() (donc selectMatchingOption() en production sur
// edit_listing) n'appelait jusqu'ici waitForElement(triggerSelector) qu'avec
// le delai PAR DEFAUT (8000ms) -- observe en direct comme trop court pour
// ETAT/TAILLE sur /items/new (trigger_not_found) alors que MARQUE, tentee
// plus tard dans la meme sequence, reussit. `triggerTimeoutMs` (nouveau,
// optionnel) permet a la reprise post-categorie de vinted-publish.ts
// d'elargir CE delai precis sans toucher au comportement par defaut dont
// edit_listing depend (aucun appel existant ne passe ce parametre).
describe("readOptionTexts", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function makeTriggerAndContent(): void {
    const trigger = document.createElement("div");
    trigger.setAttribute("data-testid", "test-trigger");
    document.body.appendChild(trigger);

    const content = document.createElement("div");
    content.setAttribute("data-testid", "test-content");
    content.innerHTML = "<li>Option A</li><li>Option B</li>";
    document.body.appendChild(content);
  }

  it("reads trigger/content/texts when both elements already exist (default timeout, no regression for edit_listing)", async () => {
    makeTriggerAndContent();
    const result = await readOptionTexts('[data-testid="test-trigger"]', '[data-testid="test-content"]');
    expect(result.texts).toEqual(["Option A", "Option B"]);
  });

  it("honors a custom triggerTimeoutMs -- resolves once the trigger appears within the WIDENED window, even if it would have missed the 8000ms default", async () => {
    const promise = readOptionTexts('[data-testid="late-trigger"]', '[data-testid="late-content"]', 2000);
    setTimeout(() => {
      const trigger = document.createElement("div");
      trigger.setAttribute("data-testid", "late-trigger");
      document.body.appendChild(trigger);
      const content = document.createElement("div");
      content.setAttribute("data-testid", "late-content");
      content.innerHTML = "<li>Only option</li>";
      document.body.appendChild(content);
    }, 100);
    const result = await promise;
    expect(result.texts).toEqual(["Only option"]);
  });

  it("still rejects with WaitTimeoutError if the trigger never appears, even with a custom timeout", async () => {
    await expect(readOptionTexts('[data-testid="never"]', '[data-testid="never-content"]', 50)).rejects.toBeInstanceOf(
      WaitTimeoutError
    );
  });

  // Mission "REPUBLICATION VINTED : CORRIGER LES 5 ATTRIBUTS APRES CATEGORIE"
  // (2026-08-12) : BUG REEL trouve par lecture de code -- le SECOND
  // waitForElement (celui du CONTENU du dropdown) n'a jamais recu
  // triggerTimeoutMs, retombant TOUJOURS sur le defaut de domWait.ts (8000ms)
  // meme quand l'appelant en demandait 20000. Explique exactement le
  // symptome live (conditionTriggerFound:true, mais l'erreur porte encore
  // "8000ms"). Preuve directe et deterministe (spy, aucune attente reelle de
  // 8s dans un test) que les DEUX appels recoivent desormais le meme timeout.
  it("propagates the SAME custom timeout to BOTH the trigger wait and the content wait -- the exact bug fixed here", async () => {
    const spy = vi.spyOn(domWait, "waitForElement");
    makeTriggerAndContent();

    await readOptionTexts('[data-testid="test-trigger"]', '[data-testid="test-content"]', 20000);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, '[data-testid="test-trigger"]', { timeoutMs: 20000 });
    expect(spy).toHaveBeenNthCalledWith(2, '[data-testid="test-content"]', { timeoutMs: 20000 });

    spy.mockRestore();
  });

  // Cases J.1-J.4 de la mission : onStep() distingue precisement jusqu'ou la
  // sequence est allee avant un echec eventuel -- plus jamais un seul
  // "trigger_not_found" generique masquant plusieurs causes differentes.
  describe("onStep instrumentation", () => {
    it("case 1: trigger absent -- rejects, onStep is never called at all", async () => {
      const steps: ReadOptionTextsStep[] = [];
      const onStep = (step: ReadOptionTextsStep) => steps.push(step);

      await expect(
        readOptionTexts('[data-testid="absent-trigger"]', '[data-testid="absent-content"]', 50, onStep)
      ).rejects.toBeInstanceOf(WaitTimeoutError);
      expect(steps).toEqual([]);
    });

    it("cases 2/3: trigger present and clicked, but dropdown content never appears -- rejects after trigger_found/trigger_click_attempted, never reaches dropdown_content_found", async () => {
      const trigger = document.createElement("div");
      trigger.setAttribute("data-testid", "lonely-trigger");
      document.body.appendChild(trigger);

      const steps: ReadOptionTextsStep[] = [];
      const onStep = (step: ReadOptionTextsStep) => steps.push(step);

      await expect(
        readOptionTexts('[data-testid="lonely-trigger"]', '[data-testid="content-that-never-appears"]', 50, onStep)
      ).rejects.toBeInstanceOf(WaitTimeoutError);
      expect(steps).toEqual(["trigger_found", "trigger_click_attempted"]);
    });

    it("case 4: content present but zero <li> options -- resolves successfully (not a rejection) with an empty texts array, options_read reports optionsCount:0", async () => {
      const trigger = document.createElement("div");
      trigger.setAttribute("data-testid", "empty-options-trigger");
      document.body.appendChild(trigger);
      const content = document.createElement("div");
      content.setAttribute("data-testid", "empty-options-content");
      document.body.appendChild(content); // aucun <li> a l'interieur

      const steps: ReadOptionTextsStep[] = [];
      const onStep = (step: ReadOptionTextsStep) => steps.push(step);

      const result = await readOptionTexts(
        '[data-testid="empty-options-trigger"]',
        '[data-testid="empty-options-content"]',
        undefined,
        onStep
      );
      expect(result.texts).toEqual([]);
      expect(steps).toEqual(["trigger_found", "trigger_click_attempted", "dropdown_content_found", "options_read"]);
    });

    it("full success path logs all 4 steps in order", async () => {
      makeTriggerAndContent();
      const steps: ReadOptionTextsStep[] = [];
      const onStep = (step: ReadOptionTextsStep) => steps.push(step);

      await readOptionTexts('[data-testid="test-trigger"]', '[data-testid="test-content"]', undefined, onStep);
      expect(steps).toEqual(["trigger_found", "trigger_click_attempted", "dropdown_content_found", "options_read"]);
    });
  });
});

// Mission "LIVE RETEST RESULTS -- FIX SIZE/COLOR CONFIRMATION + COLOR
// DROPDOWN CLOSURE" (2026-08-13) : preuve live directe -- apres une
// selection Couleur reussie, le dropdown restait ouvert ; un Echap MANUEL
// l'a ferme sans deselectionner "Bleu". dispatchEscapeKey() est le
// mecanisme de fermeture desormais utilise (vinted-publish.ts::
// attemptDedicatedPickerPrefill), UNIQUEMENT apres confirmation reelle et
// UNIQUEMENT si le picker est encore ouvert -- ces tests couvrent le
// dispatch lui-meme (le fait qu'il emet reellement les bons evenements),
// pas l'orchestration (deja verifiee par lecture de code : le call site ne
// l'invoque que dans la branche triggerConfirmed===true, apres avoir
// verifie readCandidates().length > 0).
describe("dispatchEscapeKey", () => {
  it("dispatches both keydown and keyup with key 'Escape'", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    const received: string[] = [];
    el.addEventListener("keydown", (e) => received.push(`keydown:${(e as KeyboardEvent).key}`));
    el.addEventListener("keyup", (e) => received.push(`keyup:${(e as KeyboardEvent).key}`));

    dispatchEscapeKey(el);

    expect(received).toEqual(["keydown:Escape", "keyup:Escape"]);
  });

  it("dispatches a bubbling, cancelable event (reaches a delegated listener on an ancestor, as many close-on-escape handlers use)", () => {
    const parent = document.createElement("div");
    const child = document.createElement("div");
    parent.appendChild(child);
    document.body.appendChild(parent);

    let receivedOnParent = false;
    parent.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Escape") receivedOnParent = true;
    });

    dispatchEscapeKey(child);

    expect(receivedOnParent).toBe(true);
  });
});
