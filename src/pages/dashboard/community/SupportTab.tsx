import { useState } from 'react';
import { LifeBuoy, Plus } from 'lucide-react';
import { useSupportTickets, type TicketScope } from '../../../hooks/useSupportTickets';
import { useIsAdmin } from '../../../hooks/useIsAdmin';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { TicketCreateModal } from '../../../components/community/TicketCreateModal';
import { TicketDetailModal } from '../../../components/community/TicketDetailModal';
import type { SupportTicket, TicketStatus } from '../../../lib/types';

const STATUS_STYLES: Record<TicketStatus, { label: string; bg: string; text: string }> = {
  open: { label: 'Ouvert', bg: 'bg-amber-400/10', text: 'text-amber-400' },
  in_progress: { label: 'En cours', bg: 'bg-neon-500/10', text: 'text-neon-500' },
  closed: { label: 'Clos', bg: 'bg-white/10', text: 'text-gray-400' },
};

// Meme table support_tickets, deux vues dans le meme onglet (voir le
// plan, Lot 6) : "Mes tickets" pour tous, "File d'attente" en plus pour
// l'admin uniquement. isAdmin cote UI n'est qu'une commodite d'affichage --
// la RLS (select_own_support_tickets) reste la seule vraie frontiere.
export function SupportTab() {
  const isAdmin = useIsAdmin();
  const [scope, setScope] = useState<TicketScope>('mine');
  const { tickets, loading, error, createTicket, setTicketStatus } = useSupportTickets(scope);
  const [showCreate, setShowCreate] = useState(false);
  const [openTicket, setOpenTicket] = useState<SupportTicket | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <p className="text-sm text-gray-400">Un souci, une question ? On te répond ici.</p>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-neon-500 text-black text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-neon-600 hover:shadow-[0_0_20px_rgba(255,196,0,0.3)] transition-all flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nouveau ticket
        </button>
      </div>

      {isAdmin && (
        <div className="flex gap-1 mb-5">
          {(['mine', 'queue'] as TicketScope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                scope === s ? 'bg-neon-500/10 text-neon-500' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {s === 'mine' ? 'Mes tickets' : "File d'attente"}
            </button>
          ))}
        </div>
      )}

      {error && <ErrorBanner message={error} className="mb-6" />}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} shape="block" className="h-16" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="Aucun ticket pour l'instant" description="Ouvre un ticket si tu as besoin d'aide." />
      ) : (
        <div className="bg-surface border border-white/5 rounded-2xl divide-y divide-white/5 overflow-hidden">
          {tickets.map((ticket) => {
            const style = STATUS_STYLES[ticket.status];
            return (
              <button
                key={ticket.id}
                onClick={() => setOpenTicket(ticket)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition-colors"
              >
                <span className="text-sm font-medium text-gray-200 truncate">{ticket.subject}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg flex-shrink-0 ${style.text} ${style.bg}`}>{style.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {showCreate && (
        <TicketCreateModal
          onClose={() => setShowCreate(false)}
          onCreate={createTicket}
          onCreated={(ticketId) => {
            setShowCreate(false);
            setOpenTicket(tickets.find((t) => t.id === ticketId) ?? { id: ticketId, user_id: '', subject: '', status: 'open', min_plan: null, created_at: '', updated_at: '' });
          }}
        />
      )}
      {openTicket && (
        <TicketDetailModal ticket={openTicket} isAdmin={isAdmin} onClose={() => setOpenTicket(null)} onStatusChange={setTicketStatus} />
      )}
    </div>
  );
}
