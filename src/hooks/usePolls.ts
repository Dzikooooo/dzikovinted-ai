import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Poll, PollOption, PollStatus } from '../lib/types';

export interface PollWithOptions extends Poll {
  options: PollOption[];
  // Option choisie par l'utilisateur courant pour ce sondage, null s'il n'a
  // pas encore vote -- jamais le vote des autres (poll_votes n'est jamais
  // lu en liste, voir la policy select_own_poll_votes).
  myOptionId: string | null;
}

export interface PollInput {
  question: string;
  description?: string | null;
  options: string[];
}

// Premier onglet Communaute avec Realtime (voir le plan, Lot 4) : les
// compteurs de vote doivent refleter en direct les votes des autres
// utilisateurs, pas seulement les siens. Meme discipline de canal que
// useActionHistory.ts (souscription au montage, nettoyage au demontage).
export function usePolls() {
  const { user } = useAuth();
  const [polls, setPolls] = useState<PollWithOptions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [pollsRes, optionsRes, votesRes] = await Promise.all([
      supabase.from('polls').select('*').order('created_at', { ascending: false }),
      supabase.from('poll_options').select('*').order('sort_order', { ascending: true }),
      supabase.from('poll_votes').select('poll_id, option_id').eq('user_id', user.id),
    ]);
    if (pollsRes.error || optionsRes.error || votesRes.error) {
      console.error(pollsRes.error ?? optionsRes.error ?? votesRes.error);
      setError('Impossible de charger les sondages. Réessaie plus tard.');
      setLoading(false);
      return;
    }
    setError(null);
    const options = (optionsRes.data ?? []) as PollOption[];
    const myVoteByPoll = new Map<string, string>();
    for (const vote of (votesRes.data ?? []) as { poll_id: string; option_id: string }[]) {
      myVoteByPoll.set(vote.poll_id, vote.option_id);
    }
    const combined = ((pollsRes.data ?? []) as Poll[]).map((poll) => ({
      ...poll,
      options: options.filter((opt) => opt.poll_id === poll.id),
      myOptionId: myVoteByPoll.get(poll.id) ?? null,
    }));
    setPolls(combined);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`community_polls_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_options' }, () => void load())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'poll_votes', filter: `user_id=eq.${user.id}` },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  // Vote unique par sondage (contrainte unique(poll_id, user_id) en base) --
  // changer de choix retire d'abord l'ancien vote puis pose le nouveau.
  async function vote(pollId: string, optionId: string): Promise<boolean> {
    if (!user) return false;
    await supabase.from('poll_votes').delete().eq('poll_id', pollId).eq('user_id', user.id);
    const { error: insertError } = await supabase.from('poll_votes').insert({ poll_id: pollId, option_id: optionId, user_id: user.id });
    if (insertError) {
      console.error(insertError);
      setError('Impossible d\'enregistrer ton vote. Réessaie plus tard.');
      return false;
    }
    await load();
    return true;
  }

  async function retractVote(pollId: string): Promise<boolean> {
    if (!user) return false;
    const { error: deleteError } = await supabase.from('poll_votes').delete().eq('poll_id', pollId).eq('user_id', user.id);
    if (deleteError) {
      console.error(deleteError);
      setError('Impossible de retirer ton vote. Réessaie plus tard.');
      return false;
    }
    await load();
    return true;
  }

  async function createPoll(input: PollInput): Promise<boolean> {
    if (!user) return false;
    const { data: poll, error: pollError } = await supabase
      .from('polls')
      .insert({ question: input.question, description: input.description ?? null, author_id: user.id })
      .select('id')
      .single();
    if (pollError || !poll) {
      console.error(pollError);
      setError('Impossible de créer ce sondage. Réessaie plus tard.');
      return false;
    }
    const { error: optionsError } = await supabase.from('poll_options').insert(
      input.options.map((label, index) => ({ poll_id: poll.id, label, sort_order: index }))
    );
    if (optionsError) {
      console.error(optionsError);
      setError('Le sondage a été créé mais les options ont échoué. Réessaie plus tard.');
      return false;
    }
    await load();
    return true;
  }

  async function setPollStatus(pollId: string, status: PollStatus): Promise<boolean> {
    const { error: updateError } = await supabase
      .from('polls')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', pollId);
    if (updateError) {
      console.error(updateError);
      setError('Impossible de mettre à jour ce sondage. Réessaie plus tard.');
      return false;
    }
    await load();
    return true;
  }

  async function deletePoll(pollId: string): Promise<boolean> {
    const { error: deleteError } = await supabase.from('polls').delete().eq('id', pollId);
    if (deleteError) {
      console.error(deleteError);
      setError('Impossible de supprimer ce sondage. Réessaie plus tard.');
      return false;
    }
    await load();
    return true;
  }

  return { polls, loading, error, vote, retractVote, createPoll, setPollStatus, deletePoll, refresh: load };
}
