import { Check, Loader2, AlertTriangle } from 'lucide-react';
import type { PublishStep } from '../../lib/actions/publishSteps';
import { PUBLISH_STEP_ORDER, PUBLISH_STEP_LABELS } from '../../lib/actions/publishSteps';

interface PublishProgressModalProps {
  currentStep: PublishStep | 'done' | null;
  error?: string | null;
  onClose: () => void;
}

export default function PublishProgressModal({ currentStep, error, onClose }: PublishProgressModalProps) {
  const isTerminal = currentStep === 'done' || !!error;
  const currentIndex = currentStep ? PUBLISH_STEP_ORDER.indexOf(currentStep as PublishStep) : -1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm bg-surface border border-white/10 rounded-2xl p-5">
        <h2 className="text-lg font-black mb-5">{error ? 'Échec de la publication' : 'Publication en cours'}</h2>

        <div className="space-y-3">
          {PUBLISH_STEP_ORDER.map((step, index) => {
            const done = !error && (currentStep === 'done' || index < currentIndex);
            const active = !error && step === currentStep;
            return (
              <div key={step} className="flex items-center gap-3">
                {done ? (
                  <Check className="w-4 h-4 text-neon-500 flex-shrink-0" />
                ) : active ? (
                  <Loader2 className="w-4 h-4 text-neon-500 flex-shrink-0 animate-spin" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-white/10 flex-shrink-0" />
                )}
                <span className={`text-sm ${active ? 'text-gray-100 font-semibold' : done ? 'text-gray-400' : 'text-gray-600'}`}>
                  {PUBLISH_STEP_LABELS[step]}
                </span>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {currentStep === 'done' && !error && (
          <p className="mt-4 text-sm text-neon-500 font-semibold">Terminé.</p>
        )}

        {isTerminal && (
          <button
            onClick={onClose}
            className="w-full mt-5 bg-neon-500 text-black font-bold py-3 rounded-xl hover:bg-neon-600 transition-all"
          >
            Fermer
          </button>
        )}
      </div>
    </div>
  );
}
