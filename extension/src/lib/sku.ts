// Copie volontaire des fonctions de src/lib/sku.ts (pas de tooling
// monorepo partage entre l'app et l'extension, meme convention que
// date.ts/messages.ts).

import type { SupabaseClient } from "@supabase/supabase-js";

// extractSkuFromTitle : au premier import d'une annonce Vinted existante
// dont le titre porte deja un numero manuel (" #12"), sert UNIQUEMENT a
// nettoyer le titre (voir sync.ts) -- le nombre extrait n'est plus jamais
// repris comme sku (decision explicite 2026-07-26, "le systeme ne doit
// plus deviner les SKU a partir des titres"), qui vient toujours du
// trigger DB (assign_sku_before_insert, ne s'active que si sku est encore
// null).
const TRAILING_SKU_PATTERN = /\s*#(\d+)\s*$/;

export function extractSkuFromTitle(title: string): { title: string; sku: number | null } {
  const match = title.match(TRAILING_SKU_PATTERN);
  if (!match) return { title, sku: null };
  return { title: title.slice(0, match.index).trimEnd(), sku: Number(match[1]) };
}

// Contrat normalise du resultat de reparation (2026-07-27, meme contrat que
// src/lib/sku.ts::runSkuRepair -- voir ce fichier pour le detail complet du
// raisonnement). Duplique ici pour que l'extension (sync.ts) puisse
// appeler repair_sku_inconsistencies() depuis les memes points d'entree
// (synchro, import) sans dependre de l'app.
export interface SkuRepairResult {
  success: boolean;
  repaired: {
    title_cleaned: number;
    sku_allocated: number;
    sku_released: number;
    sku_resynced: number;
  };
  warnings: ("duplicate_detected" | "manual_review_required")[];
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

export async function runSkuRepair(client: SupabaseClient, userId: string): Promise<SkuRepairResult> {
  const { data, error } = await client.rpc("repair_sku_inconsistencies", { p_user_id: userId });
  if (error) {
    return EMPTY_SKU_REPAIR_RESULT;
  }

  const rows = (data ?? []) as SkuRepairRow[];
  const repaired = { title_cleaned: 0, sku_allocated: 0, sku_released: 0, sku_resynced: 0 };
  const warnings = new Set<SkuRepairResult["warnings"][number]>();

  for (const row of rows) {
    switch (row.action) {
      case "title_cleaned":
        repaired.title_cleaned += 1;
        break;
      case "sku_allocated":
        repaired.sku_allocated += 1;
        break;
      case "denormalized_resynced":
        repaired.sku_resynced += 1;
        break;
      case "duplicate_flagged_manual_review":
        warnings.add("duplicate_detected");
        warnings.add("manual_review_required");
        break;
    }
  }

  return { success: true, repaired, warnings: [...warnings] };
}
