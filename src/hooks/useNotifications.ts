import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { AppNotification, DashboardPage } from '../lib/types';

// Fenetre de recap raisonnable -- au-dela, une notification (vente,
// nouveaute Communaute) n'est plus vraiment "recente" et encombrerait le
// popup d'ouverture sans rien apporter (demande produit 2026-08-04).
const RECAP_WINDOW_DAYS = 30;

// Notifications perso (ventes) + diffusions (nouveau contenu Communaute,
// diffusion admin) -- le tri lu/non-lu se fait cote client via
// notification_reads (jamais un flag sur la ligne notifications elle-meme,
// puisqu'une diffusion est partagee par tout le monde). Aucune donnee
// inventee : chaque notification vient d'un evenement reel (vente
// effectivement enregistree, contenu Communaute effectivement publie par
// un admin, ou envoi explicite depuis le panel admin).
export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const since = new Date(Date.now() - RECAP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: notifRows }, { data: readRows }] = await Promise.all([
      supabase.from('notifications').select('*').gte('created_at', since).order('created_at', { ascending: false }),
      supabase.from('notification_reads').select('notification_id').eq('user_id', user.id),
    ]);
    setNotifications((notifRows ?? []) as AppNotification[]);
    setReadIds(new Set((readRows ?? []).map((r) => r.notification_id as string)));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const unread = notifications.filter((n) => !readIds.has(n.id));

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!user || readIds.has(notificationId)) return;
      setReadIds((prev) => new Set(prev).add(notificationId));
      const { error } = await supabase
        .from('notification_reads')
        .insert({ notification_id: notificationId, user_id: user.id });
      if (error) console.error(error);
    },
    [user, readIds]
  );

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const toMark = unread.map((n) => n.id);
    if (toMark.length === 0) return;
    setReadIds((prev) => {
      const next = new Set(prev);
      toMark.forEach((id) => next.add(id));
      return next;
    });
    const { error } = await supabase
      .from('notification_reads')
      .insert(toMark.map((id) => ({ notification_id: id, user_id: user.id })));
    if (error) console.error(error);
  }, [user, unread]);

  return { notifications, unread, loading, markRead, markAllRead, refresh: load };
}

// Vente reelle enregistree (voir ListingsManagementSection.tsx::markAsSold) --
// notification personnelle, jamais pour le compte d'un autre utilisateur
// (RLS : type='sale' and user_id=auth.uid()).
export async function notifySale(userId: string, listingTitle: string, soldPrice: number) {
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type: 'sale',
    title: 'Vente enregistrée',
    body: `"${listingTitle}" vendu pour ${soldPrice} €.`,
    target_page: 'watchlist' as DashboardPage,
  });
  if (error) console.error(error);
}

// Nouveau contenu Communaute publie par un admin -- diffuse a tout le
// monde (user_id null). RLS : type='community' reserve a is_admin().
export async function notifyCommunityPublish(title: string) {
  const { error } = await supabase.from('notifications').insert({
    user_id: null,
    type: 'community',
    title: 'Nouveauté publiée',
    body: title,
    target_page: 'community' as DashboardPage,
  });
  if (error) console.error(error);
}
