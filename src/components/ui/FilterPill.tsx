import type { ReactNode } from 'react';

interface FilterPillProps {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  className?: string;
}

// Style de filtre unique (chantier coherence UI, 2026-07-29) : reprend le
// traitement le plus discret deja en place (StockPage) -- pas de bordure,
// juste un fond violet tres leger a l'etat actif. Remplace la variante plus
// lourde a bordure pleine qui coexistait sur Opportunities.tsx pour le meme
// type de controle (filtre a choix unique en ligne).
export function FilterPill({ label, active, onClick, icon, className = '' }: FilterPillProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-400 ${
        active ? 'bg-neon-500/10 text-neon-500 font-medium' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
      } ${className}`}
    >
      {icon}
      {label}
    </button>
  );
}
