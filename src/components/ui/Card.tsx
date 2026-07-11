import type { HTMLAttributes } from 'react';

export type CardVariant = 'surface' | 'surface-alt';
export type CardPadding = 'sm' | 'md' | 'lg';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  interactive?: boolean;
}

// rounded-2xl conservé (distinction déjà cohérente avec les boutons en
// rounded-xl ailleurs dans l'app - ce n'est pas de la dérive à corriger).
const VARIANT_CLASSES: Record<CardVariant, string> = {
  surface: 'bg-surface border border-white/5',
  'surface-alt': 'bg-surface-alt border border-white/10',
};

const PADDING_CLASSES: Record<CardPadding, string> = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export function Card({
  variant = 'surface',
  padding = 'md',
  interactive = false,
  className = '',
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={`rounded-2xl ${VARIANT_CLASSES[variant]} ${PADDING_CLASSES[padding]} ${
        interactive ? 'transition-colors hover:border-white/20' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
