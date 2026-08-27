import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  describeCategoryContainer,
  readCategoryResultCells,
  readCategoryResultCellsDetailed,
} from "../categoryOptionReader";

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

// ===========================================================================
// ECHEC LIVE 2026-08-26 : `candidates: []` alors que TROIS lignes etaient
// visibles a l'ecran. La strategie unique d'origine ne decrivait plus le DOM.
// ===========================================================================
// Ces tests couvrent la chaine de repli. Ce qui compte a chaque etage : que
// `element` reste CLIQUABLE (jamais le <li>, jamais le radio -- preuve live
// 2026-08-16), et que la strategie utilisee soit annoncee.

describe("chaine de repli du lecteur", () => {
  it("prefere la strategie d'origine quand le DOM documente est present", () => {
    const root = document.createElement("ul");
    root.appendChild(makeCategoryResultCell("Polos", "Hommes > Vêtements"));
    expect(readCategoryResultCellsDetailed(root).strategy).toBe("cell_role_button");
  });

  it("retrouve les lignes quand role=button a disparu mais que la classe de titre reste", () => {
    // Cas d'un <button> natif a la place de role="button".
    const root = document.createElement("ul");
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "web_ui__Cell__cell";
    const title = document.createElement("div");
    title.className = "web_ui__Cell__title";
    title.textContent = "Polos";
    const body = document.createElement("div");
    body.className = "web_ui__Cell__body";
    body.textContent = "Hommes > Vêtements";
    btn.append(title, body);
    li.appendChild(btn);
    root.appendChild(li);

    const read = readCategoryResultCellsDetailed(root);
    expect(read.strategy).toBe("cell_title_class");
    expect(read.cells).toHaveLength(1);
    expect(read.cells[0].title).toBe("Polos");
    expect(read.cells[0].breadcrumb).toBe("Hommes > Vêtements");
    // Le noeud rendu doit etre cliquable, pas le <li>.
    expect(read.cells[0].element.tagName).toBe("BUTTON");
  });

  it("s'ancre sur le radio quand plus aucune classe n'est reconnue", () => {
    // Le radio est un ancrage STRUCTUREL : il survit a un renommage de classes.
    const root = document.createElement("ul");
    const li = document.createElement("li");
    const clickable = document.createElement("div");
    clickable.setAttribute("role", "button");
    const radio = document.createElement("input");
    radio.type = "radio";
    clickable.appendChild(radio);
    // Deux lignes de texte separees par un vrai saut de ligne : c'est ainsi
    // que la ligne se presente quand plus aucune classe n'est exploitable.
    clickable.appendChild(document.createTextNode(["Polos", "Hommes > Vêtements"].join("\n")));
    li.appendChild(clickable);
    root.appendChild(li);

    const read = readCategoryResultCellsDetailed(root);
    expect(read.strategy).toBe("radio_row");
    expect(read.cells[0].title).toBe("Polos");
    // On NE clique PAS le radio (sans effet en direct) : on remonte au noeud
    // porteur du handler.
    expect(read.cells[0].element).toBe(clickable);
  });

  it("rend 'none' et zero cellule sur un conteneur vide", () => {
    const read = readCategoryResultCellsDetailed(document.createElement("ul"));
    expect(read.strategy).toBe("none");
    expect(read.cells).toEqual([]);
  });

  it("garde l'API historique intacte pour les appelants existants", () => {
    const root = document.createElement("ul");
    root.appendChild(makeCategoryResultCell("Polos", "Hommes > Vêtements"));
    expect(readCategoryResultCells(root).map((c) => c.title)).toEqual(["Polos"]);
  });
});

describe("photographie du conteneur (diagnostic)", () => {
  it("compte ce qui permettra d'ecrire le bon selecteur", () => {
    const root = document.createElement("div");
    const li = document.createElement("li");
    const radio = document.createElement("input");
    radio.type = "radio";
    const inner = document.createElement("div");
    inner.className = "some_new_hashed_class";
    inner.setAttribute("data-testid", "catalog-row");
    inner.textContent = "Polos";
    li.append(radio, inner);
    root.appendChild(li);

    const shape = describeCategoryContainer(root);
    expect(shape.liCount).toBe(1);
    expect(shape.radioCount).toBe(1);
    expect(shape.sampleClasses).toContain("some_new_hashed_class");
    expect(shape.sampleTestIds).toContain("catalog-row");
    expect(shape.textPreview).toContain("Polos");
  });

  it("ne leve pas sur un conteneur vide", () => {
    expect(() => describeCategoryContainer(document.createElement("div"))).not.toThrow();
  });
});

// ===========================================================================
// ECHEC LIVE 2026-08-27 : les 3 lignes etaient trouvees, mais
// titleMatchBreadcrumbs valait ['', '', ''] -- .web_ui__Cell__body n'existe
// plus. Sans chemin, trois "Polos" homonymes sont indepartageables.
// ===========================================================================
describe("lecture du chemin quand la classe du sous-texte a disparu", () => {
  function cellWithoutBodyClass(title: string, breadcrumb: string): HTMLElement {
    const li = document.createElement("li");
    const cell = document.createElement("div");
    cell.setAttribute("role", "button");
    const titleEl = document.createElement("div");
    titleEl.className = "web_ui__Cell__title";
    titleEl.textContent = title;
    // Le sous-texte existe toujours a l'ecran, mais plus sous une classe connue.
    const bodyEl = document.createElement("div");
    bodyEl.className = "u-color-grey-dark";
    bodyEl.textContent = breadcrumb;
    cell.append(titleEl, bodyEl);
    li.appendChild(cell);
    return li;
  }

  it("recupere le chemin en retirant le titre du texte de la ligne", () => {
    const root = document.createElement("ul");
    root.appendChild(cellWithoutBodyClass("Polos", "Hommes > Vêtements > Hauts et t-shirts"));

    const cells = readCategoryResultCells(root);
    expect(cells).toHaveLength(1);
    expect(cells[0].breadcrumb).toBe("Hommes > Vêtements > Hauts et t-shirts");
  });

  it("rend les trois chemins du cas live, ce qui suffit a departager", () => {
    const root = document.createElement("ul");
    root.appendChild(cellWithoutBodyClass("Polos", "Enfants > Garçons"));
    root.appendChild(cellWithoutBodyClass("Polos", "Hommes > Vêtements"));
    root.appendChild(cellWithoutBodyClass("Polos", "Enfants > Filles"));

    expect(readCategoryResultCells(root).map((c) => c.breadcrumb)).toEqual([
      "Enfants > Garçons",
      "Hommes > Vêtements",
      "Enfants > Filles",
    ]);
  });

  it("n'ampute pas un chemin qui reprend le nom de la feuille", () => {
    // Seule la PREMIERE occurrence du titre est retiree : celle du titre
    // lui-meme. "Polos" en fin de chemin doit survivre.
    const root = document.createElement("ul");
    root.appendChild(cellWithoutBodyClass("Polos", "Hommes > Vêtements > Polos"));
    expect(readCategoryResultCells(root)[0].breadcrumb).toBe("Hommes > Vêtements > Polos");
  });

  it("prefere toujours une classe connue quand elle existe", () => {
    const root = document.createElement("ul");
    root.appendChild(makeCategoryResultCell("Polos", "Hommes > Vêtements"));
    expect(readCategoryResultCells(root)[0].breadcrumb).toBe("Hommes > Vêtements");
  });

  it("rend une chaine vide, jamais le titre, quand la ligne n'a pas de sous-texte", () => {
    const root = document.createElement("ul");
    const li = document.createElement("li");
    const cell = document.createElement("div");
    cell.setAttribute("role", "button");
    const titleEl = document.createElement("div");
    titleEl.className = "web_ui__Cell__title";
    titleEl.textContent = "Polos";
    cell.appendChild(titleEl);
    li.appendChild(cell);
    root.appendChild(li);

    expect(readCategoryResultCells(root)[0].breadcrumb).toBe("");
  });
});

// ===========================================================================
// ECHEC LIVE 2026-08-27, 2e trace : strategy "cell_title_class",
// titles ['Polos','Polos','Polos'], breadcrumbs ['','',''].
// ===========================================================================
// La classe du titre existait toujours -- c'est la LIGNE qui etait mal
// identifiee. Le design system empile plusieurs wrappers dont la classe
// contient "Cell" ; closest() s'arretait au premier, qui ne contient QUE le
// titre.
describe("ligne imbriquee : plusieurs wrappers 'Cell' entre le titre et le chemin", () => {
  function nestedRow(title: string, breadcrumb: string): HTMLElement {
    const li = document.createElement("li");
    const cell = document.createElement("div");
    cell.className = "web_ui__Cell__cell";

    const content = document.createElement("div");
    content.className = "web_ui__Cell__content";

    // Wrapper intermediaire qui ne contient QUE le titre : c'est lui que
    // l'ancienne remontee attrapait.
    const heading = document.createElement("div");
    heading.className = "web_ui__Cell__heading";
    const titleEl = document.createElement("div");
    titleEl.className = "web_ui__Cell__title";
    titleEl.textContent = title;
    heading.appendChild(titleEl);

    // Le chemin, sans classe reconnaissable, en dehors du wrapper du titre.
    const path = document.createElement("div");
    path.className = "u-color-grey";
    path.textContent = breadcrumb;

    content.append(heading, path);
    cell.appendChild(content);
    li.appendChild(cell);
    return li;
  }

  it("remonte jusqu'a la ligne qui porte reellement le chemin", () => {
    const root = document.createElement("ul");
    root.appendChild(nestedRow("Polos", "Hommes > Vêtements"));

    const cells = readCategoryResultCells(root);
    expect(cells).toHaveLength(1);
    expect(cells[0].breadcrumb).toBe("Hommes > Vêtements");
  });

  it("rend les trois chemins du cas live", () => {
    const root = document.createElement("ul");
    root.appendChild(nestedRow("Polos", "Enfants > Garçons"));
    root.appendChild(nestedRow("Polos", "Hommes > Vêtements"));
    root.appendChild(nestedRow("Polos", "Enfants > Filles"));

    expect(readCategoryResultCells(root).map((c) => c.breadcrumb)).toEqual([
      "Enfants > Garçons",
      "Hommes > Vêtements",
      "Enfants > Filles",
    ]);
  });

  it("ne remonte JAMAIS jusqu'a la liste : le chemin ne doit pas absorber les autres lignes", () => {
    // Garde-fou essentiel. Sans lui, la remontee continuerait jusqu'au <ul> et
    // le "chemin" de chaque ligne contiendrait le texte des deux autres.
    const root = document.createElement("ul");
    root.appendChild(nestedRow("Polos", "Enfants > Garçons"));
    root.appendChild(nestedRow("Polos", "Hommes > Vêtements"));

    for (const cell of readCategoryResultCells(root)) {
      expect(cell.breadcrumb).not.toContain("Enfants > Garçons Hommes");
      expect(cell.breadcrumb.split(">").length).toBeLessThanOrEqual(3);
    }
  });

  it("rend un chemin vide quand la ligne n'en porte reellement aucun", () => {
    const root = document.createElement("ul");
    const li = document.createElement("li");
    const cell = document.createElement("div");
    cell.className = "web_ui__Cell__cell";
    const titleEl = document.createElement("div");
    titleEl.className = "web_ui__Cell__title";
    titleEl.textContent = "Polos";
    cell.appendChild(titleEl);
    li.appendChild(cell);
    root.appendChild(li);

    expect(readCategoryResultCells(root)[0].breadcrumb).toBe("");
  });
});
