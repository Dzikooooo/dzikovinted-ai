import { RefreshCw } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

// Chaque variante reprend des classes déjà réellement utilisées ailleurs
// dans l'app (ex. `primary` = classes exactes du bouton "Scanner
// maintenant"/"Fermer" des modales) - aucune nouvelle couleur introduite.
// Glow primary aligne sur .btn-neon (index.css) -- meme valeurs, pour que
// tout bouton primaire du produit (pas seulement ceux qui utilisent
// directement la classe utilitaire) porte le meme accent dore.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Etat desactive (2026-08-26) : fond neutre + texte gris, et NON
  // `opacity-50` sur un bouton violet a texte blanc -- l'opacite delave les
  // DEUX couches a la fois et tombait a 1.50:1, soit un libelle illisible au
  // moment precis ou il indique ce qui manque pour continuer. gray-600 sur
  // gray-100 : 6.87:1. `disabled:opacity-100` neutralise le `opacity-50`
  // generique porte par la classe de base, sans y toucher pour les autres
  // variantes qui, elles, ne posent pas de texte blanc sur un aplat sature.
  primary:
    'bg-neon-600 text-white shadow-[0_0_25px_rgba(124,92,255,0.18)] hover:bg-neon-700 hover:shadow-[0_0_35px_rgba(124,92,255,0.28)] disabled:opacity-100 disabled:bg-gray-100 disabled:text-gray-600 disabled:hover:bg-gray-100 disabled:shadow-none',
  secondary: 'bg-dark-400 border border-gray-200 text-gray-800 hover:border-neon-500/40',
  ghost: 'text-gray-500 hover:text-gray-900 hover:bg-gray-100',
  danger: 'bg-red-500/10 border border-red-500/20 text-red-700 hover:bg-red-500/20',
  // Etat "deja enregistre" (ex. ResultStep.tsx du Generateur) -- reste
  // pleinement colore meme desactive (disabled:!opacity-100), contrairement
  // aux autres variantes qui s'estompent a disabled:opacity-50 : le but ici
  // est de confirmer un succes, pas de signaler une action indisponible.
  success: 'bg-neon-500/20 text-neon-500 border border-neon-500/30 disabled:!opacity-100',
  // Ajoutee le 2026-08-26 : action PRINCIPALE d'une page qui ne doit pas
  // concurrencer le CTA global de la barre du haut. Porte l'accent de marque
  // sans le poids d'un bouton plein -- entre `primary` et `secondary`.
  //
  // Le texte est en neon-600 et non neon-500 : sur le fond neon-500/10
  // (#F2EFFF compose sur blanc), neon-500 ne donne que 3.84:1, sous le seuil
  // AA. neon-600 donne 5.88:1, et 5.14:1 sur le fond du survol.
  outline: 'bg-neon-500/10 text-neon-600 border border-neon-500/25 hover:bg-neon-500/20 hover:border-neon-500/40',
};

// Radius unifie a rounded-xl (sm etait en rounded-lg, seule incoherence de
// radius du produit sur ce composant).
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm rounded-xl gap-1.5',
  md: 'px-6 py-3 text-sm rounded-xl gap-2',
  lg: 'px-8 py-4 text-base rounded-xl gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-400 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
