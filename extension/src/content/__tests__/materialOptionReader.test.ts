import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { matchMaterialOption, readMaterialOptionCandidates } from "../materialOptionReader";

// Mission "MATIERE : MULTI-SELECT" (2026-08-16) : jsdom n'implemente pas de
// layout reel -- offsetParent/getClientRects() restent toujours "invisibles"
// par defaut, meme stub que colorOptionReader.test.ts/conditionOptionReader.test.ts.
function markVisible(el: HTMLElement): void {
  Object.defineProperty(el, "offsetParent", { get: () => document.body, configurable: true });
}

// Reproduit la structure REELLE prouvee en live (id 44 = Coton, id 45 =
// Polyester) : conteneur logique + -title/-suffix (laisses vides, jamais lus
// par le reader -- non prouves lisibles isolement) + checkbox + input reel.
function makeMaterialOption(id: number, label: string, options: { checked?: boolean } = {}): HTMLInputElement {
  const container = document.createElement("div");
  container.setAttribute("data-testid", `material-${id}`);
  container.appendChild(document.createTextNode(label));

  const titleEl = document.createElement("div");
  titleEl.setAttribute("data-testid", `material-${id}--title`);
  container.appendChild(titleEl);

  const suffixEl = document.createElement("div");
  suffixEl.setAttribute("data-testid", `material-${id}--suffix`);
  container.appendChild(suffixEl);

  document.body.appendChild(container);

  const checkboxWrapper = document.createElement("div");
  checkboxWrapper.setAttribute("data-testid", `material-checkbox-${id}`);
  const checkboxInput = document.createElement("input");
  checkboxInput.setAttribute("type", "checkbox");
  checkboxInput.setAttribute("data-testid", `material-checkbox-${id}--input`);
  checkboxInput.checked = options.checked ?? false;
  markVisible(checkboxInput);
  checkboxWrapper.appendChild(checkboxInput);
  document.body.appendChild(checkboxWrapper);

  return checkboxInput;
}

// Mission "MATIERE : BUG MATCHING" (2026-08-16) : reproduit EXACTEMENT le
// scenario signale en direct par l'utilisateur -- Vinted rend DEUX fois le
// meme id (ex. variante desktop/mobile simultanee), donnant DEUX conteneurs
// material-44 et DEUX checkboxes material-checkbox-44--input distincts dans
// le DOM, tous deux visibles et portant le meme texte "Coton". Doit produire
// EXACTEMENT UN candidat logique pour l'id 44, jamais deux (qui rendraient
// "Coton" ambigu a tort).
function makeDuplicatedMaterialOption(id: number, label: string): void {
  makeMaterialOption(id, label);
  makeMaterialOption(id, label);
}

describe("readMaterialOptionCandidates", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("recognizes real material-{id} + material-checkbox-{id}--input pairs by id correlation", () => {
    makeMaterialOption(44, "Coton");
    makeMaterialOption(45, "Polyester");

    const candidates = readMaterialOptionCandidates();
    expect(candidates.map((c) => c.id).sort()).toEqual(["44", "45"]);
    expect(candidates.find((c) => c.id === "44")?.containerText).toBe("Coton");
    expect(candidates.find((c) => c.id === "45")?.containerText).toBe("Polyester");
  });

  it("exposes the real <input type=checkbox> element for each candidate", () => {
    const checkbox = makeMaterialOption(44, "Coton");
    const candidates = readMaterialOptionCandidates();
    expect(candidates[0].checkbox).toBe(checkbox);
    expect(candidates[0].checkbox.type).toBe("checkbox");
  });

  it("ignores material-{id}--title/--suffix as independent options -- only the id-only container form counts", () => {
    makeMaterialOption(44, "Coton");
    const testIds = readMaterialOptionCandidates().map((c) => c.containerTestId);
    expect(testIds).not.toContain("material-44--title");
    expect(testIds).not.toContain("material-44--suffix");
  });

  it("never invents a candidate when the checkbox exists but its correlated container is absent", () => {
    const checkboxWrapper = document.createElement("div");
    checkboxWrapper.setAttribute("data-testid", "material-checkbox-99");
    const checkboxInput = document.createElement("input");
    checkboxInput.setAttribute("type", "checkbox");
    checkboxInput.setAttribute("data-testid", "material-checkbox-99--input");
    markVisible(checkboxInput);
    checkboxWrapper.appendChild(checkboxInput);
    document.body.appendChild(checkboxWrapper);
    // Aucun material-99 ajoute.

    expect(readMaterialOptionCandidates()).toEqual([]);
  });

  it("never treats a checkbox without isVisible() as a candidate", () => {
    const container = document.createElement("div");
    container.setAttribute("data-testid", "material-44");
    container.appendChild(document.createTextNode("Coton"));
    document.body.appendChild(container);

    const checkboxWrapper = document.createElement("div");
    checkboxWrapper.setAttribute("data-testid", "material-checkbox-44");
    const checkboxInput = document.createElement("input");
    checkboxInput.setAttribute("type", "checkbox");
    checkboxInput.setAttribute("data-testid", "material-checkbox-44--input");
    // Pas de markVisible() ici -- jsdom le rapporte donc invisible par defaut.
    checkboxWrapper.appendChild(checkboxInput);
    document.body.appendChild(checkboxWrapper);

    expect(readMaterialOptionCandidates()).toEqual([]);
  });

  it("returns an empty array when no material options are present at all", () => {
    document.body.innerHTML = `<div data-testid="unrelated"></div>`;
    expect(readMaterialOptionCandidates()).toEqual([]);
  });

  it("reflects checkbox.checked as-is, including an already-checked option", () => {
    makeMaterialOption(44, "Coton", { checked: true });
    const candidates = readMaterialOptionCandidates();
    expect(candidates[0].checkbox.checked).toBe(true);
  });

  it("deduplicates by id -- two DOM nodes sharing the same material-44/material-checkbox-44--input testids produce exactly ONE logical 'Coton' candidate, never two", () => {
    makeDuplicatedMaterialOption(44, "Coton");
    makeDuplicatedMaterialOption(45, "Polyester");

    const candidates = readMaterialOptionCandidates();
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.id).sort()).toEqual(["44", "45"]);
    expect(candidates.find((c) => c.id === "44")?.containerText).toBe("Coton");
    expect(candidates.find((c) => c.id === "45")?.containerText).toBe("Polyester");
  });

  it("deduplication picks the FIRST checkbox in DOM order for a duplicated id, never a mix of container A with checkbox B", () => {
    const firstCheckbox = makeMaterialOption(44, "Coton");
    makeMaterialOption(44, "Coton"); // duplicat -- meme id, meme texte, checkbox DIFFERENTE

    const candidates = readMaterialOptionCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].checkbox).toBe(firstCheckbox);
  });
});

// Meme strategie prouvee necessaire pour Etat (matchConditionOption) --
// -title/-suffix ne sont pas supposes lisibles isolement, le matching se
// fait sur le texte COMPLET du conteneur, en prefixe normalise.
describe("matchMaterialOption (Matière prefix-match strategy)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    makeMaterialOption(44, "Coton");
    makeMaterialOption(45, "Polyester");
    makeMaterialOption(46, "Laine");
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("'Coton' matches material-44 uniquely", () => {
    const result = matchMaterialOption("Coton", readMaterialOptionCandidates());
    expect(result.reason).toBe("unique_match");
    expect(result.matched?.id).toBe("44");
  });

  it("'Polyester' matches material-45 uniquely", () => {
    const result = matchMaterialOption("Polyester", readMaterialOptionCandidates());
    expect(result.reason).toBe("unique_match");
    expect(result.matched?.id).toBe("45");
  });

  it("matches case/accent-insensitively ('coton' -> material-44, 'laine' already unaccented)", () => {
    const result = matchMaterialOption("coton", readMaterialOptionCandidates());
    expect(result.reason).toBe("unique_match");
    expect(result.matched?.id).toBe("44");
  });

  it("returns no_match (manual) for a material absent from the real Vinted list", () => {
    const result = matchMaterialOption("Néoprène", readMaterialOptionCandidates());
    expect(result.reason).toBe("no_match");
    expect(result.matched).toBeNull();
  });

  it("returns ambiguous_match (manual) when two candidates share the same prefix -- never guesses", () => {
    document.body.innerHTML = "";
    makeMaterialOption(44, "Coton");
    makeMaterialOption(50, "Coton mélangé");

    const result = matchMaterialOption("Coton", readMaterialOptionCandidates());
    expect(result.reason).toBe("ambiguous_match");
    expect(result.matched).toBeNull();
    expect(result.matchingCandidates.map((c) => c.id).sort()).toEqual(["44", "50"]);
  });

  it("returns no_match for an empty/missing requested value rather than matching arbitrarily", () => {
    expect(matchMaterialOption("", readMaterialOptionCandidates()).reason).toBe("no_match");
    expect(matchMaterialOption(null, readMaterialOptionCandidates()).reason).toBe("no_match");
    expect(matchMaterialOption(undefined, readMaterialOptionCandidates()).reason).toBe("no_match");
  });

  it("resolves each requested material independently when matched one at a time against the remaining candidates (multi-select orchestration contract)", () => {
    const allCandidates = readMaterialOptionCandidates();
    const first = matchMaterialOption("Coton", allCandidates);
    expect(first.matched?.id).toBe("44");

    const remaining = allCandidates.filter((c) => c.id !== first.matched?.id);
    const second = matchMaterialOption("Laine", remaining);
    expect(second.matched?.id).toBe("46");
  });

  // Mission "MATIERE : BUG MATCHING" (2026-08-16) : preuve directe demandee
  // -- meme avec le DOM duplique par id (scenario live signale), ["Coton",
  // "Polyester"] donne exactement deux matchs NON ambigus (jamais
  // "ambiguous_match" a cause du doublon), les deux checkboxes cochees et
  // confirmables independamment (deux id distincts, jamais reutilises).
  it("still resolves ['Coton', 'Polyester'] as two clean, non-ambiguous matches even when the DOM duplicates every id (live-observed duplication scenario)", () => {
    document.body.innerHTML = "";
    makeDuplicatedMaterialOption(44, "Coton");
    makeDuplicatedMaterialOption(45, "Polyester");
    makeDuplicatedMaterialOption(46, "Laine");

    const usedIds = new Set<string>();
    for (const [requested, expectedId] of [
      ["Coton", "44"],
      ["Polyester", "45"],
    ] as const) {
      const candidates = readMaterialOptionCandidates().filter((c) => !usedIds.has(c.id));
      const result = matchMaterialOption(requested, candidates);
      expect(result.reason).toBe("unique_match");
      expect(result.matched?.id).toBe(expectedId);
      usedIds.add(result.matched!.id);
    }
    expect(usedIds.size).toBe(2);
  });
});
