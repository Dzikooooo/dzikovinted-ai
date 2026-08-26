import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface ClosableSectionProps {
  label: string;
  labelOpen?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

// Onglet fermable generalise a partir du pattern "Voir le detail" de
// DashboardHome.tsx (Design Freeze, Lot 11) -- meme comportement (replie par
// defaut, chevron qui pivote) reutilise partout ou une section merite d'etre
// disponible sans etre imposee en permanence (Watchlist/Comptabilite/
// Parametres, demande explicite du 2026-07-29).
export function ClosableSection({ label, labelOpen, defaultOpen = false, children, className = '' }: ClosableSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={className}>
      {/* Vrai en-tete d'accordeon (2026-08-26) : c'etait un lien mono en
          majuscules 12px gris clair, indistinguable d'une legende -- des
          sections entieres de contenu reel passaient inapercues. Bordure,
          fond et padding en font une commande qu'on voit et qu'on vise.

          Seul l'EN-TETE est encadre, pas le contenu : les trois appelants y
          placent deja leurs propres cartes (Reglages, Mes annonces,
          Comptabilite) -- un cadre de plus produirait des bordures imbriquees. */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 mb-4 bg-surface border border-gray-200 rounded-2xl text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-500/50"
      >
        <span className="text-left">{open ? (labelOpen ?? `Masquer ${label.toLowerCase()}`) : label}</span>
        <ChevronDown className={`w-4 h-4 text-gray-600 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && children}
    </div>
  );
}
