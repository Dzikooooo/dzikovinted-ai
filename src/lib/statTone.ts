import type { StatCardTone } from '../components/ui/StatCard';

// P1-5 (Freeze Audit correctif) : StatCard n'a pas de valeur `tone` par
// defaut adaptee a un montant qui peut etre negatif (Marge brute, Benefice
// net, ROI moyen en Comptabilite) -- `tone="positive"` etait code en dur,
// affichant un benefice negatif en vert.
//
// MAJ 2026-08-26 : zero rend desormais 'neutral' (gris) et non plus
// `undefined`. `undefined` retombait sur 'brand', donc un violet d'accent
// sur "Pertes : 0 €" -- une non-information mise en vedette.
export function toneForValue(value: number): StatCardTone {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}
