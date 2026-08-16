import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readSizeOptionCandidates } from "../sizeOptionReader";
import { matchOption } from "../matchOption";

// Mission "FIX LIVE-GROUNDED : TAILLE + COULEUR" (2026-08-13) : preuve live
// directe (dump console reel apres clic synthetique sur
// [data-testid="category-size-single-grid-input"]) -- les vraies options
// sont size-group-{n}-grid-option-{id} (role=checkbox), tandis qu'une
// SUGGESTION (size-suggestions-grid-option-*) porte le MEME texte qu'une
// option canonique et doit etre ignoree, sous peine de transformer un match
// unique legitime en faux doublon. D'autres elements techniques
// (size-banner-*, size-guide-*, category-size-single-grid-chevron-up) ne
// sont pas non plus des options. Ces tests reproduisent cette forme DOM
// reelle -- aucune supposition, uniquement la preuve fournie.
//
// jsdom n'implemente pas de layout reel : offsetParent/getClientRects()
// restent toujours "invisibles" par defaut, meme pour un element attache au
// document -- limitation deja rencontree pour isVisible()
// (attributeDropdownDiagnostics.ts) et conditionOptionReader.test.ts. Stub
// cible sur CET element precis pour simuler l'etat "visible" confirme en
// live, sans affaiblir la garde de production elle-meme.
function markVisible(el: HTMLElement): void {
  Object.defineProperty(el, "offsetParent", { get: () => document.body, configurable: true });
}

function makeSizeOption(groupId: number, optionId: number, label: string, opts: { role?: string; visible?: boolean } = {}): HTMLElement {
  const { role = "checkbox", visible = true } = opts;
  const el = document.createElement("div");
  el.setAttribute("data-testid", `size-group-${groupId}-grid-option-${optionId}`);
  if (role) el.setAttribute("role", role);
  el.setAttribute("aria-label", label);
  el.textContent = label;
  if (visible) markVisible(el);
  document.body.appendChild(el);
  return el;
}

describe("readSizeOptionCandidates", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("accepts a canonical size-group-14-grid-option-209 container", () => {
    makeSizeOption(14, 209, "L");
    const candidates = readSizeOptionCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].containerTestId).toBe("size-group-14-grid-option-209");
    expect(candidates[0].label).toBe("L");
  });

  it("accepts a DIFFERENT group id (size-group-99-grid-option-209) -- proves 14 is not hardcoded", () => {
    makeSizeOption(99, 209, "L");
    const candidates = readSizeOptionCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].containerTestId).toBe("size-group-99-grid-option-209");
  });

  it("rejects size-suggestions-grid-option-* even when it carries the SAME label as a real canonical option", () => {
    const suggestion = document.createElement("div");
    suggestion.setAttribute("data-testid", "size-suggestions-grid-option-209");
    suggestion.setAttribute("role", "checkbox");
    suggestion.setAttribute("aria-label", "L");
    suggestion.textContent = "L";
    markVisible(suggestion);
    document.body.appendChild(suggestion);

    makeSizeOption(14, 209, "L");

    const candidates = readSizeOptionCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].containerTestId).toBe("size-group-14-grid-option-209");
  });

  it("rejects size-banner-* technical elements", () => {
    const banner = document.createElement("div");
    banner.setAttribute("data-testid", "size-banner-info");
    banner.setAttribute("role", "checkbox");
    markVisible(banner);
    document.body.appendChild(banner);

    expect(readSizeOptionCandidates()).toEqual([]);
  });

  it("rejects size-guide-* technical elements", () => {
    const guide = document.createElement("div");
    guide.setAttribute("data-testid", "size-guide-link");
    guide.setAttribute("role", "checkbox");
    markVisible(guide);
    document.body.appendChild(guide);

    expect(readSizeOptionCandidates()).toEqual([]);
  });

  it("rejects category-size-single-grid-chevron-up (not an option)", () => {
    const chevron = document.createElement("div");
    chevron.setAttribute("data-testid", "category-size-single-grid-chevron-up");
    chevron.setAttribute("role", "checkbox");
    markVisible(chevron);
    document.body.appendChild(chevron);

    expect(readSizeOptionCandidates()).toEqual([]);
  });

  it("rejects a size-group-*-grid-option-* element with the wrong role (not role=checkbox)", () => {
    makeSizeOption(14, 999, "L", { role: "button" });
    expect(readSizeOptionCandidates()).toEqual([]);
  });

  it("rejects an invisible size-group-*-grid-option-* element", () => {
    makeSizeOption(14, 998, "L", { visible: false });
    expect(readSizeOptionCandidates()).toEqual([]);
  });

  it("reads the label correctly for multiple real options at once (XS through Taille unique, live evidence shape)", () => {
    makeSizeOption(14, 206, "XS");
    makeSizeOption(14, 207, "S");
    makeSizeOption(14, 208, "M");
    makeSizeOption(14, 209, "L");
    makeSizeOption(14, 210, "XL");
    makeSizeOption(14, 211, "XXL");
    makeSizeOption(14, 213, "Taille unique");

    const labels = readSizeOptionCandidates().map((c) => c.label);
    expect(labels.sort()).toEqual(["L", "M", "S", "Taille unique", "XL", "XS", "XXL"].sort());
  });

  it("real live scenario -- two DIFFERENT canonical size groups both offering 'L' makes matchOption() refuse (ambiguous), never a guess", () => {
    makeSizeOption(14, 209, "L");
    makeSizeOption(20, 500, "L"); // deuxieme groupe canonique reel, meme libelle
    const labels = readSizeOptionCandidates().map((c) => c.label);
    expect(matchOption("L", labels)).toBeNull();
  });

  it("returns an empty array when no size options are present at all", () => {
    document.body.innerHTML = `<div data-testid="unrelated"></div>`;
    expect(readSizeOptionCandidates()).toEqual([]);
  });
});
