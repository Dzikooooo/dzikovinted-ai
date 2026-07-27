import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { SupportTicket, TicketStatus } from '../lib/types';

export type TicketScope = 'mine' | 'queue';

// 'mine' = mes propres tickets (tout utilisateur). 'queue' = tous les
// tickets (admin uniquement -- la RLS select_own_support_tickets ne
// renvoie de toute facon que ses propres lignes a un non-admin, ce scope
// n'a de sens reel que pour is_admin()). Meme table, deux vues distinctes
// dans le meme onglet (voir le plan, section Lot 6).
export function useSupportTickets(scope: TicketScope) {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase.from('support_tickets').select('*').order('updated_at', { ascending: false });
    if (scope === 'mine') query = query.eq('user_id', user.id);
    const { data, error: loadError } = await query;
    if (loadError) {
      console.error(loadError);
      setError('Impossible de charger les tickets. Réessaie plus tard.');
    } else {
      setError(null);
    }
    setTickets((data ?? []) as SupportTicket[]);
    setLoading(false);
  }, [user, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`support_tickets_${scope}_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, scope, load]);

  async function createTicket(subject: string, firstMessage: string): Promise<string | null> {
    if (!user) return null;
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .insert({ user_id: user.id, subject })
      .select('id')
      .single();
    if (ticketError || !ticket) {
      console.error(ticketError);
      setError('Impossible de créer ce ticket. Réessaie plus tard.');
      return null;
    }
    const { error: messageError } = await supabase
      .from('ticket_messages')
      .insert({ ticket_id: ticket.id, author_id: user.id, body: firstMessage, is_admin_reply: false });
    if (messageError) {
      console.error(messageError);
      setError('Le ticket a été créé mais le premier message a échoué. Réessaie plus tard.');
      return null;
    }
    await load();
    return ticket.id as string;
  }

  async function setTicketStatus(id: string, status: TicketStatus): Promise<boolean> {
    const { error: updateError } = await supabase.from('support_tickets').update({ status }).eq('id', id);
    if (updateError) {
      console.error(updateError);
      setError('Impossible de mettre à jour ce ticket. Réessaie plus tard.');
      return false;
    }
    await load();
    return true;
  }

  return { tickets, loading, error, createTicket, setTicketStatus, refresh: load };
}
