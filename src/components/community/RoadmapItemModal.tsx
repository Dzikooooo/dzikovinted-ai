import { useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { ErrorBanner } from '../ui/ErrorBanner';
import type { RoadmapItem, RoadmapStatus } from '../../lib/types';
import type { RoadmapItemInput } from '../../hooks/useRoadmap';

const STATUS_OPTIONS: { value: RoadmapStatus; label: string }[] = [
  { value: 'planned', label: 'Prévu' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'shipped', label: 'Livré' },
];

interface RoadmapItemModalProps {
  item?: RoadmapItem | null;
  onClose: () => void;
  onCreate: (input: RoadmapItemInput) => Promise<boolean>;
  onUpdate: (id: string, patch: Partial<RoadmapItemInput>) => Promise<boolean>;
}

// Modale dediee, pas CommunityContentEditorModal : un item roadmap n'a ni
// slug ni brouillon/publie, juste un statut qui determine sa colonne
// (voir le plan, section Lot 3 -- forme differente d'un post editorial).
export function RoadmapItemModal({ item, onClose, onCreate, onUpdate }: RoadmapItemModalProps) {
  const isEdit = !!item;
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [status, setStatus] = useState<RoadmapStatus>(item?.status ?? 'planned');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = title.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    const input: RoadmapItemInput = { title: title.trim(), description: description.trim(), status };
    const ok = item ? await onUpdate(item.id, input) : await onCreate(input);
    setSaving(false);
    if (ok) onClose();
    else setError("L'enregistrement a échoué. Réessaie.");
  };

  return (
    <Modal onClose={onClose} size="md">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-black">{isEdit ? 'Modifier' : 'Nouvel élément'}</h2>
        <button onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-gray-100">
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
            className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
          />
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Description (optionnel)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all min-h-[100px] resize-y"
          />
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Statut</label>
          <div className="flex gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold border transition ${
                  status === opt.value ? 'bg-neon-600 text-white border-neon-500' : 'bg-dark-400 text-gray-500 border-gray-200 hover:text-gray-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full bg-neon-600 text-white font-bold py-3 rounded-xl hover:bg-neon-700 hover:shadow-[0_0_20px_rgba(124,92,255,0.3)] transition-all disabled:opacity-50 disabled:hover:shadow-none"
        >
          {saving ? 'Enregistrement...' : isEdit ? 'Enregistrer' : 'Ajouter à la roadmap'}
        </button>
      </div>
    </Modal>
  );
}
