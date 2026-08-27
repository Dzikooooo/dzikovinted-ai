// Lecture DOM PURE des resultats de recherche CATEGORIE -- extraite pour
// rester testable via jsdom sans mock chrome, meme discipline que
// colorOptionReader.ts/conditionOptionReader.ts/sizeOptionReader.ts.
//
// Les primitives de lecture (resolveClickable, findRowForLabel, ...) vivent
// dans pickerCellReader.ts et sont PARTAGEES avec le picker Marque : c'est la
// duplication picker par picker qui a produit trois pannes successives quand
// Vinted a change son balisage.
//
// Historique des preuves live, a ne pas perdre :
//   2026-08-16 : chaque resultat est une Cell `<div role="button">` portant
//     .web_ui__Cell__title (libelle) et .web_ui__Cell__body (chemin). Un clic
//     sur le <li> parent ou sur le radio interne ne selectionne RIEN.
//   2026-08-26 : `candidates: []` alors que 3 lignes etaient a l'ecran --
//     `[role="button"]` a disparu des Cells.
//   2026-08-27 : lignes trouvees mais `breadcrumbs: ['','','']` --
//     `.web_ui__Cell__body` a disparu a son tour, ET la remontee vers la
//     "ligne" s'arretait sur un wrapper interne ne contenant que le titre.
//
// `root` reste un parametre EXPLICITE et obligatoire : `.web_ui__Cell__*` est
// un motif generique du design system, reutilise par d'autres pickers. Jamais
// de defaut `document`, pour ne jamais lire les resultats d'un AUTRE picker
// ouvert au meme instant.

import {
  collapseWhitespace,
  describePickerContainer,
  findRowForLabel,
  resolveClickable,
  textOf,
  TITLE_SELECTOR,
  type PickerContainerShape,
} from "./pickerCellReader";

export interface CategoryResultCell {
  title: string;
  breadcrumb: string;
  element: HTMLElement;
}

export type CategoryReadStrategy = "cell_role_button" | "cell_title_class" | "radio_row" | "none";

export interface CategoryReadResult {
  cells: CategoryResultCell[];
  strategy: CategoryReadStrategy;
}

// Sous-texte d'une ligne = le CHEMIN ("Hommes > Vêtements > Hauts et
// t-shirts"), seule chose qui departage des homonymes ("Polos" existe sous
// Hommes ET sous Enfants).
//
// Lecture en deux temps :
//   1. quelques selecteurs connus, du plus precis au plus large ;
//   2. a defaut, LE TEXTE DE LA LIGNE MOINS LE TITRE -- qui ne depend d'aucune
//      classe et survit donc a n'importe quel renommage.
//
// La PREMIERE occurrence du titre est retiree, jamais toutes : un chemin peut
// legitimement se terminer par le nom de la feuille ("Hommes > Vêtements >
// Polos"), et l'effacer partout amputerait le chemin de sa fin.
const SUBTITLE_SELECTORS = [
  ".web_ui__Cell__body",
  ".web_ui__Cell__subtitle",
  '[class*="Cell__body"]',
  '[class*="Cell__subtitle"]',
  '[class*="subtitle"]',
];

export function readRowBreadcrumb(row: HTMLElement, title: string): string {
  for (const selector of SUBTITLE_SELECTORS) {
    const candidate = collapseWhitespace(textOf(row.querySelector(selector)));
    // `!== title` : sur certaines variantes le titre lui-meme porte une classe
    // qui matche l'un de ces motifs -- le reprendre comme chemin ne
    // departagerait rien.
    if (candidate && candidate !== title) return candidate;
  }

  const full = collapseWhitespace(textOf(row));
  if (!full) return "";
  const index = full.indexOf(title);
  const withoutTitle = index >= 0 ? full.slice(0, index) + full.slice(index + title.length) : full;
  return collapseWhitespace(withoutTitle);
}

// --- Strategie 1 : le contrat observe en 2026-08-16 ---
function readByCellRoleButton(root: ParentNode): CategoryResultCell[] {
  const results: CategoryResultCell[] = [];
  for (const element of Array.from(root.querySelectorAll<HTMLElement>('[role="button"]'))) {
    const titleEl = element.querySelector<HTMLElement>(TITLE_SELECTOR);
    const title = textOf(titleEl);
    if (!title || !titleEl) continue; // pas une Cell de resultat (ex. bouton fermer/retour)
    // Le chemin peut vivre EN DEHORS du noeud cliquable : on le cherche sur la
    // ligne complete, tout en gardant le role=button comme cible du clic.
    const row = findRowForLabel(titleEl, title);
    results.push({ title, breadcrumb: readRowBreadcrumb(row, title), element });
  }
  return results;
}

// --- Strategie 2 : la classe de titre survit, le role a disparu ---
function readByCellTitleClass(root: ParentNode): CategoryResultCell[] {
  const results: CategoryResultCell[] = [];
  for (const titleEl of Array.from(root.querySelectorAll<HTMLElement>(TITLE_SELECTOR))) {
    const title = textOf(titleEl);
    if (!title) continue;
    const row = findRowForLabel(titleEl, title);
    results.push({ title, breadcrumb: readRowBreadcrumb(row, title), element: resolveClickable(row) });
  }
  return results;
}

// --- Strategie 3 : plus aucune classe reconnue, on s'ancre sur le radio ---
// Un `input[type="radio"]` est un ancrage STRUCTUREL, bien plus stable qu'une
// classe de design system susceptible d'etre hachee au prochain build Vinted.
// On ne CLIQUE pas le radio (preuve live : sans effet), on s'en sert seulement
// pour localiser la ligne, puis on resout le noeud cliquable.
function readByRadioRow(root: ParentNode): CategoryResultCell[] {
  const results: CategoryResultCell[] = [];
  for (const radio of Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]'))) {
    const row = radio.closest<HTMLElement>("li, [class*='Cell'], label") ?? radio.parentElement;
    if (!row) continue;

    const parts = textOf(row)
      .split("\n")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const title = parts[0] ?? "";
    if (!title) continue;

    // Le decoupage par lignes suffit quand le DOM en produit ; sinon (tout le
    // texte sur un seul bloc), readRowBreadcrumb reprend la main.
    const breadcrumb = parts.length > 1 ? collapseWhitespace(parts.slice(1).join(" ")) : readRowBreadcrumb(row, title);
    results.push({ title, breadcrumb, element: resolveClickable(row) });
  }
  return results;
}

export function readCategoryResultCellsDetailed(root: ParentNode): CategoryReadResult {
  const byRoleButton = readByCellRoleButton(root);
  if (byRoleButton.length > 0) return { cells: byRoleButton, strategy: "cell_role_button" };

  const byTitleClass = readByCellTitleClass(root);
  if (byTitleClass.length > 0) return { cells: byTitleClass, strategy: "cell_title_class" };

  const byRadio = readByRadioRow(root);
  if (byRadio.length > 0) return { cells: byRadio, strategy: "radio_row" };

  return { cells: [], strategy: "none" };
}

export function readCategoryResultCells(root: ParentNode): CategoryResultCell[] {
  return readCategoryResultCellsDetailed(root).cells;
}

// Photographie structurelle du conteneur -- delegue au helper partage, pour
// que Categorie et Marque produisent exactement le meme diagnostic.
export type CategoryContainerShape = PickerContainerShape;

export function describeCategoryContainer(root: ParentNode): PickerContainerShape {
  return describePickerContainer(root);
}
