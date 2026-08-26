import { useState } from 'react';
import { FolderDown, FileText, PlayCircle, Link2, Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';
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
import type { CommunityContent, CommunityResourceKind } from '../../../lib/types';

const RESOURCE_KIND_ICON: Record<CommunityResourceKind, typeof FileText> = {
  pdf: FileText,
  video: PlayCircle,
  link: Link2,
};

const RESOURCE_KIND_LABEL: Record<CommunityResourceKind, string> = {
  pdf: 'PDF',
  video: 'Vidéo',
  link: 'Lien',
};

// Contrairement a Tutoriels/Guides, une ressource pointe vers un fichier/
// une video/un lien externe -- pas de modale de detail, la carte ouvre
// directement resource_url dans un nouvel onglet.
export function ResourcesTab() {
  const isAdmin = useIsAdmin();
  const { items, loading, error, createItem, updateItem, deleteItem } = useCommunityContent('resource');
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

  const groups = groupByCategory(items);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <p className="text-sm text-gray-500">PDF, vidéos et mini-formations pour aller plus loin.</p>
        {isAdmin && (
          <Button icon={<Plus className="w-4 h-4" />} onClick={openCreate}>
            Publier une ressource
          </Button>
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
        <EmptyState icon={FolderDown} title="Aucune ressource pour l'instant" description="Les prochaines ressources ResellOS apparaîtront ici." />
      ) : (
        <div className="space-y-8">
          {groups.map(({ category, items: groupItems }) => (
            <div key={category}>
              <SectionLabel>{category}</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {groupItems.map((item) => {
                  const Icon = item.resource_kind ? RESOURCE_KIND_ICON[item.resource_kind] : Link2;
                  return (
                    <div
                      key={item.id}
                      className="group relative bg-surface border border-gray-200 rounded-2xl p-4 transition-all hover:border-gray-200 hover:shadow-[0_8px_28px_rgba(0,0,0,0.3)]"
                    >
                      <a
                        href={item.resource_url ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-start gap-3 ${item.resource_url ? '' : 'pointer-events-none'}`}
                      >
                        <div className="w-10 h-10 bg-neon-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4 text-neon-500" />
                        </div>
                        <div className="min-w-0 flex-1 pr-8">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-sm text-gray-900">{item.title}</h3>
                            {item.status === 'draft' && <Badge label="Brouillon" tone="warning" />}
                          </div>
                          {item.excerpt && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.excerpt}</p>}
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-neon-500/60 mt-2">
                            {item.resource_kind ? RESOURCE_KIND_LABEL[item.resource_kind] : ''}
                            {item.resource_url && <ExternalLink className="w-2.5 h-2.5" />}
                          </span>
                        </div>
                      </a>
                      {isAdmin && (
                        <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <CommunityContentEditorModal type="resource" item={editingItem} onClose={() => setShowForm(false)} onCreate={createItem} onUpdate={updateItem} />
      )}
    </div>
  );
}
