import { useState } from 'react';
import { Megaphone, Plus, Pencil, Trash2 } from 'lucide-react';
import { useCommunityContent } from '../../../hooks/useCommunityContent';
import { useIsAdmin } from '../../../hooks/useIsAdmin';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { CommunityContentEditorModal } from '../../../components/community/CommunityContentEditorModal';
import type { CommunityContent } from '../../../lib/types';

function formatPublishedDate(iso: string | null): string {
  if (!iso) return 'Brouillon';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Pattern Linear (voir la section Inspiration du plan) : une entree =
// titre + date + un paragraphe, triee du plus recent au plus ancien,
// sans pagination -- charge cognitive minimale, l'utilisateur scanne et
// s'arrete des qu'il reconnait du deja-vu. Pas de page de detail
// separee : le format court des mises a jour ne le justifie pas.
export function ChangelogTab() {
  const isAdmin = useIsAdmin();
  const { items, loading, error, createItem, updateItem, deleteItem } = useCommunityContent('changelog');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<CommunityContent | null>(null);

  const openCreate = () => {
    setEditingItem(null);
    setShowForm(true);
  };
  const openEdit = (item: CommunityContent) => {
    setEditingItem(item);
    setShowForm(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <p className="text-sm text-gray-400">Les dernières nouveautés de ResellOS.</p>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-neon-500 text-black text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-neon-600 hover:shadow-[0_0_20px_rgba(255,196,0,0.3)] transition-all flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            Publier une actualité
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} className="mb-6" />}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} shape="block" className="h-28" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="Aucune actualité pour l'instant"
          description="Les prochaines nouveautés de ResellOS apparaîtront ici."
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-surface border border-white/5 rounded-2xl p-5 transition-all hover:border-white/10 hover:shadow-[0_8px_28px_rgba(0,0,0,0.3)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-100">{item.title}</h3>
                    {item.status === 'draft' && (
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-lg flex-shrink-0">
                        Brouillon
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{formatPublishedDate(item.published_at)}</p>
                  {item.excerpt && <p className="text-sm text-gray-400 mt-3">{item.excerpt}</p>}
                  <p className="text-sm text-gray-300 mt-2 leading-relaxed whitespace-pre-line">{item.body}</p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(item)}
                      aria-label="Modifier"
                      className="p-2 rounded-lg hover:bg-white/5 text-gray-600 hover:text-gray-300 transition-all"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      aria-label="Supprimer"
                      className="p-2 rounded-lg hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <CommunityContentEditorModal
          type="changelog"
          item={editingItem}
          onClose={() => setShowForm(false)}
          onCreate={createItem}
          onUpdate={updateItem}
        />
      )}
    </div>
  );
}
