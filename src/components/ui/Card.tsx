import type { HTMLAttributes } from 'react';

// Composant fondation (Phase 1 "Design irreprochable", 2026-08-28) : premiere
// brique d'un chantier d'uniformisation, volontairement isolee -- AUCUNE page
// existante n'est migree dans ce lot (chaque carte "a la main" continue de
// fonctionner a l'identique tant qu'elle n'est pas explicitement basculee).
//
// Rayon fige a `rounded-2xl`, jamais expose en prop : c'est precisement le
// point de ce composant (une seule decision, prise une fois). Verifie par
// grep avant d'ecrire ce fichier -- ce n'est PAS un chaos aleatoire a
// trancher au hasard, mais une hierarchie de taille deja reelle et non-dite
// dans le code existant (SettingsPage.tsx notamment) : rounded-2xl pour les
// sections/cartes de contenu (ce que ce composant couvre), rounded-xl pour
// les elements moyens (inputs, badges, bannieres -- domaine de Button.tsx,
// deja unifie), rounded-lg pour les petits controles icone-seule. Ce
// composant formalise le premier palier, il ne remplace pas les deux autres.
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';
export type CardTone = 'default' | 'danger';

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

// Bordure de tonalite : 'danger' reprend EXACTEMENT la valeur deja en usage
// pour la zone "Danger" de SettingsPage.tsx (border-red-500/20) -- aucune
// nouvelle teinte inventee ici.
const TONE_BORDER_CLASSES: Record<CardTone, string> = {
  default: 'border-gray-200',
  danger: 'border-red-500/20',
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** p-4 / p-5 / p-6, ou 'none' quand le contenu gere son propre padding interne (ex. un tableau avec divide-y). */
  padding?: CardPadding;
  tone?: CardTone;
  // 'alt' = zone secondaire imbriquee (une carte DANS une carte, ex. un
  // encart a l'interieur d'une section Parametres) -- reprend la distinction
  // deja documentee dans tailwind.config.js (surface.DEFAULT vs surface.alt),
  // jamais une nouvelle teinte.
  background?: 'default' | 'alt';
  // Hover de bordure + curseur pointer, pour une carte cliquable dans son
  // ensemble (ex. ListingCard) -- ne pose aucun onClick/role/aria-label a la
  // place de l'appelant : Card reste un composant de PRESENTATION, jamais
  // proprietaire de la semantique d'interaction (chaque carte cliquable garde
  // son propre role="button"/onKeyDown/aria-label, deja le cas de ListingCard).
  interactive?: boolean;
  // Etat de selection reel (grille multi-select, ex. ListingCard) -- reprend
  // EXACTEMENT la bordure + l'ombre deja en usage a cet endroit, jamais une
  // nouvelle valeur bricolee. Seule ombre que ce composant porte : elle
  // correspond a un vrai etat (selectionne/non), pas a une decoration.
  selected?: boolean;
}

export function Card({
  padding = 'md',
  tone = 'default',
  background = 'default',
  interactive = false,
  selected = false,
  className = '',
  children,
  ...rest
}: CardProps) {
  const borderClass = selected ? 'border-neon-500/60' : TONE_BORDER_CLASSES[tone];
  const bgClass = background === 'alt' ? 'bg-surface-alt' : 'bg-surface';
  const shadowClass = selected ? 'shadow-[0_0_0_1px_rgba(124,92,255,0.3),0_20px_50px_rgba(0,0,0,0.35)]' : '';
  const interactiveClass = interactive
    ? `transition-all duration-300 cursor-pointer ${!selected ? 'hover:border-neon-500/30' : ''}`
    : '';

  return (
    <div
      className={`rounded-2xl border ${borderClass} ${bgClass} ${PADDING_CLASSES[padding]} ${shadowClass} ${interactiveClass} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
