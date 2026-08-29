import { useState } from 'react';
import { Bot, ArrowRight } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useNotifications } from '../../hooks/useNotifications';
import { NOTIFICATION_TYPE_STYLE } from './notificationTypeStyle';
import type { AppNotification, DashboardPage } from '../../lib/types';

interface NotificationRecapModalProps {
  onNavigate: (page: DashboardPage) => void;
}

// Recap "Dziko IA" a l'ouverture/rafraichissement du dashboard -- ne
// s'affiche que s'il reste reellement des notifications non lues (ventes
// enregistrees, nouveau contenu Communaute publie, diffusion admin), rien
// n'est jamais invente ici : le contenu vient exclusivement de la table
// notifications, remplie par de vrais evenements (demande produit
// 2026-08-04).
export function NotificationRecapModal({ onNavigate }: NotificationRecapModalProps) {
  const { unread, loading, markRead, markAllRead } = useNotifications();
  const [dismissed, setDismissed] = useState(false);

  if (loading || dismissed || unread.length === 0) return null;

  const handleView = (n: AppNotification) => {
    markRead(n.id);
    if (n.target_page) {
      // Meme deep-link que NotificationBell.tsx -- voir son commentaire.
      if (n.target_page === 'admin') sessionStorage.setItem('resellos:adminTab', 'messages');
      onNavigate(n.target_page);
    }
    setDismissed(true);
  };

  const handleCloseAll = () => {
    markAllRead();
    setDismissed(true);
  };

  return (
    <Modal onClose={() => setDismissed(true)} size="sm">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-neon-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <Bot className="w-5 h-5 text-neon-500" />
        </div>
        <div>
          <p className="font-bold text-sm">Dziko IA</p>
          <p className="text-xs text-gray-500">
            {unread.length} nouvelle{unread.length > 1 ? 's' : ''} notification{unread.length > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="space-y-2.5 max-h-80 overflow-y-auto mb-5">
        {unread.map((n) => {
          const { icon: Icon, bg, text } = NOTIFICATION_TYPE_STYLE[n.type];
          return (
            <button
              key={n.id}
              onClick={() => handleView(n)}
              className="w-full text-left bg-surface border border-gray-200 rounded-xl p-3.5 hover:border-neon-500/30 transition-all flex items-start gap-3"
            >
              <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-4 h-4 ${text}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800 truncate">{n.title}</p>
                {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
              </div>
              {n.target_page && <ArrowRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-1" />}
            </button>
          );
        })}
      </div>

      <button
        onClick={handleCloseAll}
        className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors py-2"
      >
        Tout marquer comme lu
      </button>
    </Modal>
  );
}
