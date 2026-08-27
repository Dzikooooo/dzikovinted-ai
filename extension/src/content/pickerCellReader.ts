// Primitives de lecture des pickers Vinted (Categorie, Marque, ...), extraites
// de categoryOptionReader.ts le 2026-08-27.
//
// POURQUOI CE MODULE EXISTE. Tous ces panneaux sont batis sur les MEMES
// composants Cell du design system "core" de Vinted, mais chaque picker avait
// son propre selecteur en dur. Quand Vinted a change son balisage, ils ont
// donc casse un par un, chacun demandant son propre diagnostic live :
//
//   2026-08-27, Categorie : `[role="button"]` a disparu des Cells, puis
//     `.web_ui__Cell__body` (le chemin) a disparu a son tour.
//   2026-08-27, Marque : meme cause exactement -- son selecteur etait
//     `[role="button"][aria-label]`, donc zero resultat lu, champ saute.
//
// La lecon n'est pas "corriger ce selecteur" mais "ne plus dependre d'UN
// selecteur". Chaque fonction ici essaie plusieurs ancrages, du plus precis au
// plus structurel, et annonce lequel a repondu.

export const TITLE_SELECTOR = ".web_ui__Cell__title";

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function textOf(el: Element | null | undefined): string {
  return el?.textContent?.trim() ?? "";
}

// Resout le noeud reellement CLIQUABLE d'une ligne. Un <li>, un <label> ou un
// radio ne declenchent rien sur ces composants (preuve live 2026-08-16) : le
// handler vit sur la Cell.
//
// Cherche DANS la ligne avant de chercher AU-DESSUS : quand la ligne a ete
// localisee par son <li> ou son radio, la Cell cliquable est un DESCENDANT.
// Ne chercher qu'en remontant rendait le <li> lui-meme, dont le clic est sans
// effet.
export function resolveClickable(el: HTMLElement): HTMLElement {
  const CLICKABLE = '[role="button"], button';
  if (el.matches(CLICKABLE)) return el;
  const inside = el.querySelector<HTMLElement>(CLICKABLE);
  if (inside) return inside;
  return el.closest<HTMLElement>(CLICKABLE) ?? el;
}

// Remonte d'un libelle jusqu'a la LIGNE COMPLETE : le plus petit ancetre qui
// contient du texte EN PLUS du libelle.
//
// Critere volontairement independant de tout nom de classe. `closest(
// '[class*="Cell"]')` semblait naturel mais s'arretait au PREMIER wrapper --
// or le design system en empile plusieurs (…__cell > …__content > …__heading >
// …__title), et le plus interne ne contient que le libelle.
//
// Deux garde-fous a la montee :
//   - arret des qu'un ancetre englobe PLUSIEURS libelles : on serait arrive a
//     la liste, et le "reste" deviendrait le texte des autres lignes ;
//   - jamais au-dela de <body>/<html>.
export function findRowForLabel(labelEl: HTMLElement, label: string, labelSelector = TITLE_SELECTOR): HTMLElement {
  let node: HTMLElement | null = labelEl.parentElement;
  let deepest: HTMLElement = labelEl;

  while (node && node.tagName !== "BODY" && node.tagName !== "HTML") {
    if (node.querySelectorAll(labelSelector).length > 1) break;
    if (collapseWhitespace(node.textContent ?? "").length > label.length) return node;
    deepest = node;
    node = node.parentElement;
  }

  return deepest;
}

// Photographie STRUCTURELLE d'un conteneur de picker, purement
// observationnelle. Emise uniquement quand toutes les strategies rendent zero
// resultat : c'est ce qui permet d'ecrire le bon selecteur au coup suivant, au
// lieu d'en essayer un de plus a l'aveugle.
export interface PickerContainerShape {
  childCount: number;
  roleButtonCount: number;
  buttonCount: number;
  liCount: number;
  radioCount: number;
  cellClassCount: number;
  ariaLabelCount: number;
  /** Classes reellement presentes, dedupliquees -- revele un renommage de design system. */
  sampleClasses: string[];
  sampleTestIds: string[];
  sampleAriaLabels: string[];
  /** Debut du texte visible : confirme que le conteneur inspecte est bien celui affiche. */
  textPreview: string;
}

export function describePickerContainer(root: ParentNode): PickerContainerShape {
  const all = Array.from(root.querySelectorAll<HTMLElement>("*"));
  const classes = new Set<string>();
  const testIds = new Set<string>();
  const ariaLabels = new Set<string>();

  for (const el of all.slice(0, 200)) {
    for (const cls of Array.from(el.classList)) classes.add(cls);
    const testId = el.getAttribute("data-testid");
    if (testId) testIds.add(testId);
    const aria = el.getAttribute("aria-label");
    if (aria) ariaLabels.add(aria);
  }

  const rootEl = root as ParentNode & { textContent?: string | null };
  return {
    childCount: all.length,
    roleButtonCount: root.querySelectorAll('[role="button"]').length,
    buttonCount: root.querySelectorAll("button").length,
    liCount: root.querySelectorAll("li").length,
    radioCount: root.querySelectorAll('input[type="radio"]').length,
    cellClassCount: root.querySelectorAll('[class*="Cell"]').length,
    ariaLabelCount: root.querySelectorAll("[aria-label]").length,
    sampleClasses: Array.from(classes).slice(0, 40),
    sampleTestIds: Array.from(testIds).slice(0, 20),
    sampleAriaLabels: Array.from(ariaLabels).slice(0, 20),
    textPreview: (rootEl.textContent ?? "").trim().slice(0, 300),
  };
}

// ---------------------------------------------------------------------------
// Lecture des options d'un picker A LIBELLE SIMPLE (Marque, et tout picker du
// meme genre) -- par opposition a la Categorie, qui porte en plus un chemin.
// ---------------------------------------------------------------------------
export interface LabeledOptionCell {
  label: string;
  element: HTMLElement;
}

export type LabeledOptionStrategy = "aria_label_role_button" | "aria_label_any" | "cell_title" | "none";

export interface LabeledOptionReadResult {
  options: LabeledOptionCell[];
  strategy: LabeledOptionStrategy;
}

// Ecarte les commandes du panneau qui portent un aria-label sans etre des
// resultats (fermer, retour, effacer la recherche...). On ne peut pas les
// reconnaitre par leur classe -- c'est precisement ce qui casse -- mais un
// resultat de marque a toujours un libelle non vide ET n'est pas un champ de
// saisie.
function isPlausibleOptionElement(el: HTMLElement): boolean {
  const tag = el.tagName;
  return tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT" && tag !== "FORM";
}

export function readLabeledOptionCellsDetailed(root: ParentNode): LabeledOptionReadResult {
  // 1. Le contrat documente jusqu'ici.
  const byRoleButton: LabeledOptionCell[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[role="button"][aria-label]'))) {
    const label = (el.getAttribute("aria-label") ?? "").trim();
    if (label && isPlausibleOptionElement(el)) byRoleButton.push({ label, element: el });
  }
  if (byRoleButton.length > 0) return { options: byRoleButton, strategy: "aria_label_role_button" };

  // 2. L'aria-label survit, le role a disparu -- exactement ce qui vient
  //    d'arriver a la Categorie.
  const byAria: LabeledOptionCell[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[aria-label]"))) {
    const label = (el.getAttribute("aria-label") ?? "").trim();
    if (!label || !isPlausibleOptionElement(el)) continue;
    // Un aria-label porte par un ancetre englobant plusieurs lignes n'est pas
    // une option : c'est le panneau lui-meme.
    if (el.querySelectorAll("[aria-label]").length > 0) continue;
    byAria.push({ label, element: resolveClickable(el) });
  }
  if (byAria.length > 0) return { options: byAria, strategy: "aria_label_any" };

  // 3. Plus aucun aria-label : on lit le titre de Cell, comme la Categorie.
  const byTitle: LabeledOptionCell[] = [];
  for (const titleEl of Array.from(root.querySelectorAll<HTMLElement>(TITLE_SELECTOR))) {
    const label = textOf(titleEl);
    if (!label) continue;
    byTitle.push({ label, element: resolveClickable(findRowForLabel(titleEl, label)) });
  }
  if (byTitle.length > 0) return { options: byTitle, strategy: "cell_title" };

  return { options: [], strategy: "none" };
}

export function readLabeledOptionCells(root: ParentNode): LabeledOptionCell[] {
  return readLabeledOptionCellsDetailed(root).options;
}
