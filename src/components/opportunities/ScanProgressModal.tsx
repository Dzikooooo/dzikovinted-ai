import { AlertTriangle, Clock, Search, X } from 'lucide-react';
import ActionStepTimeline, { type ActionStepTimelineRow } from '../actions/ActionStepTimeline';
import { SCAN_STEP_ORDER, SCAN_STEP_LABELS, isScanStep, type ScanStep } from '../../lib/actions/scanSteps';
import { SCAN_TIMEOUT_ERROR_MESSAGE } from '../../lib/actions/handlers/scanMarket';
import { useActionLogEntries } from '../../hooks/useActionHistory';
import { Modal } from '../ui/Modal';

interface ScanProgressModalProps {
  actionId: string | null;
  done: boolean;
  error?: string | null;
  opportunitiesFound?: number | null;
  failedSearches?: number | null;
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
export default function ScanProgressModal({ actionId, done, error, opportunitiesFound, failedSearches, onClose, onViewAction }: ScanProgressModalProps) {
  const { entries } = useActionLogEntries(actionId);
  const currentStep = latestScanStep(entries);
  const isTerminal = done || !!error;
  // Ce timeout precis n'est PAS un echec confirme (voir scanMarket.ts) : le
  // job GitHub Actions peut tres bien reussir juste apres, et ecrasera ce
  // message par un vrai statut terminal. Afficher "Echec du scan" en rouge
  // ici induit l'utilisateur en erreur -- traitement distinct, honnete sur
  // l'incertitude (bug reel signale par l'utilisateur, 2026-07-27 : le scan
  // avait en fait reussi, 259 opportunites trouvees, confirme en base).
  const isUncertainTimeout = error === SCAN_TIMEOUT_ERROR_MESSAGE;
  const confirmedError = !!error && !isUncertainTimeout;

  // Retour beta (2026-08-27) : cette modale bloquait toute navigation
  // pendant un scan (dismissible={isTerminal} coupait Echap ET le clic
  // exterieur, et aucun bouton X n'existait). Le scan tourne entierement
  // cote serveur (Edge Function -> workflow GitHub Actions ->
  // action_log_entries, voir le commentaire de useActionLogEntries plus
  // haut) : cette vue n'est qu'un AFFICHAGE PASSIF (Realtime), la fermer
  // n'a jamais eu la moindre prise sur le scan lui-meme. Desormais
  // toujours fermable (Echap, clic exterieur, bouton X) -- le suivi
  // continue en arriere-plan (voir Opportunities.tsx::scanModalOpen), le
  // bouton "Scan en cours" du header permet de rouvrir cette vue.
  return (
    <Modal onClose={onClose} dismissible size="sm">
      <div className="flex items-center justify-between gap-2 mb-5">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-neon-500" />
          <h2 className="text-lg font-black">
            {confirmedError ? 'Échec du scan' : isUncertainTimeout ? 'Scan toujours en cours ?' : 'Scan en cours'}
          </h2>
        </div>
        <button onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-gray-100">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {!isTerminal && (
        <p className="mb-4 text-xs text-gray-500">
          Le scan continue en arrière-plan -- tu peux fermer cette fenêtre et te balader dans ResellOS, il se
          termine tout seul.
        </p>
      )}

      <ActionStepTimeline rows={buildRows(currentStep, done, error, entries)} />

      {confirmedError && (
        <div className="mt-4 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {isUncertainTimeout && (
        <div className="mt-4 flex items-start gap-2 bg-amber-400/10 border border-amber-400/20 rounded-xl p-3">
          <Clock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">{error}</p>
        </div>
      )}

      {done && !error && (
        <>
          <p className="mt-4 text-sm text-neon-500 font-semibold">
            {opportunitiesFound === 0
              ? 'Terminé — aucune opportunité trouvée cette fois.'
              : `Terminé — ${opportunitiesFound} opportunité${opportunitiesFound === 1 ? '' : 's'} trouvée${opportunitiesFound === 1 ? '' : 's'}.`}
          </p>
          {!!failedSearches && failedSearches > 0 && (
            <p className="mt-1.5 text-xs text-amber-400">
              {failedSearches} recherche{failedSearches > 1 ? 's' : ''} de ta watchlist n'{failedSearches > 1 ? 'ont' : 'a'} pas pu être vérifiée{failedSearches > 1 ? 's' : ''} cette fois (Vinted indisponible) — elle{failedSearches > 1 ? 's' : ''} sera{failedSearches > 1 ? 'nt' : ''} retentée{failedSearches > 1 ? 's' : ''} au prochain scan.
            </p>
          )}
        </>
      )}

      {isTerminal && onViewAction && (
        <button
          onClick={onViewAction}
          className="w-full mt-5 bg-dark-400 border border-gray-200 text-gray-800 font-semibold py-3 rounded-xl hover:border-neon-500/40 transition-all"
        >
          Voir dans Niches
        </button>
      )}

      {isTerminal ? (
        <button
          onClick={onClose}
          className="w-full mt-3 bg-neon-600 text-white font-bold py-3 rounded-xl hover:bg-neon-700 transition-all"
        >
          Fermer
        </button>
      ) : (
        <button
          onClick={onClose}
          className="w-full mt-5 bg-dark-400 border border-gray-200 text-gray-800 font-semibold py-3 rounded-xl hover:border-neon-500/40 transition-all"
        >
          Continuer en arrière-plan
        </button>
      )}
    </Modal>
  );
}
