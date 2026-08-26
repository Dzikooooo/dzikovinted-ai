import { useState } from 'react';
import { HelpCircle, Plus, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { useCommunityContent } from '../../../hooks/useCommunityContent';
import { useIsAdmin } from '../../../hooks/useIsAdmin';
import { groupByCategory } from '../../../lib/communityContent';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { SectionLabel } from '../../../components/ui/SectionLabel';
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
        <p className="text-sm text-gray-500">Les réponses aux questions les plus fréquentes.</p>
        {isAdmin && (
          <Button icon={<Plus className="w-4 h-4" />} onClick={openCreate}>
            Publier une question
          </Button>
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
              <SectionLabel>{category}</SectionLabel>
              <div className="bg-surface border border-gray-200 rounded-2xl divide-y divide-gray-200 overflow-hidden">
                {groupItems.map((item) => {
                  const expanded = expandedIds.has(item.id);
                  return (
                    <div key={item.id}>
                      <div className="flex items-center gap-2 group">
                        <button
                          onClick={() => toggleExpanded(item.id)}
                          className="flex-1 flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-gray-100 transition-colors"
                        >
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-800">{item.title}</span>
                            {item.status === 'draft' && <Badge label="Brouillon" tone="warning" />}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                        {isAdmin && (
                          <div className="flex items-center gap-1 pr-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button
                              onClick={() => openEdit(item)}
                              aria-label="Modifier"
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-all"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteItem(item.id)}
                              aria-label="Supprimer"
                              className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-700 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      {/* Motion (2026-08-25) : meme defaut que la FAQ de la
                          landing -- montage/demontage instantane au clic.
                          Reutilise le MEME systeme .faq-panel (index.css),
                          jamais une seconde mecanique d'accordeon. */}
                      <div className={`faq-panel ${expanded ? 'faq-panel-open' : ''}`}>
                        <div>
                          <div className="faq-panel-content px-4 pb-4">
                            <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-line">{item.body}</p>
                          </div>
                        </div>
                      </div>
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
