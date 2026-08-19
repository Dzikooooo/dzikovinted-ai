import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describePriceValidationState,
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

// Mission "ROUND PRIX -- micro-test synthetique complet" (2026-08-17) :
// REMPLACE l'ancien test "no keydown/keyup" (mission "BRAND KEYBOARD EVENT
// EXPERIMENT", 2026-08-13) -- celui-ci affirmait explicitement l'ABSENCE de
// ces evenements comme preuve de non-regression a l'epoque ; cette mission
// modifie DELIBEREMENT typeIntoPriceField() pour reproduire la sequence
// humaine complete (comparaison live directe TEST A/TEST B, voir son
// commentaire d'en-tete dans formFill.ts) -- l'ancien test serait donc
// desormais un faux negatif s'il restait tel quel. EXPERIMENTAL : isTrusted
// reste toujours false sur tous ces evenements (impossible a falsifier
// depuis jsdom comme depuis un vrai navigateur) -- ces tests ne pretendent
// jamais le contraire, ils prouvent uniquement l'ORDRE et la COMPLETUDE de
// la sequence.
describe("typeIntoPriceField -- sequence complete (mission ROUND PRIX, 2026-08-17)", () => {
  function captureAllEvents(input: HTMLInputElement): Array<{ type: string; isTrusted: boolean; key: string | null; code: string | null; inputType: string | null; data: string | null }> {
    const captured: Array<{ type: string; isTrusted: boolean; key: string | null; code: string | null; inputType: string | null; data: string | null }> = [];
    // "focusout" ajoute (mission "ROUND PRIX -- focusout apres blur",
    // 2026-08-19) -- doit etre observable pour prouver qu'il est bien
    // dispatche, dans l'ordre, apres "blur".
    for (const type of ["focus", "keydown", "keypress", "beforeinput", "input", "keyup", "change", "blur", "focusout"]) {
      input.addEventListener(type, (e) => {
        captured.push({
          type: e.type,
          isTrusted: e.isTrusted,
          key: e instanceof KeyboardEvent ? e.key : null,
          code: e instanceof KeyboardEvent ? e.code : null,
          inputType: e instanceof InputEvent ? e.inputType : null,
          data: e instanceof InputEvent ? e.data : null,
        });
      });
    }
    return captured;
  }

  it("emits keydown -> beforeinput(deleteContentBackward) -> input(deleteContentBackward) -> keyup for the initial clear (no keypress for Backspace)", async () => {
    const input = document.createElement("input");
    input.value = "old";
    document.body.appendChild(input);
    const captured = captureAllEvents(input);

    await typeIntoPriceField(input, "");

    // focus (el.focus(), deja existant avant cette mission) puis les 4
    // evenements d'effacement pour une valeur cible vide (aucun caractere
    // insere ensuite) -- ordre exact. "focusout" ajoute en dernier (mission
    // "ROUND PRIX -- focusout apres blur", 2026-08-19) -- tout le reste de
    // la sequence, jusqu'a "blur" inclus, reste rigoureusement identique.
    expect(captured.map((c) => c.type)).toEqual(["focus", "keydown", "beforeinput", "input", "keyup", "change", "blur", "focusout"]);
    expect(captured.some((c) => c.type === "keypress")).toBe(false);
    const [, keydown, beforeinput, inputEvt, keyup] = captured;
    expect(keydown.key).toBe("Backspace");
    expect(beforeinput.inputType).toBe("deleteContentBackward");
    expect(inputEvt.inputType).toBe("deleteContentBackward");
    expect(keyup.key).toBe("Backspace");
  });

  it("emits keydown -> keypress -> beforeinput -> input -> keyup for EACH inserted character, in this exact order", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const captured = captureAllEvents(input);

    await typeIntoPriceField(input, "24");

    // focus + effacement (4) + 2 caracteres x 5 evenements + change + blur +
    // focusout (ajoute mission "ROUND PRIX -- focusout apres blur",
    // 2026-08-19) -- seul le dernier element differe de la sequence
    // d'origine.
    expect(captured.map((c) => c.type)).toEqual([
      "focus",
      "keydown",
      "beforeinput",
      "input",
      "keyup",
      "keydown",
      "keypress",
      "beforeinput",
      "input",
      "keyup",
      "keydown",
      "keypress",
      "beforeinput",
      "input",
      "keyup",
      "change",
      "blur",
      "focusout",
    ]);

    const firstCharSequence = captured.slice(5, 10);
    expect(firstCharSequence.map((c) => c.type)).toEqual(["keydown", "keypress", "beforeinput", "input", "keyup"]);
    expect(firstCharSequence[0].key).toBe("2"); // keydown
    expect(firstCharSequence[1].key).toBe("2"); // keypress
    expect(firstCharSequence[2].data).toBe("2"); // beforeinput
    expect(firstCharSequence[2].inputType).toBe("insertText");
    expect(firstCharSequence[3].data).toBe("2"); // input
    expect(firstCharSequence[3].inputType).toBe("insertText");
    expect(firstCharSequence[4].key).toBe("2"); // keyup

    const secondCharSequence = captured.slice(10, 15);
    expect(secondCharSequence[0].key).toBe("4");
    expect(secondCharSequence[2].data).toBe("4");

    expect(input.value).toBe("24");
  });

  it("no SYNTHETICALLY CONSTRUCTED event (keydown/keypress/beforeinput/input/keyup/change/blur) carries isTrusted:true -- EXPERIMENTAL, never pretends otherwise (excludes the native 'focus' event produced by el.focus() itself, pre-existing since before this mission)", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const captured = captureAllEvents(input);

    await typeIntoPriceField(input, "5");

    const constructedEvents = captured.filter((c) => c.type !== "focus");
    expect(constructedEvents.length).toBeGreaterThan(0);
    expect(constructedEvents.every((c) => c.isTrusted === false)).toBe(true);
  });

  it("still emits change then blur after all character sequences, exactly as before this mission", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const captured = captureAllEvents(input);

    await typeIntoPriceField(input, "7");

    expect(captured.at(-3)?.type).toBe("change");
    expect(captured.at(-2)?.type).toBe("blur");
  });

  // Mission "ROUND PRIX -- focusout apres blur" (2026-08-19) : "blur" est un
  // evenement natif NON-bubbling -- React delegue son ecoute d'evenements a
  // la racine et n'ecoute donc jamais "blur" directement, seulement son
  // equivalent bubbling "focusout", pour synthetiser en interne le onBlur
  // React. Preuve live : le prix s'affichait correctement ("24,00 €") mais
  // le POST reel /api/v2/item_upload/items partait avec price:null --
  // symptome coherent avec un handler onBlur React jamais declenche faute de
  // "focusout". Ces 3 tests couvrent exactement les points demandes : (1)
  // focusout dispatche apres blur, (2) il bubble, (3) le reste de la
  // sequence actuelle reste strictement inchange (couvert par les 2 tests
  // d'ordre exact ci-dessus, deja mis a jour pour n'ajouter que "focusout"
  // en toute derniere position).
  it("dispatches focusout immediately after blur, as the very last event of the whole sequence", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const captured = captureAllEvents(input);

    await typeIntoPriceField(input, "24");

    expect(captured.at(-1)?.type).toBe("focusout");
    expect(captured.at(-2)?.type).toBe("blur");
  });

  it("dispatches focusout as a bubbling event", async () => {
    const parent = document.createElement("div");
    const input = document.createElement("input");
    parent.appendChild(input);
    document.body.appendChild(parent);

    let bubbledFocusoutSeen = false;
    parent.addEventListener("focusout", (e) => {
      bubbledFocusoutSeen = e.bubbles === true;
    });

    await typeIntoPriceField(input, "24");

    expect(bubbledFocusoutSeen).toBe(true);
  });

  it("dispatches focusout with isTrusted:false, consistent with every other synthetic event in this sequence", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const captured = captureAllEvents(input);

    await typeIntoPriceField(input, "24");

    const focusout = captured.find((c) => c.type === "focusout");
    expect(focusout?.isTrusted).toBe(false);
  });

  it("derives a plausible KeyboardEvent.code for digits and the decimal separator", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const captured = captureAllEvents(input);

    await typeIntoPriceField(input, "9.5");

    const keydowns = captured.filter((c) => c.type === "keydown" && c.key !== "Backspace");
    expect(keydowns.map((c) => c.code)).toEqual(["Digit9", "Period", "Digit5"]);
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

// Mission "REPUBLICATION VINTED : BUG PRIX + FAUX READY_TO_SUBMIT" (2026-08-16) :
// CAUSE CONFIRMEE en test live -- "24,00 €" reellement AFFICHE dans le champ
// (donc parsePriceToNumber() confirmerait deja une egalite stricte) alors que
// Vinted affichait simultanement "Le champ prix doit être supérieur ou égal
// à 1.0" et que ResellOS annoncait pourtant "Tout est prêt". Une comparaison
// de VALEUR AFFICHEE seule ne prouve donc plus rien -- describePriceValidationState()
// agrege validity.valid/aria-invalid/le texte d'erreur reellement rapporte en
// direct, jamais une seule chaine comparee. Ces tests couvrent scenarios A/B/E
// de la mission (A: affiche mais invalide => pas confirme ; B: reellement
// accepte => confirme ; E: generique, jamais un prix hardcode a 24).
describe("describePriceValidationState", () => {
  function makeInput(form: boolean = true): { input: HTMLInputElement; container: HTMLFormElement | HTMLDivElement } {
    const container = form ? document.createElement("form") : document.createElement("div");
    const input = document.createElement("input");
    container.appendChild(input);
    document.body.appendChild(container);
    return { input, container: container as HTMLFormElement };
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  // Scenario A de la mission : la VALEUR affichee correspond deja au prix
  // demande, mais Vinted a marque le champ invalide (setCustomValidity() est
  // le mecanisme standard qu'un composant controle utilise pour piloter
  // validity.valid/validationMessage sur un <input> quel que soit son type,
  // y compris type="text" -- un <input type="number" min="1"> natif ne
  // s'applique pas ici, Vinted utilise un champ de type texte avec masque de
  // devise). Doit rester PAS CONFIRME malgre la valeur affichee correcte.
  it("scenario A: value displayed matches the requested price, but Vinted marked the field invalid -- NOT confirmed", () => {
    const { input } = makeInput();
    input.value = "24,00 €";
    input.setCustomValidity("Le champ prix doit être supérieur ou égal à 1.0");

    const state = describePriceValidationState(input);

    expect(state.parsedValue).toBe(24);
    expect(state.validityValid).toBe(false);
    expect(state.valid).toBe(false);
  });

  // Scenario B : aucune erreur de validation reelle -- confirme.
  it("scenario B: value matches and Vinted reports no validation error -- confirmed", () => {
    const { input } = makeInput();
    input.value = "24,00 €";

    const state = describePriceValidationState(input);

    expect(state.parsedValue).toBe(24);
    expect(state.validityValid).toBe(true);
    expect(state.ariaInvalid).toBeNull();
    expect(state.errorTextFound).toBe(false);
    expect(state.valid).toBe(true);
  });

  it("scenario E: works for a generic price, never hardcoded to 24 -- proven here with 87,50", () => {
    const { input } = makeInput();
    input.value = "87,50 €";

    const state = describePriceValidationState(input);

    expect(state.parsedValue).toBe(87.5);
    expect(state.valid).toBe(true);
  });

  it("treats aria-invalid=true as invalid even if validity.valid is true (defensive second signal)", () => {
    const { input } = makeInput();
    input.value = "24,00 €";
    input.setAttribute("aria-invalid", "true");

    const state = describePriceValidationState(input);

    expect(state.validityValid).toBe(true);
    expect(state.ariaInvalid).toBe("true");
    expect(state.valid).toBe(false);
  });

  // Signal de secours textuel (2e couche, jamais la seule condition) : le
  // texte EXACT rapporte en direct par l'utilisateur, recherche scopee au
  // <form> englobant -- jamais tout le document (ne doit jamais confondre
  // une erreur affichee sur un AUTRE champ).
  it("treats the exact live-reported error text nearby as invalid, even if validity.valid/aria-invalid don't flag it (defensive fallback)", () => {
    const { input, container } = makeInput();
    input.value = "24,00 €";
    const errorSpan = document.createElement("span");
    errorSpan.textContent = "Le champ prix doit être supérieur ou égal à 1.0";
    container.appendChild(errorSpan);

    const state = describePriceValidationState(input);

    expect(state.errorTextFound).toBe(true);
    expect(state.valid).toBe(false);
  });

  it("does NOT match an error text found outside the price field's own <form> (scoped search, never document-wide)", () => {
    const { input } = makeInput();
    input.value = "24,00 €";
    const unrelatedError = document.createElement("span");
    unrelatedError.textContent = "Le champ prix doit être supérieur ou égal à 1.0";
    document.body.appendChild(unrelatedError); // hors du <form>, jamais scanne

    const state = describePriceValidationState(input);

    expect(state.errorTextFound).toBe(false);
    expect(state.valid).toBe(true);
  });

  it("is permissive (valid:true) when the price input cannot be found -- never blocks readiness on an unobservable field", () => {
    const state = describePriceValidationState(null);

    expect(state.found).toBe(false);
    expect(state.valid).toBe(true);
  });
});
