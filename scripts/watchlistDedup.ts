// Déduplication de la watchlist au moment du scan (phase produit,
// watchlist personnelle - 2026-07-12). watchlist n'est plus une liste
// globale unique : plusieurs utilisateurs peuvent chacun suivre la même
// paire marque/modèle. La recherche Vinted elle-même ne dépend que de
// brand+model (voir scanSearch dans vinted-scan.ts) - il ne faut donc
// jamais lancer deux fois la même recherche.
//
// Pour chaque groupe (brand, model) : min_profit/min_roi prennent le
// minimum du groupe (le seuil le plus permissif l'emporte - aucune
// opportunité n'est perdue pour l'utilisateur qui voulait voir plus
// large), priority prend le maximum (le signal de score utilise
// l'enthousiasme le plus fort). category/id proviennent de la première
// ligne du groupe : category ne varie normalement pas pour une même paire
// marque/modèle, et id ne sert qu'au champ de traçabilité
// market_price_observations.watchlist_id, jamais relu ailleurs.
export interface WatchlistRow {
  id: string;
  brand: string;
  model: string;
  category: string;
  priority: number;
  min_profit: number;
  min_roi: number;
}

export function dedupeWatchlist(rows: WatchlistRow[]): WatchlistRow[] {
  const groups = new Map<string, WatchlistRow[]>();

  for (const row of rows) {
    const key = `${row.brand}::${row.model}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  return Array.from(groups.values()).map((group) => {
    const [first] = group;
    return {
      id: first.id,
      brand: first.brand,
      model: first.model,
      category: first.category,
      priority: Math.max(...group.map((r) => r.priority)),
      min_profit: Math.min(...group.map((r) => r.min_profit)),
      min_roi: Math.min(...group.map((r) => r.min_roi)),
    };
  });
}
