import { useState } from 'react';
import { Plus, Pencil, Trash2, Eye, ChevronDown } from 'lucide-react';
import { useWatchlist } from '../../hooks/useWatchlist';
import { OPPORTUNITY_CATEGORIES } from '../../lib/opportunityCategories';
import type { WatchlistEntry } from '../../lib/types';
import { StatCard } from '../../components/ui/StatCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Modal } from '../../components/ui/Modal';

const DEFAULT_MIN_PROFIT = 20;
const DEFAULT_MIN_ROI = 50;

interface FormState {
  brand: string;
  model: string;
  category: string;
  priority: number;
  minProfit: string;
  minRoi: string;
}

const EMPTY_FORM: FormState = {
  brand: '',
  model: '',
  category: OPPORTUNITY_CATEGORIES[0],
  priority: 2,
  minProfit: String(DEFAULT_MIN_PROFIT),
  minRoi: String(DEFAULT_MIN_ROI),
};

function entryToForm(entry: WatchlistEntry): FormState {
  return {
    brand: entry.brand,
    model: entry.model,
    category: entry.category,
    priority: entry.priority,
    minProfit: String(entry.min_profit),
    minRoi: String(entry.min_roi),
  };
}

export default function WatchlistPage() {
  const { myEntries, platformEntries, loading, error, addEntry, updateEntry, toggleActive, deleteEntry } =
    useWatchlist();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeCount = myEntries.filter((e) => e.active).length;

  function openAddForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowAdvanced(false);
    setShowForm(true);
  }

  function openEditForm(entry: WatchlistEntry) {
    setEditingId(entry.id);
    setForm(entryToForm(entry));
    setShowAdvanced(entry.min_profit !== DEFAULT_MIN_PROFIT || entry.min_roi !== DEFAULT_MIN_ROI);
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!form.brand.trim() || !form.model.trim()) return;
    setSaving(true);
    const payload = {
      brand: form.brand.trim(),
      model: form.model.trim(),
      category: form.category,
      priority: form.priority,
      min_profit: Number(form.minProfit) || DEFAULT_MIN_PROFIT,
      min_roi: Number(form.minRoi) || DEFAULT_MIN_ROI,
    };
    if (editingId) {
      await updateEntry(editingId, payload);
    } else {
      await addEntry(payload);
    }
    setSaving(false);
    setShowForm(false);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black mb-1">Watchlist</h1>
          <p className="text-gray-400 text-sm">
            Choisis les marques et modèles que le scanner doit surveiller pour toi.
          </p>
        </div>

        <button
          onClick={openAddForm}
          className="flex items-center gap-2 bg-neon-500 text-black text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-neon-600 transition-all flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Ajouter une recherche
        </button>
      </div>

      {error && <ErrorBanner message={error} className="mb-6" />}

      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="Recherches actives" value={activeCount} highlight />
        <StatCard label="Recherches suivies" value={myEntries.length} />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} shape="block" className="h-16" />
          ))}
        </div>
      ) : myEntries.length === 0 ? (
        <EmptyState
          icon={Eye}
          title="Aucune recherche suivie"
          description="Ajoute une marque et un modèle pour que le scanner les surveille à ta place."
          action={{ label: 'Ajouter ta première recherche', onClick: openAddForm }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 mb-8">
          {myEntries.map((entry) => (
            <div
              key={entry.id}
              className="bg-surface border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => toggleActive(entry.id, !entry.active)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition flex-shrink-0 ${
                    entry.active
                      ? 'bg-neon-500 text-black border-neon-500'
                      : 'bg-dark-400 text-gray-500 border-white/10 hover:text-white'
                  }`}
                >
                  {entry.active ? 'Actif' : 'Inactif'}
                </button>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-100 truncate">
                    {entry.brand} {entry.model}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {entry.category} · Priorité {entry.priority}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => openEditForm(entry)}
                  aria-label="Modifier"
                  className="p-2 rounded-lg hover:bg-white/5 text-gray-600 hover:text-gray-300 transition-all"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteEntry(entry.id)}
                  aria-label="Supprimer"
                  className="p-2 rounded-lg hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {platformEntries.length > 0 && (
        <div>
          <h2 className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-3">
            Recherches par défaut de ResellOS
          </h2>
          <div className="grid grid-cols-1 gap-3">
            {platformEntries.map((entry) => (
              <div
                key={entry.id}
                className="bg-surface border border-white/5 rounded-2xl p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-300 truncate">
                    {entry.brand} {entry.model}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">{entry.category}</p>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-gray-600 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 flex-shrink-0">
                  Recommandé
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <Modal onClose={() => setShowForm(false)} size="md">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-black">{editingId ? 'Modifier la recherche' : 'Nouvelle recherche'}</h2>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Marque</label>
                <input
                  type="text"
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  placeholder="Nike"
                  className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Modèle</label>
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="Shox TL"
                  className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Catégorie</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
              >
                {OPPORTUNITY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Priorité</label>
              <div className="flex gap-2">
                {[1, 2, 3].map((p) => (
                  <button
                    key={p}
                    onClick={() => setForm({ ...form, priority: p })}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold border transition ${
                      form.priority === p
                        ? 'bg-neon-500 text-black border-neon-500'
                        : 'bg-dark-400 text-gray-400 border-white/10 hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 font-semibold"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              Seuils avancés (optionnel)
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">
                    Profit min (€)
                  </label>
                  <input
                    type="number"
                    value={form.minProfit}
                    onChange={(e) => setForm({ ...form, minProfit: e.target.value })}
                    className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">
                    ROI min (%)
                  </label>
                  <input
                    type="number"
                    value={form.minRoi}
                    onChange={(e) => setForm({ ...form, minRoi: e.target.value })}
                    className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={saving || !form.brand.trim() || !form.model.trim()}
              className="w-full bg-neon-500 text-black font-bold py-3 rounded-xl hover:bg-neon-600 transition-all disabled:opacity-60"
            >
              {saving ? 'Enregistrement...' : editingId ? 'Enregistrer' : 'Ajouter la recherche'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
