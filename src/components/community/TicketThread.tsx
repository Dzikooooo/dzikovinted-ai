import { useState } from 'react';
import { X, Send, BadgeCheck, Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Skeleton } from '../ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useTicketMessages } from '../../hooks/useTicketMessages';
import { formatRelativeSync } from '../../lib/formatRelativeTime';
import type { SupportTicket, TicketStatus } from '../../lib/types';

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: 'Ouvert' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'closed', label: 'Clos' },
];

interface TicketThreadProps {
  ticket: SupportTicket;
  isAdmin: boolean;
  onStatusChange: (id: string, status: TicketStatus) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  // Present en modale (TicketDetailModal -- ferme la modale), absent en
  // panneau deux-colonnes (AdminMessagesTab -- rien a "fermer", juste
  // desactionner le bouton correspondant).
  onClose?: () => void;
  // Nom/email du contact, affiche en en-tete -- fourni par l'appelant.
  // TicketDetailModal (l'utilisateur ouvre SON PROPRE ticket) ne le passe
  // jamais ; AdminMessagesTab (plusieurs contacts melanges dans une seule
  // file d'attente) en a besoin pour savoir a qui il repond.
  contactLabel?: string;
}

// Extrait de TicketDetailModal.tsx (2026-08-29, refonte Administration en 2
// onglets) -- meme logique de rendu (bulles de message, libelles, statuts,
// suppression), desormais reutilisable SANS le <Modal> englobant :
// TicketDetailModal (Communaute > Support) le garde en modale,
// AdminMessagesTab (Administration > Messages) l'affiche directement dans
// un panneau deux-colonnes de type messagerie. Realtime deja gere par
// useTicketMessages (canal scope a CE ticket) -- rien a refaire ici.
export function TicketThread({ ticket, isAdmin, onStatusChange, onDelete, onClose, contactLabel }: TicketThreadProps) {
  const { user } = useAuth();
  const { messages, loading, error, sendMessage } = useTicketMessages(ticket.id, isAdmin);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    const ok = await sendMessage(draft.trim());
    setSending(false);
    if (ok) setDraft('');
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    const ok = await onDelete(ticket.id);
    setDeleting(false);
    setConfirmingDelete(false);
    if (ok) onClose?.();
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          {contactLabel && <p className="text-xs font-semibold text-neon-500 mb-1">{contactLabel}</p>}
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
        <div className="flex items-center gap-1 flex-shrink-0">
          {isAdmin && (
            <button
              onClick={() => setConfirmingDelete(true)}
              aria-label="Supprimer ce ticket"
              className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {onClose && (
            <button onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} className="mb-4" />}

      <div className="space-y-3 mb-4 max-h-[50vh] overflow-y-auto pr-1">
        {loading ? (
          <Skeleton shape="block" className="h-16" />
        ) : (
          messages.map((msg) => {
            const isMine = msg.author_id === user?.id;
            // Retour beta (2026-08-27) : seule la reponse de l'equipe portait
            // un libelle -- un message de l'utilisateur lui-meme restait une
            // bulle nue, ambigue a relire plus tard ("qui a ecrit ca ?"),
            // proche de l'impression de "s'auto-repondre". Desormais CHAQUE
            // bulle porte un libelle explicite. Les deux seules combinaisons
            // qu'un utilisateur non-admin peut jamais voir dans SON propre
            // ticket sont couvertes ('Toi' / "Réponse de l'équipe") ; 'Toi
            // (équipe)' ne concerne que l'admin relisant sa PROPRE reponse
            // passee depuis la file d'attente -- jamais visible autrement.
            const label = isMine && !msg.is_admin_reply ? 'Toi' : isMine && msg.is_admin_reply ? 'Toi (équipe)' : msg.is_admin_reply ? "Réponse de l'équipe" : null;
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl p-3 ${
                    msg.is_admin_reply ? 'bg-neon-500/5 border border-neon-500/20' : 'bg-dark-400 border border-gray-200'
                  }`}
                >
                  {label && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {msg.is_admin_reply && <BadgeCheck className="w-3.5 h-3.5 text-neon-500" />}
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider ${
                          msg.is_admin_reply ? 'text-neon-500' : 'text-gray-500'
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                  )}
                  <p className="text-sm text-gray-800 whitespace-pre-line">{msg.body}</p>
                  <p className="text-[10px] text-gray-500 mt-1.5">{formatRelativeSync(msg.created_at)}</p>
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

      {confirmingDelete && (
        <Modal onClose={() => setConfirmingDelete(false)} size="sm">
          <h2 className="text-lg font-black mb-2">Supprimer ce ticket ?</h2>
          <p className="text-sm text-gray-500 mb-5">
            "{ticket.subject}" et tous ses messages seront définitivement supprimés. Cette action est irréversible.
          </p>
          <div className="flex items-center gap-3">
            <Button variant="secondary" fullWidth onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Annuler
            </Button>
            <Button variant="danger" fullWidth onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Suppression...' : 'Supprimer'}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
