import { useCallback, useEffect, useState } from 'react';
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
export function useActionHistory(filters: ActionHistoryFilters) {
  const { user } = useAuth();
  const { selectedAccountId } = useVintedAccountFilter();
  const [rows, setRows] = useState<ActionHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let query = supabase
      .from('action_log')
      .select(
        'id, kind, status, current_step, vinted_account_id, listing_id, error_message, started_at, completed_at, duration_ms, vinted_accounts(label), listings(title, image_urls)'
      )
      .eq('user_id', user.id)
      .order('started_at', { ascending: false });

    if (selectedAccountId !== 'all') query = query.eq('vinted_account_id', selectedAccountId);
    if (filters.kind !== 'all') query = query.eq('kind', filters.kind);
    if (filters.result !== 'all') query = query.eq('status', filters.result);

    const { from } = computePeriodRange(filters.period);
    if (from) query = query.gte('started_at', from);

    const { data, error: queryError } = await query;
    if (queryError) {
      console.error(queryError);
      setError("Impossible de charger l'historique des actions. Réessaie plus tard.");
    } else {
      setError(null);
      setRows((data as unknown as RawActionLogRow[]).map(mapRow));
    }
    setLoading(false);
  }, [user, selectedAccountId, filters.kind, filters.result, filters.period]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`action_log_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'action_log', filter: `user_id=eq.${user.id}` },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  const searchTerm = filters.search.trim().toLowerCase();
  const filteredRows = searchTerm
    ? rows.filter(
        (row) =>
          (row.listingTitle ?? '').toLowerCase().includes(searchTerm) ||
          ACTION_KIND_LABELS[row.kind].toLowerCase().includes(searchTerm)
      )
    : rows;

  return { rows: filteredRows, loading, error, refetch: load };
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
