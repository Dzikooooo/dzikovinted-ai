import { RefreshCw } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
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
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-neon-500 text-black hover:bg-neon-600 disabled:hover:bg-neon-500',
  secondary: 'bg-dark-400 border border-white/10 text-gray-200 hover:border-neon-500/40',
  ghost: 'text-gray-400 hover:text-white hover:bg-white/5',
  danger: 'bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm rounded-lg gap-1.5',
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
      className={`inline-flex items-center justify-center font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
