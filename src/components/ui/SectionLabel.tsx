import type { ReactNode } from 'react';

interface SectionLabelProps {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

// Eyebrow de sous-section partage (chantier coherence UI, 2026-07-29) :
// deux conventions coexistaient pour la meme fonction (separer des groupes
// de contenu a l'interieur d'une page) -- l'une en petites majuscules mono
// (StockPage/WatchlistPage), l'autre en gras taille normale (DashboardHome/
// AccountingPage/StatsPage). Choix retenu : la version mono/majuscules,
// deja la convention de label la plus repandue dans le reste du produit
// (StatCard, badges, metadonnees) -- un seul vocabulaire visuel pour "ceci
// est un intitule de groupe", pas un titre a part entiere.
export function SectionLabel({ children, action, className = '' }: SectionLabelProps) {
  return (
    <div className={`flex items-center justify-between mb-3 ${className}`}>
      <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-gray-500">{children}</h2>
      {action}
    </div>
  );
}
