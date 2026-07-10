import { AlertTriangle } from 'lucide-react';
import ActionStepTimeline, { type ActionStepTimelineRow } from '../actions/ActionStepTimeline';
import type { PublishStep } from '../../lib/actions/publishSteps';
import { PUBLISH_STEP_ORDER, PUBLISH_STEP_LABELS } from '../../lib/actions/publishSteps';

interface PublishProgressModalProps {
  currentStep: PublishStep | 'done' | null;
  error?: string | null;
  onClose: () => void;
  // Present uniquement si l'appelant sait naviguer vers le Centre des
  // Actions (StockPage le fournit, d'autres futurs appelants pourraient
  // ne pas l'avoir) - lien optionnel, jamais requis.
  onViewAction?: () => void;
}

function buildRows(currentStep: PublishStep | 'done' | null, error?: string | null): ActionStepTimelineRow[] {
  const currentIndex = currentStep ? PUBLISH_STEP_ORDER.indexOf(currentStep as PublishStep) : -1;
  return PUBLISH_STEP_ORDER.map((step, index) => {
    const done = !error && (currentStep === 'done' || index < currentIndex);
    const active = !error && step === currentStep;
    return {
      key: step,
      label: PUBLISH_STEP_LABELS[step],
      state: done ? 'done' : active ? 'active' : 'pending',
    };
  });
}

export default function PublishProgressModal({ currentStep, error, onClose, onViewAction }: PublishProgressModalProps) {
  const isTerminal = currentStep === 'done' || !!error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm bg-surface border border-white/10 rounded-2xl p-5">
        <h2 className="text-lg font-black mb-5">{error ? 'Échec de la publication' : 'Publication en cours'}</h2>

        <ActionStepTimeline rows={buildRows(currentStep, error)} />

        {error && (
          <div className="mt-4 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {currentStep === 'done' && !error && (
          <p className="mt-4 text-sm text-neon-500 font-semibold">Terminé.</p>
        )}

        {isTerminal && onViewAction && (
          <button
            onClick={onViewAction}
            className="w-full mt-5 bg-dark-400 border border-white/10 text-gray-200 font-semibold py-3 rounded-xl hover:border-neon-500/40 transition-all"
          >
            Voir dans le Centre des Actions
          </button>
        )}

        {isTerminal && (
          <button
            onClick={onClose}
            className="w-full mt-3 bg-neon-500 text-black font-bold py-3 rounded-xl hover:bg-neon-600 transition-all"
          >
            Fermer
          </button>
        )}
      </div>
    </div>
  );
}
