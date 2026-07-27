import { useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { ErrorBanner } from '../ui/ErrorBanner';
import type { Suggestion, SuggestionStatus } from '../../lib/types';

const STATUS_OPTIONS: { value: SuggestionStatus; label: string }[] = [
  { value: 'open', label: 'Nouvelle' },
  { value: 'planned', label: 'Prévue' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'done', label: 'Faite' },
  { value: 'declined', label: 'Refusée' },
];

interface SuggestionReplyModalProps {
  suggestion: Suggestion;
  onClose: () => void;
  onReply: (id: string, status: SuggestionStatus, adminReply: string | null) => Promise<boolean>;
}

// Reservee a l'admin (bouton n'apparait que pour isAdmin cote UI, RLS
// update_admin_suggestions comme seule vraie frontiere).
export function SuggestionReplyModal({ suggestion, onClose, onReply }: SuggestionReplyModalProps) {
  const [status, setStatus] = useState<SuggestionStatus>(suggestion.status);
  const [reply, setReply] = useState(suggestion.admin_reply ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const ok = await onReply(suggestion.id, status, reply.trim() || null);
    setSaving(false);
    if (ok) onClose();
    else setError("L'enregistrement a échoué. Réessaie.");
  };

  return (
    <Modal onClose={onClose} size="md">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-black">Répondre</h2>
        <button onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-white/5">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <p className="text-sm text-gray-400 mb-5">{suggestion.title}</p>

      {error && <ErrorBanner message={error} className="mb-5" />}

      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Statut</label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${
                  status === opt.value ? 'bg-neon-500 text-black border-neon-500' : 'bg-dark-400 text-gray-400 border-white/10 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Réponse de l'équipe (optionnel)</label>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all min-h-[100px] resize-y"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-neon-500 text-black font-bold py-3 rounded-xl hover:bg-neon-600 hover:shadow-[0_0_20px_rgba(255,196,0,0.3)] transition-all disabled:opacity-50 disabled:hover:shadow-none"
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </Modal>
  );
}
