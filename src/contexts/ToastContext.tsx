import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Toast, type ToastTone } from '../components/ui/Toast';

// Fondation Phase 1 "micro-feedbacks" (2026-08-28). Contexte global (comme
// AuthContext/VintedAccountFilterContext) : contrairement a Card/Input, un
// systeme de toast est INUTILISABLE sans son Provider monte a la racine --
// le brancher dans main.tsx fait donc partie de la fondation elle-meme, pas
// d'une "migration de page" a part.
//
// z-[60] : deliberement au-dessus de Modal (z-50, Modal.tsx) -- le cas le
// plus frequent est de confirmer une action qui vient de se passer DANS une
// modale (ex. "Compte supprimé", puis la modale se ferme) : le toast doit
// rester visible par-dessus. En dessous de SplashScreen (z-[100]), qui ne
// coexiste jamais avec une interaction utilisateur reelle.
//
// Coin HAUT-droit et non bas-droit : DzikoAiBubble (chat flottant persistant)
// occupe deja bas-droit (fixed bottom-5 right-5) -- un chevauchement visuel
// reel, pas seulement une preference esthetique.
const TOAST_DURATION_MS = 4000;

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, message, tone }]);
      setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* pointer-events-none sur le conteneur : les zones VIDES entre deux
          toasts ne doivent jamais bloquer un clic sur la page en dessous.
          Chaque Toast individuel se redonne pointer-events-auto (voir
          Toast.tsx) pour que son propre bouton de fermeture reste cliquable. */}
      <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <Toast key={t.id} tone={t.tone} onDismiss={() => dismiss(t.id)}>
            {t.message}
          </Toast>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
