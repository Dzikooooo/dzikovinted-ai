import { AlertTriangle, Search } from 'lucide-react';
import ActionStepTimeline, { type ActionStepTimelineRow } from '../actions/ActionStepTimeline';
import { SCAN_STEP_ORDER, SCAN_STEP_LABELS, isScanStep, type ScanStep } from '../../lib/actions/scanSteps';
import { useActionLogEntries } from '../../hooks/useActionHistory';
import { Modal } from '../ui/Modal';

interface ScanProgressModalProps {
  actionId: string | null;
  done: boolean;
  error?: string | null;
  opportunitiesFound?: number | null;
  onClose: () => void;
  onViewAction?: () => void;
}

function latestScanStep(entries: { step: string | null; at: string }[]): ScanStep | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const step = entries[i].step;
    if (step && isScanStep(step)) return step;
  }
  return null;
}

function latestMessage(entries: { step: string | null; message: string }[], step: ScanStep): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].step === step) return entries[i].message;
  }
  return null;
}

function buildRows(currentStep: ScanStep | null, done: boolean, error: string | null | undefined, entries: { step: string | null; message: string }[]): ActionStepTimelineRow[] {
  const currentIndex = currentStep ? SCAN_STEP_ORDER.indexOf(currentStep) : -1;
  return SCAN_STEP_ORDER.map((step, index) => {
    const isDone = !error && (done || index < currentIndex);
    const isActive = !error && !done && step === currentStep;
    return {
      key: step,
      label: isActive ? (latestMessage(entries, step) ?? SCAN_STEP_LABELS[step]) : SCAN_STEP_LABELS[step],
      state: isDone ? 'done' : isActive ? 'active' : 'pending',
    };
  });
}

// Mirror de PublishProgressModal.tsx, mais alimente par le Realtime deja
// existant (useActionLogEntries) plutot que par le port d'extension : la
// Edge Function scan-market ecrit directement dans action_log_entries
// pendant qu'elle tourne (voir handlers/scanMarket.ts), ce composant se
// contente d'afficher ce qui arrive reellement - aucun timing fabrique.
export default function ScanProgressModal({ actionId, done, error, opportunitiesFound, onClose, onViewAction }: ScanProgressModalProps) {
  const { entries } = useActionLogEntries(actionId);
  const currentStep = latestScanStep(entries);
  const isTerminal = done || !!error;

  return (
    <Modal onClose={onClose} dismissible={isTerminal} size="sm">
      <div className="flex items-center gap-2 mb-5">
        <Search className="w-4 h-4 text-neon-500" />
        <h2 className="text-lg font-black">{error ? 'Échec du scan' : 'Scan en cours'}</h2>
      </div>

      <ActionStepTimeline rows={buildRows(currentStep, done, error, entries)} />

      {error && (
        <div className="mt-4 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {done && !error && (
        <p className="mt-4 text-sm text-neon-500 font-semibold">
          {opportunitiesFound === 0
            ? 'Terminé — aucune opportunité trouvée cette fois.'
            : `Terminé — ${opportunitiesFound} opportunité${opportunitiesFound === 1 ? '' : 's'} trouvée${opportunitiesFound === 1 ? '' : 's'}.`}
        </p>
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
    </Modal>
  );
}
