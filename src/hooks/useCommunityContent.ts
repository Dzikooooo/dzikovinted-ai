import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { CommunityContent, CommunityContentType, CommunityContentStatus, CommunityResourceKind } from '../lib/types';

export interface CommunityContentInput {
  title: string;
  slug: string;
  excerpt?: string | null;
  body: string;
  cover_image_url?: string | null;
  resource_kind?: CommunityResourceKind | null;
  resource_url?: string | null;
  category?: string | null;
  sort_order?: number;
  status: CommunityContentStatus;
  published_at?: string | null;
}

// Meme pattern que useWatchlist.ts : hook dedie, toute la logique
// Supabase ici, jamais dans la page. La distinction lecteur/admin (un
// non-admin ne voit jamais les brouillons) est geree entierement par la
// policy RLS select_community_content -- ce hook ne filtre rien
// lui-meme sur `status`, il affiche ce que Supabase renvoie reellement.
export function useCommunityContent(type: CommunityContentType) {
  const { user } = useAuth();
  const [items, setItems] = useState<CommunityContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('community_content')
      .select('*')
      .eq('type', type)
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (loadError) {
      console.error(loadError);
      setError('Impossible de charger ce contenu. Réessaie plus tard.');
    } else {
      setError(null);
    }
    setItems((data ?? []) as CommunityContent[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, type]);

  // Publier immediatement ecrit published_at si absent (premiere
  // publication) -- republier plus tard (brouillon -> publie une
  // deuxieme fois) ne rafraichit jamais une date deja posee, meme
  // discipline que "ne jamais reecrire une donnee deja confirmee sans
  // raison" appliquee ailleurs dans ce projet (SKU, listings).
  async function createItem(input: CommunityContentInput): Promise<boolean> {
    if (!user) return false;
    const publishedAt = input.status === 'published' ? (input.published_at ?? new Date().toISOString()) : null;
    const { error: insertError } = await supabase.from('community_content').insert({
      type,
      status: input.status,
      title: input.title,
      slug: input.slug,
      excerpt: input.excerpt ?? null,
      body: input.body,
      cover_image_url: input.cover_image_url ?? null,
      resource_kind: input.resource_kind ?? null,
      resource_url: input.resource_url ?? null,
      category: input.category ?? null,
      sort_order: input.sort_order ?? 0,
      author_id: user.id,
      published_at: publishedAt,
    });
    if (insertError) {
      console.error(insertError);
      setError(
        insertError.code === '23505'
          ? 'Ce slug est déjà utilisé pour ce type de contenu.'
          : "Impossible de publier. Réessaie plus tard."
      );
      return false;
    }
    await load();
    return true;
  }

  async function updateItem(id: string, current: CommunityContent, patch: Partial<CommunityContentInput>): Promise<boolean> {
    const nextStatus = patch.status ?? current.status;
    // Meme regle que createItem : ne pose published_at qu'au moment ou le
    // statut passe reellement a 'published' pour la premiere fois -- une
    // simple mise a jour de contenu sur un item deja publie ne doit jamais
    // deplacer sa date dans le fil (surprise pour les lecteurs qui l'ont
    // deja vu passer).
    const publishedAt =
      nextStatus === 'published' ? (current.published_at ?? patch.published_at ?? new Date().toISOString()) : current.published_at;
    const { error: updateError } = await supabase
      .from('community_content')
      .update({ ...patch, published_at: publishedAt, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (updateError) {
      console.error(updateError);
      setError(
        updateError.code === '23505'
          ? 'Ce slug est déjà utilisé pour ce type de contenu.'
          : 'Impossible de mettre à jour. Réessaie plus tard.'
      );
      return false;
    }
    await load();
    return true;
  }

  async function deleteItem(id: string): Promise<boolean> {
    const { error: deleteError } = await supabase.from('community_content').delete().eq('id', id);
    if (deleteError) {
      console.error(deleteError);
      setError('Impossible de supprimer. Réessaie plus tard.');
      return false;
    }
    await load();
    return true;
  }

  return { items, loading, error, createItem, updateItem, deleteItem, refresh: load };
}
