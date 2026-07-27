import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { TicketMessage } from '../lib/types';

// Calque de useActionLogEntries (src/hooks/useActionHistory.ts) : journal
// immuable + Realtime scope a un seul ticket ouvert.
export function useTicketMessages(ticketId: string | null, isAdmin: boolean) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ticketId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (loadError) {
      console.error(loadError);
      setError('Impossible de charger les messages. Réessaie plus tard.');
    } else {
      setError(null);
    }
    setMessages((data ?? []) as TicketMessage[]);
    setLoading(false);
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!ticketId) return;
    const channel = supabase
      .channel(`ticket_messages_${ticketId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${ticketId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ticketId, load]);

  // is_admin_reply est fixe ici a partir du isAdmin REEL cote UI -- la
  // policy insert_own_ticket_messages est la seule garantie qui compte
  // (un client modifie ne pourrait de toute facon jamais forcer
  // is_admin_reply=true sans etre reellement admin cote base).
  async function sendMessage(body: string): Promise<boolean> {
    if (!ticketId || !user) return false;
    const { error: insertError } = await supabase
      .from('ticket_messages')
      .insert({ ticket_id: ticketId, author_id: user.id, body, is_admin_reply: isAdmin });
    if (insertError) {
      console.error(insertError);
      setError("Impossible d'envoyer ce message. Réessaie plus tard.");
      return false;
    }
    await load();
    return true;
  }

  return { messages, loading, error, sendMessage };
}
