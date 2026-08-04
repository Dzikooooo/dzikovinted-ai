import { useState } from 'react';
import { LifeBuoy, Plus } from 'lucide-react';
import { useSupportTickets, type TicketScope } from '../../../hooks/useSupportTickets';
import { useIsAdmin } from '../../../hooks/useIsAdmin';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { Button } from '../../../components/ui/Button';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { TicketCreateModal } from '../../../components/community/TicketCreateModal';
import { TicketDetailModal } from '../../../components/community/TicketDetailModal';
import type { SupportTicket, TicketStatus } from '../../../lib/types';

const STATUS_STYLES: Record<TicketStatus, { label: string; tone: BadgeTone }> = {
  open: { label: 'Ouvert', tone: 'warning' },
  in_progress: { label: 'En cours', tone: 'brand' },
  closed: { label: 'Clos', tone: 'neutral' },
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
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
          Nouveau ticket
        </Button>
      </div>

      {isAdmin && (
        <SegmentedControl
          className="mb-5"
          options={[
            { value: 'mine', label: 'Mes tickets' },
            { value: 'queue', label: "File d'attente" },
          ]}
          value={scope}
          onChange={(v) => setScope(v as TicketScope)}
        />
      )}

      {error && <ErrorBanner message={error} className="mb-6" />}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} shape="block" className="h-16" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="Aucun ticket pour l'instant"
          description="Un souci, une question ? On te répond ici."
          action={{ label: 'Ouvrir un ticket', onClick: () => setShowCreate(true) }}
        />
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
                <Badge label={style.label} tone={style.tone} />
              </button>
            );
          })}
        </div>
      )}

      {showCreate && (
        <TicketCreateModal
          onClose={() => setShowCreate(false)}
          onCreate={createTicket}
          onCreated={(ticket) => {
            setShowCreate(false);
            setOpenTicket(ticket);
          }}
        />
      )}
      {openTicket && (
        <TicketDetailModal ticket={openTicket} isAdmin={isAdmin} onClose={() => setOpenTicket(null)} onStatusChange={setTicketStatus} />
      )}
    </div>
  );
}
