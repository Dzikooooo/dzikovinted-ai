import type { SupabaseClient } from '@supabase/supabase-js';

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

// Contrat normalise du resultat de reparation (2026-07-27, demande
// explicite -- "je ne veux pas devoir changer le contrat RPC plus tard").
// repair_sku_inconsistencies() (migration 20260726200000) renvoie un
// ensemble de lignes {action, listing_id, detail} -- utile comme journal
// detaille, mais pas directement exploitable par un futur Centre des
// Actions/badge/metrique. runSkuRepair() agrege ces lignes dans cette forme
// stable des maintenant, meme si pour l'instant (chantier "auto-reparation")
// le seul consommateur est un simple console.log/logger.info -- aucune UI,
// aucune notification, aucun blocage.
export interface SkuRepairResult {
  success: boolean;
  repaired: {
    title_cleaned: number;
    sku_allocated: number;
    // Toujours 0 pour l'instant : repair_sku_inconsistencies() n'alloue,
    // ne nettoie et ne resynchronise jamais de liberation -- la liberation
    // reste entierement geree par le trigger AFTER UPDATE (vente/suppression
    // definitive). Champ present des maintenant pour ne pas avoir a changer
    // ce contrat si une detection de liberation manquee est ajoutee un jour.
    sku_released: number;
    sku_resynced: number;
  };
  warnings: ('duplicate_detected' | 'manual_review_required')[];
}

const EMPTY_SKU_REPAIR_RESULT: SkuRepairResult = {
  success: false,
  repaired: { title_cleaned: 0, sku_allocated: 0, sku_released: 0, sku_resynced: 0 },
  warnings: [],
};

interface SkuRepairRow {
  action: string;
  listing_id: string;
  detail: string;
}

// runSkuRepair : appelle repair_sku_inconsistencies() et agrege ses lignes
// dans le contrat normalise ci-dessus. Un doublon detecte (action
// 'duplicate_flagged_manual_review') n'incremente jamais un compteur
// 'repaired' -- rien n'a ete corrige, seulement signale -- et pousse les
// deux warnings ensemble (aucune autre situation ne declenche
// 'manual_review_required' pour l'instant, les deux avancent donc toujours
// de pair). Best-effort strict : une erreur RPC renvoie success:false sans
// jamais lever -- l'appelant journalise, ne bloque et ne "rollback" jamais
// l'action principale qui a declenche cet appel (demande explicite).
export async function runSkuRepair(client: SupabaseClient, userId: string): Promise<SkuRepairResult> {
  const { data, error } = await client.rpc('repair_sku_inconsistencies', { p_user_id: userId });
  if (error) {
    return EMPTY_SKU_REPAIR_RESULT;
  }

  const rows = (data ?? []) as SkuRepairRow[];
  const repaired = { title_cleaned: 0, sku_allocated: 0, sku_released: 0, sku_resynced: 0 };
  const warnings = new Set<SkuRepairResult['warnings'][number]>();

  for (const row of rows) {
    switch (row.action) {
      case 'title_cleaned':
        repaired.title_cleaned += 1;
        break;
      case 'sku_allocated':
        repaired.sku_allocated += 1;
        break;
      case 'denormalized_resynced':
        repaired.sku_resynced += 1;
        break;
      case 'duplicate_flagged_manual_review':
        warnings.add('duplicate_detected');
        warnings.add('manual_review_required');
        break;
    }
  }

  return { success: true, repaired, warnings: [...warnings] };
}
