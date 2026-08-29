import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, CheckCheck, Trash2 } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { NOTIFICATION_TYPE_STYLE } from './notificationTypeStyle';
import type { AppNotification, DashboardPage } from '../../lib/types';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

// Centre de notifications (demande produit 2026-08-29) : cloche + tiroir
// deroulant dans l'en-tete du dashboard, distinct de NotificationRecapModal
// (popup UNIQUE a l'ouverture, jamais reconsultable ensuite) -- ce composant
// est la vue PERSISTANTE, toujours accessible, classee chronologiquement
// (lu ET non-lu, contrairement au recap qui ne montre que le non-lu).
export function NotificationBell({ onNavigate }: { onNavigate: (page: DashboardPage) => void }) {
  const { notifications, unread, loading, markRead, markAllRead, clearAll, permission, requestPermission } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fermeture au clic exterieur : meme pattern que DatePicker.tsx (seul
  // autre dropdown "flottant" du produit), un menu natif se fermerait seul,
  // celui-ci non.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const handleOpenNotification = (n: AppNotification) => {
    void markRead(n.id);
    if (n.target_page) {
      // Deep-link vers l'onglet Messages (meme technique que
      // resellos:blogSection/resellos:dashboardPage) : une notification
      // "nouveau message" cible deja target_page='admin' (voir
      // notify_on_user_ticket_message) -- ouvre directement le bon onglet
      // plutot que de laisser l'admin chercher dans Administration.
      if (n.target_page === 'admin') sessionStorage.setItem('resellos:adminTab', 'messages');
      onNavigate(n.target_page);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-5 h-5 text-gray-500" />
        {unread.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold leading-none">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-96 bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden animate-slide-down">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <p className="text-sm font-bold text-gray-900">Notifications</p>
            <div className="flex items-center gap-1">
              {unread.length > 0 && (
                <button
                  onClick={() => void markAllRead()}
                  aria-label="Tout marquer comme lu"
                  title="Tout marquer comme lu"
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  aria-label="Tout effacer"
                  title="Tout effacer"
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Notifications bureau (Web Notifications API, demande 2026-08-29) :
              proposee seulement tant que la permission n'a jamais ete
              tranchee ('default') -- jamais reproposee si l'utilisateur a
              deja refuse ('denied'), et invisible si deja accordee. */}
          {permission === 'default' && (
            <button
              onClick={() => void requestPermission()}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-xs text-gray-500 hover:bg-gray-50 border-b border-gray-200 transition-colors"
            >
              <BellOff className="w-3.5 h-3.5 flex-shrink-0" />
              Recevoir aussi ces notifications sur ton bureau, même onglet fermé au premier plan.
              <span className="ml-auto font-semibold text-neon-500 flex-shrink-0">Activer</span>
            </button>
          )}

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-sm text-gray-500">Chargement...</div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">Aucune notification.</div>
            ) : (
              <div className="divide-y divide-gray-200">
                {notifications.map((n) => {
                  const isUnread = unread.some((u) => u.id === n.id);
                  const { icon: Icon, bg, text } = NOTIFICATION_TYPE_STYLE[n.type];
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleOpenNotification(n)}
                      className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors ${
                        isUnread ? 'bg-neon-500/5' : ''
                      }`}
                    >
                      <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-4 h-4 ${text}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm truncate ${isUnread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                          {n.title}
                        </p>
                        {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                        <p className="text-[10px] text-gray-500 mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                      {isUnread && <span className="w-2 h-2 rounded-full bg-neon-500 flex-shrink-0 mt-1.5" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
