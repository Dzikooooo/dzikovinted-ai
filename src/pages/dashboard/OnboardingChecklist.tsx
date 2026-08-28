import { Check, Puzzle, Sparkles, RefreshCw } from 'lucide-react';
import type { DashboardPage } from '../../lib/types';
import { BRAND_VIOLET } from '../../lib/brandColors';

// FTUE minimal (audit 2026-08-28, section 3 "UX/Produit" -- "aucun flux de
// premiere utilisation guide n'existe"). Deux etapes reelles seulement,
// derivees de donnees DEJA chargees par DashboardHome (accounts du contexte,
// listings deja fetches) -- aucune nouvelle requete, aucun etat persiste
// (pas de "ne plus jamais afficher" en base ou en localStorage) : la
// checklist disparait d'elle-meme des que les deux conditions reelles sont
// remplies, jamais besoin d'un mecanisme de fermeture separe a maintenir.
//
// Volontairement PAS un tunnel bloquant ni une modale : un nouvel
// utilisateur peut toujours ignorer ces deux etapes et naviguer librement --
// coherent avec le reste du produit (rien n'est jamais impose).

interface OnboardingChecklistProps {
  hasAccount: boolean;
  hasAnyListing: boolean;
  onNavigate: (page: DashboardPage) => void;
}

export function OnboardingChecklist({ hasAccount, hasAnyListing, onNavigate }: OnboardingChecklistProps) {
  if (hasAccount && hasAnyListing) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-surface p-5 mb-6">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Pour démarrer</p>
      <div className="space-y-3">
        <Step
          done={hasAccount}
          icon={Puzzle}
          label="Connecte ton compte Vinted"
          description="Installe l'extension ResellOS et détecte ton compte en un instant."
          actionLabel="Connecter"
          onAction={() => onNavigate('vinted-account')}
        />
        <Step
          done={hasAnyListing}
          icon={hasAccount ? RefreshCw : Sparkles}
          label="Récupère tes premières annonces"
          description={
            hasAccount
              ? 'Synchronise ce que tu as déjà en ligne sur Vinted, ou génère une fiche avec l\'IA.'
              : 'Connecte d\'abord ton compte Vinted (étape 1), ou génère directement une fiche avec l\'IA.'
          }
          actionLabel={hasAccount ? 'Synchroniser' : undefined}
          onAction={hasAccount ? () => onNavigate('vinted-account') : undefined}
          secondaryLabel="Générer avec l'IA"
          onSecondaryAction={() => onNavigate('generator')}
        />
      </div>
    </div>
  );
}

function Step({
  done,
  icon: Icon,
  label,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondaryAction,
}: {
  done: boolean;
  icon: typeof Puzzle;
  label: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
          done ? 'bg-neon-500' : 'bg-white border border-gray-200'
        }`}
      >
        {done ? <Check className="w-3.5 h-3.5 text-white" /> : <Icon className="w-3.5 h-3.5" style={{ color: BRAND_VIOLET }} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{label}</p>
        {!done && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        {!done && (actionLabel || secondaryLabel) && (
          <div className="flex items-center gap-3 mt-2">
            {actionLabel && onAction && (
              <button onClick={onAction} className="text-xs font-bold text-neon-500 hover:text-neon-400">
                {actionLabel}
              </button>
            )}
            {secondaryLabel && onSecondaryAction && (
              <button onClick={onSecondaryAction} className="text-xs font-bold text-gray-500 hover:text-gray-900">
                {secondaryLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
