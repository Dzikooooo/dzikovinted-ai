import { AlertTriangle, Check, Info, ShieldCheck } from 'lucide-react';
import ActionStepTimeline, { type ActionStepTimelineRow } from '../actions/ActionStepTimeline';
import type { PublishStep } from '../../lib/actions/publishSteps';
import { PUBLISH_STEP_ORDER, PUBLISH_STEP_LABELS } from '../../lib/actions/publishSteps';
import { Modal } from '../ui/Modal';

interface PublishProgressModalProps {
  // 'cleanup_required' (mission "CORRIGER LE FAUX TERMINE", 2026-08-17) :
  // republication ou B est confirmee ET rattachee, mais l'ancienne annonce
  // Vinted n'a pas pu etre supprimee/confirmee supprimee -- distinct de
  // 'done' (jamais "Terminé." pour cet etat, republication non totalement
  // terminee) ET de `error` (B a reellement ete publiee, ce n'est jamais un
  // echec total de l'action).
  currentStep: PublishStep | 'done' | 'cleanup_required' | null;
  error?: string | null;
  // Detail de l'echec de suppression (transactionResult.cleanupError,
  // extension) -- affiche uniquement avec currentStep==='cleanup_required'.
  cleanupError?: string | null;
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
  // Republication assistee (2026-08-11) : etat des lieux honnete rapporte
  // par vinted-publish.ts UNE FOIS le remplissage automatise termine (voir
  // PUBLISH_PREFILL_SUMMARY) -- `confirmed` n'affiche jamais de coche pour
  // un champ non reellement relu dans le DOM, `pending` liste ce qu'il reste
  // a faire manuellement sur Vinted. Absent tant que le message n'est pas
  // encore arrivé (ou pour toute autre action que publish/republish).
  prefillSummary?: { confirmed: string[]; pending: string[] } | null;
}

function buildRows(
  currentStep: PublishStep | 'done' | 'cleanup_required' | null,
  error: string | null | undefined,
  stepOrder: PublishStep[],
  stepLabels: Record<PublishStep, string>
): ActionStepTimelineRow[] {
  const currentIndex = currentStep ? stepOrder.indexOf(currentStep as PublishStep) : -1;
  return stepOrder.map((step, index) => {
    // 'cleanup_required' : B a bien franchi toutes les etapes reelles de
    // publication (seule la suppression de l'ancienne annonce reste en
    // attente/a echoue) -- les lignes de PUBLICATION restent donc "done",
    // jamais "pending" comme si rien ne s'etait passe.
    const done = !error && (currentStep === 'done' || currentStep === 'cleanup_required' || index < currentIndex);
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
  cleanupError,
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
  prefillSummary,
}: PublishProgressModalProps) {
  const isTerminal = currentStep === 'done' || currentStep === 'cleanup_required' || !!error;

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

      {/* Repositionnement "bouclier anti-bannissement" (2026-08-29) : ligne
          discrete, jamais aussi appuyee que le hint d'action ci-dessus
          (hierarchie primaire/secondaire, playbook C) -- rappelle POURQUOI
          ce clic reste humain, sans repeter l'instruction du hint. */}
      {!isTerminal && hint && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500">
          <ShieldCheck className="w-3 h-3 flex-shrink-0" />
          Ce clic reste le tien — ResellOS ne publie jamais à ta place sur Vinted.
        </p>
      )}

      {prefillSummary && (prefillSummary.confirmed.length > 0 || prefillSummary.pending.length > 0) && (
        <div className="mt-4 bg-dark-400 border border-gray-200 rounded-xl p-3 space-y-3">
          {prefillSummary.confirmed.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Préremplis</p>
              <ul className="space-y-1">
                {prefillSummary.confirmed.map((field) => (
                  <li key={field} className="flex items-center gap-1.5 text-xs text-neon-300">
                    <Check className="w-3.5 h-3.5 text-neon-500 flex-shrink-0" /> {field}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {prefillSummary.pending.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">À confirmer sur Vinted</p>
              <ul className="space-y-1">
                {prefillSummary.pending.map((field) => (
                  <li key={field} className="flex items-center gap-1.5 text-xs text-amber-300">
                    <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center text-amber-400">•</span> {field}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!isTerminal && hint && onOpenVinted && (
        <button
          onClick={onOpenVinted}
          className="w-full mt-3 bg-dark-400 border border-gray-200 text-gray-800 font-semibold py-3 rounded-xl hover:border-neon-500/40 transition-all"
        >
          Ouvrir Vinted
        </button>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {currentStep === 'done' && !error && (
        <p className="mt-4 text-sm text-neon-500 font-semibold">Terminé.</p>
      )}

      {currentStep === 'cleanup_required' && !error && (
        <div className="mt-4 flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-300 font-semibold">Republication presque terminée</p>
            <p className="text-xs text-amber-200/80 mt-1">
              La nouvelle annonce est bien publiée sur Vinted. L'ancienne annonce n'a en revanche pas pu être
              supprimée{cleanupError ? ` (${cleanupError})` : ''} — supprime-la manuellement sur Vinted, ou réessaie la republication.
            </p>
          </div>
        </div>
      )}

      {error && onOpenVinted && (
        <button
          onClick={onOpenVinted}
          className="w-full mt-4 bg-dark-400 border border-gray-200 text-gray-800 font-semibold py-3 rounded-xl hover:border-neon-500/40 transition-all"
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
          className="w-full mt-3 bg-dark-400 border border-gray-200 text-gray-800 font-semibold py-3 rounded-xl hover:border-neon-500/40 transition-all"
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
