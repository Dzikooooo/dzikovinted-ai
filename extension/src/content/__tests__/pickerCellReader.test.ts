import { describe, expect, it } from "vitest";
import {
  describePickerContainer,
  findRowForLabel,
  readLabeledOptionCells,
  readLabeledOptionCellsDetailed,
  resolveClickable,
} from "../pickerCellReader";

// pickerCellReader.ts factorise les primitives que categoryOptionReader.ts
// avait developpees le 2026-08-26/27 pour survivre a deux changements de
// balisage Vinted successifs. Ce fichier couvre l'usage MARQUE, qui a subi
// exactement la meme panne le 2026-08-27 : `[role="button"][aria-label]`
// (BRAND_RESULT_CELL_SELECTOR) ne matchait plus rien, le champ etait
// silencieusement saute (optionsCount:0).

function brandCellRoleButtonAriaLabel(label: string): HTMLElement {
  const li = document.createElement("li");
  const cell = document.createElement("div");
  cell.setAttribute("role", "button");
  cell.setAttribute("aria-label", label);
  const radio = document.createElement("input");
  radio.type = "radio";
  cell.appendChild(radio);
  li.appendChild(cell);
  return li;
}

describe("readLabeledOptionCells -- contrat d'origine (role=button + aria-label)", () => {
  it("lit le libelle depuis aria-label", () => {
    const root = document.createElement("ul");
    root.appendChild(brandCellRoleButtonAriaLabel("Ralph Lauren"));
    root.appendChild(brandCellRoleButtonAriaLabel("Polo Ralph Lauren"));

    const read = readLabeledOptionCellsDetailed(root);
    expect(read.strategy).toBe("aria_label_role_button");
    expect(read.options.map((o) => o.label)).toEqual(["Ralph Lauren", "Polo Ralph Lauren"]);
  });

  it("cible le role=button pour le clic, jamais le <li> ni le radio", () => {
    const root = document.createElement("ul");
    const cell = brandCellRoleButtonAriaLabel("Ralph Lauren").firstElementChild as HTMLElement;
    root.appendChild(cell.parentElement!);

    const [option] = readLabeledOptionCells(root);
    expect(option.element).toBe(cell);
    expect(option.element.tagName).not.toBe("LI");
    expect(option.element.tagName).not.toBe("INPUT");
  });
});

describe("readLabeledOptionCells -- ECHEC LIVE 2026-08-27 : role=button disparu", () => {
  it("retrouve le libelle via aria-label seul quand le role a disparu", () => {
    const root = document.createElement("ul");
    const li = document.createElement("li");
    const cell = document.createElement("div");
    // Plus de role="button" -- exactement le symptome constate en direct :
    // champ Marque saute, "Sélectionne une marque" jamais rempli.
    cell.setAttribute("aria-label", "Ralph Lauren");
    li.appendChild(cell);
    root.appendChild(li);

    const read = readLabeledOptionCellsDetailed(root);
    expect(read.strategy).toBe("aria_label_any");
    expect(read.options[0].label).toBe("Ralph Lauren");
  });

  it("ignore un aria-label porte par un ancetre englobant plusieurs options (le panneau lui-meme)", () => {
    const root = document.createElement("div");
    root.setAttribute("aria-label", "Résultats de recherche marque");
    const row = document.createElement("div");
    row.setAttribute("aria-label", "Ralph Lauren");
    root.appendChild(row);

    const read = readLabeledOptionCellsDetailed(root);
    expect(read.options.map((o) => o.label)).toEqual(["Ralph Lauren"]);
  });

  it("n'accepte pas le champ de recherche lui-meme comme option", () => {
    const root = document.createElement("div");
    const input = document.createElement("input");
    input.setAttribute("aria-label", "Rechercher une marque");
    root.appendChild(input);

    expect(readLabeledOptionCells(root)).toEqual([]);
  });
});

describe("readLabeledOptionCells -- repli ultime : titre de Cell", () => {
  it("lit le titre quand plus aucun aria-label n'est present", () => {
    const root = document.createElement("ul");
    const li = document.createElement("li");
    const cell = document.createElement("div");
    cell.className = "web_ui__Cell__cell";
    const title = document.createElement("div");
    title.className = "web_ui__Cell__title";
    title.textContent = "Ralph Lauren";
    cell.appendChild(title);
    li.appendChild(cell);
    root.appendChild(li);

    const read = readLabeledOptionCellsDetailed(root);
    expect(read.strategy).toBe("cell_title");
    expect(read.options[0].label).toBe("Ralph Lauren");
  });

  it("rend 'none' et un tableau vide sur un conteneur qui n'a plus rien de reconnaissable", () => {
    const read = readLabeledOptionCellsDetailed(document.createElement("div"));
    expect(read.strategy).toBe("none");
    expect(read.options).toEqual([]);
  });
});

describe("primitives partagees (deja couvertes indirectement par categoryOptionReader.test.ts)", () => {
  it("resolveClickable prefere un role=button DESCENDANT a un ancetre", () => {
    const li = document.createElement("li");
    const cell = document.createElement("div");
    cell.setAttribute("role", "button");
    li.appendChild(cell);
    expect(resolveClickable(li)).toBe(cell);
  });

  it("findRowForLabel s'arrete des qu'un ancetre contient plusieurs libelles", () => {
    const list = document.createElement("ul");
    const rowA = document.createElement("li");
    const titleA = document.createElement("div");
    titleA.className = "web_ui__Cell__title";
    titleA.textContent = "Ralph Lauren";
    rowA.appendChild(titleA);
    const rowB = document.createElement("li");
    const titleB = document.createElement("div");
    titleB.className = "web_ui__Cell__title";
    titleB.textContent = "Lauren";
    rowB.appendChild(titleB);
    list.append(rowA, rowB);

    expect(findRowForLabel(titleA, "Ralph Lauren")).toBe(rowA);
  });

  it("describePickerContainer photographie sans lever sur un conteneur vide", () => {
    expect(() => describePickerContainer(document.createElement("div"))).not.toThrow();
  });
});
