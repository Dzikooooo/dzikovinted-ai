import type { ScrapedItem } from "./types";

// Lecture DOM PURE d'une page de resultats de recherche Vinted -- extraite de
// vinted-scan.ts::extractItemsFromPage() pour etre testable sans Playwright
// (meme discipline que scripts/cardSettle.ts/photoPlan.ts).
//
// ZERO parametre, lit `document` directement : c'est exactement ainsi que
// Playwright execute cette fonction via `page.evaluate(extractItemsFromDocument)`
// -- le code tourne DANS le contexte de la vraie page Vinted, `document` y
// designe la page reelle. En test, jsdom fournit le meme global `document`,
// donc le meme appel sans argument suffit a la tester.
//
// ============================================================================
// BUG REEL corrige le 2026-08-27, confirme par capture d'ecran en direct :
// "Voir sur Vinted" reouvrait ResellOS au lieu de l'annonce.
// ============================================================================
// Cause : `linkEl.getAttribute("href")` rend le texte BRUT de l'attribut tel
// qu'ecrit dans le HTML de Vinted -- un CHEMIN RELATIF ("/items/9797084772-
// arcteryx-...", confirme en interrogeant market_opportunities en
// production), jamais resolu. Stocke tel quel dans market_opportunities.
// vinted_url, puis rendu par le composant React en <a href={vinted_url}>
// (deja verifie correct et deja teste, voir Opportunities.tsx) : un href
// relatif se resout par rapport a l'origine COURANTE de la page qui l'affiche
// -- resellosapp.com, jamais vinted.fr. Le composant React n'avait donc rien
// a se reprocher ; la donnee qu'on lui donnait a lire etait deja fausse.
//
// Correctif : `linkEl.href` (la PROPRIETE, pas l'attribut) -- le getter IDL
// standard d'un <a> resout TOUJOURS une URL absolue contre l'URL du document
// courant (ici, une vraie page vinted.fr pendant le scan), quel que soit le
// format ecrit dans l'attribut source. Coute un cast vers HTMLAnchorElement
// (document.querySelector generique rend Element, sans proprie te .href).
export function extractItemsFromDocument(): ScrapedItem[] {
  const titleEls = document.querySelectorAll('[data-testid$="--description-title"]');
  const results: ScrapedItem[] = [];

  titleEls.forEach((titleEl) => {
    const testid = titleEl.getAttribute("data-testid") || "";
    const prefix = testid.replace(/--description-title$/, "");
    if (!prefix) return;

    const priceEl = document.querySelector(`[data-testid="${prefix}--price-text"]`);
    const linkEl = document.querySelector<HTMLAnchorElement>(`[data-testid="${prefix}--overlay-link"]`);
    const imageEl = document.querySelector(`[data-testid="${prefix}--image--img"]`);
    const container = document.querySelector(`[data-testid="${prefix}"]`);
    const favEl = container?.querySelector('[data-testid="favourite-count-text"]');

    // .href (propriete, URL ABSOLUE resolue par le navigateur) et non
    // .getAttribute("href") (texte brut, potentiellement relatif) -- voir
    // l'en-tete de ce fichier.
    const href = linkEl?.href || "";
    const priceText = priceEl?.textContent || "";
    const price = Number(priceText.replace(/[^\d,]/g, "").replace(",", "."));
    // Fonctionne identiquement sur un chemin relatif ou une URL absolue :
    // cette regex cherche "/items/<id>-<slug>" comme SOUS-CHAINE, sans ancrage
    // au debut ("^"), donc "https://www.vinted.fr/items/123-foo" matche tout
    // autant que "/items/123-foo".
    const slugMatch = href.match(/\/items\/\d+-([^?]+)/);
    const title = slugMatch ? slugMatch[1].replace(/-/g, " ") : "";

    results.push({
      title,
      price,
      image: imageEl?.getAttribute("src") || "",
      url: href,
      favourites: favEl ? parseInt(favEl.textContent || "0", 10) || 0 : 0,
    });
  });

  return results;
}
