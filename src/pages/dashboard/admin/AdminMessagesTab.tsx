import { useEffect, useMemo, useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useSupportTickets } from '../../../hooks/useSupportTickets';
import { TicketThread } from '../../../components/community/TicketThread';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import type { TicketStatus } from '../../../lib/types';

const STATUS_STYLES: Record<TicketStatus, { label: string; tone: BadgeTone }> = {
  open: { label: 'Ouvert', tone: 'warning' },
  in_progress: { label: 'En cours', tone: 'brand' },
  closed: { label: 'Clos', tone: 'neutral' },
};

// Onglet "Messages" (refonte Administration en 2 onglets, 2026-08-29) --
// meme donnee que Communaute > Support > "File d'attente" (support_tickets,
// scope 'queue', deja RLS-securisee : select_own_support_tickets limite un
// non-admin a ses propres tickets, is_admin() seul voit tout), presentee
// ici en panneau deux-colonnes de type messagerie ("app mobile") plutot
// qu'en liste + modale : conversations a gauche, fil actif a droite.
// TicketThread (extrait de TicketDetailModal.tsx le meme jour) porte toute
// la logique de messages/statuts/suppression -- le temps reel est deja
// gere par useTicketMessages (canal scope au ticket ouvert, filter
// ticket_id=eq.<id>), rien a refaire ici.
export function AdminMessagesTab() {
  const { tickets, loading, error, setTicketStatus, deleteTicket } = useSupportTickets('queue');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Record<string, { full_name: string | null; email: string }>>({});

  // Profils des contacts (nom/email) -- support_tickets ne porte que
  // user_id (uuid brut) : sans cette jointure cote client, la file
  // d'attente melangeant plusieurs utilisateurs serait illisible ("qui est
  // qui ?"). RLS profiles autorise deja un admin a tout lire (policy
  // "admins can view all profiles", is_admin() SECURITY DEFINER).
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, email');
      if (!data) return;
      const map: Record<string, { full_name: string | null; email: string }> = {};
      for (const p of data as { id: string; full_name: string | null; email: string }[]) {
        map[p.id] = { full_name: p.full_name, email: p.email };
      }
      setContacts(map);
    })();
  }, []);

  // Reste synchronise avec `tickets` (ex. apres un changement de statut
  // depuis TicketThread) -- sans ca, la conversation ouverte resterait
  // figee sur son ancienne version des la premiere action dessus.
  const activeTicket = useMemo(() => tickets.find((t) => t.id === selectedId) ?? null, [tickets, selectedId]);

  const contactLabel = (userId: string) => {
    const c = contacts[userId];
    if (!c) return userId;
    return c.full_name ? `${c.full_name} (${c.email})` : c.email;
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} shape="block" className="h-16" />)}
        </div>
        <Skeleton shape="block" className="h-96" />
      </div>
    );
  }

  return (
    <div>
      {error && <ErrorBanner message={error} className="mb-6" />}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 lg:items-start">
        {/* Conversations */}
        <div className="bg-surface border border-gray-200 rounded-2xl divide-y divide-gray-200 overflow-hidden lg:max-h-[70vh] lg:overflow-y-auto">
          {tickets.length === 0 ? (
            <EmptyState
              bare
              icon={LifeBuoy}
              title="Aucun message"
              description="Les demandes de support des utilisateurs apparaîtront ici."
            />
          ) : (
            tickets.map((t) => {
              const style = STATUS_STYLES[t.status];
              const isActive = activeTicket?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left p-4 transition-colors ${isActive ? 'bg-neon-500/5' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-xs font-semibold text-gray-800 truncate">{contactLabel(t.user_id)}</p>
                    <Badge label={style.label} tone={style.tone} />
                  </div>
                  <p className="text-sm text-gray-700 truncate">{t.subject}</p>
                </button>
              );
            })
          )}
        </div>

        {/* Fil actif */}
        <div className="bg-surface border border-gray-200 rounded-2xl p-6">
          {activeTicket ? (
            <TicketThread
              ticket={activeTicket}
              isAdmin
              onStatusChange={setTicketStatus}
              onDelete={deleteTicket}
              onClose={() => setSelectedId(null)}
              contactLabel={contactLabel(activeTicket.user_id)}
            />
          ) : (
            <EmptyState
              bare
              icon={LifeBuoy}
              title="Sélectionne une conversation"
              description="Choisis un message dans la liste pour l'ouvrir ici."
            />
          )}
        </div>
      </div>
    </div>
  );
}
