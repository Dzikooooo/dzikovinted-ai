import { useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { ErrorBanner } from '../ui/ErrorBanner';
import type { CommunityContent, CommunityContentType, CommunityContentStatus, CommunityResourceKind } from '../../lib/types';
import type { CommunityContentInput } from '../../hooks/useCommunityContent';
import { notifyCommunityPublish } from '../../hooks/useNotifications';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const RESOURCE_KIND_OPTIONS: { value: CommunityResourceKind; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'video', label: 'Vidéo' },
  { value: 'link', label: 'Lien' },
];

interface CommunityContentEditorModalProps {
  type: CommunityContentType;
  item?: CommunityContent | null;
  onClose: () => void;
  onCreate: (input: CommunityContentInput) => Promise<boolean>;
  onUpdate: (id: string, current: CommunityContent, patch: Partial<CommunityContentInput>) => Promise<boolean>;
}

// Reutilisee telle quelle pour changelog/tutorial/guide/resource/faq
// (Lot 1 + Lot 2 de la Communaute, voir le plan) -- seuls les champs
// resource_kind/resource_url sont conditionnes au type, tout le reste
// est commun aux 5 types de community_content.
export function CommunityContentEditorModal({ type, item, onClose, onCreate, onUpdate }: CommunityContentEditorModalProps) {
  const isEdit = !!item;
  const [title, setTitle] = useState(item?.title ?? '');
  const [slug, setSlug] = useState(item?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [excerpt, setExcerpt] = useState(item?.excerpt ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [coverImageUrl, setCoverImageUrl] = useState(item?.cover_image_url ?? '');
  const [resourceKind, setResourceKind] = useState<CommunityResourceKind>(item?.resource_kind ?? 'link');
  const [resourceUrl, setResourceUrl] = useState(item?.resource_url ?? '');
  const [status, setStatus] = useState<CommunityContentStatus>(item?.status ?? 'draft');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const canSave = title.trim().length > 0 && slug.trim().length > 0 && body.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    const input: CommunityContentInput = {
      title: title.trim(),
      slug: slug.trim(),
      excerpt: excerpt.trim() || null,
      body: body.trim(),
      cover_image_url: coverImageUrl.trim() || null,
      resource_kind: type === 'resource' ? resourceKind : null,
      resource_url: type === 'resource' ? resourceUrl.trim() || null : null,
      category: category.trim() || null,
      status,
    };
    const ok = item ? await onUpdate(item.id, item, input) : await onCreate(input);
    setSaving(false);
    // Fermeture uniquement en cas de succes reel confirme -- meme regle
    // que WatchlistPage.tsx (ne jamais fermer sur un echec silencieux).
    if (ok) {
      // Notification "Dziko IA" uniquement sur une VRAIE premiere
      // publication d'une actualite (jamais un simple re-enregistrement
      // d'un item deja publie, jamais les autres types de contenu
      // Communaute -- demande produit 2026-08-04 : la diffusion doit
      // rester rare et pertinente, pas un ping a chaque edition de FAQ).
      const isNewPublish = status === 'published' && (!item || item.status !== 'published');
      if (type === 'changelog' && isNewPublish) void notifyCommunityPublish(title.trim());
      onClose();
    } else {
      setError("L'enregistrement a échoué. Réessaie.");
    }
  };

  return (
    <Modal onClose={onClose} size="lg">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-black">{isEdit ? 'Modifier' : 'Publier'}</h2>
        <button onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-white/5">
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
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
          />
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Slug</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 font-mono focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
          />
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Résumé (optionnel)</label>
          <input
            type="text"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
          />
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Contenu</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all min-h-[160px] resize-y"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Catégorie (optionnel)</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Image de couverture (URL, optionnel)</label>
            <input
              type="text"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
            />
          </div>
        </div>

        {type === 'resource' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Type de ressource</label>
              <div className="flex gap-2">
                {RESOURCE_KIND_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setResourceKind(opt.value)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold border transition ${
                      resourceKind === opt.value
                        ? 'bg-neon-600 text-white border-neon-500'
                        : 'bg-dark-400 text-gray-400 border-white/10 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">URL de la ressource</label>
              <input
                type="text"
                value={resourceUrl}
                onChange={(e) => setResourceUrl(e.target.value)}
                className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
              />
            </div>
          </div>
        )}

        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Statut</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStatus('draft')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold border transition ${
                status === 'draft' ? 'bg-neon-600 text-white border-neon-500' : 'bg-dark-400 text-gray-400 border-white/10 hover:text-white'
              }`}
            >
              Brouillon
            </button>
            <button
              type="button"
              onClick={() => setStatus('published')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold border transition ${
                status === 'published' ? 'bg-neon-600 text-white border-neon-500' : 'bg-dark-400 text-gray-400 border-white/10 hover:text-white'
              }`}
            >
              Publié
            </button>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full bg-neon-600 text-white font-bold py-3 rounded-xl hover:bg-neon-700 hover:shadow-[0_0_20px_rgba(124,92,255,0.3)] transition-all disabled:opacity-50 disabled:hover:shadow-none"
        >
          {saving ? 'Enregistrement...' : status === 'published' ? 'Publier' : 'Enregistrer le brouillon'}
        </button>
      </div>
    </Modal>
  );
}
