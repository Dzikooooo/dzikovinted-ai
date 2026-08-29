import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { AppNotification, DashboardPage } from '../lib/types';

// Fenetre de recap raisonnable -- au-dela, une notification (vente,
// nouveaute Communaute) n'est plus vraiment "recente" et encombrerait le
// popup d'ouverture sans rien apporter (demande produit 2026-08-04).
const RECAP_WINDOW_DAYS = 30;

// "Tout effacer" (centre de notifications, 2026-08-29) : la liste VISIBLE
// se vide localement, jamais en base -- voir clearAll() plus bas pour la
// raison (diffusions partagees). Namespace par utilisateur : deux comptes
// sur le meme navigateur ne doivent jamais se melanger.
const DISMISSED_STORAGE_PREFIX = 'resellos:notif_dismissed:';

function loadDismissed(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_STORAGE_PREFIX + userId);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_STORAGE_PREFIX + userId, JSON.stringify([...ids]));
  } catch {
    // Stockage indisponible (navigation privee, quota plein...) -- un
    // confort d'affichage ne doit jamais lever d'erreur bloquante.
  }
}

// Notifications perso (ventes, alertes stock) + diffusions (nouveau
// contenu Communaute, diffusion admin, reponse a un ticket de support) --
// le tri lu/non-lu se fait cote client via notification_reads (jamais un
// flag sur la ligne notifications elle-meme, puisqu'une diffusion est
// partagee par tout le monde). Aucune donnee inventee : chaque notification
// vient d'un evenement reel (vente effectivement enregistree, contenu
// Communaute effectivement publie par un admin, reponse de support
// effectivement postee, alerte stock effectivement calculee par
// src/lib/insights/alerts.ts, ou envoi explicite depuis le panel admin).
export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  // null = premier chargement pas encore fait -- distingue "rien n'est
  // encore arrive" de "tout ce qui est charge est deja connu", pour ne
  // jamais notifier tout le backlog au montage (voir load() ci-dessous).
  const seenIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (user) setDismissedIds(loadDismissed(user.id));
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const since = new Date(Date.now() - RECAP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: notifRows }, { data: readRows }] = await Promise.all([
      supabase.from('notifications').select('*').gte('created_at', since).order('created_at', { ascending: false }),
      supabase.from('notification_reads').select('notification_id').eq('user_id', user.id),
    ]);
    const rows = (notifRows ?? []) as AppNotification[];
    setNotifications(rows);
    setReadIds(new Set((readRows ?? []).map((r) => r.notification_id as string)));

    // Notification bureau (Web Notifications API, demande 2026-08-29) : ne
    // declenche jamais pour le backlog du tout premier chargement -- seules
    // les lignes reellement nouvelles depuis le dernier chargement connu,
    // et seulement si l'onglet est en arriere-plan (au premier plan, le
    // centre de notifications lui-meme suffit).
    if (seenIdsRef.current) {
      const previouslySeen = seenIdsRef.current;
      const freshlyArrived = rows.filter((n) => !previouslySeen.has(n.id));
      if (freshlyArrived.length > 0 && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        for (const n of freshlyArrived) {
          new Notification(n.title, { body: n.body ?? undefined });
        }
      }
    }
    seenIdsRef.current = new Set(rows.map((n) => n.id));

    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime : une notification (vente, diffusion admin, reponse de
  // support, alerte stock) doit apparaitre sans recharger la page -- meme
  // discipline que useSupportTickets.ts (RLS reste la seule vraie
  // frontiere sur ce que le canal peut effectivement transmettre).
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }, []);

  const unread = notifications.filter((n) => !readIds.has(n.id));
  const visible = notifications.filter((n) => !dismissedIds.has(n.id));

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

  // "Tout effacer" (demande produit 2026-08-29) : vide la liste VISIBLE
  // localement plutot que de supprimer les lignes en base -- une
  // notification peut etre une diffusion partagee par tous les
  // utilisateurs (user_id null) ; la supprimer effacerait le contenu pour
  // tout le monde, pas seulement pour soi. Marque aussi tout comme lu : le
  // badge doit retomber a 0 en meme temps que la liste se vide.
  const clearAll = useCallback(() => {
    if (!user) return;
    void markAllRead();
    const next = new Set(dismissedIds);
    notifications.forEach((n) => next.add(n.id));
    setDismissedIds(next);
    saveDismissed(user.id, next);
  }, [user, notifications, dismissedIds, markAllRead]);

  return {
    notifications: visible,
    unread,
    loading,
    markRead,
    markAllRead,
    clearAll,
    refresh: load,
    permission,
    requestPermission,
  };
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

// Alerte produit/stock reelle (demande centre de notifications, 2026-08-29)
// -- src/lib/insights/alerts.ts recalcule ces alertes a CHAQUE chargement
// du dashboard, sans etat ni identifiant stable : sans garde-fou, la meme
// alerte (ex. "12 annonces dorment") redeclencherait une notification a
// chaque visite. Dedoublonnage simple et suffisant pour ce cas d'usage :
// une seule notification par TITRE identique et par jour civil -- pas une
// solution parfaite en cas d'onglets multiples ouverts simultanement, mais
// une alerte stock n'a aucun enjeu de securite a etre dupliquee rarement,
// contrairement a un paiement ou une suppression de compte.
export async function notifyStockAlert(userId: string, title: string, body: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data: existing, error: checkError } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'stock_alert')
    .eq('title', title)
    .gte('created_at', startOfDay.toISOString())
    .limit(1);
  if (checkError) {
    console.error(checkError);
    return;
  }
  if (existing && existing.length > 0) return;

  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type: 'stock_alert',
    title,
    body,
    target_page: 'watchlist' as DashboardPage,
  });
  if (error) console.error(error);
}
