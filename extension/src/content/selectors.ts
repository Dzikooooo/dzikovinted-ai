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
