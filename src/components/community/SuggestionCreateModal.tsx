import { useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { ErrorBanner } from '../ui/ErrorBanner';

interface SuggestionCreateModalProps {
  onClose: () => void;
  onCreate: (title: string, description: string) => Promise<boolean>;
}

// Ouverte a tout utilisateur (pas seulement l'admin) -- voir le
// commentaire en tete de la migration suggestions.
export function SuggestionCreateModal({ onClose, onCreate }: SuggestionCreateModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = title.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    const ok = await onCreate(title.trim(), description.trim());
    setSaving(false);
    if (ok) onClose();
    else setError("L'envoi a échoué. Réessaie.");
  };

  return (
    <Modal onClose={onClose} size="md">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-black">Nouvelle suggestion</h2>
        <button onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-white/5">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {error && <ErrorBanner message={error} className="mb-5" />}

      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Titre</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="En une phrase, qu'est-ce qui manque ?"
            className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
          />
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Description (optionnel)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Le contexte, le cas d'usage..."
            className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all min-h-[100px] resize-y"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full bg-neon-500 text-black font-bold py-3 rounded-xl hover:bg-neon-600 hover:shadow-[0_0_20px_rgba(255,196,0,0.3)] transition-all disabled:opacity-50 disabled:hover:shadow-none"
        >
          {saving ? 'Envoi...' : 'Envoyer la suggestion'}
        </button>
      </div>
    </Modal>
  );
}
