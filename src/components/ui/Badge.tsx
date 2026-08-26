export type BadgeTone = 'brand' | 'positive' | 'attention' | 'warning' | 'negative' | 'neutral';

// Primitive partagee (chantier coherence UI, 2026-07-29) : VintedStatusBadge
// et ActionStatusBadge etaient deux fichiers strictement identiques (meme
// balisage, meme classes) qui ne differaient que par leur table
// statut -> style -- desormais deux tables de donnees au-dessus de ce seul
// composant de rendu.
const TONE_CLASSES: Record<BadgeTone, string> = {
  brand: 'text-neon-500 bg-neon-500/10',
  positive: 'text-green-400 bg-green-500/10',
  attention: 'text-yellow-400 bg-yellow-400/10',
  // Distinct de 'attention' (jaune = opportunite/nouveaute/badge) : ambre
  // reserve aux etats "a surveiller/incertain" (stock vieillissant, synchro
  // perimee, alerte moyenne) -- distinction deja etablie ailleurs dans le
  // produit (DashboardHome.tsx, StockPage.tsx), preservee ici plutot que
  // fusionnee dans 'attention'.
  warning: 'text-amber-400 bg-amber-400/10',
  negative: 'text-red-700 bg-red-500/10',
  neutral: 'text-gray-500 bg-gray-100',
};

interface BadgeProps {
  label: string;
  tone: BadgeTone;
  className?: string;
}

export function Badge({ label, tone, className = '' }: BadgeProps) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg flex-shrink-0 ${TONE_CLASSES[tone]} ${className}`}>
      {label}
    </span>
  );
}
