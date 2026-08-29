// Audit du compte Vinted (2026-08-30, remplace Pricer Pro) -- statistiques
// PUREMENT deterministes calculees en code, jamais devinees par Gemini (voir
// prompt.ts : le prompt interdit explicitement d'inventer un chiffre absent
// d'ici). Cette version couvre UNIQUEMENT les annonces deja stockees en base
// (titre/description/categorie/etat/prix/statuts) -- ni la photo de profil
// ni la bio Vinted (aucune capacite de scraping pour ca aujourd'hui, choix
// explicite pour ce premier lot).
//
// Seuils dupliques DELIBEREMENT depuis src/lib/insights/constants.ts (Vite)
// plutot qu'importes -- meme convention deja etablie par marketEngine.ts :
// Deno (supabase/functions/) et Node/Vite (src/, scripts/) sont deux
// frontieres de build distinctes dans ce repo, jamais de partage de code
// entre elles.
const AGING_STOCK_DAYS = 21;
const MIN_DESCRIPTION_LENGTH = 20;

export interface AccountAuditListingRow {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  condition: string | null;
  price: number;
  image_urls: string[] | null;
  vinted_item_id: string | null;
  vinted_status: string | null;
  status: string;
  created_at: string;
}

export interface AccountStats {
  totalListings: number;
  activeCount: number;
  draftCount: number;
  pendingCount: number;
  soldCount: number;
  missingDescriptionCount: number;
  noPhotoCount: number;
  singlePhotoCount: number;
  agingActiveCount: number;
  needsRepublishCount: number;
  avgPhotoCount: number;
  topCategory: string | null;
  topBrand: string | null;
  score: number;
}

const NEEDS_REPUBLISH_VINTED_STATUSES = new Set(["hidden", "deleted", "draft", "unknown"]);

function mostFrequent(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

export function computeAccountStats(listings: AccountAuditListingRow[], now: Date = new Date()): AccountStats {
  const totalListings = listings.length;
  if (totalListings === 0) {
    return {
      totalListings: 0,
      activeCount: 0,
      draftCount: 0,
      pendingCount: 0,
      soldCount: 0,
      missingDescriptionCount: 0,
      noPhotoCount: 0,
      singlePhotoCount: 0,
      agingActiveCount: 0,
      needsRepublishCount: 0,
      avgPhotoCount: 0,
      topCategory: null,
      topBrand: null,
      score: 0,
    };
  }

  let activeCount = 0;
  let draftCount = 0;
  let pendingCount = 0;
  let soldCount = 0;
  let missingDescriptionCount = 0;
  let noPhotoCount = 0;
  let singlePhotoCount = 0;
  let agingActiveCount = 0;
  let needsRepublishCount = 0;
  let photoTotal = 0;

  for (const item of listings) {
    if (item.status === "en_stock") activeCount++;
    else if (item.status === "draft") draftCount++;
    else if (item.status === "en_attente") pendingCount++;
    else if (item.status === "vendu") soldCount++;

    const descLength = item.description?.trim().length ?? 0;
    if (descLength < MIN_DESCRIPTION_LENGTH) missingDescriptionCount++;

    const photoCount = item.image_urls?.length ?? 0;
    photoTotal += photoCount;
    if (photoCount === 0) noPhotoCount++;
    else if (photoCount === 1) singlePhotoCount++;

    if (item.status === "en_stock") {
      const ageDays = (now.getTime() - new Date(item.created_at).getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays > AGING_STOCK_DAYS) agingActiveCount++;

      if (!item.vinted_item_id || NEEDS_REPUBLISH_VINTED_STATUSES.has(item.vinted_status ?? "")) {
        needsRepublishCount++;
      }
    }
  }

  // Score deterministe (0-100, jamais invente par Gemini) : part de 100,
  // penalites proportionnelles au taux d'annonces concernees par chaque
  // probleme -- poids volontairement plus lourd pour l'absence de photo
  // (bloquant pour vendre) que pour une description courte (genant mais pas
  // redhibitoire). BETA : ponderation de depart, non calibree sur un volume
  // reel (meme statut que les seuils de src/lib/insights/constants.ts).
  const activeOrDraft = activeCount + draftCount || 1;
  const penalty =
    (noPhotoCount / totalListings) * 35 +
    (singlePhotoCount / totalListings) * 10 +
    (missingDescriptionCount / totalListings) * 20 +
    (agingActiveCount / activeOrDraft) * 20 +
    (needsRepublishCount / activeOrDraft) * 15;
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  return {
    totalListings,
    activeCount,
    draftCount,
    pendingCount,
    soldCount,
    missingDescriptionCount,
    noPhotoCount,
    singlePhotoCount,
    agingActiveCount,
    needsRepublishCount,
    avgPhotoCount: Math.round((photoTotal / totalListings) * 10) / 10,
    topCategory: mostFrequent(listings.map((l) => l.category)),
    topBrand: mostFrequent(listings.map((l) => l.brand)),
    score,
  };
}
