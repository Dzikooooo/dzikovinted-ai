import type { ComponentType } from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
  bare?: boolean;
}

// Traitement canonique = celui déjà le plus abouti avant cette passe
// (StockPage.tsx/ActionsPage.tsx) : bordure pointillée + icône + titre +
// description, désormais la seule variante dans l'app.
// `bare` (2026-08-26) : rend l'etat vide SANS sa coquille (bordure pointillee,
// fond, gros padding). Necessaire quand il est place a l'interieur d'un
// panneau deja borde -- sinon on obtient une carte dans une carte, double
// bordure visible (constate sur la page Communication).
//
// Prop OPTIONNELLE et par defaut a false : les 20 autres usages de ce
// composant, qui le posent directement sur le fond de page, gardent
// exactement le rendu actuel.
export function EmptyState({ icon: Icon, title, description, action, className = '', bare = false }: EmptyStateProps) {
  return (
    <div
      className={`${bare ? 'py-8' : 'bg-surface border border-dashed border-gray-200 rounded-2xl p-10 sm:p-12'} text-center ${className}`}
    >
      {Icon && <Icon className="w-8 h-8 text-gray-700 mx-auto mb-3" />}
      <h3 className="text-gray-500 font-semibold mb-2">{title}</h3>
      {description && <p className="text-sm text-gray-500 max-w-sm mx-auto">{description}</p>}
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick} className="mt-5 mx-auto">
          {action.label}
        </Button>
      )}
    </div>
  );
}
