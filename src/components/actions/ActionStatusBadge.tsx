import { Badge, type BadgeTone } from '../ui/Badge';
import type { ActionHistoryStatus } from '../../lib/actions/types';

// Meme primitive que VintedStatusBadge.tsx (src/components/ui/Badge.tsx) -
// un badge par statut du cycle de vie de l'Action Engine.
const STATUS_STYLES: Record<ActionHistoryStatus, { label: string; tone: BadgeTone }> = {
  pending_confirmation: { label: 'En attente', tone: 'warning' },
  success: { label: 'Terminée', tone: 'positive' },
  error: { label: 'Erreur', tone: 'negative' },
  cancelled: { label: 'Annulée', tone: 'neutral' },
  not_implemented: { label: 'Non disponible', tone: 'neutral' },
};

export default function ActionStatusBadge({ status }: { status: ActionHistoryStatus }) {
  const style = STATUS_STYLES[status];
  if (!style) return null;
  return <Badge label={style.label} tone={style.tone} />;
}
