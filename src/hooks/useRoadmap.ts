import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { RoadmapItem, RoadmapStatus } from '../lib/types';

export interface RoadmapItemInput {
  title: string;
  description: string;
  status: RoadmapStatus;
  sort_order?: number;
}

// Meme pattern que useCommunityContent.ts, en plus simple : pas de
// slug/brouillon-publie, un item roadmap est visible des sa creation
// (voir le plan, section Lot 3).
export function useRoadmap() {
  const { user } = useAuth();
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('roadmap_items')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (loadError) {
      console.error(loadError);
      setError('Impossible de charger la roadmap. Réessaie plus tard.');
    } else {
      setError(null);
    }
    setItems((data ?? []) as RoadmapItem[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function createItem(input: RoadmapItemInput): Promise<boolean> {
    if (!user) return false;
    const { error: insertError } = await supabase.from('roadmap_items').insert({
      title: input.title,
      description: input.description,
      status: input.status,
      sort_order: input.sort_order ?? 0,
      author_id: user.id,
    });
    if (insertError) {
      console.error(insertError);
      setError("Impossible d'ajouter cet élément. Réessaie plus tard.");
      return false;
    }
    await load();
    return true;
  }

  async function updateItem(id: string, patch: Partial<RoadmapItemInput>): Promise<boolean> {
    const { error: updateError } = await supabase
      .from('roadmap_items')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (updateError) {
      console.error(updateError);
      setError('Impossible de mettre à jour cet élément. Réessaie plus tard.');
      return false;
    }
    await load();
    return true;
  }

  async function deleteItem(id: string): Promise<boolean> {
    const { error: deleteError } = await supabase.from('roadmap_items').delete().eq('id', id);
    if (deleteError) {
      console.error(deleteError);
      setError('Impossible de supprimer cet élément. Réessaie plus tard.');
      return false;
    }
    await load();
    return true;
  }

  return { items, loading, error, createItem, updateItem, deleteItem, refresh: load };
}
