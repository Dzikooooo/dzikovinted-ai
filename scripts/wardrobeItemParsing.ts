// Extrait de vinted-wardrobe-sync.ts (2026-08-31) -- meme raison que
// itemExtraction.ts/cardSettle.ts pour vinted-scan.ts : module PUR, sans
// Playwright ni Supabase, importable par les tests sans jamais declencher
// main() (qui, lui, lance un vrai navigateur et ecrit en base).

export interface WardrobeItem {
  id: string;
  title: string;
  price: number | null;
  url: string;
  photoUrl: string | null;
  favourites: number;
  views: number;
}

export interface ItemDetail {
  title: string | null;
  description: string | null;
  price: number | null;
  brand: string | null;
  category: string | null;
  color: string | null;
  size: string | null;
  condition: string | null;
  material: string | null;
  photoUrls: string[];
}

// price.amount arrive tantot en string tantot en number selon les endpoints
// Vinted deja observes dans ce repo (voir ScrapedItem/vinted-scan.ts),
// jamais suppose d'un seul type. Un item sans id NI url exploitable est
// rejete (null) plutot qu'insere avec des champs vides -- filtre applique
// par l'appelant.
export function parseWardrobeItem(raw: unknown): WardrobeItem | null {
  const it = raw as {
    id?: number | string;
    title?: string;
    url?: string;
    price?: { amount?: string | number };
    photos?: { url?: string }[];
    favourite_count?: number;
    view_count?: number;
  };
  const id = String(it.id ?? "");
  const url = it.url ?? (it.id ? `https://www.vinted.fr/items/${it.id}` : "");
  if (!id || !url) return null;

  const priceRaw = it.price?.amount;
  const price = typeof priceRaw === "number" ? priceRaw : typeof priceRaw === "string" ? parseFloat(priceRaw) : null;

  return {
    id,
    title: it.title ?? "",
    price: price !== null && Number.isFinite(price) ? price : null,
    url,
    photoUrl: it.photos?.[0]?.url ?? null,
    favourites: it.favourite_count ?? 0,
    views: it.view_count ?? 0,
  };
}

// Duplique volontairement de src/lib/sku.ts::stripSkuSuffix plutot
// qu'importe depuis src/ (scripts/ reste un dossier autonome dans ce repo,
// aucun fichier existant n'y importe depuis src/ -- voir vinted-scan.ts).
// Meme comportement exact : retire un eventuel "#N" manuel deja present
// dans le titre Vinted, jamais repris comme SKU (toujours alloue par le
// trigger DB assign_sku_before_insert).
const TRAILING_SKU_PATTERN = /\s*#(\d+)\s*$/;
export function stripSkuSuffix(title: string): string {
  let current = title;
  let match = current.match(TRAILING_SKU_PATTERN);
  while (match) {
    current = current.slice(0, match.index).trimEnd();
    match = current.match(TRAILING_SKU_PATTERN);
  }
  return current;
}
