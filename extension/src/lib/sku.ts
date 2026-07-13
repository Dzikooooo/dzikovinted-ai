// Copie volontaire de la fonction d'extraction de src/lib/sku.ts (pas de
// tooling monorepo partage entre l'app et l'extension, meme convention que
// date.ts/messages.ts). Seule extractSkuFromTitle est necessaire cote
// extension : au premier import d'une annonce Vinted existante dont le
// titre porte deja un numero manuel (" #12"), on le reprend comme sku
// explicite plutot que d'en laisser un nouveau etre alloue par le trigger
// DB (assign_sku_before_insert ne s'active que si sku est encore null).

const TRAILING_SKU_PATTERN = /\s*#(\d+)\s*$/;

export function extractSkuFromTitle(title: string): { title: string; sku: number | null } {
  const match = title.match(TRAILING_SKU_PATTERN);
  if (!match) return { title, sku: null };
  return { title: title.slice(0, match.index).trimEnd(), sku: Number(match[1]) };
}
