// Lecture DOM PURE des resultats de recherche categorie -- extraite pour
// rester testable via jsdom sans mock chrome, meme discipline que
// colorOptionReader.ts/conditionOptionReader.ts/sizeOptionReader.ts.
//
// Mission "AUTOMATISATION CATEGORIE" (2026-08-16), preuve live directe :
// chaque resultat filtre est une Cell `<div role="button">` (JAMAIS le <li>
// parent, JAMAIS le radio interne -- un clic sur l'un ou l'autre ne
// selectionne rien, confirme en direct) portant deux descendants distincts :
// .web_ui__Cell__title (le libelle court, ex. "Polos") et
// .web_ui__Cell__body (le chemin complet, ex. "Hommes > Vêtements > Hauts et
// t-shirts"). Contrairement a colorOptionReader.ts (data-testid suffisamment
// specifique pour interroger `document` globalement), ces classes
// .web_ui__Cell__* sont un motif de design system generique probablement
// reutilise ailleurs sur la page (Marque utilise deja des Cells similaires) --
// `root` est donc un parametre EXPLICITE et obligatoire, jamais un defaut
// `document`, pour ne jamais risquer de lire les resultats d'un AUTRE picker
// ouvert au meme instant.

export interface CategoryResultCell {
  title: string;
  breadcrumb: string;
  element: HTMLElement;
}

export function readCategoryResultCells(root: ParentNode): CategoryResultCell[] {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('[role="button"]'));
  const results: CategoryResultCell[] = [];

  for (const element of candidates) {
    const titleEl = element.querySelector<HTMLElement>(".web_ui__Cell__title");
    const title = titleEl?.textContent?.trim();
    if (!title) continue; // pas une Cell de resultat categorie (ex. bouton fermer/retour du panneau)

    const bodyEl = element.querySelector<HTMLElement>(".web_ui__Cell__body");
    results.push({ title, breadcrumb: bodyEl?.textContent?.trim() ?? "", element });
  }

  return results;
}
