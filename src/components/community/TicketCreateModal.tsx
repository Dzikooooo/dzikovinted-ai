import { useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { ErrorBanner } from '../ui/ErrorBanner';
import type { SupportTicket } from '../../lib/types';

interface TicketCreateModalProps {
  onClose: () => void;
  onCreate: (subject: string, firstMessage: string) => Promise<SupportTicket | null>;
  onCreated: (ticket: SupportTicket) => void;
}

export function TicketCreateModal({ onClose, onCreate, onCreated }: TicketCreateModalProps) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = subject.trim().length > 0 && message.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    const ticket = await onCreate(subject.trim(), message.trim());
    setSaving(false);
    if (ticket) onCreated(ticket);
    else setError("L'envoi a échoué. Réessaie.");
  };

  return (
    <Modal onClose={onClose} size="md">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-black">Nouveau ticket</h2>
        <button onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-gray-100">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {error && <ErrorBanner message={error} className="mb-5" />}

      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Sujet</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
          />
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Ton message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all min-h-[120px] resize-y"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full bg-neon-600 text-white font-bold py-3 rounded-xl hover:bg-neon-700 hover:shadow-[0_0_20px_rgba(124,92,255,0.3)] transition-all disabled:opacity-50 disabled:hover:shadow-none"
        >
          {saving ? 'Envoi...' : 'Envoyer'}
        </button>
      </div>
    </Modal>
  );
}
