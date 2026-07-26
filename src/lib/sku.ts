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

// stripSkuSuffix (2026-07-26, garde-fou saisie manuelle -- audit complet du
// systeme SKU) : rien n'empechait jusqu'ici un utilisateur de taper lui-meme
// un "#N" dans le champ titre (Generateur ou modale d'edition) -- au
// prochain envoi vers Vinted, formatTitleWithSku y ajoute le VRAI sku par
// dessus, reproduisant exactement le motif "#11 #11" deja rencontre par un
// autre chemin (corrige le 2026-07-25). Applique extractSkuFromTitle en
// boucle (pas une seule passe) pour retirer aussi un eventuel double
// suffixe deja present. Le nombre extrait est toujours jete : jamais
// repris comme sku (meme regle que l'import, voir extension/src/background/
// sync.ts) -- uniquement utilise pour garder le titre propre avant
// sauvegarde.
export function stripSkuSuffix(title: string): string {
  let current = title;
  let extracted = extractSkuFromTitle(current);
  while (extracted.sku !== null) {
    current = extracted.title;
    extracted = extractSkuFromTitle(current);
  }
  return current;
}

// Champs a ecrire en base sur un succes edit_listing (StockPage.tsx::runVintedAction).
// `title` vient TOUJOURS du titre propre connu de ResellOS (listingTitle), jamais du
// payload envoye a Vinted (deja SKU-formate via formatTitleWithSku) -- sinon chaque
// succes reformate un titre deja suffixe et le SKU s'accumule indefiniment (#11 #11 #11...).
// Bug reel confirme en test live le 2026-07-25 : un edit_listing description-only faisait
// quand meme grossir le titre, car l'ancienne ecriture reutilisait le titre du payload
// (deja suffixe) inconditionnellement, meme quand "title" n'etait pas dans changedFields.
export interface EditSuccessSyncFields {
  title: string;
  description: string;
  brand: string;
  category: string;
  color: string;
  size: string;
  material: string;
  condition: string;
  price: number;
}

export function buildEditSuccessSyncFields(
  listingTitle: string,
  editPayload: {
    description: string;
    brand: string | null;
    category: string;
    color: string | null;
    size: string | null;
    material: string | null;
    condition: string;
    price: number;
  }
): EditSuccessSyncFields {
  return {
    title: listingTitle,
    description: editPayload.description,
    brand: editPayload.brand ?? '',
    category: editPayload.category,
    color: editPayload.color ?? '',
    size: editPayload.size ?? '',
    material: editPayload.material ?? '',
    condition: editPayload.condition,
    price: editPayload.price,
  };
}
