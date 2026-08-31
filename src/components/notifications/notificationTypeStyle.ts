import { TrendingUp, Megaphone, Bell, MessageCircle, AlertTriangle, CheckCircle2, XCircle, UserPlus, PackagePlus } from 'lucide-react';
import type { NotificationType } from '../../lib/types';

// Extrait de NotificationRecapModal.tsx (2026-08-29, ajout de NotificationBell.tsx)
// -- fichier dedie plutot qu'une constante partagee exportee d'un composant,
// pour eviter l'avertissement react-refresh/only-export-components et
// garder un seul point de verite pour l'icone/couleur de chaque type.
//
// Paliers 700 (2026-08-31, au fil de l'eau -- fichier ouvert pour ajouter
// 'auto_sync_new_listing', voir [[project_dark_theme_color_leftovers]]) :
// green-400/yellow-400/red-400 mesuraient tous sous le seuil WCAG AA sur
// fond clair -- remontes au meme palier deja applique ailleurs (Badge.tsx,
// meme jour). orange-400/blue-400 non touches : hors perimetre de l'audit
// documente, pas verifies ici.
export const NOTIFICATION_TYPE_STYLE: Record<NotificationType, { icon: typeof TrendingUp; bg: string; text: string }> = {
  sale: { icon: TrendingUp, bg: 'bg-green-500/10', text: 'text-green-700' },
  community: { icon: Megaphone, bg: 'bg-yellow-400/10', text: 'text-yellow-700' },
  admin_broadcast: { icon: Bell, bg: 'bg-neon-500/10', text: 'text-neon-500' },
  ticket_reply: { icon: MessageCircle, bg: 'bg-blue-400/10', text: 'text-blue-400' },
  stock_alert: { icon: AlertTriangle, bg: 'bg-orange-400/10', text: 'text-orange-400' },
  // Distincts de 'stock_alert' (2026-08-29) : une icone de succes ne doit
  // jamais reprendre le triangle d'avertissement de l'alerte "stock dormant"
  // -- voir notify_on_vinted_sync_status_change (migration 20260829150000).
  sync_success: { icon: CheckCircle2, bg: 'bg-green-500/10', text: 'text-green-700' },
  sync_failed: { icon: XCircle, bg: 'bg-red-500/10', text: 'text-red-700' },
  waitlist_signup: { icon: UserPlus, bg: 'bg-blue-400/10', text: 'text-blue-400' },
  // Icone distincte de sync_success/sync_failed (2026-08-31) : ceux-ci
  // concernent un article DEJA CONNU dont le statut se synchronise, ici
  // l'article lui-meme vient d'apparaitre pour la premiere fois -- indigo
  // choisi car libre de toute signification deja prise dans cette table
  // (jamais teal/VINTED_INK ici : reserve aux elements designant reellement
  // Vinted, voir CLAUDE.md).
  auto_sync_new_listing: { icon: PackagePlus, bg: 'bg-indigo-500/10', text: 'text-indigo-600' },
};
