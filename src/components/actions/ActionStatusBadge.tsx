import type { ActionHistoryStatus } from '../../lib/actions/types';

// Meme pattern que VintedStatusBadge.tsx (src/components/ui/) - un badge
// par statut du cycle de vie de l'Action Engine.
const STATUS_STYLES: Record<ActionHistoryStatus, { label: string; bg: string; text: string }> = {
  pending_confirmation: { label: 'En attente', bg: 'bg-amber-400/10', text: 'text-amber-400' },
  success: { label: 'Terminée', bg: 'bg-neon-500/10', text: 'text-neon-500' },
  error: { label: 'Erreur', bg: 'bg-red-500/10', text: 'text-red-400' },
  cancelled: { label: 'Annulée', bg: 'bg-white/10', text: 'text-gray-400' },
  not_implemented: { label: 'Non disponible', bg: 'bg-white/10', text: 'text-gray-400' },
};

export default function ActionStatusBadge({ status }: { status: ActionHistoryStatus }) {
  const style = STATUS_STYLES[status];
  if (!style) return null;
  return (
    <span className={`text-[10px] font-bold ${style.text} ${style.bg} px-1.5 py-0.5 rounded-md flex-shrink-0`}>
      {style.label}
    </span>
  );
}
