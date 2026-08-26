import type { MarketOpportunity } from './types';

// Puces cles des cartes d'opportunite (2026-08-26). Remplace le pave textuel
// "Pourquoi cette opportunite ?" sur la CARTE -- la modale de detail continue
// d'afficher buildHighlights() en entier, rien n'est perdu.
//
// Difference de nature, pas seulement de longueur : buildHighlights() ecrit
// des phrases ("Bénéfice estimé de +12 €"), utiles quand on lit une seule
// opportunite. Ici on scanne une grille de dizaines de cartes -- ce qui compte
// est le chiffre, pas la phrase autour. D'ou des etiquettes de 2-3 mots.
//
// Aucune donnee nouvelle : tous les champs lus sont deja produits par
// scripts/opportunity-engine et deja affiches ailleurs. Un champ null ne
// produit AUCUNE puce plutot qu'une puce a zero -- une absence de mesure
// n'est pas une mesure a 0.

export interface OpportunityChip {
  /** Cle stable pour React, et point d'ancrage des tests. */
  kind: 'under_market' | 'comparables' | 'resale_days' | 'confidence';
  label: string;
}

// Volontairement bas : au-dela de 3, la puce cesse d'etre scannable et
// redevient le pave qu'on vient de supprimer.
export const MAX_CARD_CHIPS = 3;

export function buildOpportunityChips(item: MarketOpportunity): OpportunityChip[] {
  const chips: OpportunityChip[] = [];

  // Ordre = importance decroissante pour decider d'acheter. L'ecart au
  // marche est le signal le plus direct, la confiance du modele le plus
  // abstrait -- c'est donc elle qui saute en premier quand on tronque.
  const priceFound = Number(item.price_found ?? 0);
  const marketPrice = Number(item.market_price ?? 0);
  if (item.price_found !== null && item.market_price !== null && marketPrice > 0) {
    const pctUnder = Math.round((1 - priceFound / marketPrice) * 100);
    // Un prix AU-DESSUS du marche n'est pas un argument de vente : on se tait
    // plutot que d'afficher "-0 %" ou un pourcentage negatif deguise.
    if (pctUnder > 0) chips.push({ kind: 'under_market', label: `${pctUnder} % sous le marché` });
  }

  if (item.competing_listings_count !== null && item.competing_listings_count > 0) {
    const n = item.competing_listings_count;
    chips.push({ kind: 'comparables', label: `${n} comparable${n > 1 ? 's' : ''}` });
  }

  if (item.resale_days_min !== null && item.resale_days_max !== null) {
    const avg = Math.round((item.resale_days_min + item.resale_days_max) / 2);
    chips.push({ kind: 'resale_days', label: `Revente ~${avg} j` });
  }

  if (item.confidence !== null) {
    chips.push({ kind: 'confidence', label: `Confiance ${Math.round(Number(item.confidence))} %` });
  }

  return chips;
}
