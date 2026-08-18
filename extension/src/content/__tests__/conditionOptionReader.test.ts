import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { describeConditionTriggerAfterSelection, matchConditionOption, readConditionOptionCandidates } from "../conditionOptionReader";

// Mission "FIX FINAL ETAT : MATCHER LE CONTAINER REEL" (2026-08-13) : preuve
// live directe dans la console Vinted sur les candidats reels (condition-1
// a condition-6) -- condition-{id}-title/-content/-suffix rapportent
// systematiquement textContent ET innerText illisibles (null/vide), quel
// que soit le candidat. Le texte exploitable est porte par le CONTENEUR
// LOGIQUE lui-meme, concatene sans separateur entre libelle et description
// ("Très bon étatTrès peu porté, ..."). Ces tests reproduisent cette forme
// DOM reelle -- pas l'ancienne hypothese (infirmee) "-title porte le
// libelle court".
// jsdom n'implemente pas de layout reel : offsetParent/getClientRects()
// restent toujours "invisibles" par defaut, meme pour un element attache au
// document -- limitation deja rencontree pour isVisible() (attributeDropdownDiagnostics.ts).
// Stub cible sur CET element precis pour simuler l'etat "visible" confirme
// en live.
function markVisible(el: HTMLElement): void {
  Object.defineProperty(el, "offsetParent", { get: () => document.body, configurable: true });
}

// containerText concatene sans separateur, EXACTEMENT comme observe en live
// -- aucune supposition sur un separateur qui n'existe pas dans le DOM reel.
// role par defaut "radio" : mission "ROUND CONDITION / ETAT -- correctif
// role" (2026-08-19), valeur REELLEMENT observee en live aujourd'hui (le
// role="button" de la mission du 2026-08-13 ne l'est plus) -- garde
// parametrable pour les tests qui verifient explicitement le repli de
// compatibilite "button" et le rejet d'un role non supporte.
function makeConditionOption(id: number, containerText: string, role: string = "radio"): HTMLElement {
  const container = document.createElement("div");
  container.setAttribute("data-testid", `condition-${id}`);
  container.setAttribute("role", role);
  markVisible(container);

  // Preuve live : ces sous-elements existent (voir ATTRIBUTE_DROPDOWN_DOM_DIFF,
  // mission precedente) mais leur texte est illisible pour tous les
  // candidats testes -- laisses volontairement vides ici, jamais lus par le
  // reader desormais.
  const titleEl = document.createElement("div");
  titleEl.setAttribute("data-testid", `condition-${id}-title`);
  container.appendChild(titleEl);

  const contentEl = document.createElement("div");
  contentEl.setAttribute("data-testid", `condition-${id}-content`);
  container.appendChild(contentEl);

  const suffixEl = document.createElement("div");
  suffixEl.setAttribute("data-testid", `condition-${id}-suffix`);
  container.appendChild(suffixEl);

  // Le texte exploitable est porte par le conteneur lui-meme (noeud texte
  // direct), pas par un sous-element isole -- source confirmee live.
  container.appendChild(document.createTextNode(containerText));

  const radio = document.createElement("div");
  radio.setAttribute("data-testid", `condition-radio-${id}`);
  const radioInput = document.createElement("input");
  radioInput.setAttribute("data-testid", `condition-radio-${id}--input`);
  const radioText = document.createElement("span");
  radioText.setAttribute("data-testid", `condition-radio-${id}--text`);
  radio.appendChild(radioInput);
  radio.appendChild(radioText);
  document.body.appendChild(radio);

  document.body.appendChild(container);
  return container;
}

// Echelle Vinted reelle a 5 niveaux (publishSelectors.ts), avec le texte
// concatene tel qu'observe en live -- ids repris de la preuve live fournie
// par l'utilisateur (condition-6/1/2/3/4).
function makeRealConditionScale(): void {
  makeConditionOption(6, "Neuf avec étiquetteJamais porté, avec étiquette d'origine");
  makeConditionOption(1, "Neuf sans étiquetteArticle neuf, jamais porté");
  makeConditionOption(2, "Très bon étatTrès peu porté, peut présenter quelques légères traces d'usure");
  makeConditionOption(3, "Bon étatPorté mais en bon état general");
  makeConditionOption(4, "SatisfaisantArticle use, avec des signes d'usure visibles");
}

describe("readConditionOptionCandidates", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("recognizes only real condition-{numericId} containers", () => {
    makeConditionOption(1, "Neuf sans étiquetteArticle neuf, jamais porté");
    makeConditionOption(6, "Neuf avec étiquetteJamais porté, avec étiquette d'origine");

    const candidates = readConditionOptionCandidates();
    expect(candidates.map((c) => c.containerTestId).sort()).toEqual(["condition-1", "condition-6"]);
  });

  it("ignores condition-{id}-title/-content/-suffix as independent options -- only the id-only form counts", () => {
    makeConditionOption(1, "Neuf sans étiquetteArticle neuf, jamais porté");
    const testIds = readConditionOptionCandidates().map((c) => c.containerTestId);
    expect(testIds).not.toContain("condition-1-title");
    expect(testIds).not.toContain("condition-1-content");
    expect(testIds).not.toContain("condition-1-suffix");
  });

  it("ignores the condition-radio-{id}* family entirely (different prefix)", () => {
    makeConditionOption(1, "Neuf sans étiquetteArticle neuf, jamais porté");
    const testIds = readConditionOptionCandidates().map((c) => c.containerTestId);
    expect(testIds).not.toContain("condition-radio-1");
    expect(testIds).not.toContain("condition-radio-1--input");
    expect(testIds).not.toContain("condition-radio-1--text");
  });

  it("ignores a condition-{id} element without any role attribute (not a real leaf container)", () => {
    const noRole = document.createElement("div");
    noRole.setAttribute("data-testid", "condition-9");
    document.body.appendChild(noRole);

    expect(readConditionOptionCandidates()).toEqual([]);
  });

  // Mission "ROUND CONDITION / ETAT -- correctif role" (2026-08-19) : cause
  // racine confirmee en live -- Vinted a change role="button" (preuve du
  // 2026-08-13) en role="radio" pour ces conteneurs. Les 5 tests suivants
  // couvrent exactement les cas demandes pour cette regression.
  it("recognizes condition-{id} with role=radio, visible -- the role actually used by Vinted today", () => {
    const container = makeConditionOption(2, "Très bon étatTrès peu porté", "radio");
    expect(readConditionOptionCandidates().map((c) => c.containerTestId)).toEqual(["condition-2"]);
    expect(container.getAttribute("role")).toBe("radio");
  });

  it("still recognizes condition-{id} with role=button, visible -- compatibility fallback for the older DOM variant", () => {
    makeConditionOption(2, "Très bon étatTrès peu porté", "button");
    expect(readConditionOptionCandidates().map((c) => c.containerTestId)).toEqual(["condition-2"]);
  });

  it("ignores condition-{id} with an unsupported role (neither radio nor button)", () => {
    makeConditionOption(2, "Très bon étatTrès peu porté", "option");
    expect(readConditionOptionCandidates()).toEqual([]);
  });

  it("ignores condition-{id} with role=radio when invisible (offsetParent null, no client rects)", () => {
    const container = document.createElement("div");
    container.setAttribute("data-testid", "condition-2");
    container.setAttribute("role", "radio");
    container.appendChild(document.createTextNode("Très bon étatTrès peu porté"));
    document.body.appendChild(container);
    // Aucun markVisible() ici -- jsdom laisse offsetParent/getClientRects()
    // dans leur etat "invisible" par defaut, exactement le cas a couvrir.

    expect(readConditionOptionCandidates()).toEqual([]);
  });

  it("matches 'Très bon état' to condition-2 end-to-end with role=radio (the real live DOM shape)", () => {
    makeConditionOption(6, "Neuf avec étiquetteJamais porté, avec étiquette d'origine", "radio");
    makeConditionOption(1, "Neuf sans étiquetteArticle neuf, jamais porté", "radio");
    makeConditionOption(2, "Très bon étatTrès peu porté, peut présenter quelques légères traces d'usure", "radio");
    makeConditionOption(3, "Bon étatPorté mais en bon état general", "radio");
    makeConditionOption(4, "SatisfaisantArticle use, avec des signes d'usure visibles", "radio");

    const result = matchConditionOption("Très bon état", readConditionOptionCandidates());
    expect(result.reason).toBe("unique_match");
    expect(result.matched?.containerTestId).toBe("condition-2");
  });

  it("reads the container's own concatenated text even when -title/-content/-suffix children have no readable text (proven live: title/content are unreadable for every real candidate)", () => {
    const container = makeConditionOption(2, "Très bon étatTrès peu porté, peut présenter quelques légères traces");
    // Preuve live directe : les sous-elements existent mais sont vides --
    // le reader n'en depend plus du tout desormais.
    expect(container.querySelector('[data-testid="condition-2-title"]')?.textContent).toBe("");
    expect(container.querySelector('[data-testid="condition-2-content"]')?.textContent).toBe("");

    const candidates = readConditionOptionCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].containerText).toBe("Très bon étatTrès peu porté, peut présenter quelques légères traces");
  });

  it("returns an empty array when no condition options are present at all", () => {
    document.body.innerHTML = `<div data-testid="unrelated"></div>`;
    expect(readConditionOptionCandidates()).toEqual([]);
  });
});

// Mission item C/D : matchConditionOption() est la strategie dediee Etat --
// UNIQUE PREFIX MATCH ONLY sur le texte COMPLET du conteneur, jamais de
// decoupage du texte concatene (aucun separateur fiable dans le DOM reel).
describe("matchConditionOption (Etat prefix-match strategy)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    makeRealConditionScale();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("'Très bon état' matches condition-2 uniquely (case: requested from the real 5-tier scale)", () => {
    const result = matchConditionOption("Très bon état", readConditionOptionCandidates());
    expect(result.reason).toBe("unique_match");
    expect(result.matched?.containerTestId).toBe("condition-2");
  });

  it("'Bon état' matches condition-3 uniquely", () => {
    const result = matchConditionOption("Bon état", readConditionOptionCandidates());
    expect(result.reason).toBe("unique_match");
    expect(result.matched?.containerTestId).toBe("condition-3");
  });

  it("'Neuf avec étiquette' matches condition-6 uniquely", () => {
    const result = matchConditionOption("Neuf avec étiquette", readConditionOptionCandidates());
    expect(result.reason).toBe("unique_match");
    expect(result.matched?.containerTestId).toBe("condition-6");
  });

  it("'Neuf sans étiquette' matches condition-1 uniquely", () => {
    const result = matchConditionOption("Neuf sans étiquette", readConditionOptionCandidates());
    expect(result.reason).toBe("unique_match");
    expect(result.matched?.containerTestId).toBe("condition-1");
  });

  it("'Satisfaisant' matches condition-4 uniquely", () => {
    const result = matchConditionOption("Satisfaisant", readConditionOptionCandidates());
    expect(result.reason).toBe("unique_match");
    expect(result.matched?.containerTestId).toBe("condition-4");
  });

  it("matches case/accent-insensitively (source data may differ in casing from the DOM text)", () => {
    const result = matchConditionOption("tres bon etat", readConditionOptionCandidates());
    expect(result.reason).toBe("unique_match");
    expect(result.matched?.containerTestId).toBe("condition-2");
  });

  it("returns no_match (manual) when the requested value is a prefix of no candidate", () => {
    const result = matchConditionOption("Comme neuf", readConditionOptionCandidates());
    expect(result.reason).toBe("no_match");
    expect(result.matched).toBeNull();
  });

  it("returns ambiguous_match (manual) when two candidates share the same prefix -- never guesses the closest one", () => {
    document.body.innerHTML = "";
    makeConditionOption(3, "Bon étatPorté mais en bon état general");
    makeConditionOption(7, "Bon état renforcéVariante hypothetique partageant le meme prefixe");

    const result = matchConditionOption("Bon état", readConditionOptionCandidates());
    expect(result.reason).toBe("ambiguous_match");
    expect(result.matched).toBeNull();
    expect(result.matchingCandidates.map((c) => c.containerTestId).sort()).toEqual(["condition-3", "condition-7"]);
  });

  it("returns no_match for an empty/missing requested value rather than matching arbitrarily", () => {
    const result = matchConditionOption("", readConditionOptionCandidates());
    expect(result.reason).toBe("no_match");
    expect(result.matched).toBeNull();
  });

  it("ignores condition-radio-* technical elements when matching (never treated as candidates)", () => {
    const candidates = readConditionOptionCandidates();
    expect(candidates.some((c) => c.containerTestId.startsWith("condition-radio-"))).toBe(false);
  });
});

// Mission "FINALISER ETAT : CONFIRMATION POST-SELECTION" (2026-08-13) :
// describeConditionTriggerAfterSelection() est PUREMENT observationnel --
// aucune de ces sources n'est encore prouvee fiable en live (readTriggerText()
// renvoie null sur le vrai trigger), ces tests verifient seulement que
// CHAQUE source plausible est correctement extraite quand elle existe dans
// le DOM, pas laquelle est "la bonne" (a trancher par le prochain test live).
const TRIGGER_SELECTOR = '[data-testid="category-condition-single-list-input"]';

describe("describeConditionTriggerAfterSelection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns an all-null diagnostic when the trigger is not found in the DOM", () => {
    const diagnostic = describeConditionTriggerAfterSelection(TRIGGER_SELECTOR);
    expect(diagnostic).toEqual({
      triggerTagName: null,
      triggerType: null,
      valueProperty: null,
      valueAttribute: null,
      textContent: null,
      innerText: null,
      ariaLabel: null,
      ariaValueText: null,
      placeholder: null,
      outerHTML: null,
      parentTextContent: null,
      parentInnerText: null,
      parentOuterHTML: null,
    });
  });

  it("captures input.value and the value attribute when the trigger is a real <input>", () => {
    const parent = document.createElement("div");
    const input = document.createElement("input");
    input.setAttribute("data-testid", "category-condition-single-list-input");
    input.setAttribute("type", "text");
    input.value = "Très bon état";
    parent.appendChild(input);
    document.body.appendChild(parent);

    const diagnostic = describeConditionTriggerAfterSelection(TRIGGER_SELECTOR);
    expect(diagnostic.triggerTagName).toBe("INPUT");
    expect(diagnostic.triggerType).toBe("text");
    expect(diagnostic.valueProperty).toBe("Très bon état");
  });

  it("captures aria-valuetext/aria-label/placeholder when present on the trigger", () => {
    const trigger = document.createElement("div");
    trigger.setAttribute("data-testid", "category-condition-single-list-input");
    trigger.setAttribute("aria-valuetext", "Très bon état");
    trigger.setAttribute("aria-label", "État de l'article");
    trigger.setAttribute("placeholder", "Sélectionner l'état");
    document.body.appendChild(trigger);

    const diagnostic = describeConditionTriggerAfterSelection(TRIGGER_SELECTOR);
    expect(diagnostic.ariaValueText).toBe("Très bon état");
    expect(diagnostic.ariaLabel).toBe("État de l'article");
    expect(diagnostic.placeholder).toBe("Sélectionner l'état");
  });

  it("captures textContent/innerText/outerHTML of the trigger itself", () => {
    const trigger = document.createElement("div");
    trigger.setAttribute("data-testid", "category-condition-single-list-input");
    trigger.textContent = "Très bon état";
    document.body.appendChild(trigger);

    const diagnostic = describeConditionTriggerAfterSelection(TRIGGER_SELECTOR);
    expect(diagnostic.textContent).toBe("Très bon état");
    expect(diagnostic.outerHTML).toContain("Très bon état");
  });

  it("captures the parent's textContent/innerText/outerHTML separately from the trigger's own", () => {
    const parent = document.createElement("div");
    parent.textContent = "État : Très bon état";
    const trigger = document.createElement("span");
    trigger.setAttribute("data-testid", "category-condition-single-list-input");
    parent.appendChild(trigger);
    document.body.appendChild(parent);

    const diagnostic = describeConditionTriggerAfterSelection(TRIGGER_SELECTOR);
    expect(diagnostic.parentTextContent).toBe("État : Très bon état");
    expect(diagnostic.parentOuterHTML).toContain("category-condition-single-list-input");
  });

  it("returns null valueProperty for a non-input trigger (no .value property to read)", () => {
    const trigger = document.createElement("div");
    trigger.setAttribute("data-testid", "category-condition-single-list-input");
    document.body.appendChild(trigger);

    const diagnostic = describeConditionTriggerAfterSelection(TRIGGER_SELECTOR);
    expect(diagnostic.valueProperty).toBeNull();
  });
});
