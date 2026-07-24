import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVintedAccountFilter } from '../contexts/VintedAccountFilterContext';
import { supabase } from '../lib/supabase';
import { ACTION_KIND_LABELS } from '../lib/actions/labels';
import { computePeriodRange, type ActionPeriod } from '../lib/actions/periodRange';
import type { ActionHistoryStatus, ActionKind } from '../lib/actions/types';

export interface ActionHistoryFilters {
  search: string;
  period: ActionPeriod;
  kind: ActionKind | 'all';
  result: 'all' | 'success' | 'error';
}

export interface ActionHistoryRow {
  id: string;
  kind: ActionKind;
  status: ActionHistoryStatus;
  currentStep: string | null;
  vintedAccountId: string | null;
  vintedAccountLabel: string | null;
  listingId: string | null;
  listingTitle: string | null;
  listingImageUrl: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}

interface RawActionLogRow {
  id: string;
  kind: string;
  status: string;
  current_step: string | null;
  vinted_account_id: string | null;
  listing_id: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  vinted_accounts: { label: string } | null;
  listings: { title: string; image_urls: string[] } | null;
}

function mapRow(row: RawActionLogRow): ActionHistoryRow {
  return {
    id: row.id,
    kind: row.kind as ActionKind,
    status: row.status as ActionHistoryStatus,
    currentStep: row.current_step,
    vintedAccountId: row.vinted_account_id,
    vintedAccountLabel: row.vinted_accounts?.label ?? null,
    listingId: row.listing_id,
    listingTitle: row.listings?.title ?? null,
    listingImageUrl: row.listings?.image_urls?.[0] ?? null,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
  };
}

// Centre des Actions : liste + temps reel. Premier usage de Supabase
// Realtime dans l'app web (voir ARCHITECTURE.md) - distinct de la decision
// "pas de Realtime" prise pour le service worker MV3 de l'extension
// (EXTENSION.md §7), qui concerne un probleme de cycle de vie different.
// S'abonne aux changements de `action_log` pour refleter une action en
// cours meme si elle a ete declenchee depuis un autre onglet/page.
// Nombre de lignes charge par page -- la liste n'etait auparavant bornee
// par aucun `.limit()`/`.range()` (P0 #8 de l'audit pre-lancement,
// 2026-07-10), un historique d'actions grandissant indefiniment avec
// l'usage reel du produit. Purement une pagination d'affichage : les 3
// compteurs (total/succes/erreurs) viennent de requetes `count` separees
// (voir loadCounts), jamais de `rows.length`, pour rester exacts au-dela
// de la premiere page.
const PAGE_SIZE = 30;

// Prend les champs de filtre individuellement (pas l'objet `filters` en bloc)
// pour que les `useCallback` ci-dessous puissent lister des dependances
// primitives stables plutot que l'objet `{ search, period, kind, result }`
// recree a chaque rendu de ActionsPage -- `search` n'est volontairement pas
// un parametre ici, voir le filtre cote client plus bas.
function buildFilteredQuery(
  userId: string,
  selectedAccountId: string,
  kind: ActionKind | 'all',
  result: 'all' | 'success' | 'error',
  period: ActionPeriod,
  selectColumns: string,
  countOnly = false
) {
  let query = supabase
    .from('action_log')
    .select(selectColumns, countOnly ? { count: 'exact', head: true } : undefined)
    .eq('user_id', userId);

  if (selectedAccountId !== 'all') query = query.eq('vinted_account_id', selectedAccountId);
  if (kind !== 'all') query = query.eq('kind', kind);
  if (result !== 'all') query = query.eq('status', result);

  const { from } = computePeriodRange(period);
  if (from) query = query.gte('started_at', from);

  return query;
}

export function useActionHistory(filters: ActionHistoryFilters) {
  const { user } = useAuth();
  const { selectedAccountId } = useVintedAccountFilter();
  const [rows, setRows] = useState<ActionHistoryRow[]>([]);
  const [counts, setCounts] = useState({ total: 0, success: 0, error: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compteurs independants de la pagination -- reproduisent exactement les
  // filtres deja appliques a `rows` (y compris `filters.result`, pour ne
  // pas changer le comportement existant quand un filtre resultat est
  // actif : `success`/`error` retombent alors sur les memes valeurs que
  // `total`, comme avant ce correctif).
  const loadCounts = useCallback(async () => {
    if (!user) return;
    const [totalRes, successRes, errorRes] = await Promise.all([
      buildFilteredQuery(user.id, selectedAccountId, filters.kind, filters.result, filters.period, '*', true),
      buildFilteredQuery(user.id, selectedAccountId, filters.kind, filters.result, filters.period, '*', true).eq(
        'status',
        'success'
      ),
      buildFilteredQuery(user.id, selectedAccountId, filters.kind, filters.result, filters.period, '*', true).eq(
        'status',
        'error'
      ),
    ]);
    setCounts({ total: totalRes.count ?? 0, success: successRes.count ?? 0, error: errorRes.count ?? 0 });
  }, [user, selectedAccountId, filters.kind, filters.result, filters.period]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const query = buildFilteredQuery(
      user.id,
      selectedAccountId,
      filters.kind,
      filters.result,
      filters.period,
      'id, kind, status, current_step, vinted_account_id, listing_id, error_message, started_at, completed_at, duration_ms, vinted_accounts(label), listings(title, image_urls)'
    )
      .order('started_at', { ascending: false })
      .range(0, PAGE_SIZE - 1);

    const { data, error: queryError } = await query;
    if (queryError) {
      console.error(queryError);
      setError("Impossible de charger l'historique des actions. Réessaie plus tard.");
    } else {
      setError(null);
      const mapped = (data as unknown as RawActionLogRow[]).map(mapRow);
      setRows(mapped);
      setHasMore(mapped.length === PAGE_SIZE);
    }
    setLoading(false);
    void loadCounts();
  }, [user, selectedAccountId, filters.kind, filters.result, filters.period, loadCounts]);

  const loadMore = useCallback(async () => {
    if (!user || loadingMore || !hasMore) return;
    setLoadingMore(true);

    const query = buildFilteredQuery(
      user.id,
      selectedAccountId,
      filters.kind,
      filters.result,
      filters.period,
      'id, kind, status, current_step, vinted_account_id, listing_id, error_message, started_at, completed_at, duration_ms, vinted_accounts(label), listings(title, image_urls)'
    )
      .order('started_at', { ascending: false })
      .range(rows.length, rows.length + PAGE_SIZE - 1);

    const { data, error: queryError } = await query;
    if (queryError) {
      console.error(queryError);
      setError("Impossible de charger la suite de l'historique. Réessaie plus tard.");
    } else {
      const mapped = (data as unknown as RawActionLogRow[]).map(mapRow);
      setRows((prev) => [...prev, ...mapped]);
      setHasMore(mapped.length === PAGE_SIZE);
    }
    setLoadingMore(false);
  }, [user, selectedAccountId, filters.kind, filters.result, filters.period, rows.length, loadingMore, hasMore]);

  useEffect(() => {
    void load();
  }, [load]);

  // Combien de lignes etaient deja chargees (via loadMore) au moment d'un
  // evenement Realtime -- lu par `refresh` ci-dessous pour re-synchroniser
  // sans faire regresser silencieusement la pagination de l'utilisateur a
  // la premiere page a chaque changement (ex. une autre action qui progresse).
  const loadedCountRef = useRef(0);
  useEffect(() => {
    loadedCountRef.current = rows.length;
  }, [rows.length]);

  const refresh = useCallback(async () => {
    if (!user) return;
    const count = Math.max(loadedCountRef.current, PAGE_SIZE);
    const query = buildFilteredQuery(
      user.id,
      selectedAccountId,
      filters.kind,
      filters.result,
      filters.period,
      'id, kind, status, current_step, vinted_account_id, listing_id, error_message, started_at, completed_at, duration_ms, vinted_accounts(label), listings(title, image_urls)'
    )
      .order('started_at', { ascending: false })
      .range(0, count - 1);

    const { data, error: queryError } = await query;
    if (!queryError && data) {
      const mapped = (data as unknown as RawActionLogRow[]).map(mapRow);
      setRows(mapped);
      setHasMore(mapped.length === count);
    }
    void loadCounts();
  }, [user, selectedAccountId, filters.kind, filters.result, filters.period, loadCounts]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`action_log_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'action_log', filter: `user_id=eq.${user.id}` },
        () => void refresh()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  // Filtre cote client, volontairement instantane (pas de requete reseau a
  // chaque frappe) -- limite honnete introduite par la pagination : ne
  // cherche que parmi les lignes deja chargees (premiere page + eventuels
  // "Charger plus"), pas sur tout l'historique. Un vrai filtre serveur
  // (ilike sur listings.title + kind) reste un chantier separe si cette
  // limite s'avere genante en usage reel.
  const searchTerm = filters.search.trim().toLowerCase();
  const filteredRows = searchTerm
    ? rows.filter(
        (row) =>
          (row.listingTitle ?? '').toLowerCase().includes(searchTerm) ||
          ACTION_KIND_LABELS[row.kind].toLowerCase().includes(searchTerm)
      )
    : rows;

  return { rows: filteredRows, counts, hasMore, loading, loadingMore, error, refetch: load, loadMore };
}

export interface ActionLogEntryRow {
  id: string;
  step: string | null;
  message: string;
  at: string;
}

// Journal detaille d'une action - chargement + temps reel scopes a une
// seule action (ouverte dans le panneau de detail), pour rejouer et suivre
// sa progression en direct meme si elle a ete demarree ailleurs.
export function useActionLogEntries(actionId: string | null) {
  const [entries, setEntries] = useState<ActionLogEntryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!actionId) {
      setEntries([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('action_log_entries')
      .select('id, step, message, at')
      .eq('action_id', actionId)
      .order('at', { ascending: true });
    if (!error && data) setEntries(data as ActionLogEntryRow[]);
    setLoading(false);
  }, [actionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!actionId) return;
    const channel = supabase
      .channel(`action_log_entries_${actionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'action_log_entries', filter: `action_id=eq.${actionId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [actionId, load]);

  return { entries, loading };
}
