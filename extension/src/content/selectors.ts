// Selecteurs DOM Vinted verifies en direct (navigateur reel, compte reel,
// page /member/<id>) le 2026-07-09 - voir le plan d'implementation pour le
// detail de l'investigation. Vinted peut changer son DOM sans preavis (deja
// arrive pour scripts/vinted-scan.ts) : regrouper les selecteurs ici limite
// la casse a un seul endroit a corriger si ca se reproduit.

// Presents UNIQUEMENT sur son propre profil (vue vendeur), absents sur le
// profil d'un autre utilisateur - le signal le plus fiable pour distinguer
// "je regarde mon propre compte" de "je regarde le profil de quelqu'un
// d'autre". Plus robuste qu'un texte de bouton (independant de la langue).
export const OWN_PROFILE_MARKER_SELECTOR = '[data-testid="closet-seller-filters-active"]';

export const USERNAME_SELECTOR = 'h1[data-testid="profile-username"]';

// L'id Vinted numerique n'est disponible que via l'URL (/member/<id>), pas
// via un attribut DOM dedie.
export function extractVintedUserIdFromUrl(url: string): string | null {
  const match = url.match(/\/member\/(\d+)/);
  return match ? match[1] : null;
}

// Cartes d'annonces sur le profil (onglet "Actifs", affiche par defaut) :
// meme convention data-testid que scripts/vinted-scan.ts (scraping
// anonyme), mais deux differences reelles constatees en direct sur cette
// page precise :
// 1. Le lien annonce n'a PAS de slug dans l'URL ici (juste /items/<id>),
//    contrairement aux resultats de recherche publics - la technique
//    d'extraction du titre par slug ne s'applique pas.
// 2. --description-title / --description-subtitle sont detournes pour
//    afficher les stats vendeur ("3 vues" / "0 favoris") plutot que le
//    titre de l'annonce. Le vrai titre vient de l'attribut `title` du lien
//    overlay, qui contient une chaine composite
//    "<titre>, marque: X, etat: Y, taille: Z, <prix>" - le titre est tout
//    ce qui precede la premiere virgule.
export const LISTING_CARD_ID_PATTERN = /^product-item-id-(\d+)$/;

export interface RawListingCard {
  vintedItemId: string;
  title: string;
  price: number | null;
  imageUrl: string | null;
  vintedUrl: string;
  favourites: number | null;
  views: number | null;
}

function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const normalized = text.replace(/[^\d,]/g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isNaN(value) ? null : value;
}

function parseCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

export function extractListingCards(root: ParentNode): RawListingCard[] {
  const cards = Array.from(root.querySelectorAll("[data-testid]")).filter((el) =>
    LISTING_CARD_ID_PATTERN.test(el.getAttribute("data-testid") ?? "")
  );

  const results: RawListingCard[] = [];
  for (const card of cards) {
    const match = card.getAttribute("data-testid")!.match(LISTING_CARD_ID_PATTERN)!;
    const vintedItemId = match[1];

    const overlayLink = card.querySelector<HTMLAnchorElement>('[data-testid$="--overlay-link"]');
    const priceEl = card.querySelector('[data-testid$="--price-text"]');
    const subtitleEl = card.querySelector('[data-testid$="--description-subtitle"]');
    const descTitleEl = card.querySelector('[data-testid$="--description-title"]');
    const imgEl = card.querySelector<HTMLImageElement>('[data-testid$="--image--img"]');

    const titleAttr = overlayLink?.getAttribute("title") ?? "";
    const title = titleAttr.split(",")[0]?.trim();
    if (!title) continue; // pas assez d'info pour une annonce exploitable

    results.push({
      vintedItemId,
      title,
      price: parsePrice(priceEl?.textContent),
      imageUrl: imgEl?.src ?? null,
      vintedUrl: `https://www.vinted.fr/items/${vintedItemId}`,
      favourites: parseCount(subtitleEl?.textContent),
      views: parseCount(descTitleEl?.textContent),
    });
  }
  return results;
}
