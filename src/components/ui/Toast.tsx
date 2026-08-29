import { CheckCircle2, AlertCircle, Info, X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

// Fondation Phase 1 "micro-feedbacks" (2026-08-28) -- meme discipline que
// Card/Input : composant isole, pas de migration d'appel existant dans ce
// lot. Trois tons SEULEMENT, tous repris de palettes DEJA auditees
// ailleurs dans le produit -- aucune quatrieme teinte inventee (regle
// CLAUDE.md, tokens de couleur) :
//  - success/error : memes valeurs que KPI_TONES (DashboardHome.tsx), deja
//    corrigees le 2026-08-26 pour tenir le seuil AA (paliers 600/700, pas
//    les 400/500 qui echouaient le contraste).
//  - info : gris neutre deja utilise partout comme ton neutre (EmptyState,
//    KPI_TONES.neutral) -- jamais BRAND_VIOLET ici. Le violet designe
//    ResellOS lui-meme (playbook, tokens de couleur) ; un toast neutre
//    n'est pas un element qui "designe ResellOS", donc pas violet.
export type ToastTone = 'success' | 'error' | 'info';

const TONE_CLASSES: Record<ToastTone, { bg: string; border: string; text: string; icon: LucideIcon }> = {
  success: { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-700', icon: CheckCircle2 },
  error: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-600', icon: AlertCircle },
  info: { bg: 'bg-gray-100', border: 'border-gray-200', text: 'text-gray-700', icon: Info },
};

interface ToastProps {
  tone: ToastTone;
  children: ReactNode;
  onDismiss: () => void;
}

// role="status" (pas "alert") : une notification ephemere de confirmation
// n'est pas une urgence a interrompre le lecteur d'ecran en cours de tache,
// contrairement a role="alert" -- coherent avec ErrorBanner.tsx qui reserve
// deja alert aux erreurs bloquantes affichees en continu, jamais a un
// message qui disparait tout seul.
export function Toast({ tone, children, onDismiss }: ToastProps) {
  const t = TONE_CLASSES[tone];
  const Icon = t.icon;
  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-2.5 ${t.bg} border ${t.border} rounded-xl px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.12)] animate-slide-down`}
    >
      <Icon className={`w-4 h-4 ${t.text} flex-shrink-0 mt-0.5`} />
      <p className={`text-sm font-medium ${t.text} flex-1`}>{children}</p>
      <button onClick={onDismiss} aria-label="Fermer la notification" className={`${t.text} opacity-60 hover:opacity-100 transition-opacity flex-shrink-0`}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
