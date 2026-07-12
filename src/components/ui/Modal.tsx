import { useEffect, useRef, type ReactNode } from 'react';

export type ModalSize = 'sm' | 'md' | 'lg';

interface ModalProps {
  onClose: () => void;
  dismissible?: boolean;
  size?: ModalSize;
  children: ReactNode;
  className?: string;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Coquille partagée pour les 3 modales existantes (ScanProgressModal,
// PublishProgressModal, PublishConfirmationModal) - overlay + panneau +
// piège à focus + Échap + clic-extérieur uniquement. Chaque appelant garde
// son propre header/body/footer à l'identique, aucune régression visuelle.
export function Modal({ onClose, dismissible = true, size = 'sm', children, className = '' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable?.[0]?.focus();

    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (dismissible) onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dismissible, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={() => dismissible && onClose()}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        className={`w-full ${SIZE_CLASSES[size]} max-h-[90vh] overflow-y-auto bg-surface border border-white/10 rounded-2xl p-5 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
