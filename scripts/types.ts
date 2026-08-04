// P0-1 (2026-08-04) : brand a ete retire de ce type. Il contenait le texte
// scrape de [data-testid$="--description-title"], qui n'est PAS un champ
// marque dedie sur Vinted -- c'est parfois le titre libre complet de
// l'annonce ("Stussy zip hoodie, S") quand le vendeur n'a pas associe de
// marque catalogue, d'ou des valeurs polluees dans market_opportunities.brand
// (voir vinted-scan.ts::main -- la marque utilisee desormais est
// watch.brand, deja verifiee par isRelevant() pour chaque item retenu).
export interface ScrapedItem {
  title: string;
  price: number;
  image: string;
  url: string;
  favourites: number;
}
