import { TrendingUp, Megaphone, Bell, MessageCircle, AlertTriangle } from 'lucide-react';
import type { NotificationType } from '../../lib/types';

// Extrait de NotificationRecapModal.tsx (2026-08-29, ajout de NotificationBell.tsx)
// -- fichier dedie plutot qu'une constante partagee exportee d'un composant,
// pour eviter l'avertissement react-refresh/only-export-components et
// garder un seul point de verite pour l'icone/couleur de chaque type.
export const NOTIFICATION_TYPE_STYLE: Record<NotificationType, { icon: typeof TrendingUp; bg: string; text: string }> = {
  sale: { icon: TrendingUp, bg: 'bg-green-500/10', text: 'text-green-400' },
  community: { icon: Megaphone, bg: 'bg-yellow-400/10', text: 'text-yellow-400' },
  admin_broadcast: { icon: Bell, bg: 'bg-neon-500/10', text: 'text-neon-500' },
  ticket_reply: { icon: MessageCircle, bg: 'bg-blue-400/10', text: 'text-blue-400' },
  stock_alert: { icon: AlertTriangle, bg: 'bg-orange-400/10', text: 'text-orange-400' },
};
