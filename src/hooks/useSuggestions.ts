import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Suggestion, SuggestionStatus } from '../lib/types';

export interface SuggestionWithVote extends Suggestion {
  // true si l'utilisateur courant a upvote cette suggestion -- jamais le
  // vote des autres (suggestion_votes n'est jamais lu en liste, meme
  // discipline que poll_votes).
  votedByMe: boolean;
}

// Tri par upvotes decroissant (pas par date) -- une suggestion pertinente
// mais ancienne doit rester visible si elle est plus votee qu'une
// suggestion recente isolee (voir le plan, section Inspiration).
export function useSuggestions() {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<SuggestionWithVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [suggestionsRes, votesRes] = await Promise.all([
      supabase.from('suggestions').select('*').order('votes_count', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('suggestion_votes').select('suggestion_id').eq('user_id', user.id),
    ]);
    if (suggestionsRes.error || votesRes.error) {
      console.error(suggestionsRes.error ?? votesRes.error);
      setError('Impossible de charger les suggestions. Réessaie plus tard.');
      setLoading(false);
      return;
    }
    setError(null);
    const myVotedIds = new Set(((votesRes.data ?? []) as { suggestion_id: string }[]).map((v) => v.suggestion_id));
    const combined = ((suggestionsRes.data ?? []) as Suggestion[]).map((s) => ({ ...s, votedByMe: myVotedIds.has(s.id) }));
    setSuggestions(combined);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`community_suggestions_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suggestions' }, () => void load())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'suggestion_votes', filter: `user_id=eq.${user.id}` },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  // Toute personne authentifiee peut soumettre -- pas de garde admin ici,
  // voir le commentaire en tete de la migration 20260727140000.
  async function createSuggestion(title: string, description: string): Promise<boolean> {
    if (!user) return false;
    const { error: insertError } = await supabase.from('suggestions').insert({
      title,
      description,
      author_id: user.id,
    });
    if (insertError) {
      console.error(insertError);
      setError("Impossible d'envoyer ta suggestion. Réessaie plus tard.");
      return false;
    }
    await load();
    return true;
  }

  async function toggleVote(suggestionId: string, currentlyVoted: boolean): Promise<boolean> {
    if (!user) return false;
    const { error: mutationError } = currentlyVoted
      ? await supabase.from('suggestion_votes').delete().eq('suggestion_id', suggestionId).eq('user_id', user.id)
      : await supabase.from('suggestion_votes').insert({ suggestion_id: suggestionId, user_id: user.id });
    if (mutationError) {
      console.error(mutationError);
      setError('Impossible d\'enregistrer ton vote. Réessaie plus tard.');
      return false;
    }
    await load();
    return true;
  }

  // Admin uniquement (impose par la policy update_admin_suggestions) --
  // useIsAdmin() cote UI n'est qu'une commodite d'affichage, la RLS reste
  // la seule frontiere de securite reelle.
  async function replyToSuggestion(id: string, status: SuggestionStatus, adminReply: string | null): Promise<boolean> {
    const { error: updateError } = await supabase
      .from('suggestions')
      .update({
        status,
        admin_reply: adminReply,
        admin_reply_at: adminReply ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (updateError) {
      console.error(updateError);
      setError('Impossible de mettre à jour cette suggestion. Réessaie plus tard.');
      return false;
    }
    await load();
    return true;
  }

  async function deleteSuggestion(id: string): Promise<boolean> {
    const { error: deleteError } = await supabase.from('suggestions').delete().eq('id', id);
    if (deleteError) {
      console.error(deleteError);
      setError('Impossible de supprimer cette suggestion. Réessaie plus tard.');
      return false;
    }
    await load();
    return true;
  }

  return { suggestions, loading, error, createSuggestion, toggleVote, replyToSuggestion, deleteSuggestion, refresh: load };
}
