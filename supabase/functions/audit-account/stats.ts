// Audit du compte Vinted (2026-08-30, remplace Pricer Pro) -- statistiques
// PUREMENT deterministes calculees en code, jamais devinees par Gemini (voir
// prompt.ts : le prompt interdit explicitement d'inventer un chiffre absent
// d'ici). Cette version couvre UNIQUEMENT les annonces deja stockees en base
// (titre/description/categorie/etat/prix/statuts) -- ni la photo de profil
// ni la bio Vinted (aucune capacite de scraping pour ca aujourd'hui, choix
// explicite pour ce premier lot).
//
// Refonte "casier visuel" (2026-08-30, suite) : n'audite plus que le STOCK
// ACTUEL (listings.status='en_stock', filtre par index.ts avant meme d'
// atteindre ce module -- draft/en_attente/vendu sortent du perimetre de
// l'audit, demande explicite). La detection par defaut REPREND EXACTEMENT
// les memes 5 regles que src/lib/listingQuality.ts (duplication deliberee,
// frontiere Vite/Deno -- voir marketEngine.ts pour la meme convention) : les
// contours colores des cartes et les compteurs de cet audit mesurent donc
// TOUJOURS la meme chose, sans jamais avoir besoin d'un cache -- la
// "synchronisation" vient de la logique identique, jamais d'une valeur
// stockee qui pourrait perimer.
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
  vinted_sync_status: string | null;
  created_at: string;
}

export type ListingIssueKind =
  | "no_photo"
  | "single_photo"
  | "missing_description"
  | "missing_category_or_condition"
  | "sync_failed";

const ISSUE_MESSAGES: Record<ListingIssueKind, string> = {
  no_photo: "Ajoute au moins une photo — une annonce sans photo n'attire aucun acheteur.",
  single_photo: "Ajoute plus de photos (une seule aujourd'hui) pour rassurer les acheteurs.",
  missing_description: "Complète la description : état, matière et mesures donnent confiance aux acheteurs.",
  missing_category_or_condition: "Catégorie ou état manquant sur cette annonce.",
  sync_failed: "Une modification précédente a échoué — vérifie l'annonce sur Vinted.",
};

// Meme fonction que src/lib/listingQuality.ts::computeListingIssues,
// dupliquee ici (voir en-tete du fichier). `listing.status` est deja
// toujours 'en_stock' a ce stade (filtre par index.ts), mais la fonction
// reste ecrite pour etre correcte independamment de cette garantie externe.
export function computeIssueKinds(listing: AccountAuditListingRow): ListingIssueKind[] {
  if (listing.status === "vendu") return [];

  const kinds: ListingIssueKind[] = [];
  const photoCount = listing.image_urls?.length ?? 0;
  if (photoCount === 0) kinds.push("no_photo");
  else if (photoCount === 1) kinds.push("single_photo");

  const descLength = listing.description?.trim().length ?? 0;
  if (descLength < MIN_DESCRIPTION_LENGTH) kinds.push("missing_description");

  if (!listing.category || !listing.condition) kinds.push("missing_category_or_condition");

  if (listing.status === "en_stock" && listing.vinted_sync_status === "sync_failed") {
    kinds.push("sync_failed");
  }

  return kinds;
}

export interface FlaggedListing {
  id: string;
  title: string;
  issueCount: number;
  topMessage: string;
}

export interface AccountStats {
  totalListings: number;
  noPhotoCount: number;
  singlePhotoCount: number;
  missingDescriptionCount: number;
  missingCategoryOrConditionCount: number;
  syncFailedCount: number;
  perfectCount: number;
  agingCount: number;
  needsRepublishCount: number;
  avgPhotoCount: number;
  topCategory: string | null;
  topBrand: string | null;
  score: number;
  // Annonces avec au moins un defaut, triees par nombre de defauts
  // decroissant -- permet au rapport de pointer vers les cartes concernees
  // (demande explicite : "injecter... dans les cartes concernees"), plafonne
  // pour ne jamais gonfler la reponse sur un gros catalogue.
  flaggedListings: FlaggedListing[];
}

const NEEDS_REPUBLISH_VINTED_STATUSES = new Set(["hidden", "deleted", "draft", "unknown"]);
const MAX_FLAGGED_LISTINGS = 15;

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
      noPhotoCount: 0,
      singlePhotoCount: 0,
      missingDescriptionCount: 0,
      missingCategoryOrConditionCount: 0,
      syncFailedCount: 0,
      perfectCount: 0,
      agingCount: 0,
      needsRepublishCount: 0,
      avgPhotoCount: 0,
      topCategory: null,
      topBrand: null,
      score: 0,
      flaggedListings: [],
    };
  }

  let noPhotoCount = 0;
  let singlePhotoCount = 0;
  let missingDescriptionCount = 0;
  let missingCategoryOrConditionCount = 0;
  let syncFailedCount = 0;
  let perfectCount = 0;
  let agingCount = 0;
  let needsRepublishCount = 0;
  let photoTotal = 0;
  const flaggedListings: FlaggedListing[] = [];

  for (const item of listings) {
    const kinds = computeIssueKinds(item);
    if (kinds.length === 0) perfectCount++;
    else {
      flaggedListings.push({
        id: item.id,
        title: item.title,
        issueCount: kinds.length,
        topMessage: ISSUE_MESSAGES[kinds[0]],
      });
    }
    if (kinds.includes("no_photo")) noPhotoCount++;
    if (kinds.includes("single_photo")) singlePhotoCount++;
    if (kinds.includes("missing_description")) missingDescriptionCount++;
    if (kinds.includes("missing_category_or_condition")) missingCategoryOrConditionCount++;
    if (kinds.includes("sync_failed")) syncFailedCount++;

    const photoCount = item.image_urls?.length ?? 0;
    photoTotal += photoCount;

    const ageDays = (now.getTime() - new Date(item.created_at).getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays > AGING_STOCK_DAYS) agingCount++;
    if (!item.vinted_item_id || NEEDS_REPUBLISH_VINTED_STATUSES.has(item.vinted_status ?? "")) {
      needsRepublishCount++;
    }
  }

  flaggedListings.sort((a, b) => b.issueCount - a.issueCount);

  // Score deterministe (0-100, jamais invente par Gemini) : part de 100,
  // penalites proportionnelles au taux d'annonces du stock actuel concernees
  // par chaque probleme -- poids volontairement plus lourd pour l'absence de
  // photo (bloquant pour vendre) que pour une description courte (genant
  // mais pas redhibitoire). BETA : ponderation de depart, non calibree sur
  // un volume reel (meme statut que les seuils de src/lib/insights/constants.ts).
  const penalty =
    (noPhotoCount / totalListings) * 35 +
    (singlePhotoCount / totalListings) * 10 +
    (missingDescriptionCount / totalListings) * 20 +
    (agingCount / totalListings) * 20 +
    (needsRepublishCount / totalListings) * 15;
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  return {
    totalListings,
    noPhotoCount,
    singlePhotoCount,
    missingDescriptionCount,
    missingCategoryOrConditionCount,
    syncFailedCount,
    perfectCount,
    agingCount,
    needsRepublishCount,
    avgPhotoCount: Math.round((photoTotal / totalListings) * 10) / 10,
    topCategory: mostFrequent(listings.map((l) => l.category)),
    topBrand: mostFrequent(listings.map((l) => l.brand)),
    score,
    flaggedListings: flaggedListings.slice(0, MAX_FLAGGED_LISTINGS),
  };
}
