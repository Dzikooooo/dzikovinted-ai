import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { ErrorBanner } from '../ui/ErrorBanner';
import type { PollInput } from '../../hooks/usePolls';

interface PollCreateModalProps {
  onClose: () => void;
  onCreate: (input: PollInput) => Promise<boolean>;
}

// Modale dediee (pas CommunityContentEditorModal ni RoadmapItemModal) : un
// sondage porte une liste d'options de longueur variable, forme propre a
// ce type de contenu.
export function PollCreateModal({ onClose, onCreate }: PollCreateModalProps) {
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedOptions = options.map((o) => o.trim()).filter(Boolean);
  const canSave = question.trim().length > 0 && trimmedOptions.length >= 2;

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  };
  const addOption = () => setOptions((prev) => [...prev, '']);
  const removeOption = (index: number) => setOptions((prev) => prev.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    const ok = await onCreate({ question: question.trim(), description: description.trim() || null, options: trimmedOptions });
    setSaving(false);
    if (ok) onClose();
    else setError("L'enregistrement a échoué. Réessaie.");
  };

  return (
    <Modal onClose={onClose} size="md">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-black">Nouveau sondage</h2>
        <button onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-white/5">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {error && <ErrorBanner message={error} className="mb-5" />}

      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Question</label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
          />
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Description (optionnel)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all min-h-[80px] resize-y"
          />
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Options (2 minimum)</label>
          <div className="space-y-2">
            {options.map((opt, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => updateOption(index, e.target.value)}
                  placeholder={`Option ${index + 1}`}
                  className="flex-1 bg-dark-400 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
                />
                {options.length > 2 && (
                  <button
                    onClick={() => removeOption(index)}
                    aria-label="Retirer cette option"
                    className="p-2 rounded-lg hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-all flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addOption}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 mt-2 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter une option
          </button>
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full bg-neon-600 text-white font-bold py-3 rounded-xl hover:bg-neon-700 hover:shadow-[0_0_20px_rgba(124,92,255,0.3)] transition-all disabled:opacity-50 disabled:hover:shadow-none"
        >
          {saving ? 'Création...' : 'Publier le sondage'}
        </button>
      </div>
    </Modal>
  );
}
