// Calcul des offres proposees a la relance favoris (2026-08-26).
//
// Fonctions PURES, aucun effet de bord : ResellOS calcule et suggere, la
// decision et l'envoi restent chez le vendeur (voir l'engagement affiche sur
// la landing et en bas de la page Communication).
//
// EUROS ENTIERS, jamais de centimes. La convention monetaire de toute
// l'application est "123 €" sans decimale (voir src/lib/currency.ts,
// formatEUR) : calculer 22,49 pour l'afficher "22 €" ferait diverger le prix
// CALCULE du prix AFFICHE, donc de celui que le vendeur ira taper sur Vinted.
//
// Consequence assumee : sur de petits montants, l'arrondi rend le pourcentage
// approximatif (25 € -10 % donne 23 €, soit -8 % en realite). C'est pourquoi
// chaque bouton affiche le PRIX obtenu a cote du libelle -- c'est le prix qui
// engage le vendeur, pas le pourcentage.
function roundEuro(value: number): number {
  return Math.round(value);
}

export type OfferKind = 'minus5' | 'minus10' | 'round';

export interface OfferSuggestion {
  kind: OfferKind;
  label: string;
  price: number;
}

// "Prix rond" = l'euro inferieur le plus proche, un cran en dessous du prix
// affiche. Deux cas volontairement ecartes :
//   - si le prix est deja rond, on descend d'un euro (sinon le bouton
//     proposerait exactement le prix actuel, donc aucune offre) ;
//   - le resultat n'est jamais < 1 € : proposer 0 € n'a pas de sens, et
//     Vinted refuse de toute facon.
export function roundedOffer(price: number): number {
  const floored = Math.floor(price);
  const candidate = floored === price ? floored - 1 : floored;
  return Math.max(1, candidate);
}

export function computeOfferSuggestions(price: number | null): OfferSuggestion[] {
  // Un prix absent ou nul ne permet aucune remise honnete -- on ne propose
  // rien plutot que des boutons qui calculeraient sur zero.
  if (price === null || !Number.isFinite(price) || price <= 0) return [];
  return [
    { kind: 'minus5', label: '-5 %', price: Math.max(1, roundEuro(price * 0.95)) },
    { kind: 'minus10', label: '-10 %', price: Math.max(1, roundEuro(price * 0.9)) },
    { kind: 'round', label: 'Prix rond', price: roundedOffer(price) },
  ];
}
