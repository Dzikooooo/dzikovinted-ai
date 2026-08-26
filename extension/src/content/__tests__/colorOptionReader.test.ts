import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isColorCandidateChecked, readColorOptionCandidates, resolveColorOptionByTestId } from "../colorOptionReader";
import { matchOption } from "../matchOption";

// Mission "CAUSE COULEUR CONFIRMEE LIVE" (2026-08-19) : preuve live directe
// (fournie par l'utilisateur, capture DOM reelle sur Vinted) -- l'ancienne
// structure "color-{id}" (role=button) est OBSOLETE. Le picker Couleur expose
// desormais ses options via [role="checkbox"][data-testid^="filter-grid-
// option-"], confirmees par aria-checked ("false" avant clic humain, "true"
// apres) -- structurellement identique a Taille (size-group-{n}-grid-option-{id},
// deja role=checkbox) mais avec un prefixe de testid GENERIQUE. Ces tests
// reproduisent cette forme DOM reelle -- aucune supposition, uniquement la
// preuve fournie pour l'option "Bleu" (filter-grid-option-9).
//
// jsdom n'implemente pas de layout reel : offsetParent/getClientRects()
// restent toujours "invisibles" par defaut -- meme stub que
// sizeOptionReader.test.ts/conditionOptionReader.test.ts.
function markVisible(el: HTMLElement): void {
  Object.defineProperty(el, "offsetParent", { get: () => document.body, configurable: true });
}

function makeColorOption(
  id: number,
  label: string,
  opts: { role?: string; visible?: boolean; ariaChecked?: string; useAriaLabel?: boolean } = {}
): HTMLElement {
  const { role = "checkbox", visible = true, ariaChecked = "false", useAriaLabel = false } = opts;
  const el = document.createElement("div");
  el.setAttribute("data-testid", `filter-grid-option-${id}`);
  if (role) el.setAttribute("role", role);
  el.setAttribute("aria-checked", ariaChecked);
  if (useAriaLabel) {
    el.setAttribute("aria-label", label);
  } else {
    el.textContent = label;
  }
  if (visible) markVisible(el);
  document.body.appendChild(el);
  return el;
}

describe("readColorOptionCandidates", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("accepts a canonical filter-grid-option-9 checkbox with textContent 'Bleu'", () => {
    makeColorOption(9, "Bleu");
    const candidates = readColorOptionCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].containerTestId).toBe("filter-grid-option-9");
    expect(candidates[0].label).toBe("Bleu");
  });

  it("prefers aria-label over textContent when both are present", () => {
    const el = makeColorOption(9, "Bleu (aria)", { useAriaLabel: true });
    el.textContent = "Bleu (text, ignore)";
    const candidates = readColorOptionCandidates();
    expect(candidates[0].label).toBe("Bleu (aria)");
  });

  it("falls back to textContent when aria-label is absent", () => {
    makeColorOption(9, "Bleu");
    const candidates = readColorOptionCandidates();
    expect(candidates[0].label).toBe("Bleu");
  });

  it("rejects a filter-grid-option-{id} element with the wrong role (not role=checkbox)", () => {
    makeColorOption(9, "Bleu", { role: "button" });
    expect(readColorOptionCandidates()).toEqual([]);
  });

  it("rejects an invisible filter-grid-option-{id} element", () => {
    makeColorOption(9, "Bleu", { visible: false });
    expect(readColorOptionCandidates()).toEqual([]);
  });

  it("rejects a filter-grid-option-{id}--suffix as an independent option (regression: strict numeric-id-only pattern)", () => {
    const suffix = document.createElement("div");
    suffix.setAttribute("data-testid", "filter-grid-option-9--title");
    suffix.setAttribute("role", "checkbox");
    suffix.setAttribute("aria-checked", "false");
    markVisible(suffix);
    document.body.appendChild(suffix);

    expect(readColorOptionCandidates()).toEqual([]);
  });

  it("regression: no longer reads the old color-{id} pattern at all", () => {
    const oldStyle = document.createElement("div");
    oldStyle.setAttribute("data-testid", "color-9");
    oldStyle.setAttribute("role", "button");
    oldStyle.textContent = "Bleu";
    markVisible(oldStyle);
    document.body.appendChild(oldStyle);

    expect(readColorOptionCandidates()).toEqual([]);
  });

  it("'Bleu' matches only filter-grid-option-9 uniquely (matchOption exact-match-first)", () => {
    makeColorOption(9, "Bleu");
    makeColorOption(26, "Bleu clair");
    makeColorOption(27, "Marine");
    const candidates = readColorOptionCandidates();
    const match = matchOption("Bleu", candidates.map((c) => c.label));
    expect(match).toBe("Bleu");
    const matched = candidates.find((c) => c.label === match);
    expect(matched?.containerTestId).toBe("filter-grid-option-9");
  });

  it("'Bleu' does NOT match 'Bleu clair' when both are real candidates -- exact match on 'Bleu' itself wins, never the longer variant", () => {
    makeColorOption(9, "Bleu");
    makeColorOption(26, "Bleu clair");
    const candidates = readColorOptionCandidates();
    const match = matchOption("Bleu", candidates.map((c) => c.label));
    expect(match).toBe("Bleu");
    expect(match).not.toBe("Bleu clair");
  });

  it("returns no_match (manual) when the requested color is absent from the real options", () => {
    makeColorOption(9, "Bleu");
    makeColorOption(27, "Marine");
    const candidates = readColorOptionCandidates();
    expect(matchOption("Turquoise", candidates.map((c) => c.label))).toBeNull();
  });
});

// Mission "CAUSE COULEUR CONFIRMEE LIVE -- doublon DOM" (2026-08-19) : preuve
// live directe -- pour l'option "Bleu", Vinted retourne DEUX noeuds DOM
// portant EXACTEMENT le meme data-testid ("filter-grid-option-9" x2). C'est
// la MEME option logique dupliquee dans le DOM, pas deux couleurs
// differentes -- readColorOptionCandidates() doit dedupliquer strictement par
// data-testid, jamais par label seul.
describe("readColorOptionCandidates -- deduplication par data-testid (doublon DOM reel)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("deux noeuds DOM filter-grid-option-9 label 'Bleu' => un seul candidat logique", () => {
    makeColorOption(9, "Bleu");
    makeColorOption(9, "Bleu"); // meme testid -- doublon DOM reel, meme option logique
    const candidates = readColorOptionCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].containerTestId).toBe("filter-grid-option-9");
    expect(candidates[0].label).toBe("Bleu");
  });

  it("'Bleu' + 'Bleu clair' (data-testid differents) restent deux candidats distincts -- jamais dedupliques par label", () => {
    makeColorOption(9, "Bleu");
    makeColorOption(26, "Bleu clair");
    const candidates = readColorOptionCandidates();
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.containerTestId).sort()).toEqual(["filter-grid-option-26", "filter-grid-option-9"]);
  });

  it("deux 'Bleu' avec des data-testid REELLEMENT differents restent deux candidats distincts -- comportement ambigu strict inchange, aucun choix arbitraire", () => {
    makeColorOption(9, "Bleu");
    makeColorOption(99, "Bleu"); // testid different -- pas un doublon DOM, deux options logiques distinctes de meme libelle
    const candidates = readColorOptionCandidates();
    expect(candidates).toHaveLength(2);
    expect(matchOption("Bleu", candidates.map((c) => c.label))).toBeNull(); // ambigu, jamais un choix devine
  });

  it("apres deduplication du doublon DOM, matchOption('Bleu', ...) matche bien l'unique candidat filter-grid-option-9", () => {
    makeColorOption(9, "Bleu");
    makeColorOption(9, "Bleu");
    makeColorOption(26, "Bleu clair");
    makeColorOption(27, "Marine");
    const candidates = readColorOptionCandidates();
    expect(candidates).toHaveLength(3); // le doublon "Bleu" fusionne en 1, "Bleu clair" et "Marine" restent distincts
    const match = matchOption("Bleu", candidates.map((c) => c.label));
    expect(match).toBe("Bleu");
    const matched = candidates.find((c) => c.label === match);
    expect(matched?.containerTestId).toBe("filter-grid-option-9");
  });

  it("garde le PREMIER noeud DOM rencontre comme representant du candidat deduplique (ordre document)", () => {
    const first = makeColorOption(9, "Bleu");
    makeColorOption(9, "Bleu");
    const candidates = readColorOptionCandidates();
    expect(candidates[0].container).toBe(first);
  });
});

describe("resolveColorOptionByTestId -- re-resolution explicite avant clic", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("resout un noeud portant le data-testid canonique demande", () => {
    makeColorOption(9, "Bleu");
    const resolved = resolveColorOptionByTestId("filter-grid-option-9");
    expect(resolved).not.toBeNull();
    expect(resolved?.getAttribute("data-testid")).toBe("filter-grid-option-9");
  });

  it("resout l'un des deux noeuds dupliques portant le meme data-testid (equivalents par construction)", () => {
    makeColorOption(9, "Bleu");
    makeColorOption(9, "Bleu");
    const resolved = resolveColorOptionByTestId("filter-grid-option-9");
    expect(resolved?.getAttribute("data-testid")).toBe("filter-grid-option-9");
  });

  it("retourne null quand aucun noeud ne porte ce data-testid", () => {
    makeColorOption(9, "Bleu");
    expect(resolveColorOptionByTestId("filter-grid-option-999")).toBeNull();
  });

  it("clic sur le noeud re-resolu fait passer aria-checked a 'true' -- confirmation toujours via aria-checked, jamais le trigger", () => {
    const el = makeColorOption(9, "Bleu", { ariaChecked: "false" });
    const resolved = resolveColorOptionByTestId("filter-grid-option-9")!;
    // Simule ce que Vinted fait reellement sur un clic reel -- ce test ne
    // dispatche pas de vrai clic (jsdom ne branche pas React), il verifie
    // seulement que isColorCandidateChecked() lit bien l'etat post-clic sur
    // le noeud re-resolu, jamais une reference perimee.
    resolved.setAttribute("aria-checked", "true");
    const [candidate] = readColorOptionCandidates();
    expect(candidate.container).toBe(el);
    expect(isColorCandidateChecked(candidate)).toBe(true);
  });
});

describe("isColorCandidateChecked -- source de verite structurelle (aria-checked, jamais le trigger)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns false for aria-checked='false' (etat avant clic, preuve live)", () => {
    makeColorOption(9, "Bleu", { ariaChecked: "false" });
    const [candidate] = readColorOptionCandidates();
    expect(isColorCandidateChecked(candidate)).toBe(false);
  });

  it("returns true for aria-checked='true' (etat apres clic, preuve live)", () => {
    makeColorOption(9, "Bleu", { ariaChecked: "true" });
    const [candidate] = readColorOptionCandidates();
    expect(isColorCandidateChecked(candidate)).toBe(true);
  });

  it("re-reads the attribute FRESH (never a cached value) -- reflects a mutation on the live container", () => {
    const el = makeColorOption(9, "Bleu", { ariaChecked: "false" });
    const [candidate] = readColorOptionCandidates();
    expect(isColorCandidateChecked(candidate)).toBe(false);
    el.setAttribute("aria-checked", "true");
    expect(isColorCandidateChecked(candidate)).toBe(true);
  });

  it("treats a missing aria-checked attribute as not checked, never a false positive", () => {
    const el = document.createElement("div");
    el.setAttribute("data-testid", "filter-grid-option-9");
    el.setAttribute("role", "checkbox");
    el.textContent = "Bleu";
    markVisible(el);
    document.body.appendChild(el);
    const [candidate] = readColorOptionCandidates();
    expect(isColorCandidateChecked(candidate)).toBe(false);
  });
});
