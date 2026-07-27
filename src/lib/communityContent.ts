import type { CommunityContent } from './types';

const UNCATEGORIZED_LABEL = 'Général';

export interface CommunityContentGroup {
  category: string;
  items: CommunityContent[];
}

// Regroupement par categorie partage entre TutorialsTab/GuidesTab/FaqTab
// (Communaute, Lot 2) -- arborescence type Notion : sections nommees
// plutot qu'une liste plate. Ordre des groupes = ordre de premiere
// apparition dans `items` (deja trie par sort_order/published_at par
// useCommunityContent), items non-categorises regroupes sous "General"
// en dernier plutot qu'eparpilles.
export function groupByCategory(items: CommunityContent[]): CommunityContentGroup[] {
  const groups = new Map<string, CommunityContent[]>();
  for (const item of items) {
    const key = item.category?.trim() || UNCATEGORIZED_LABEL;
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  const entries = [...groups.entries()];
  entries.sort(([a], [b]) => {
    if (a === UNCATEGORIZED_LABEL) return 1;
    if (b === UNCATEGORIZED_LABEL) return -1;
    return 0;
  });
  return entries.map(([category, groupItems]) => ({ category, items: groupItems }));
}
