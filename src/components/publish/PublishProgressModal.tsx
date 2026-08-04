import { AlertTriangle, Info } from 'lucide-react';
import ActionStepTimeline, { type ActionStepTimelineRow } from '../actions/ActionStepTimeline';
import type { PublishStep } from '../../lib/actions/publishSteps';
import { PUBLISH_STEP_ORDER, PUBLISH_STEP_LABELS } from '../../lib/actions/publishSteps';
import { Modal } from '../ui/Modal';

interface PublishProgressModalProps {
  currentStep: PublishStep | 'done' | null;
  error?: string | null;
  onClose: () => void;
  // Present uniquement si l'appelant sait naviguer vers le Centre des
  // Actions (StockPage le fournit, d'autres futurs appelants pourraient
  // ne pas l'avoir) - lien optionnel, jamais requis.
  onViewAction?: () => void;
  // Ecran de progression edit_listing (finition UX 2026-07-21) : par
  // defaut (undefined), reste l'ecran de publication original, inchange --
  // seul StockPage.tsx passe des valeurs differentes pour edit_listing
  // (voir src/lib/actions/editListingSteps.ts).
  stepOrder?: PublishStep[];
  stepLabels?: Record<PublishStep, string>;
  title?: string;
  errorTitle?: string;
  // Attente du clic manuel sur Valider (audit RC, 2026-08-05) -- toutes
  // optionnelles, jamais fournies par l'ecran de publication original
  // (publish_listing/republish_listing), aucun changement de comportement
  // pour ces deux-la. hint : instruction affichee sous la timeline tant que
  // l'action n'est ni terminee ni en erreur. onOpenVinted/onRetry : boutons
  // secondaires, affiches uniquement si fournis par l'appelant.
  hint?: string;
  onOpenVinted?: () => void;
  onRetry?: () => void;
  retryDisabled?: boolean;
}

function buildRows(
  currentStep: PublishStep | 'done' | null,
  error: string | null | undefined,
  stepOrder: PublishStep[],
  stepLabels: Record<PublishStep, string>
): ActionStepTimelineRow[] {
  const currentIndex = currentStep ? stepOrder.indexOf(currentStep as PublishStep) : -1;
  return stepOrder.map((step, index) => {
    const done = !error && (currentStep === 'done' || index < currentIndex);
    const active = !error && step === currentStep;
    return {
      key: step,
      label: stepLabels[step],
      state: done ? 'done' : active ? 'active' : 'pending',
    };
  });
}

export default function PublishProgressModal({
  currentStep,
  error,
  onClose,
  onViewAction,
  stepOrder = PUBLISH_STEP_ORDER,
  stepLabels = PUBLISH_STEP_LABELS,
  title = 'Publication en cours',
  errorTitle = 'Échec de la publication',
  hint,
  onOpenVinted,
  onRetry,
  retryDisabled,
}: PublishProgressModalProps) {
  const isTerminal = currentStep === 'done' || !!error;

  return (
    <Modal onClose={onClose} dismissible={isTerminal} size="sm">
      <h2 className="text-lg font-black mb-5">{error ? errorTitle : title}</h2>

      <ActionStepTimeline rows={buildRows(currentStep, error, stepOrder, stepLabels)} />

      {!isTerminal && hint && (
        <div className="mt-4 flex items-start gap-2 bg-neon-500/10 border border-neon-500/20 rounded-xl p-3">
          <Info className="w-4 h-4 text-neon-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-neon-300">{hint}</p>
        </div>
      )}

      {!isTerminal && hint && onOpenVinted && (
        <button
          onClick={onOpenVinted}
          className="w-full mt-3 bg-dark-400 border border-white/10 text-gray-200 font-semibold py-3 rounded-xl hover:border-neon-500/40 transition-all"
        >
          Ouvrir Vinted
        </button>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {currentStep === 'done' && !error && (
        <p className="mt-4 text-sm text-neon-500 font-semibold">Terminé.</p>
      )}

      {error && onOpenVinted && (
        <button
          onClick={onOpenVinted}
          className="w-full mt-4 bg-dark-400 border border-white/10 text-gray-200 font-semibold py-3 rounded-xl hover:border-neon-500/40 transition-all"
        >
          Ouvrir Vinted
        </button>
      )}

      {error && onRetry && (
        <button
          onClick={onRetry}
          disabled={retryDisabled}
          className="w-full mt-3 bg-neon-600 text-white font-bold py-3 rounded-xl hover:bg-neon-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Réessayer
        </button>
      )}

      {isTerminal && onViewAction && (
        <button
          onClick={onViewAction}
          className="w-full mt-3 bg-dark-400 border border-white/10 text-gray-200 font-semibold py-3 rounded-xl hover:border-neon-500/40 transition-all"
        >
          Voir dans Niches
        </button>
      )}

      {isTerminal && (
        <button
          onClick={onClose}
          className="w-full mt-3 bg-neon-600 text-white font-bold py-3 rounded-xl hover:bg-neon-700 transition-all"
        >
          Fermer
        </button>
      )}
    </Modal>
  );
}
