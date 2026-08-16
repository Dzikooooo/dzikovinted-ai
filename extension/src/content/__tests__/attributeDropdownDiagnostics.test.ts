import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  describeExactMatchCandidate,
  describeExactMatchStructure,
  diffDropdownDomElements,
  diffTestIds,
  matchesHumanClick,
  snapshotDropdownDom,
} from "../attributeDropdownDiagnostics";

// Mission "IDENTIFIER ET CORRIGER LES DERNIERS BLOQUAGES DES ATTRIBUTS"
// (2026-08-12) : preuve live -- Etat/Taille/Couleur atteignent
// "trigger_click_attempted" mais jamais "dropdown_content_found", meme avec
// le timeout de 20000ms confirme fonctionnel. Ces tests couvrent la lecture
// DOM pure utilisee pour distinguer "le clic n'ouvre rien" de "le clic ouvre
// bien quelque chose mais on regarde le mauvais contentSelector", sans
// jamais decider laquelle est vraie a la place d'un vrai test live.
describe("snapshotDropdownDom", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns all-null/zero when the trigger doesn't exist and nothing relevant is in the DOM", () => {
    const snapshot = snapshotDropdownDom('[data-testid="missing-trigger"]');
    expect(snapshot.ariaExpanded).toBeNull();
    expect(snapshot.triggerOuterHtml).toBeNull();
    expect(snapshot.visibleListboxCount).toBe(0);
    expect(snapshot.visibleOptionCount).toBe(0);
    expect(snapshot.matchingTestIds).toEqual([]);
    expect(snapshot.dialogOrPopoverCount).toBe(0);
  });

  it("reads aria-expanded off the trigger when present", () => {
    const trigger = document.createElement("div");
    trigger.setAttribute("data-testid", "category-condition-single-list-input");
    trigger.setAttribute("aria-expanded", "true");
    document.body.appendChild(trigger);

    const snapshot = snapshotDropdownDom('[data-testid="category-condition-single-list-input"]');
    expect(snapshot.ariaExpanded).toBe("true");
  });

  it("truncates an excessively long trigger outerHTML rather than logging it whole", () => {
    const trigger = document.createElement("div");
    trigger.setAttribute("data-testid", "big-trigger");
    trigger.innerHTML = `<span>${"x".repeat(1000)}</span>`;
    document.body.appendChild(trigger);

    const snapshot = snapshotDropdownDom('[data-testid="big-trigger"]');
    expect(snapshot.triggerOuterHtml?.length).toBeLessThan(600);
    expect(snapshot.triggerOuterHtml?.endsWith("…")).toBe(true);
  });

  it("finds and dedupes matching data-testid keywords (dropdown/content/condition/size/color/select/list/option)", () => {
    document.body.innerHTML = `
      <div data-testid="category-condition-single-list-input"></div>
      <div data-testid="condition-select-dropdown-content"></div>
      <div data-testid="condition-select-dropdown-content"></div>
      <div data-testid="unrelated-thing"></div>
    `;
    const snapshot = snapshotDropdownDom('[data-testid="category-condition-single-list-input"]');
    expect(snapshot.matchingTestIds).toContain("category-condition-single-list-input");
    expect(snapshot.matchingTestIds).toContain("condition-select-dropdown-content");
    expect(snapshot.matchingTestIds).not.toContain("unrelated-thing");
    // deduplique : "condition-select-dropdown-content" apparait deux fois dans le DOM
    // mais une seule fois dans le resultat.
    expect(snapshot.matchingTestIds.filter((id) => id === "condition-select-dropdown-content")).toHaveLength(1);
  });

  it("counts role=dialog/presentation/popover elements as potential portals", () => {
    document.body.innerHTML = `<div role="dialog"></div><div role="presentation"></div>`;
    const snapshot = snapshotDropdownDom('[data-testid="anything"]');
    expect(snapshot.dialogOrPopoverCount).toBe(2);
  });
});

describe("diffTestIds", () => {
  it("returns only the ids present in 'after' but not in 'before'", () => {
    expect(diffTestIds(["a", "b"], ["a", "b", "c"])).toEqual(["c"]);
  });

  it("returns an empty array when nothing new appeared", () => {
    expect(diffTestIds(["a", "b"], ["a", "b"])).toEqual([]);
  });

  it("returns an empty array when the DOM shrank (no false 'new' ids)", () => {
    expect(diffTestIds(["a", "b", "c"], ["a"])).toEqual([]);
  });
});

// Mission item F : preuve live -- describeMatchAttempt() rapporte
// exactMatches.length === 2 pour "Polo Ralph Lauren" (reason:
// "multiple_exact_matches_ambiguous"). describeExactMatchCandidate() expose
// les details DOM reels de CHAQUE element correspondant, pour distinguer
// sans deviner : deux options Vinted distinctes, une duplication DOM
// (mobile/desktop, deja rencontre pour les photos), une option visible + une
// cachee, ou une duplication introduite par notre propre extraction.
describe("describeExactMatchCandidate", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("captures identity/accessibility/visibility details for a real DOM candidate", () => {
    const li = document.createElement("li");
    li.id = "option-42";
    li.setAttribute("role", "option");
    li.setAttribute("data-testid", "brand-option-42");
    li.setAttribute("aria-selected", "false");
    li.textContent = "Polo Ralph Lauren";
    document.body.appendChild(li);

    const diagnostic = describeExactMatchCandidate(li, 3, "Polo Ralph Lauren", "polo ralph lauren");
    expect(diagnostic.index).toBe(3);
    expect(diagnostic.rawText).toBe("Polo Ralph Lauren");
    expect(diagnostic.normalizedText).toBe("polo ralph lauren");
    expect(diagnostic.tagName).toBe("LI");
    expect(diagnostic.id).toBe("option-42");
    expect(diagnostic.role).toBe("option");
    expect(diagnostic.dataTestId).toBe("brand-option-42");
    expect(diagnostic.ariaSelected).toBe("false");
    expect(diagnostic.hidden).toBe(false);
  });

  it("reports hidden:true for an element with the native hidden attribute", () => {
    const li = document.createElement("li");
    li.hidden = true;
    li.textContent = "Polo Ralph Lauren";
    document.body.appendChild(li);

    const diagnostic = describeExactMatchCandidate(li, 0, "Polo Ralph Lauren", "polo ralph lauren");
    expect(diagnostic.hidden).toBe(true);
  });

  it("truncates outerHTML and parentOuterHTML rather than logging them whole", () => {
    const parent = document.createElement("ul");
    const li = document.createElement("li");
    li.innerHTML = `<span>${"x".repeat(1000)}</span>`;
    parent.appendChild(li);
    document.body.appendChild(parent);

    const diagnostic = describeExactMatchCandidate(li, 0, "text", "text");
    expect(diagnostic.outerHTML?.length).toBeLessThan(600);
    expect(diagnostic.parentOuterHTML?.length).toBeLessThan(600);
  });

  it("returns null id when the element has no id attribute", () => {
    const li = document.createElement("li");
    document.body.appendChild(li);
    const diagnostic = describeExactMatchCandidate(li, 0, "text", "text");
    expect(diagnostic.id).toBeNull();
  });
});

// Mission "DIAGNOSTIC FINAL CLIC HUMAIN + DROPDOWNS ATTRIBUTS" (2026-08-12) :
// preuve live -- ATTRIBUTE_HUMAN_CLICK_DIAGNOSTIC n'a produit aucun log
// malgre un clic humain reussi. Ces tests couvrent directement les causes
// identifiees par l'audit de code (reference DOM stale, propagation) --
// matchesHumanClick() re-interroge le DOM a CHAQUE appel, jamais une
// reference conservee.
describe("matchesHumanClick", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("case: trigger absent -- found:false, contains:false", () => {
    const result = matchesHumanClick('[data-testid="missing"]', document.body);
    expect(result).toEqual({ triggerFoundAtClickTime: false, triggerContainsEventTarget: false });
  });

  it("case: click target IS the trigger itself -- contains:true", () => {
    const trigger = document.createElement("div");
    trigger.setAttribute("data-testid", "my-trigger");
    document.body.appendChild(trigger);

    const result = matchesHumanClick('[data-testid="my-trigger"]', trigger);
    expect(result).toEqual({ triggerFoundAtClickTime: true, triggerContainsEventTarget: true });
  });

  it("case: click humain sur un enfant du trigger -- detecte via .contains()", () => {
    const trigger = document.createElement("div");
    trigger.setAttribute("data-testid", "my-trigger");
    const icon = document.createElement("span");
    trigger.appendChild(icon);
    document.body.appendChild(trigger);

    const result = matchesHumanClick('[data-testid="my-trigger"]', icon);
    expect(result.triggerContainsEventTarget).toBe(true);
  });

  it("case: click humain ailleurs sur la page (hors trigger) -- ignore", () => {
    const trigger = document.createElement("div");
    trigger.setAttribute("data-testid", "my-trigger");
    document.body.appendChild(trigger);
    const elsewhere = document.createElement("div");
    document.body.appendChild(elsewhere);

    const result = matchesHumanClick('[data-testid="my-trigger"]', elsewhere);
    expect(result).toEqual({ triggerFoundAtClickTime: true, triggerContainsEventTarget: false });
  });

  it("case: trigger REMPLACE (ancien noeud retire, nouveau ajoute) avant le clic -- le nouveau noeud est quand meme detecte, car la fonction re-interroge le DOM a chaque appel plutot que de garder une reference conservee", () => {
    const oldTrigger = document.createElement("div");
    oldTrigger.setAttribute("data-testid", "my-trigger");
    document.body.appendChild(oldTrigger);

    // Simule un remplacement React : l'ancien noeud est retire, un NOUVEAU
    // noeud (instance DOM differente) avec le meme selecteur le remplace --
    // exactement le scenario qui rendait l'ancienne implementation (reference
    // conservee a l'attache) incapable de detecter le clic humain reel.
    oldTrigger.remove();
    const newTrigger = document.createElement("div");
    newTrigger.setAttribute("data-testid", "my-trigger");
    const newChild = document.createElement("span");
    newTrigger.appendChild(newChild);
    document.body.appendChild(newTrigger);

    const result = matchesHumanClick('[data-testid="my-trigger"]', newChild);
    expect(result).toEqual({ triggerFoundAtClickTime: true, triggerContainsEventTarget: true });
  });
});

// Item 6 de la mission : structure des candidats en exact match ambigu
// (Marque, "Polo Ralph Lauren" x2) -- determiner si ResellOS agrege deux
// LISTES differentes plutot que de decider a l'aveugle.
describe("describeExactMatchStructure", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reports the closest <ul> and the sibling index within it", () => {
    const ul = document.createElement("ul");
    ul.setAttribute("data-testid", "brand-list");
    const li1 = document.createElement("li");
    const li2 = document.createElement("li");
    ul.appendChild(li1);
    ul.appendChild(li2);
    document.body.appendChild(ul);

    const diag1 = describeExactMatchStructure(li1);
    const diag2 = describeExactMatchStructure(li2);
    expect(diag1.closestUlTestId).toBe("brand-list");
    expect(diag1.parentIndexAmongSiblings).toBe(0);
    expect(diag2.parentIndexAmongSiblings).toBe(1);
  });

  it("reports distinct closest <ul> ids when two candidates live in two different lists", () => {
    const ul1 = document.createElement("ul");
    ul1.id = "desktop-list";
    const li1 = document.createElement("li");
    ul1.appendChild(li1);
    document.body.appendChild(ul1);

    const ul2 = document.createElement("ul");
    ul2.id = "mobile-list";
    const li2 = document.createElement("li");
    ul2.appendChild(li2);
    document.body.appendChild(ul2);

    expect(describeExactMatchStructure(li1).closestUlId).toBe("desktop-list");
    expect(describeExactMatchStructure(li2).closestUlId).toBe("mobile-list");
  });

  it("captures up to 3 ancestor levels with tag/id/class/testid", () => {
    const grandparent = document.createElement("section");
    grandparent.id = "grandparent";
    const parent = document.createElement("ul");
    parent.className = "options";
    const li = document.createElement("li");
    parent.appendChild(li);
    grandparent.appendChild(parent);
    document.body.appendChild(grandparent);

    const diag = describeExactMatchStructure(li);
    expect(diag.ancestors.length).toBeGreaterThanOrEqual(2);
    expect(diag.ancestors[0].tagName).toBe("UL");
    expect(diag.ancestors[0].className).toBe("options");
    expect(diag.ancestors[1].id).toBe("grandparent");
  });

  it("finds a nearby heading as section context when present", () => {
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    heading.textContent = "Marques populaires";
    const ul = document.createElement("ul");
    const li = document.createElement("li");
    ul.appendChild(li);
    section.appendChild(heading);
    section.appendChild(ul);
    document.body.appendChild(section);

    expect(describeExactMatchStructure(li).nearbySectionText).toBe("Marques populaires");
  });

  it("returns null section text when no heading exists nearby", () => {
    const li = document.createElement("li");
    document.body.appendChild(li);
    expect(describeExactMatchStructure(li).nearbySectionText).toBeNull();
  });
});

// Preuve structurelle (pas un test de vinted-publish.ts, qui n'est pas
// importable) que le PATTERN "listener document-level en phase capture"
// fonctionne comme attendu avec de vraies APIs DOM : un clic sur un enfant
// profondement imbrique est bien recu par un listener capture attache sur
// `document`, meme AVANT tout listener bulle pose entre les deux -- la base
// meme de l'architecture demandee pour watchForHumanClick().
describe("document-level capture listener pattern (DOM API proof, not a vinted-publish.ts import)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("a capture-phase document listener receives a click on a deeply nested child, and runs before a bubble-phase listener on an intermediate ancestor", () => {
    const outer = document.createElement("div");
    const inner = document.createElement("span");
    outer.appendChild(inner);
    document.body.appendChild(outer);

    const order: string[] = [];
    document.addEventListener("click", () => order.push("document_capture"), true);
    outer.addEventListener("click", () => order.push("outer_bubble"), false);

    inner.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(order).toEqual(["document_capture", "outer_bubble"]);
  });

  it("a capture-phase document listener still fires even if a bubble-phase ancestor listener calls stopPropagation()", () => {
    const outer = document.createElement("div");
    const inner = document.createElement("span");
    outer.appendChild(inner);
    document.body.appendChild(outer);

    let captureRan = false;
    document.addEventListener("click", () => (captureRan = true), true);
    outer.addEventListener("click", (e) => e.stopPropagation(), false);

    inner.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(captureRan).toBe(true);
  });
});

// Mission "IDENTIFIER FACTUELLEMENT LA STRUCTURE DOM REELLE" (2026-08-12) :
// preuve live -- clic humain sur Etat, matchingTestIds passe de 51 a 87
// (dropdown visiblement ouvert dans l'UI Vinted), mais visibleListboxCount/
// visibleOptionCount RESTENT a 0 tout du long -- le heuristique generique
// role=listbox/role=option ne represente PAS la structure reelle de ce
// composant. Ces tests couvrent la fonction qui identifie PRECISEMENT les
// data-testid ajoutes/retires (et le detail complet de chaque element
// ajoute), pour la comparaison synthetique vs humain demandee.
describe("diffDropdownDomElements", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reports no added/removed testids when nothing relevant changed", () => {
    document.body.innerHTML = `<div data-testid="category-condition-single-list-input"></div>`;
    const diff = diffDropdownDomElements(["category-condition-single-list-input"]);
    expect(diff.addedTestIds).toEqual([]);
    expect(diff.removedTestIds).toEqual([]);
    expect(diff.addedElements).toEqual([]);
  });

  it("detects a newly-appeared matching testid and returns its full element detail", () => {
    document.body.innerHTML = `<div data-testid="category-condition-single-list-input"></div>`;
    const newOption = document.createElement("div");
    newOption.setAttribute("data-testid", "condition-option-item");
    newOption.setAttribute("role", "button");
    newOption.setAttribute("aria-selected", "false");
    newOption.className = "option-row";
    newOption.textContent = "Très bon état";
    document.body.appendChild(newOption);

    const diff = diffDropdownDomElements(["category-condition-single-list-input"]);
    expect(diff.addedTestIds).toEqual(["condition-option-item"]);
    expect(diff.addedElements).toHaveLength(1);
    const el = diff.addedElements[0];
    expect(el.dataTestId).toBe("condition-option-item");
    expect(el.tagName).toBe("DIV");
    expect(el.role).toBe("button");
    expect(el.ariaSelected).toBe("false");
    expect(el.className).toBe("option-row");
    expect(el.textContent).toBe("Très bon état");
  });

  it("truncates a very long textContent on an added element", () => {
    document.body.innerHTML = "";
    const el = document.createElement("div");
    el.setAttribute("data-testid", "condition-option-item");
    el.textContent = "x".repeat(500);
    document.body.appendChild(el);

    const diff = diffDropdownDomElements([]);
    expect(diff.addedElements[0].textContent?.length).toBeLessThan(200);
    expect(diff.addedElements[0].textContent?.endsWith("…")).toBe(true);
  });

  it("captures immediate parent info (tag/testid/class) for an added element", () => {
    const parent = document.createElement("ul");
    parent.setAttribute("data-testid", "condition-list-content");
    parent.className = "list-wrap";
    const child = document.createElement("li");
    child.setAttribute("data-testid", "condition-option-item");
    parent.appendChild(child);
    document.body.appendChild(parent);

    const diff = diffDropdownDomElements([]);
    const el = diff.addedElements.find((e) => e.dataTestId === "condition-option-item");
    expect(el?.parentTagName).toBe("UL");
    expect(el?.parentDataTestId).toBe("condition-list-content");
    expect(el?.parentClassName).toBe("list-wrap");
  });

  it("reports removedTestIds for elements present in the baseline but no longer in the DOM", () => {
    document.body.innerHTML = "";
    const diff = diffDropdownDomElements(["condition-select-dropdown-content"]);
    expect(diff.removedTestIds).toEqual(["condition-select-dropdown-content"]);
  });

  it("ignores elements whose testid doesn't match any relevant keyword", () => {
    document.body.innerHTML = `<div data-testid="unrelated-page-widget"></div>`;
    const diff = diffDropdownDomElements([]);
    expect(diff.addedTestIds).toEqual([]);
  });

  it("dedupes when the same new testid appears on multiple elements (only one entry logged)", () => {
    document.body.innerHTML = `
      <div data-testid="condition-option-item">A</div>
      <div data-testid="condition-option-item">B</div>
    `;
    const diff = diffDropdownDomElements([]);
    expect(diff.addedTestIds).toEqual(["condition-option-item"]);
    expect(diff.addedElements).toHaveLength(1);
  });
});
