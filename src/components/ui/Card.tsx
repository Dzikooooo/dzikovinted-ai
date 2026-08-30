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
// 'quality-*' (2026-08-30, casier visuel "Mes annonces") : contour de suivi
// qualite par annonce (ListingCard) -- vert = aucun defaut detecte, violet =
// un seul point a corriger (reutilise neon-500, deja la couleur de marque ET
// d'action du produit, jamais une 4e teinte inventee), rouge = plusieurs
// points a corriger. `selected` reste toujours prioritaire sur ces 3 tons
// (voir plus bas) : une carte selectionnee affiche l'etat de selection, pas
// son etat qualite, exactement comme pour 'default'/'danger' deja.
export type CardTone = 'default' | 'danger' | 'quality-ok' | 'quality-warning' | 'quality-critical';

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
  'quality-ok': 'border-green-500/60',
  'quality-warning': 'border-neon-500/60',
  'quality-critical': 'border-red-500/60',
};

// Ombre douce assortie, UNIQUEMENT pour les 3 tons qualite -- 'default'/
// 'danger' restent sans ombre hors selection (test "Card ne decore jamais
// sans etat reel derriere" deja en place, jamais casse par cet ajout).
const TONE_SHADOW_CLASSES: Partial<Record<CardTone, string>> = {
  'quality-ok': 'shadow-[0_0_16px_rgba(34,197,94,0.15)]',
  'quality-warning': 'shadow-[0_0_16px_rgba(124,92,255,0.15)]',
  'quality-critical': 'shadow-[0_0_16px_rgba(239,68,68,0.15)]',
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
  const isQualityTone = tone === 'quality-ok' || tone === 'quality-warning' || tone === 'quality-critical';
  const borderClass = selected ? 'border-neon-500/60' : TONE_BORDER_CLASSES[tone];
  // Contour plus epais (2px) UNIQUEMENT pour les 3 tons qualite, et
  // seulement hors selection -- "suivi visuel rapide" demande explicitement
  // (casier "Mes annonces", 2026-08-30) : un liseret de 1px quasi-transparent
  // ne se voit pas d'un coup d'oeil sur une grille de plusieurs dizaines de
  // cartes. `selected` retombe sur l'epaisseur 1px deja existante, inchangee.
  const widthClass = isQualityTone && !selected ? 'border-2' : 'border';
  const bgClass = background === 'alt' ? 'bg-surface-alt' : 'bg-surface';
  const shadowClass = selected
    ? 'shadow-[0_0_0_1px_rgba(124,92,255,0.3),0_20px_50px_rgba(0,0,0,0.35)]'
    : (TONE_SHADOW_CLASSES[tone] ?? '');
  const interactiveClass = interactive
    ? `transition-all duration-300 cursor-pointer ${!selected ? 'hover:border-neon-500/30' : ''}`
    : '';

  return (
    <div
      className={`rounded-2xl ${widthClass} ${borderClass} ${bgClass} ${PADDING_CLASSES[padding]} ${shadowClass} ${interactiveClass} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
