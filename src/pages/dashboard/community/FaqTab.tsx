import { useState } from 'react';
import { HelpCircle, Plus, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { useCommunityContent } from '../../../hooks/useCommunityContent';
import { useIsAdmin } from '../../../hooks/useIsAdmin';
import { groupByCategory } from '../../../lib/communityContent';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { CommunityContentEditorModal } from '../../../components/community/CommunityContentEditorModal';
import type { CommunityContent } from '../../../lib/types';

// Accordeon groupe par categorie -- pas de tri par date (voir la
// section Inspiration du plan) : une FAQ se scanne par question, pas
// chronologiquement.
export function FaqTab() {
  const isAdmin = useIsAdmin();
  const { items, loading, error, createItem, updateItem, deleteItem } = useCommunityContent('faq');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<CommunityContent | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const openCreate = () => {
    setEditingItem(null);
    setShowForm(true);
  };
  const openEdit = (item: CommunityContent) => {
    setEditingItem(item);
    setShowForm(true);
  };
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const groups = groupByCategory(items);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <p className="text-sm text-gray-400">Les réponses aux questions les plus fréquentes.</p>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-neon-500 text-black text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-neon-600 hover:shadow-[0_0_20px_rgba(255,196,0,0.3)] transition-all flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            Publier une question
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} className="mb-6" />}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} shape="block" className="h-16" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={HelpCircle} title="Aucune question pour l'instant" description="La FAQ ResellOS apparaîtra ici." />
      ) : (
        <div className="space-y-8">
          {groups.map(({ category, items: groupItems }) => (
            <div key={category}>
              <h2 className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-3">{category}</h2>
              <div className="bg-surface border border-white/5 rounded-2xl divide-y divide-white/5 overflow-hidden">
                {groupItems.map((item) => {
                  const expanded = expandedIds.has(item.id);
                  return (
                    <div key={item.id}>
                      <div className="flex items-center gap-2 group">
                        <button
                          onClick={() => toggleExpanded(item.id)}
                          className="flex-1 flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition-colors"
                        >
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-200">{item.title}</span>
                            {item.status === 'draft' && (
                              <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-lg flex-shrink-0">
                                Brouillon
                              </span>
                            )}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-gray-600 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                        {isAdmin && (
                          <div className="flex items-center gap-1 pr-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button
                              onClick={() => openEdit(item)}
                              aria-label="Modifier"
                              className="p-1.5 rounded-lg hover:bg-white/5 text-gray-600 hover:text-gray-300 transition-all"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteItem(item.id)}
                              aria-label="Supprimer"
                              className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      {expanded && (
                        <div className="px-4 pb-4">
                          <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-line">{item.body}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <CommunityContentEditorModal type="faq" item={editingItem} onClose={() => setShowForm(false)} onCreate={createItem} onUpdate={updateItem} />
      )}
    </div>
  );
}
