import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}

// Bloc d'entete partage (chantier coherence UI, 2026-07-29) : titre + sous-
// titre + slot meta optionnel (ex. badge de vue, date du dernier scan) +
// slot action optionnel (CTA ou controle segmente) a droite. Remplace le
// JSX d'entete duplique/legerement divergent (marge, taille, structure) sur
// chaque page du dashboard -- une seule mise en page desormais.
export function PageHeader({ title, description, meta, action, className = '' }: PageHeaderProps) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 ${className}`}>
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-black">{title}</h1>
          {meta}
        </div>
        {description && <p className="text-gray-500 text-sm mt-1">{description}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
