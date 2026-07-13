// Le SKU (#1, #2, #43...) est stocke separement du titre (voir
// listings.sku, migration 20260713120000) : le titre reste toujours propre
// en base, le SKU n'est ajoute qu'au moment de l'envoi vers Vinted
// (creation ou modification). extractSkuFromTitle fait l'inverse, utilise
// uniquement lors de l'import d'une annonce Vinted existante dont le titre
// porte deja un numero manuel -- on le reprend plutot que d'en allouer un
// nouveau et de perdre la numerotation en place.

const TRAILING_SKU_PATTERN = /\s*#(\d+)\s*$/;

export function formatTitleWithSku(title: string, sku: number | null): string {
  if (sku === null) return title;
  return `${title} #${sku}`;
}

export function extractSkuFromTitle(title: string): { title: string; sku: number | null } {
  const match = title.match(TRAILING_SKU_PATTERN);
  if (!match) return { title, sku: null };
  return { title: title.slice(0, match.index).trimEnd(), sku: Number(match[1]) };
}
