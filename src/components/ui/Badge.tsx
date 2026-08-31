export type BadgeTone = 'brand' | 'positive' | 'attention' | 'warning' | 'negative' | 'neutral';

// Primitive partagee (chantier coherence UI, 2026-07-29) : VintedStatusBadge
// et ActionStatusBadge etaient deux fichiers strictement identiques (meme
// balisage, meme classes) qui ne differaient que par leur table
// statut -> style -- desormais deux tables de donnees au-dessus de ce seul
// composant de rendu.
// Paliers 700 (2026-08-31, "Mes annonces" -- contraste des badges de statut
// dans la grille) : text-green-400/yellow-400/amber-400 mesuraient
// respectivement 1.74:1/1.53:1/1.67:1 sur fond clair, tres en dessous du
// seuil WCAG AA (4.5:1) -- voir [[project_dark_theme_color_leftovers]] et
// CLAUDE.md, Tokens de couleur & accessibilite. green-700 et amber-700
// mesures conformes (5.02:1) lors du lot precedent (StatCard) ; yellow-700
// mesure ici a 4.92:1 (meme methode). La distinction de teinte
// jaune/attention vs ambre/warning est PRESERVEE (voir commentaire
// ci-dessous) -- seul le palier change, jamais la hierarchie semantique.
const TONE_CLASSES: Record<BadgeTone, string> = {
  brand: 'text-neon-500 bg-neon-500/10',
  positive: 'text-green-700 bg-green-500/10',
  attention: 'text-yellow-700 bg-yellow-400/10',
  // Distinct de 'attention' (jaune = opportunite/nouveaute/badge) : ambre
  // reserve aux etats "a surveiller/incertain" (stock vieillissant, synchro
  // perimee, alerte moyenne) -- distinction deja etablie ailleurs dans le
  // produit (DashboardHome.tsx, StockPage.tsx), preservee ici plutot que
  // fusionnee dans 'attention'.
  warning: 'text-amber-700 bg-amber-400/10',
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
