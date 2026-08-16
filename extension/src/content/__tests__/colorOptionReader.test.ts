import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readColorOptionCandidates } from "../colorOptionReader";
import { matchOption } from "../matchOption";

// Mission "FIX LIVE-GROUNDED : TAILLE + COULEUR" (2026-08-13) : preuve live
// directe (dump console reel apres clic synthetique sur
// [data-testid="color-select-dropdown-input"]) -- les vraies options sont
// color-{id} (role=button, textContent propre), tandis qu'une SUGGESTION
// (suggested-color-{id}) porte le MEME texte qu'une option canonique et
// doit etre ignoree, sous peine de transformer un match unique legitime en
// faux doublon. Des sous-elements techniques (color-{id}--prefix/--title/
// --suffix) ne sont pas non plus des options independantes. Ces tests
// reproduisent cette forme DOM reelle -- aucune supposition, uniquement la
// preuve fournie.
//
// jsdom n'implemente pas de layout reel : offsetParent/getClientRects()
// restent toujours "invisibles" par defaut -- meme stub que
// sizeOptionReader.test.ts/conditionOptionReader.test.ts.
function markVisible(el: HTMLElement): void {
  Object.defineProperty(el, "offsetParent", { get: () => document.body, configurable: true });
}

function makeColorOption(id: number, label: string, opts: { role?: string; visible?: boolean } = {}): HTMLElement {
  const { role = "button", visible = true } = opts;
  const el = document.createElement("div");
  el.setAttribute("data-testid", `color-${id}`);
  if (role) el.setAttribute("role", role);
  el.textContent = label;
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

  it("accepts a canonical color-9 container with textContent 'Bleu'", () => {
    makeColorOption(9, "Bleu");
    const candidates = readColorOptionCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].containerTestId).toBe("color-9");
    expect(candidates[0].label).toBe("Bleu");
  });

  it("accepts a canonical color-26 container with textContent 'Bleu clair'", () => {
    makeColorOption(26, "Bleu clair");
    const candidates = readColorOptionCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].label).toBe("Bleu clair");
  });

  it("rejects suggested-color-* even when it carries the SAME label as a real canonical option", () => {
    const suggestion = document.createElement("div");
    suggestion.setAttribute("data-testid", "suggested-color-9");
    suggestion.setAttribute("role", "button");
    suggestion.textContent = "Bleu";
    markVisible(suggestion);
    document.body.appendChild(suggestion);

    makeColorOption(9, "Bleu");

    const candidates = readColorOptionCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].containerTestId).toBe("color-9");
  });

  it("rejects color-{id}--title as an independent option", () => {
    const container = makeColorOption(9, "Bleu");
    const title = document.createElement("div");
    title.setAttribute("data-testid", "color-9--title");
    title.setAttribute("role", "button");
    title.textContent = "Bleu";
    markVisible(title);
    container.appendChild(title);

    const testIds = readColorOptionCandidates().map((c) => c.containerTestId);
    expect(testIds).toEqual(["color-9"]);
    expect(testIds).not.toContain("color-9--title");
  });

  it("rejects color-{id}--prefix as an independent option", () => {
    const prefix = document.createElement("div");
    prefix.setAttribute("data-testid", "color-9--prefix");
    prefix.setAttribute("role", "button");
    markVisible(prefix);
    document.body.appendChild(prefix);

    expect(readColorOptionCandidates()).toEqual([]);
  });

  it("rejects color-{id}--suffix as an independent option", () => {
    const suffix = document.createElement("div");
    suffix.setAttribute("data-testid", "color-9--suffix");
    suffix.setAttribute("role", "button");
    markVisible(suffix);
    document.body.appendChild(suffix);

    expect(readColorOptionCandidates()).toEqual([]);
  });

  it("rejects a color-{id} element with the wrong role (not role=button)", () => {
    makeColorOption(9, "Bleu", { role: "checkbox" });
    expect(readColorOptionCandidates()).toEqual([]);
  });

  it("rejects an invisible color-{id} element", () => {
    makeColorOption(9, "Bleu", { visible: false });
    expect(readColorOptionCandidates()).toEqual([]);
  });

  it("'Bleu' matches only color-9 uniquely (matchOption exact-match-first)", () => {
    makeColorOption(9, "Bleu");
    makeColorOption(26, "Bleu clair");
    makeColorOption(27, "Marine");
    const candidates = readColorOptionCandidates();
    const match = matchOption("Bleu", candidates.map((c) => c.label));
    expect(match).toBe("Bleu");
    const matched = candidates.find((c) => c.label === match);
    expect(matched?.containerTestId).toBe("color-9");
  });

  it("'Bleu' does NOT match 'Bleu clair' when both are real candidates -- exact match on 'Bleu' itself wins, never the longer variant", () => {
    makeColorOption(9, "Bleu");
    makeColorOption(26, "Bleu clair");
    const candidates = readColorOptionCandidates();
    const match = matchOption("Bleu", candidates.map((c) => c.label));
    expect(match).toBe("Bleu");
    expect(match).not.toBe("Bleu clair");
  });

  it("'Marine' matches color-27 uniquely", () => {
    makeColorOption(9, "Bleu");
    makeColorOption(27, "Marine");
    const candidates = readColorOptionCandidates();
    const match = matchOption("Marine", candidates.map((c) => c.label));
    expect(match).toBe("Marine");
  });

  it("returns no_match (manual) when the requested color is absent from the real options", () => {
    makeColorOption(9, "Bleu");
    makeColorOption(27, "Marine");
    const candidates = readColorOptionCandidates();
    expect(matchOption("Turquoise", candidates.map((c) => c.label))).toBeNull();
  });

  it("real live scenario -- two canonical color-{id} containers both exactly 'Bleu' makes matchOption() refuse (ambiguous), never a guess", () => {
    makeColorOption(9, "Bleu");
    makeColorOption(99, "Bleu"); // deuxieme container canonique reel, meme libelle exact
    const candidates = readColorOptionCandidates();
    expect(matchOption("Bleu", candidates.map((c) => c.label))).toBeNull();
  });
});
