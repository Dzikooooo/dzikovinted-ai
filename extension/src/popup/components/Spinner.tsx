import { Loader2 } from "lucide-react";

interface SpinnerProps {
  size?: number;
  className?: string;
}

// Loader minimal du popup, coherent avec le reste du produit (meme icone
// Loader2 que src/components/ui/Button.tsx cote app, ici animee via
// .spinner/popup.css plutot que la classe utilitaire Tailwind animate-spin,
// absente de ce paquet). Purement decoratif : jamais seul sans un libelle
// adjacent (voir Popup.tsx/PopupButton.tsx), donc aria-hidden.
export function Spinner({ size = 16, className = "" }: SpinnerProps) {
  return <Loader2 size={size} className={`spinner ${className}`} aria-hidden="true" />;
}
