import { useState } from 'react';
import { Plus, Pencil, Trash2, type LucideIcon } from 'lucide-react';
import { useCommunityContent } from '../../../hooks/useCommunityContent';
import { useIsAdmin } from '../../../hooks/useIsAdmin';
import { groupByCategory } from '../../../lib/communityContent';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { CommunityContentEditorModal } from '../../../components/community/CommunityContentEditorModal';
import { CommunityContentDetailModal } from '../../../components/community/CommunityContentDetailModal';
import type { CommunityContent, CommunityContentType } from '../../../lib/types';

interface GroupedContentTabProps {
  type: CommunityContentType;
  icon: LucideIcon;
  introText: string;
  createLabel: string;
  emptyTitle: string;
  emptyDescription: string;
}

// Base commune Tutoriels/Guides (Communaute, Lot 2) -- meme forme de
// donnees (community_content), meme UX : liste groupee par categorie
// (arborescence type Notion, voir la section Inspiration du plan),
// carte cliquable ouvrant le detail complet en modale plutot que tout
// afficher inline (contrairement au Changelog, format volontairement
// plus long ici).
export function GroupedContentTab({ type, icon: Icon, introText, createLabel, emptyTitle, emptyDescription }: GroupedContentTabProps) {
  const isAdmin = useIsAdmin();
  const { items, loading, error, createItem, updateItem, deleteItem } = useCommunityContent(type);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<CommunityContent | null>(null);
  const [viewingItem, setViewingItem] = useState<CommunityContent | null>(null);

  const openCreate = () => {
    setEditingItem(null);
    setShowForm(true);
  };
  const openEdit = (item: CommunityContent) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const groups = groupByCategory(items);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <p className="text-sm text-gray-400">{introText}</p>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-neon-500 text-black text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-neon-600 hover:shadow-[0_0_20px_rgba(255,196,0,0.3)] transition-all flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            {createLabel}
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} className="mb-6" />}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} shape="block" className="h-20" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Icon} title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="space-y-8">
          {groups.map(({ category, items: groupItems }) => (
            <div key={category}>
              <h2 className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-3">{category}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {groupItems.map((item) => (
                  <div
                    key={item.id}
                    className="group relative bg-surface border border-white/5 rounded-2xl p-4 text-left transition-all hover:border-white/10 hover:shadow-[0_8px_28px_rgba(0,0,0,0.3)]"
                  >
                    <button onClick={() => setViewingItem(item)} className="w-full text-left">
                      <div className="flex items-center gap-2 flex-wrap pr-14">
                        <h3 className="font-bold text-sm text-gray-100">{item.title}</h3>
                        {item.status === 'draft' && (
                          <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-lg flex-shrink-0">
                            Brouillon
                          </span>
                        )}
                      </div>
                      {item.excerpt && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{item.excerpt}</p>}
                    </button>
                    {isAdmin && (
                      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewingItem && <CommunityContentDetailModal item={viewingItem} onClose={() => setViewingItem(null)} />}

      {showForm && (
        <CommunityContentEditorModal type={type} item={editingItem} onClose={() => setShowForm(false)} onCreate={createItem} onUpdate={updateItem} />
      )}
    </div>
  );
}
