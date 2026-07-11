export interface ScrapedItem {
  title: string;
  brand: string;
  price: number;
  image: string;
  url: string;
  favourites: number;
}

// priority reprend watchlist.priority (1-3, colonne existante mais jamais
// consommée avant le moteur d'opportunités - voir scripts/opportunity-engine).
export interface WatchlistItem extends ScrapedItem {
  category: string;
  priority: number;
}
