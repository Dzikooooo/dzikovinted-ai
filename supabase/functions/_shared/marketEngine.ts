import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Market Engine V2 (Lot 1, 2026-08-10) -- couche partagee par les futures
// fonctions Deno qui ont besoin de pricing/confiance marche (aujourd'hui :
// analyze-clothing). Meme role que _shared/credits.ts / _shared/plans.ts :
// module pur, testable, partage a l'INTERIEUR de la frontiere de build Deno
// (supabase/functions/).
//
// Duplique DELIBEREMENT les formules statistiques de scripts/opportunity-
// engine/{math,priceModel,confidence}.ts (Node, Scanner/Niches) plutot que
// de les importer -- meme convention deja etablie trois fois dans ce repo
// (analyze-clothing avait deja sa propre copie de median()/computeMarketPrice()
// avant ce lot ; src/lib/insights/math.ts duplique deja scripts/opportunity-
// engine/math.ts). Deno (supabase/functions/) et Node (scripts/, deploye via
// GitHub Actions) sont deux frontieres de build et de deploiement distinctes
// dans ce projet, sans partage de code entre elles nulle part -- forcer un
// module litteralement importe des deux cotes casserait cette convention
// pour un gain incertain. Ce que ce lot supprime reellement comme
// duplication : la copie inline que analyze-clothing/index.ts avait de
// median()/computeMarketPrice(), desormais deleguee ICI et reutilisable par
// toute future fonction Deno (voir rapport, section M).

export type MarketTier = "strong" | "broad" | "none";
export type MarketFreshness = "recent" | "acceptable" | "old" | "stale";
export type MarketConfidenceLevel = "elevee" | "moyenne" | "faible" | "ia_uniquement";

export interface MarketPricing {
  price: number;
  quickPrice: number;
  premiumPrice: number;
  dispersion: number | null;
}

export interface MarketConfidence {
  score: number;
  level: MarketConfidenceLevel;
  reasons: string[];
}

export interface MarketContext {
  tier: MarketTier;
  comparablesCount: number;
  freshness: MarketFreshness | null;
  freshestObservedAt: string | null;
  pricing: MarketPricing | null;
  confidence: MarketConfidence;
}

// ─── Statistiques pures (dupliquees deliberement, voir en-tete) ───────────
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  if (m === null) return null;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Ecart-type / moyenne : mesure de dispersion relative, comparable entre des
// gammes de prix differentes (voir scripts/opportunity-engine/math.ts, meme
// fonction, meme justification).
function coefficientOfVariation(values: number[]): number | null {
  const m = mean(values);
  const sd = stdev(values);
  if (m === null || sd === null || m === 0) return null;
  return sd / m;
}

// ─── Seuils nommes ──────────────────────────────────────────────────────────
// BETA : valeurs de depart non calibrees sur un volume reel de generations
// (meme statut que scripts/opportunity-engine/constants.ts) -- a ajuster une
// fois plusieurs semaines de production accumulees, jamais presentees comme
// optimales.
export const MIN_COMPARABLES_FOR_MARKET_PRICE = 3;
export const OBSERVATION_LOOKBACK_DAYS = 60;
const PRICE_DISPERSION_MODERATE = 0.15;
const PRICE_DISPERSION_HIGH = 0.3;

// Fenetres de fraicheur, toujours a l'interieur de OBSERVATION_LOOKBACK_DAYS
// (rien de plus vieux que 60 jours n'entre meme dans le pool de comparables).
const FRESHNESS_RECENT_HOURS = 24;
const FRESHNESS_ACCEPTABLE_DAYS = 7;
const FRESHNESS_OLD_DAYS = 30;

export function classifyFreshness(observedAt: Date, now: Date): MarketFreshness {
  const ageHours = (now.getTime() - observedAt.getTime()) / (60 * 60 * 1000);
  if (ageHours <= FRESHNESS_RECENT_HOURS) return "recent";
  if (ageHours <= FRESHNESS_ACCEPTABLE_DAYS * 24) return "acceptable";
  if (ageHours <= FRESHNESS_OLD_DAYS * 24) return "old";
  return "stale";
}

// ─── Comparables ────────────────────────────────────────────────────────────
interface ObservationRow {
  price: number;
  scanned_at: string;
}

// Le tier "broad" ne relache JAMAIS le filtre de marque -- seule la
// correspondance de categorie s'assouplit. market_price_observations.category
// (alimente par scripts/vinted-scan.ts depuis watchlist.category) et le
// texte libre renvoye par Gemini ne partagent pas la meme taxonomie : un
// match exact echoue souvent alors que les deux designent le meme type
// d'article (ex. watchlist "Pulls Homme" vs Gemini "Pull"). Ce tier tolere
// donc un rapprochement partiel sur le mot le plus significatif de la
// categorie -- heuristique volontairement simple (pas un moteur de
// taxonomie), jamais un abandon total du filtre de categorie (qui
// melangerait par ex. chaussures et vestes d'une meme marque sous un meme
// prix "de marque").
function extractCategoryToken(category: string): string | null {
  // \p{Diacritic} (flag u) plutot qu'une plage Unicode litterale dans une
  // classe de caracteres -- evite toute ambiguite d'encodage sur ce fichier,
  // supporte nativement par le runtime V8/Deno utilise ici.
  const stripped = category.normalize("NFKD").replace(/\p{Diacritic}/gu, "");
  const words = stripped
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
  if (words.length === 0) return null;
  return words.reduce((longest, w) => (w.length > longest.length ? w : longest), words[0]);
}

async function queryObservations(
  supabase: SupabaseClient,
  brand: string,
  categoryFilter: { mode: "exact" | "contains"; value: string },
  lookbackSince: string
): Promise<ObservationRow[]> {
  const base = supabase
    .from("market_price_observations")
    .select("price, scanned_at")
    .ilike("brand", brand)
    .gte("scanned_at", lookbackSince)
    .order("scanned_at", { ascending: false })
    .limit(200);

  const query = categoryFilter.mode === "exact"
    ? base.ilike("category", categoryFilter.value)
    : base.ilike("category", `%${categoryFilter.value}%`);

  const { data, error } = await query;
  if (error) {
    console.error("[marketEngine] echec requete market_price_observations", error);
    return [];
  }
  return (data ?? []).filter(
    (row: { price: unknown }): row is ObservationRow => Number.isFinite(Number(row.price)) && Number(row.price) > 0
  );
}

async function findComparables(
  supabase: SupabaseClient,
  brand: string,
  category: string,
  now: Date
): Promise<{ tier: MarketTier; rows: ObservationRow[] }> {
  const lookbackSince = new Date(now.getTime() - OBSERVATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const strongRows = await queryObservations(supabase, brand, { mode: "exact", value: category }, lookbackSince);
  if (strongRows.length >= MIN_COMPARABLES_FOR_MARKET_PRICE) {
    return { tier: "strong", rows: strongRows };
  }

  const token = extractCategoryToken(category);
  if (token) {
    const broadRows = await queryObservations(supabase, brand, { mode: "contains", value: token }, lookbackSince);
    if (broadRows.length >= MIN_COMPARABLES_FOR_MARKET_PRICE) {
      return { tier: "broad", rows: broadRows };
    }
  }

  return { tier: "none", rows: [] };
}

// ─── Pricing ────────────────────────────────────────────────────────────────
// Formule inchangee (mediane x0.9/x1.25) par rapport a la version deja en
// production -- aucune justification statistique documentee de la remplacer
// dans ce lot (voir rapport, section F : rester deterministe et simple tant
// qu'aucun signal ne justifie une ponderation variable).
function computePricing(prices: number[]): MarketPricing | null {
  const med = median(prices);
  if (med === null) return null;
  return {
    price: Math.round(med),
    quickPrice: Math.round(med * 0.9),
    premiumPrice: Math.round(med * 1.25),
    dispersion: coefficientOfVariation(prices),
  };
}

// ─── Confiance ──────────────────────────────────────────────────────────────
// Meme squelette que scripts/opportunity-engine/confidence.ts (base = nombre
// de comparables, penalites de dispersion, memes seuils 0.15/0.3) + deux
// penalites propres au Generateur, absentes cote Scanner (qui tourne toutes
// les 4h et n'a donc jamais ce probleme a cette echelle) : fraicheur de
// l'observation la plus recente du pool, et tier "broad" (categorie
// assouplie = moins precis qu'une correspondance exacte).
function computeConfidence(
  comparablesCount: number,
  dispersion: number | null,
  freshness: MarketFreshness | null,
  tier: MarketTier
): MarketConfidence {
  if (tier === "none") {
    return { score: 0, level: "ia_uniquement", reasons: ["Aucune donnee de marche exploitable"] };
  }

  const reasons: string[] = [`Basee sur ${comparablesCount} annonce(s) comparable(s)`];
  let score = Math.min(100, comparablesCount * 5);

  if (dispersion !== null) {
    if (dispersion >= PRICE_DISPERSION_HIGH) {
      score -= 20;
      reasons.push("Prix comparables tres disperses");
    } else if (dispersion >= PRICE_DISPERSION_MODERATE) {
      score -= 10;
      reasons.push("Prix comparables moderement disperses");
    }
  }

  if (freshness === "stale") {
    score -= 15;
    reasons.push("Donnees de marche anciennes");
  } else if (freshness === "old") {
    score -= 5;
    reasons.push("Donnees de marche pas toutes recentes");
  }

  if (tier === "broad") {
    score -= 10;
    reasons.push("Categorie rapprochee, pas une correspondance exacte");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level: MarketConfidenceLevel = score >= 70 ? "elevee" : score >= 40 ? "moyenne" : "faible";
  return { score, level, reasons };
}

// ─── Orchestrateur ──────────────────────────────────────────────────────────
// Photo -> (Gemini, en amont, hors de ce module) -> brand/category ->
// findComparables() -> computePricing()/computeConfidence(). Ne leve jamais
// -- une erreur reseau/Supabase degrade en tier "none" (voir queryObservations),
// jamais une exception qui ferait echouer toute la generation (le Market
// Engine est une couche de valeur, pas un SPOF du Generateur).
export async function buildMarketContext(
  supabase: SupabaseClient,
  input: { brand: string; category: string },
  now: Date = new Date()
): Promise<MarketContext> {
  if (!input.brand || !input.category) {
    return {
      tier: "none",
      comparablesCount: 0,
      freshness: null,
      freshestObservedAt: null,
      pricing: null,
      confidence: computeConfidence(0, null, null, "none"),
    };
  }

  const { tier, rows } = await findComparables(supabase, input.brand, input.category, now);

  if (tier === "none" || rows.length === 0) {
    return {
      tier: "none",
      comparablesCount: 0,
      freshness: null,
      freshestObservedAt: null,
      pricing: null,
      confidence: computeConfidence(0, null, null, "none"),
    };
  }

  const prices = rows.map((r) => Number(r.price));
  const pricing = computePricing(prices);
  const freshestObservedAt = rows.reduce((max, r) => (r.scanned_at > max ? r.scanned_at : max), rows[0].scanned_at);
  const freshness = classifyFreshness(new Date(freshestObservedAt), now);
  const confidence = computeConfidence(rows.length, pricing?.dispersion ?? null, freshness, tier);

  return { tier, comparablesCount: rows.length, freshness, freshestObservedAt, pricing, confidence };
}
