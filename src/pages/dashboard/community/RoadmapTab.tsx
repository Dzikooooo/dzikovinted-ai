import { useState } from 'react';
import { Map, Plus, Pencil, Trash2, Circle, Loader2, CheckCircle2 } from 'lucide-react';
import { useRoadmap } from '../../../hooks/useRoadmap';
import { useIsAdmin } from '../../../hooks/useIsAdmin';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { RoadmapItemModal } from '../../../components/community/RoadmapItemModal';
import type { RoadmapItem, RoadmapStatus } from '../../../lib/types';

// 3 colonnes horizon de confiance decroissant (style Linear), calquees 1:1
// sur les 3 valeurs de statut -- voir le plan, section Inspiration. "Livre"
// sert de reference (ce qui a deja ete fait), pas une promesse a venir.
const COLUMNS: { status: RoadmapStatus; label: string; icon: typeof Circle; accent: string }[] = [
  { status: 'in_progress', label: 'En cours', icon: Loader2, accent: 'text-neon-500' },
  { status: 'planned', label: 'Prévu', icon: Circle, accent: 'text-gray-400' },
  { status: 'shipped', label: 'Livré', icon: CheckCircle2, accent: 'text-emerald-400' },
];

export function RoadmapTab() {
  const isAdmin = useIsAdmin();
  const { items, loading, error, createItem, updateItem, deleteItem } = useRoadmap();
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<RoadmapItem | null>(null);

  const openCreate = () => {
    setEditingItem(null);
    setShowForm(true);
  };
  const openEdit = (item: RoadmapItem) => {
    setEditingItem(item);
    setShowForm(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <p className="text-sm text-gray-400">Ce sur quoi l'équipe ResellOS travaille, sans dates promises.</p>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-neon-500 text-black text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-neon-600 hover:shadow-[0_0_20px_rgba(255,196,0,0.3)] transition-all flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            Nouvel élément
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} className="mb-6" />}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} shape="block" className="h-48" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Map} title="La roadmap est vide pour l'instant" description="Les prochains chantiers ResellOS apparaîtront ici." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map(({ status, label, icon: Icon, accent }) => {
            const columnItems = items.filter((item) => item.status === status);
            return (
              <div key={status} className="bg-surface border border-white/5 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Icon className={`w-3.5 h-3.5 ${accent}`} />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-300">{label}</h2>
                  <span className="text-[10px] font-mono text-gray-600 ml-auto">{columnItems.length}</span>
                </div>
                {columnItems.length === 0 ? (
                  <p className="text-xs text-gray-600 italic">Rien ici pour l'instant.</p>
                ) : (
                  <div className="space-y-2">
                    {columnItems.map((item) => (
                      <div key={item.id} className="group relative bg-dark-400 border border-white/5 rounded-xl p-3 hover:border-white/10 transition-all">
                        <h3 className="text-sm font-semibold text-gray-200 pr-12">{item.title}</h3>
                        {item.description && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed whitespace-pre-line">{item.description}</p>}
                        {isAdmin && (
                          <div className="absolute top-2.5 right-2.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEdit(item)}
                              aria-label="Modifier"
                              className="p-1 rounded-lg hover:bg-white/5 text-gray-600 hover:text-gray-300 transition-all"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => deleteItem(item.id)}
                              aria-label="Supprimer"
                              className="p-1 rounded-lg hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-all"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && <RoadmapItemModal item={editingItem} onClose={() => setShowForm(false)} onCreate={createItem} onUpdate={updateItem} />}
    </div>
  );
}
