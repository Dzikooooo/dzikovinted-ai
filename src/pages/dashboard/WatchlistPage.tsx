import { useState } from 'react';
import { Plus, Pencil, Trash2, Eye, ChevronDown, Search, Info, Tag } from 'lucide-react';
import { useWatchlist } from '../../hooks/useWatchlist';
import { OPPORTUNITY_CATEGORIES } from '../../lib/opportunityCategories';
import type { DashboardPage, WatchlistEntry } from '../../lib/types';
import { StatCard } from '../../components/ui/StatCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { ClosableSection } from '../../components/ui/ClosableSection';
import { ListingsManagementSection } from './watchlist/ListingsManagementSection';

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

interface WatchlistPageProps {
  onNavigate: (page: DashboardPage) => void;
  onViewAction?: (actionId: string) => void;
}

export default function WatchlistPage({ onNavigate, onViewAction }: WatchlistPageProps) {
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
    const ok = editingId ? await updateEntry(editingId, payload) : await addEntry(payload);
    setSaving(false);
    // Ne ferme la modale qu'en cas de succes reel - avant ce correctif elle
    // se fermait inconditionnellement, laissant croire a une sauvegarde
    // reussie meme apres un echec (bug confirme, audit du parcours
    // Scanner, 2026-07-24). Le bandeau d'erreur reste visible derriere.
    if (ok) setShowForm(false);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Mes annonces"
        description="Gère tes annonces Vinted (republication, suppression) et les recherches que le scanner surveille pour toi."
      />

      {error && <ErrorBanner message={error} className="mb-6" />}

      {/* Gestion des annonces (restructuration 2026-07-29, ex-onglet
          Watchlist) -- republication/annonces/supprimer en onglets, dans
          un onglet fermable comme le reste du produit. */}
      <ClosableSection label="Gestion des annonces" labelOpen="Masquer la gestion des annonces" defaultOpen className="mb-8">
        <ListingsManagementSection onViewAction={onViewAction} />
      </ClosableSection>

      <SectionLabel
        className="mb-4"
        action={
          <Button icon={<Plus className="w-4 h-4" />} onClick={openAddForm}>
            Ajouter une recherche
          </Button>
        }
      >
        Recherches surveillées
      </SectionLabel>

      {/* Pedagogie explicite : sans ca, un nouvel utilisateur ajoutait une
          recherche, allait voir "Aucune opportunite" sur la page
          Opportunites (qui suggerait a tort un probleme de filtres), et
          n'avait aucun moyen de savoir qu'un scan devait d'abord tourner -
          les deux pages n'etaient jamais reliees (audit du parcours
          Scanner, 2026-07-24). */}
      <div className="flex items-start gap-3 bg-surface border border-gray-200 rounded-xl px-4 py-3 mb-6">
        <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-500 flex-1">
          Le scan tourne automatiquement toutes les 4h. Les résultats correspondant à tes recherches
          (et remplissant certains critères : popularité, marge minimum...) apparaissent ensuite dans
          l'onglet Opportunités de Niches.
        </p>
        <button
          onClick={() => onNavigate('actions')}
          className="flex items-center gap-1.5 text-xs font-bold text-neon-500 hover:underline flex-shrink-0"
        >
          <Search className="w-3.5 h-3.5" />
          Voir les opportunités
        </button>
      </div>

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
              className="bg-surface border border-gray-200 rounded-2xl p-4 transition-all hover:border-gray-200 hover:shadow-[0_8px_28px_rgba(0,0,0,0.3)] flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-neon-500/10 flex items-center justify-center flex-shrink-0">
                  <Tag className="w-4 h-4 text-neon-500/70" />
                </div>
                <SegmentedControl
                  options={[
                    { value: 'active', label: 'Actif' },
                    { value: 'inactive', label: 'Inactif' },
                  ]}
                  value={entry.active ? 'active' : 'inactive'}
                  onChange={(v) => toggleActive(entry.id, v === 'active')}
                  className="flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">
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
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-all"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteEntry(entry.id)}
                  aria-label="Supprimer"
                  className="p-2 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-700 transition-all"
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
          <SectionLabel>Recherches par défaut de ResellOS</SectionLabel>
          <div className="grid grid-cols-1 gap-3">
            {platformEntries.map((entry) => (
              <div
                key={entry.id}
                className="bg-dark-400/40 border border-dashed border-gray-200 rounded-2xl p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Tag className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-700 truncate">
                      {entry.brand} {entry.model}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{entry.category}</p>
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-gray-500 bg-gray-100 border border-gray-200 rounded-lg px-2.5 py-1 flex-shrink-0">
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
                  className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Modèle</label>
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="Shox TL"
                  className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Catégorie</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
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
              <SegmentedControl
                options={[
                  { value: '1', label: '1' },
                  { value: '2', label: '2' },
                  { value: '3', label: '3' },
                ]}
                value={String(form.priority)}
                onChange={(v) => setForm({ ...form, priority: Number(v) })}
                fullWidth
                className="w-full"
              />
            </div>

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-semibold"
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
                    className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
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
                    className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
                  />
                </div>
              </div>
            )}

            <Button
              fullWidth
              loading={saving}
              disabled={!form.brand.trim() || !form.model.trim()}
              onClick={handleSubmit}
            >
              {saving ? 'Enregistrement...' : editingId ? 'Enregistrer' : 'Ajouter la recherche'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
