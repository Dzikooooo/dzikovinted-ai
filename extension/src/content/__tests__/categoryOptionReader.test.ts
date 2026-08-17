import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCategoryResultCells } from "../categoryOptionReader";

// Mission "AUTOMATISATION CATEGORIE" (2026-08-16) : reproduit la structure
// DOM reelle observee en direct pour un resultat de recherche categorie --
// Cell role="button" contenant .web_ui__Cell__title (libelle) et
// .web_ui__Cell__body (breadcrumb). JAMAIS le <li> parent, JAMAIS le radio
// interne (ni l'un ni l'autre ne selectionne quoi que ce soit en direct).
function makeCategoryResultCell(title: string, breadcrumb: string): HTMLElement {
  const li = document.createElement("li");
  const cell = document.createElement("div");
  cell.setAttribute("role", "button");

  const titleEl = document.createElement("div");
  titleEl.className = "web_ui__Cell__title";
  titleEl.textContent = title;

  const bodyEl = document.createElement("div");
  bodyEl.className = "web_ui__Cell__body";
  bodyEl.textContent = breadcrumb;

  // Radio interne reel (jamais l'element a cliquer -- voir en-tete).
  const radio = document.createElement("input");
  radio.type = "radio";

  cell.appendChild(titleEl);
  cell.appendChild(bodyEl);
  cell.appendChild(radio);
  li.appendChild(cell);
  document.body.appendChild(li);
  return cell;
}

describe("readCategoryResultCells", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reads title and breadcrumb from a single result Cell", () => {
    makeCategoryResultCell("Polos", "Hommes > Vêtements > Hauts et t-shirts > Polos");
    const results = readCategoryResultCells(document);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Polos");
    expect(results[0].breadcrumb).toBe("Hommes > Vêtements > Hauts et t-shirts > Polos");
  });

  it("reads multiple same-titled Cells with distinct breadcrumbs, in DOM order, without deduplicating them", () => {
    makeCategoryResultCell("Polos", "Enfants > Garçons (2-8 ans) > Vêtements > Polos");
    makeCategoryResultCell("Polos", "Hommes > Vêtements > Hauts et t-shirts > Polos");
    makeCategoryResultCell("Polos", "Enfants > Filles (2-8 ans) > Vêtements > Polos");
    const results = readCategoryResultCells(document);
    expect(results.map((r) => r.breadcrumb)).toEqual([
      "Enfants > Garçons (2-8 ans) > Vêtements > Polos",
      "Hommes > Vêtements > Hauts et t-shirts > Polos",
      "Enfants > Filles (2-8 ans) > Vêtements > Polos",
    ]);
  });

  it("returns the Cell element itself (not the <li> parent, not the internal radio) for clicking", () => {
    const cell = makeCategoryResultCell("Baskets", "Hommes > Chaussures > Baskets");
    const results = readCategoryResultCells(document);
    expect(results[0].element).toBe(cell);
    expect(results[0].element.tagName).not.toBe("LI");
    expect(results[0].element.tagName).not.toBe("INPUT");
  });

  it("ignores a role=button element with no .web_ui__Cell__title (e.g. a close/back button in the same panel)", () => {
    const closeButton = document.createElement("div");
    closeButton.setAttribute("role", "button");
    closeButton.setAttribute("aria-label", "Fermer");
    document.body.appendChild(closeButton);

    expect(readCategoryResultCells(document)).toEqual([]);
  });

  it("returns an empty breadcrumb string (never null/undefined) when .web_ui__Cell__body is absent", () => {
    const cell = document.createElement("div");
    cell.setAttribute("role", "button");
    const titleEl = document.createElement("div");
    titleEl.className = "web_ui__Cell__title";
    titleEl.textContent = "Polos";
    cell.appendChild(titleEl);
    document.body.appendChild(cell);

    const results = readCategoryResultCells(document);
    expect(results).toHaveLength(1);
    expect(results[0].breadcrumb).toBe("");
  });

  it("returns an empty array when scoped to an unrelated root that does not contain any result Cell", () => {
    const scope = document.createElement("div");
    document.body.appendChild(scope);
    makeCategoryResultCell("Polos", "Hommes > Vêtements > Polos"); // en dehors de `scope`

    expect(readCategoryResultCells(scope)).toEqual([]);
  });

  it("never uses a numeric id-based lookup -- results are read purely by class/role, matching even when ids are absent entirely", () => {
    makeCategoryResultCell("Robes", "Femmes > Vêtements > Robes");
    const results = readCategoryResultCells(document);
    expect(results).toHaveLength(1);
    expect(results[0].element.id).toBe("");
  });
});
