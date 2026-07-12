// Taxonomie de catégories partagée entre le filtre d'Opportunités
// (Opportunities.tsx) et le formulaire Watchlist (WatchlistPage.tsx) -
// une seule source pour éviter que les deux dérivent l'une de l'autre.
export const OPPORTUNITY_CATEGORIES = [
  "Sneakers",
  "Jackets",
  "Sweat",
  "Fleece",
  "Jeans",
  "Shoes",
] as const;

export type OpportunityCategory = (typeof OPPORTUNITY_CATEGORIES)[number];
