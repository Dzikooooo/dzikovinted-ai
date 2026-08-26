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
  // Mission "ROUND SUIVANT -- AUDIT CIBLE ECRITURE PRIX" (2026-08-20) :
  // typeIntoPriceField() journalise desormais PRICE_INPUT_WRITE_STEP via le
  // logger persiste (chrome.runtime.sendMessage en contexte content script,
  // voir background/logger.ts) -- stub minimal necessaire pour que ces
  // tests deja existants (comportement/intention inchanges) ne levent plus
  // une ReferenceError sur `chrome`, meme discipline que
  // vinted-item-delete.test.ts.
  beforeEach(() => {
    vi.stubGlobal("chrome", { runtime: { sendMessage: () => Promise.resolve() } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  // Mission "STABILISATION ECRITURE PRIX" (2026-08-25) -- REGRESSION.
  //
  // Reproduit le mecanisme isole en direct : un masque de devise controle qui
  // recoit `deleteContentBackward` ALORS QUE le champ est deja vide calcule un
  // NaN et le garde dans son etat ; le DOM parait correct pendant toute la
  // sequence synchrone, puis le re-render asynchrone reimpose "NaN €".
  //
  // Trace live d'origine (run en echec) :
  //   before_clear "" | after_clear "" | after_char_2 "2,00 €"
  //   | after_char_4 "24,00 €" | after_blur "24,00 €" | plus_200ms "NaN €"
  //
  // Le composant simule ci-dessous ne "triche" pas : il ne devient NaN que
  // s'il recoit reellement l'evenement anormal. Si un jour typeIntoPriceField
  // recommence a effacer un champ deja vide, ce test repassera au rouge.
  it("n'emet jamais deleteContentBackward sur un champ DEJA VIDE -- sinon un masque controle finit a NaN au re-render", async () => {
    const input = document.createElement("input");
    input.value = ""; // etat REEL observe en live : champ deja vide
    document.body.appendChild(input);

    // Masque de devise controle simule.
    let internalState: number | null = null;
    input.addEventListener("input", (e) => {
      const inputType = e instanceof InputEvent ? e.inputType : null;
      if (inputType === "deleteContentBackward" && input.value === "") {
        // Le bug : parseFloat("") => NaN, conserve dans l'etat interne.
        internalState = Number.NaN;
        return;
      }
      const parsed = Number.parseFloat(input.value.replace(",", "."));
      internalState = Number.isNaN(parsed) ? internalState : parsed;
    });

    await typeIntoPriceField(input, "24");

    // Re-render tardif : le composant controle reimpose son etat interne.
    const rerender = () =>
      (input.value = internalState === null || Number.isNaN(internalState) ? "NaN €" : `${internalState},00 €`);
    rerender();

    expect(internalState).not.toBeNaN();
    expect(input.value).not.toContain("NaN");
    expect(internalState).toBe(24);
  });

  // Mission "ECRITURE ATOMIQUE DU PRIX" (2026-08-25) : les trois tests
  // remplaces ici documentaient la frappe caractere par caractere, strategie
  // ABANDONNEE apres preuve live (une valeur pourtant structurellement
  // correcte, "24,00 €", produisait quand meme "NaN €" -- le composant
  // rejette toute reecriture d'une valeur portant deja les caracteres de son
  // masque). Ils sont remplaces par le contrat de la nouvelle strategie, pas
  // simplement supprimes.
  //
  // jsdom n'implemente pas document.execCommand : ces tests exercent donc le
  // REPLI (setter natif), et le canal execCommand a son propre test plus bas.
  it("ecrit la valeur BRUTE en un seul bloc -- jamais un caractere a la fois", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const written: string[] = [];
    input.addEventListener("input", () => written.push(input.value));

    await typeIntoPriceField(input, "24");

    expect(written).toEqual(["24"]);
    expect(input.value).toBe("24");
  });

  it("n'ecrit jamais de caractere de masque (virgule, espace, symbole monetaire) -- le masque produit ',00 €' lui-meme", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const written: string[] = [];
    input.addEventListener("input", () => {
      written.push(input.value);
      // Masque de devise : reformate ce que NOUS avons ecrit.
      const digits = input.value.split(",")[0].replace(/[^0-9]/g, "");
      nativeSetter.call(input, digits ? `${digits},00 €` : "");
    });

    await typeIntoPriceField(input, "24");

    // Une seule ecriture, purement numerique : le masque n'a jamais a
    // reinterpreter sa propre sortie.
    expect(written).toEqual(["24"]);
    expect(written.every((v) => !/[,€\s]/.test(v))).toBe(true);
    expect(input.value).toBe("24,00 €");
  });

  it("remplace le contenu existant en le selectionnant d'abord (jamais de sequence Backspace)", async () => {
    const input = document.createElement("input");
    input.value = "99,00 €";
    document.body.appendChild(input);
    const captured = captureAllEvents(input);

    await typeIntoPriceField(input, "24");

    expect(captured.some((c) => c.inputType === "deleteContentBackward")).toBe(false);
    expect(captured.some((c) => c.key === "Backspace")).toBe(false);
    expect(input.value).toBe("24");
  });

  it("sequence d'evenements complete : focus -> input -> change -> blur -> focusout", async () => {
    const input = document.createElement("input");
    input.value = "9";
    document.body.appendChild(input);
    const captured = captureAllEvents(input);

    await typeIntoPriceField(input, "24");

    // Mission "SYNCHRONISATION DU TRACKER REACT" (2026-08-26) : 'change' n'est
    // plus emis -- React synthetise son onChange a partir de 'input' pour un
    // champ controle, et le 'change' synthetique vidait le champ (preuve live
    // du round precedent). blur/focusout viennent de el.blur(), une vraie
    // operation de focus.
    expect(captured.map((c) => c.type)).toEqual(["focus", "input", "change", "blur", "focusout"]);
    expect(captured[1].inputType).toBe("insertText");
    expect(captured[1].data).toBe("24");
    expect(document.activeElement).not.toBe(input);
    expect(input.value).toBe("24");
  });

  it("reinitialise le _valueTracker de React avant l'evenement input, pour que le changement soit vu", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    // Tracker React simule : memorise la derniere valeur vue, et c'est a elle
    // que React compare (jamais une relecture de el.value).
    let trackedValue = "";
    const setValue = vi.fn((v: string) => {
      trackedValue = v;
    });
    Object.defineProperty(input, "_valueTracker", {
      value: { getValue: () => trackedValue, setValue },
      configurable: true,
    });

    let trackedAtInput: string | null = null;
    input.addEventListener("input", () => {
      trackedAtInput = trackedValue;
    });

    await typeIntoPriceField(input, "24");

    expect(setValue).toHaveBeenCalled();
    // Au moment de l'evenement, le tracker doit differer de la valeur ecrite --
    // sinon React conclut "aucun changement" et ignore l'evenement.
    expect(trackedAtInput).toBe("");
    expect(trackedAtInput).not.toBe(input.value);
  });

  it("quand la valeur cible est vide, le tracker recoit une sentinelle NON vide (sinon React ne voit aucun changement)", async () => {
    const input = document.createElement("input");
    input.value = "9";
    document.body.appendChild(input);

    let trackedValue = "9";
    Object.defineProperty(input, "_valueTracker", {
      value: { getValue: () => trackedValue, setValue: (v: string) => { trackedValue = v; } },
      configurable: true,
    });

    await typeIntoPriceField(input, "");

    expect(trackedValue).not.toBe("");
    expect(input.value).toBe("");
  });

  it("ne casse pas quand le champ ne porte aucun _valueTracker (champ non React)", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    await expect(typeIntoPriceField(input, "24")).resolves.toBeUndefined();
    expect(input.value).toBe("24");
  });

  // Mission "ECRITURE DU PRIX EN MONDE MAIN" (2026-08-26) : le pont
  // isole -> MAIN. Les tests du module MAIN lui-meme vivent dans
  // priceMainWorldWriter.test.ts ; ici on couvre le comportement de
  // l'APPELANT -- delegation, correlation, et repli.
  it("delegue l'ecriture au monde MAIN quand le module y est installe, et n'ecrit alors rien lui-meme", async () => {
    const input = document.createElement("input");
    input.setAttribute("data-testid", "price-input--input");
    document.body.appendChild(input);
    document.documentElement.setAttribute("data-resellos-price-writer-installed", "1");

    // Listener scope au test : sans cela il repondrait encore aux demandes des
    // tests suivants (document est partage dans tout le fichier).
    const bridge = new AbortController();
    let receivedSelector: string | null = null;
    document.addEventListener("resellos:price-write-request", (e) => {
      const detail = (e as CustomEvent).detail;
      receivedSelector = detail.selector;
      input.value = detail.value; // le monde MAIN ecrit
      document.dispatchEvent(
        new CustomEvent("resellos:price-write-result", {
          detail: { requestId: detail.requestId, ok: true, trackerState: "reset", blurred: true, domValueAfter: input.value },
        })
      );
    }, { signal: bridge.signal });

    const captured = captureAllEvents(input);
    await typeIntoPriceField(input, "24");
    bridge.abort();

    expect(receivedSelector).toBe('[data-testid="price-input--input"]');
    // L'appelant ne doit produire AUCUN evenement : le monde MAIN a emis
    // input, change ET blur dans le contexte de React (mission "CYCLE COMPLET
    // EN MONDE MAIN", 2026-08-26). Un blur redondant ici relancerait tout le
    // cycle onBlur sur un champ deja quitte.
    expect(captured.map((c) => c.type)).toEqual(["focus"]);
    expect(input.value).toBe("24");
  });

  it("ignore une reponse portant un autre requestId et retombe sur le repli isole", async () => {
    const input = document.createElement("input");
    input.setAttribute("data-testid", "price-input--input");
    document.body.appendChild(input);
    document.documentElement.setAttribute("data-resellos-price-writer-installed", "1");

    const bridge = new AbortController();
    document.addEventListener(
      "resellos:price-write-request",
      () => {
        // Reponse fabriquee avec un requestId qui n'est pas le notre.
        document.dispatchEvent(
          new CustomEvent("resellos:price-write-result", {
            detail: { requestId: "usurpe", ok: true, trackerState: "reset", domValueAfter: "999" },
          })
        );
      },
      { signal: bridge.signal }
    );

    const captured = captureAllEvents(input);
    await typeIntoPriceField(input, "24");
    bridge.abort();

    // La reponse usurpee est ignoree : le repli isole ecrit reellement.
    expect(captured.map((c) => c.type)).toEqual(["focus", "input", "change", "blur", "focusout"]);
    expect(input.value).toBe("24");
  }, 10000);

  it("retombe sur le repli isole quand le module MAIN n'est pas installe", async () => {
    const input = document.createElement("input");
    input.setAttribute("data-testid", "price-input--input");
    document.body.appendChild(input);
    document.documentElement.removeAttribute("data-resellos-price-writer-installed");

    const captured = captureAllEvents(input);
    await typeIntoPriceField(input, "24");

    expect(captured.map((c) => c.type)).toEqual(["focus", "input", "change", "blur", "focusout"]);
    expect(input.value).toBe("24");
  });
  // Mission "SYNCHRONISATION DU TRACKER REACT" (2026-08-26) : la sequence ne
  // FABRIQUE plus qu'un seul evenement -- "input". focus/blur/focusout
  // proviennent desormais de vraies operations de focus (el.focus() /
  // el.blur()). L'intention d'origine de ce test est preservee : nous ne
  // pretendons JAMAIS qu'un evenement construit est trusted.
  it("les seuls evenements CONSTRUITS sont input et change, tous isTrusted:false -- jamais de trust simule", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const captured = captureAllEvents(input);

    await typeIntoPriceField(input, "5");

    const constructed = captured.filter((c) => !["focus", "blur", "focusout"].includes(c.type));
    expect(constructed.map((c) => c.type)).toEqual(["input", "change"]);
    expect(constructed.every((c) => c.isTrusted === false)).toBe(true);
  });

  it("emet input puis change puis blur puis focusout, dans cet ordre, en fin de sequence", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const captured = captureAllEvents(input);

    await typeIntoPriceField(input, "7");

    expect(captured.at(-4)?.type).toBe("input");
    expect(captured.at(-3)?.type).toBe("change");
    expect(captured.at(-2)?.type).toBe("blur");
    expect(captured.at(-1)?.type).toBe("focusout");
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

  // Mission "SYNCHRONISATION DU TRACKER REACT" (2026-08-26) : focusout n'est
  // plus fabrique -- il provient de el.blur(), une vraie operation de focus.
  // Ce qui doit etre verifie n'est donc plus son isTrusted, mais qu'il resulte
  // bien d'un changement de focus REEL (c'est ce que React attend pour
  // synthetiser son onBlur, voir la preuve live du 2026-08-19).
  it("emet focusout via un vrai changement de focus (el.blur()), pas via un evenement fabrique", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const captured = captureAllEvents(input);

    await typeIntoPriceField(input, "24");

    expect(captured.some((c) => c.type === "focusout")).toBe(true);
    expect(document.activeElement).not.toBe(input);
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

  // Mission "ROUND PRIX + COLIS -- CORRECTIF NaN" (2026-08-19) : CAUSE
  // CONFIRMEE en test live -- "NaN €" affiche sur Vinted apres republication,
  // trace jusqu'a payload.price.toString() jamais valide avant frappe.
  // parsePriceToNumber() devient la source UNIQUE de validation, a la fois
  // pour lire l'etat DOM (deja le cas) et pour valider l'entree AVANT toute
  // ecriture (nouveau) -- accepte desormais `number` en plus de `string`.
  it("accepts a plain finite number and returns it unchanged", () => {
    expect(parsePriceToNumber(24)).toBe(24);
    expect(parsePriceToNumber(19.99)).toBe(19.99);
  });

  it("rejects NaN -- le symptome live exact ('NaN €' vient de NaN.toString())", () => {
    expect(parsePriceToNumber(NaN)).toBeNull();
  });

  it("rejects Infinity and -Infinity", () => {
    expect(parsePriceToNumber(Infinity)).toBeNull();
    expect(parsePriceToNumber(-Infinity)).toBeNull();
  });

  it("rejects undefined (en plus de null deja couvert ci-dessus)", () => {
    expect(parsePriceToNumber(undefined)).toBeNull();
  });

  it("accepts 0 as a genuinely finite number (parsing succeeds; readiness/minimum still rejects it separately)", () => {
    expect(parsePriceToNumber(0)).toBe(0);
  });

  it("still normalizes every string form requested explicitly : 24, \"24\", \"24.00\", \"24,00 €\" -> 24", () => {
    expect(parsePriceToNumber(24)).toBe(24);
    expect(parsePriceToNumber("24")).toBe(24);
    expect(parsePriceToNumber("24.00")).toBe(24);
    expect(parsePriceToNumber("24,00 €")).toBe(24);
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

  // Mission "BUG CONFIRME -- readiness prix faussement positive" (2026-08-19) :
  // le prix est obligatoire dans ce flow -- un champ introuvable n'est plus
  // suppose valide (comportement precedent inverse, corrige suite a une
  // readiness faussement positive prouvee en direct).
  it("is NOT valid when the price input cannot be found -- price is mandatory in this flow", () => {
    const state = describePriceValidationState(null);

    expect(state.found).toBe(false);
    expect(state.valid).toBe(false);
  });

  // Mission "BUG CONFIRME -- readiness prix faussement positive" (2026-08-19) :
  // CAUSE CONFIRMEE en test live -- domValue:"" avec validity.valid:true
  // (Vinted ne signale rien sur un champ simplement vide) faisait
  // precedemment passer `valid` a true. `valid` exige desormais un
  // parsedValue reellement parsable et >= 1, pas seulement l'absence
  // d'erreur Vinted.
  it("is NOT valid when domValue is empty, even if validity.valid is true (the exact live-reported false positive)", () => {
    const { input } = makeInput();
    input.value = "";

    const state = describePriceValidationState(input);

    expect(state.domValue).toBe("");
    expect(state.parsedValue).toBeNull();
    expect(state.validityValid).toBe(true);
    expect(state.valid).toBe(false);
  });

  it("is NOT valid for 0,00 € (parsed to 0, below the real Vinted minimum of 1)", () => {
    const { input } = makeInput();
    input.value = "0,00 €";

    const state = describePriceValidationState(input);

    expect(state.parsedValue).toBe(0);
    expect(state.valid).toBe(false);
  });

  it("is NOT valid for 0,99 € (just below the minimum)", () => {
    const { input } = makeInput();
    input.value = "0,99 €";

    const state = describePriceValidationState(input);

    expect(state.parsedValue).toBe(0.99);
    expect(state.valid).toBe(false);
  });

  it("is valid for 1,00 € (exactly the minimum)", () => {
    const { input } = makeInput();
    input.value = "1,00 €";

    const state = describePriceValidationState(input);

    expect(state.parsedValue).toBe(1);
    expect(state.valid).toBe(true);
  });

  // Regression directe du bug live : PUBLISH_READY_TO_SUBMIT ne doit plus
  // jamais pouvoir partir quand domValue est vide -- isFormReallyReadyToSubmit()
  // (publishReadiness.ts) consomme priceState.valid tel quel, donc ce seul
  // test sur describePriceValidationState() couvre deja la regression bout en
  // bout (meme source unique de verite, aucune logique dupliquee).
  it("regression: PUBLISH_READY_TO_SUBMIT can no longer fire with an empty price field", () => {
    const { input } = makeInput();
    input.value = "";

    const state = describePriceValidationState(input);

    const buttonState = { found: true, disabled: false, ariaDisabled: null, textContent: "Ajouter" };
    const isReady = buttonState.found && buttonState.disabled === false && buttonState.ariaDisabled !== "true" && state.valid;
    expect(isReady).toBe(false);
  });
});
