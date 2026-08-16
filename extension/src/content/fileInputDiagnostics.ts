// Extrait de vinted-publish.ts (mission "diagnostic final PHOTOS +
// CATEGORIE", 2026-08-11) pour rester testable en isolation, meme discipline
// que photoReconstruction.ts/publishFieldSummary.ts -- vinted-publish.ts
// porte des effets de bord au niveau du module (chrome.runtime.onMessage.
// addListener execute des l'import), qui empechent de l'importer tel quel
// dans un test unitaire sans mock global de `chrome`. Cette fonction ne
// depend que de `document` (jsdom-compatible), jamais de `chrome`.
//
// Diagnostic UNIQUEMENT (aucune ecriture) : scanne tous les <input
// type="file"> reellement presents dans le DOM au moment ou
// ADD_PHOTOS_INPUT_SELECTOR (date du 2026-07-10) ne matche plus rien --
// permet de confirmer si ce selecteur precis est devenu perime (Vinted a
// change son data-testid) sans avoir a rouvrir les DevTools manuellement.
// Volontairement borne (10 entrees max, outerHTML tronque) pour ne pas
// noyer le ring buffer de logger.ts (MAX_ENTRIES=400, deja documente comme
// fragile).
export function describeAvailableFileInputs(root: Document | Element = document): Record<string, unknown>[] {
  const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  return inputs.slice(0, 10).map((el) => ({
    type: el.type,
    dataTestId: el.getAttribute("data-testid"),
    accept: el.accept,
    multiple: el.multiple,
    id: el.id,
    name: el.name,
    outerHTML: el.outerHTML.slice(0, 300),
  }));
}
