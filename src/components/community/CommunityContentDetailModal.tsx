import { X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import type { CommunityContent } from '../../lib/types';

interface CommunityContentDetailModalProps {
  item: CommunityContent;
  onClose: () => void;
}

// Vue lecture seule (Tutoriels/Guides, Communaute Lot 2) -- le format
// court du changelog s'affiche entierement inline (voir ChangelogTab),
// mais un tutoriel/guide peut etre bien plus long : une modale de detail
// evite de surcharger la liste groupee par categorie.
export function CommunityContentDetailModal({ item, onClose }: CommunityContentDetailModalProps) {
  return (
    <Modal onClose={onClose} size="lg" className="max-h-[85vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          {item.category && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-neon-500/60">{item.category}</span>
          )}
          <h2 className="text-xl font-black mt-1">{item.title}</h2>
        </div>
        <button onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-gray-100 flex-shrink-0">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {item.cover_image_url && (
        <img src={item.cover_image_url} alt="" className="w-full rounded-xl border border-gray-200 mb-5 object-cover" />
      )}

      {item.excerpt && <p className="text-sm text-gray-500 mb-4">{item.excerpt}</p>}

      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{item.body}</p>
    </Modal>
  );
}
