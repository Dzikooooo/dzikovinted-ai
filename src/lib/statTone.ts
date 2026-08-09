import type { StatCardTone } from '../components/ui/StatCard';

// P1-5 (Freeze Audit correctif) : StatCard n'a pas de valeur `tone` par
// defaut adaptee a un montant qui peut etre negatif (Marge brute, Benefice
// net, ROI moyen en Comptabilite) -- `tone="positive"` etait code en dur,
// affichant un benefice negatif en vert. `undefined` retombe sur le style
// 'brand' par defaut de StatCard (ni vert ni rouge) pour une valeur neutre/0,
// StatCard ne definissant pas de tone 'neutral' dedie.
export function toneForValue(value: number): StatCardTone | undefined {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return undefined;
}
