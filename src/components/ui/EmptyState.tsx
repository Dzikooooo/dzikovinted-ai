import type { ComponentType } from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

// Traitement canonique = celui déjà le plus abouti avant cette passe
// (StockPage.tsx/ActionsPage.tsx) : bordure pointillée + icône + titre +
// description, désormais la seule variante dans l'app.
export function EmptyState({ icon: Icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`bg-surface border border-dashed border-white/10 rounded-2xl p-10 sm:p-12 text-center ${className}`}
    >
      {Icon && <Icon className="w-8 h-8 text-gray-700 mx-auto mb-3" />}
      <h3 className="text-gray-400 font-semibold mb-2">{title}</h3>
      {description && <p className="text-sm text-gray-600 max-w-sm mx-auto">{description}</p>}
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick} className="mt-5 mx-auto">
          {action.label}
        </Button>
      )}
    </div>
  );
}
