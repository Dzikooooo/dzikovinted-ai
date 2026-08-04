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
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors mb-4"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        {open ? (labelOpen ?? `Masquer ${label.toLowerCase()}`) : label}
      </button>
      {open && children}
    </div>
  );
}
