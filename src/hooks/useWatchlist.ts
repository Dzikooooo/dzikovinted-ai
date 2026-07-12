import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { WatchlistEntry } from '../lib/types';

const DEFAULT_MIN_PROFIT = 20;
const DEFAULT_MIN_ROI = 50;

export interface WatchlistEntryInput {
  brand: string;
  model: string;
  category: string;
  priority: number;
  min_profit?: number;
  min_roi?: number;
}

export function useWatchlist() {
  const { user } = useAuth();
  const [myEntries, setMyEntries] = useState<WatchlistEntry[]>([]);
  const [platformEntries, setPlatformEntries] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadWatchlist() {
    if (!user) return;
    setLoading(true);
    const [{ data: mine, error: mineError }, { data: platform, error: platformError }] = await Promise.all([
      supabase.from('watchlist').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('watchlist').select('*').is('user_id', null).order('brand'),
    ]);
    const firstError = mineError || platformError;
    if (firstError) {
      console.error(firstError);
      setError('Impossible de charger la watchlist. Réessaie plus tard.');
    } else {
      setError(null);
    }
    setMyEntries((mine ?? []) as WatchlistEntry[]);
    setPlatformEntries((platform ?? []) as WatchlistEntry[]);
    setLoading(false);
  }

  useEffect(() => {
    loadWatchlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function addEntry(input: WatchlistEntryInput) {
    if (!user) return;
    const { error: insertError } = await supabase.from('watchlist').insert({
      user_id: user.id,
      brand: input.brand,
      model: input.model,
      category: input.category,
      priority: input.priority,
      min_profit: input.min_profit ?? DEFAULT_MIN_PROFIT,
      min_roi: input.min_roi ?? DEFAULT_MIN_ROI,
    });
    if (insertError) {
      console.error(insertError);
      setError("Impossible d'ajouter cette recherche. Réessaie plus tard.");
      return;
    }
    await loadWatchlist();
  }

  async function updateEntry(id: string, patch: Partial<WatchlistEntryInput>) {
    const { error: updateError } = await supabase.from('watchlist').update(patch).eq('id', id);
    if (updateError) {
      console.error(updateError);
      setError('Impossible de modifier cette recherche. Réessaie plus tard.');
      return;
    }
    await loadWatchlist();
  }

  async function toggleActive(id: string, active: boolean) {
    const { error: toggleError } = await supabase.from('watchlist').update({ active }).eq('id', id);
    if (toggleError) {
      console.error(toggleError);
      setError('Impossible de mettre à jour cette recherche. Réessaie plus tard.');
      return;
    }
    await loadWatchlist();
  }

  async function deleteEntry(id: string) {
    const { error: deleteError } = await supabase.from('watchlist').delete().eq('id', id);
    if (deleteError) {
      console.error(deleteError);
      setError('Impossible de supprimer cette recherche. Réessaie plus tard.');
      return;
    }
    await loadWatchlist();
  }

  return { myEntries, platformEntries, loading, error, addEntry, updateEntry, toggleActive, deleteEntry };
}
