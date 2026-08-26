import { useState } from 'react';
import { X, Send, BadgeCheck } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Skeleton } from '../ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useTicketMessages } from '../../hooks/useTicketMessages';
import type { SupportTicket, TicketStatus } from '../../lib/types';

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: 'Ouvert' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'closed', label: 'Clos' },
];

interface TicketDetailModalProps {
  ticket: SupportTicket;
  isAdmin: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: TicketStatus) => Promise<boolean>;
}

export function TicketDetailModal({ ticket, isAdmin, onClose, onStatusChange }: TicketDetailModalProps) {
  const { user } = useAuth();
  const { messages, loading, error, sendMessage } = useTicketMessages(ticket.id, isAdmin);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    const ok = await sendMessage(draft.trim());
    setSending(false);
    if (ok) setDraft('');
  };

  return (
    <Modal onClose={onClose} size="lg">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-black mb-1">{ticket.subject}</h2>
          {isAdmin ? (
            <div className="flex gap-1.5">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onStatusChange(ticket.id, opt.value)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                    ticket.status === opt.value
                      ? 'bg-neon-600 text-white border-neon-500'
                      : 'bg-dark-400 text-gray-500 border-gray-200 hover:text-gray-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-lg">
              {STATUS_OPTIONS.find((o) => o.value === ticket.status)?.label}
            </span>
          )}
        </div>
        <button onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-gray-100 flex-shrink-0">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {error && <ErrorBanner message={error} className="mb-4" />}

      <div className="space-y-3 mb-4 max-h-[50vh] overflow-y-auto pr-1">
        {loading ? (
          <Skeleton shape="block" className="h-16" />
        ) : (
          messages.map((msg) => {
            const isMine = msg.author_id === user?.id;
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl p-3 ${
                    msg.is_admin_reply ? 'bg-neon-500/5 border border-neon-500/20' : 'bg-dark-400 border border-gray-200'
                  }`}
                >
                  {msg.is_admin_reply && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <BadgeCheck className="w-3.5 h-3.5 text-neon-500" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neon-500">Réponse de l'équipe</span>
                    </div>
                  )}
                  <p className="text-sm text-gray-800 whitespace-pre-line">{msg.body}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {ticket.status !== 'closed' && (
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ta réponse..."
            className="flex-1 bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all min-h-[48px] max-h-32 resize-y"
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            aria-label="Envoyer"
            className="bg-neon-600 text-white p-3 rounded-xl hover:bg-neon-700 hover:shadow-[0_0_20px_rgba(124,92,255,0.3)] transition-all disabled:opacity-50 disabled:hover:shadow-none flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}
    </Modal>
  );
}
