import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./Spinner";

export type PopupButtonVariant = "primary" | "ghost" | "danger";

interface PopupButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PopupButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
}

// Equivalent minimal de src/components/ui/Button.tsx pour le popup (paquet
// sans Tailwind, voir popup.css) -- memes 3 variantes utiles ici
// (primary/ghost/danger), meme comportement disabled+loading, meme anneau
// de focus clavier (.focus-ring). <button> natif : deja accessible au
// clavier (Enter/Espace) sans traitement supplementaire.
export function PopupButton({
  variant = "primary",
  loading = false,
  icon,
  disabled,
  className = "",
  children,
  ...rest
}: PopupButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`btn btn-${variant} focus-ring ${className}`}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : icon}
      {children}
    </button>
  );
}
