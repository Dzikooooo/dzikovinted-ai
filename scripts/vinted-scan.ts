import { randomUUID } from "node:crypto";
import { chromium, type Page } from "playwright";
import { supabase } from "./supabase";
import {
  analyzeOpportunity,
  meetsOpportunityGate,
  buildScanContext,
  buildSearchContext,
  contextForItem,
  observationLookbackSince,
  normalizeBrand,
} from "./opportunity-engine";
import type { ScrapedItem } from "./types";
import { dedupeWatchlist, type WatchlistRow } from "./watchlistDedup";
import { waitForCardsToSettle } from "./cardSettle";
import { mapWithConcurrency, planGalleryFetches, PHOTO_FETCH_CONCURRENCY } from "./photoPlan";

// Present uniquement quand ce script est declenche via workflow_dispatch
// depuis "Scanner maintenant" (voir supabase/functions/scan-market et
// src/lib/actions/handlers/scanMarket.ts) - absent lors du cron normal de
// 4h, auquel cas tout ce qui suit est un no-op et le comportement reste
// exactement celui d'avant (aucune regression sur le cron).
const actionId = process.env.ACTION_ID?.trim() || null;
const scanStartedAt = Date.now();
// A la difference de action_log (per-user, RLS auth.uid() = user_id), un run
// cron n'a aucun utilisateur a qui l'attribuer - il scanne la watchlist
// fusionnee de tous les utilisateurs. Sans cette table, un run cron qui
// echouait apres avoir vide market_opportunities ne laissait absolument
// aucune trace nulle part : un ecran "Aucune opportunite" identique a un
// simple manque de donnees, sans aucun moyen de savoir qu'un echec reel
// s'etait produit (audit du parcours Scanner, 2026-07-24). Ecrite pour
// CHAQUE run (cron ou manuel), contrairement a action_log qui ne concerne
// que les runs manuels via ACTION_ID.
let scanRunId: string | null = null;

// Identifiant du lot ecrit par CE scan. Genere ici et non repris de
// scan_runs.id : l'insertion dans scan_runs peut echouer sans arreter le scan
// (le script logue et continue), et faire dependre la bascule de cette
// insertion rendrait le scan plus fragile qu'avant.
const scanBatchId = randomUUID();

// Chronometre par phase : "le scan est trop long" doit se diagnostiquer en
// lisant les logs du run, pas en re-estimant le budget depuis le code.
const phaseTimings: Array<{ phase: string; seconds: number }> = [];

async function logProgress(step: string, message: string): Promise<void> {
  if (!actionId) return;
  try {
    await supabase.from("action_log_entries").insert({ action_id: actionId, step, message });
    await supabase.from("action_log").update({ current_step: step }).eq("id", actionId);
  } catch (e) {
    console.error("logProgress failed:", e);
  }
}

async function writeTerminal(
  status: "success" | "error",
  extra: { resultPayload?: Record<string, unknown>; errorMessage?: string }
): Promise<void> {
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - scanStartedAt;
  const opportunitiesFound = (extra.resultPayload?.opportunitiesFound as number | undefined) ?? null;
  const failedSearchesCount = (extra.resultPayload?.failedSearches as number | undefined) ?? null;

  if (scanRunId) {
    const { error } = await supabase
      .from("scan_runs")
      .update({
        status,
        completed_at: completedAt,
        opportunities_found: opportunitiesFound,
        failed_searches: failedSearchesCount,
        error_message: extra.errorMessage ?? null,
      })
      .eq("id", scanRunId);
    if (error) console.error("scan_runs update failed:", error);
  }

  if (!actionId) return;
  try {
    await supabase
      .from("action_log")
      .update({
        status,
        result_payload: extra.resultPayload ?? null,
        error_message: extra.errorMessage ?? null,
        completed_at: completedAt,
        duration_ms: durationMs,
      })
      .eq("id", actionId);
  } catch (e) {
    console.error("writeTerminal failed:", e);
  }
}

interface ObservationRow {
  watchlist_id: string;
  vinted_url: string;
  brand: string;
  category: string;
  price: number;
  favourites: number;
}

// Taille de lot pour l'insertion de l'historique (market_price_observations).
// Un insert multi-lignes Postgres est atomique : une seule ligne invalide
// (contrainte violee, valeur inattendue) fait echouer tout le lot d'un coup,
// y compris les lignes valides. Avec ~3000-4000 lignes par scan (21
// recherches x ~150-250 annonces), un seul insert géant maximise le risque
// qu'une anomalie ponctuelle (ex. NaN serialise en null par JSON.stringify,
// voir DATABASE.md) fasse perdre TOUT l'historique du scan sans que la
// vraie ligne fautive soit identifiable. Des lots de 500 limitent le degat
// a un lot et permettent de logger precisement lequel echoue.
const OBSERVATION_INSERT_BATCH_SIZE = 500;

// Diagnostic explicite (2026-07-12) : un scan reel a produit 214
// opportunites correctement enregistrees mais 0 ligne dans
// market_price_observations, sans exception ni crash visible - preuve que
// l'echec est soit silencieux (erreur Supabase non assez detaillee dans le
// log), soit que ce bloc n'etait pas atteint avec des lignes a inserer.
// Cette fonction rend les deux hypotheses immediatement verifiables au
// prochain scan : elle logue explicitement le nombre de lignes AVANT
// tentative (jamais "rien" si le tableau est vide), puis le resultat
// complet (succes ou detail integral de l'erreur Postgres/PostgREST :
// message, code, details, hint) pour chaque lot.
async function insertObservations(rows: ObservationRow[]): Promise<void> {
  console.log(`[observations] ${rows.length} ligne(s) a inserer dans market_price_observations`);

  if (rows.length === 0) {
    console.log("[observations] Aucune ligne a inserer (observationRows vide) - rien a faire.");
    return;
  }

  let totalInserted = 0;
  let totalFailed = 0;

  for (let i = 0; i < rows.length; i += OBSERVATION_INSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + OBSERVATION_INSERT_BATCH_SIZE);
    const batchNumber = Math.floor(i / OBSERVATION_INSERT_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / OBSERVATION_INSERT_BATCH_SIZE);

    const { error, status, statusText } = await supabase
      .from("market_price_observations")
      .insert(batch);

    if (error) {
      totalFailed += batch.length;
      console.error(
        `[observations] ECHEC lot ${batchNumber}/${totalBatches} (${batch.length} lignes) - ` +
          `HTTP ${status} ${statusText} - message="${error.message}" code="${error.code}" ` +
          `details="${error.details}" hint="${error.hint}"`
      );
      console.error(
        `[observations] Exemple de ligne du lot en echec (premiere ligne) :`,
        JSON.stringify(batch[0])
      );
    } else {
      totalInserted += batch.length;
      console.log(`[observations] Lot ${batchNumber}/${totalBatches} OK (${batch.length} lignes)`);
    }
  }

  console.log(
    `[observations] Bilan final : ${totalInserted}/${rows.length} lignes inserees, ${totalFailed} en echec`
  );
}

function normalize(str: string) {
  return str
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SYNONYMS: Record<string, string[]> = {
  hoodie: ["hoodie", "sweat a capuche", "sweat capuche", "capuche", "trui", "felpa", "sudadera"],
  sweatshirt: ["sweatshirt", "sweat", "pull", "pullover", "crewneck"],
};

function isRelevant(item: ScrapedItem, search: string) {
  const title = normalize(item.title);
  const terms = normalize(search).split(" ");

  return terms.every((term) => {
    const candidates = SYNONYMS[term] ?? [term];
    return candidates.some((candidate) => title.includes(candidate));
  });
}

const PAGES_PER_SEARCH = 2;

// "networkidle" n'est jamais atteint de façon fiable sur une page Vinted
// (tracking/analytics en arrière-plan continu) - confirmé en direct le
// 2026-07-12 : page.goto a expiré après 30s d'attente sur ce critère,
// interrompant tout le scan (voir insertObservations() plus bas pour le
// contexte : l'erreur remontait jusqu'au catch global sans faire échouer
// le job CI). "domcontentloaded" + attente explicite du contenu utile
// (les cartes d'annonces, ou confirmation d'un vrai 0 résultat) est un
// signal réel de "page utilisable", pas une heuristique de trafic réseau.
const NAVIGATION_TIMEOUT_MS = 30000;
const CONTENT_WAIT_TIMEOUT_MS = 10000;
const NAVIGATION_RETRIES = 3;

async function gotoWithRetry(page: Page, url: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= NAVIGATION_RETRIES; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
      // 0 résultat réel est un état valide (le sélecteur n'apparaît jamais
      // sans que ce soit une erreur) - on ignore ce timeout précis, pas les
      // autres.
      await page
        .waitForSelector('[data-testid$="--description-title"]', { timeout: CONTENT_WAIT_TIMEOUT_MS })
        .catch(() => {});
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[nav] Tentative ${attempt}/${NAVIGATION_RETRIES} échouée pour ${url} : ${message}`);
      if (attempt < NAVIGATION_RETRIES) {
        await page.waitForTimeout(2000 * attempt);
      }
    }
  }

  throw lastError;
}

async function extractItemsFromPage(page: Page): Promise<ScrapedItem[]> {
  return page.evaluate(() => {
    const titleEls = document.querySelectorAll('[data-testid$="--description-title"]');
    const results: ScrapedItem[] = [];

    titleEls.forEach((titleEl) => {
      const testid = titleEl.getAttribute("data-testid") || "";
      const prefix = testid.replace(/--description-title$/, "");
      if (!prefix) return;

      const priceEl = document.querySelector(`[data-testid="${prefix}--price-text"]`);
      const linkEl = document.querySelector(`[data-testid="${prefix}--overlay-link"]`);
      const imageEl = document.querySelector(`[data-testid="${prefix}--image--img"]`);
      const container = document.querySelector(`[data-testid="${prefix}"]`);
      const favEl = container?.querySelector('[data-testid="favourite-count-text"]');

      const href = linkEl?.getAttribute("href") || "";
      const priceText = priceEl?.textContent || "";
      const price = Number(priceText.replace(/[^\d,]/g, "").replace(",", "."));
      const slugMatch = href.match(/\/items\/\d+-([^?]+)/);
      const title = slugMatch ? slugMatch[1].replace(/-/g, " ") : "";

      results.push({
        title,
        price,
        image: imageEl?.getAttribute("src") || "",
        url: href,
        favourites: favEl ? parseInt(favEl.textContent || "0", 10) || 0 : 0,
      });
    });

    return results;
  });
}

// Galerie photo complete d'une opportunite retenue (demande produit
// 2026-07-29 : carte cliquable -> voir toutes les photos de l'annonce
// Vinted). Meme selecteur verifie en direct que
// extension/src/content/itemSelectors.ts::extractPhotoUrls() -- une seule
// tentative, timeout court : c'est un enrichissement best-effort execute
// pour chaque opportunite deja retenue (~une centaine par scan), pas une
// etape critique comme scanSearch() -- un echec ponctuel ne doit jamais
// faire perdre l'opportunite elle-meme, seulement sa galerie.
const PHOTO_NAVIGATION_TIMEOUT_MS = 15000;

async function scrapeItemPhotos(page: Page, url: string): Promise<string[]> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: PHOTO_NAVIGATION_TIMEOUT_MS });
    return await page.evaluate(() => {
      const imgs = Array.from(
        document.querySelectorAll<HTMLImageElement>('img[data-testid^="item-photo-"][data-testid$="--img"]')
      );
      const urls = imgs.map((img) => img.getAttribute("src")).filter((src): src is string => !!src);
      return [...new Set(urls)];
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[photos] Galerie ignorée pour ${url} : ${message}`);
    return [];
  }
}

async function scanSearch(page: Page, search: string) {
  const foundItems: ScrapedItem[] = [];

  for (let pageNum = 1; pageNum <= PAGES_PER_SEARCH; pageNum++) {
    await gotoWithRetry(
      page,
      `https://www.vinted.fr/catalog?search_text=${encodeURIComponent(search)}&page=${pageNum}`
    );
    // Attente adaptative au lieu d'un sommeil fixe de 4 s -- voir cardSettle.ts
    // pour la garantie (jamais plus lent, jamais sur une page en cours de
    // remplissage) et le budget de temps que ca recupere.
    await waitForCardsToSettle({
      countCards: () =>
        page.evaluate(() => document.querySelectorAll('[data-testid$="--description-title"]').length),
      wait: (ms) => page.waitForTimeout(ms),
      now: () => Date.now(),
    });
    foundItems.push(...(await extractItemsFromPage(page)));
  }

  const cleanItems = foundItems.filter(
    (item, index, self) =>
      item.url &&
      item.title &&
      item.price > 0 &&
      self.findIndex((i) => i.url === item.url) === index
  );

  const relevantItems = cleanItems.filter((item) => isRelevant(item, search));

  console.log(
    `${search} : ${relevantItems.length}/${cleanItems.length} annonces pertinentes`
  );

  return relevantItems;
}

interface ScoredOpportunity extends ScrapedItem {
  // P0-1 (2026-08-04) : marque de la recherche watchlist qui a produit cet
  // item, jamais le texte scrape du DOM Vinted (voir types.ts ScrapedItem).
  // null quand normalizeBrand() rejette watch.brand (filet de securite,
  // watch.brand est deja fiable par construction -- voir brand.ts).
  brand: string | null;
  category: string;
  market_price: number;
  profit: number;
  roi: number;
  score: number;
  confidence: number;
  price_source: string;
  risk_level: string;
  breakdown: unknown;
  resale_days_min: number | null;
  resale_days_max: number | null;
  resale_confidence: number | null;
  first_observed_at: string | null;
  competing_listings_count: number;
}

async function main() {
  const { data: runRow, error: runInsertError } = await supabase
    .from("scan_runs")
    .insert({ triggered_by: actionId ? "manual" : "cron" })
    .select("id")
    .single();
  if (runInsertError) console.error("scan_runs insert failed:", runInsertError);
  else scanRunId = runRow.id;

  await logProgress("connecting", "Connexion à Vinted…");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    // AVANT la suppression : on retient les galeries deja recuperees lors des
    // scans precedents. Les photos d'une annonce Vinted ne changent pas, et
    // une bonne partie des opportunites reapparait d'un scan a l'autre (cron
    // toutes les 4 h) -- les re-telecharger etait une page.goto par annonce
    // pour un resultat identique. Ce cache ne coute AUCUNE requete vers
    // Vinted, c'est la difference avec les autres pistes d'optimisation.
    const { data: previousGalleries } = await supabase
      .from("market_opportunities")
      .select("vinted_url, images");

    const knownPhotos = new Map<string, string[]>();
    for (const row of previousGalleries ?? []) {
      const url = row.vinted_url as string | null;
      const images = row.images as string[] | null;
      if (url && Array.isArray(images) && images.length > 0) knownPhotos.set(url, images);
    }
    console.log(`Galeries deja connues : ${knownPhotos.size}`);

    // Plus AUCUNE suppression a ce stade (2026-08-26). Le nettoyage des lots
    // precedents a lieu tout a la fin, et uniquement si le scan reussit --
    // voir la bascule apres l'upsert. Un scan qui casse en route laisse donc
    // les opportunites precedentes intactes et visibles.

    const { data: watchlist, error } = await supabase
      .from("watchlist")
      .select("*")
      .eq("active", true)
      .order("priority", { ascending: false });

    if (error) {
      console.error("WATCHLIST ERROR:", error);
      await writeTerminal("error", { errorMessage: "Impossible de lire la liste de surveillance." });
      process.exitCode = 1;
      return;
    }

    // watchlist est desormais personnelle (voir migration
    // personalize_watchlist) - plusieurs utilisateurs peuvent suivre la
    // meme paire marque/modele. dedupeWatchlist() fusionne les lignes en
    // double avant de lancer le moindre scan, pour ne jamais payer le cout
    // d'une recherche identique plusieurs fois - voir scripts/watchlistDedup.ts.
    const watchlistRows = dedupeWatchlist((watchlist ?? []) as WatchlistRow[]);
    console.log(`Watchlist chargée : ${watchlistRows.length} recherches (après dédoublonnage)`);

    // Passe 1 - scrape uniquement. Le score de demande relative (voir
    // opportunity-engine/scoring.ts) a besoin de voir tout le batch avant de
    // noter quoi que ce soit - impossible en mono-passe scrape+score comme
    // avant.
    const perSearchResults: { watch: WatchlistRow; items: ScrapedItem[] }[] = [];
    const observationRows: ObservationRow[] = [];
    const failedSearches: string[] = [];

    const searchesStartedAt = Date.now();

    for (let i = 0; i < watchlistRows.length; i++) {
      const watch = watchlistRows[i];
      const search = `${watch.brand} ${watch.model}`;
      const searchStartedAt = Date.now();

      console.log("\nRecherche :", search);
      await logProgress("searching", `Recherche : ${i + 1}/${watchlistRows.length} (${search})`);

      // Une recherche isolée (page.goto qui expire malgré les tentatives,
      // page cassée...) ne doit jamais interrompre tout le scan - les
      // autres recherches déjà réussies (et celles à venir) restent
      // exploitées, écrites en base normalement.
      let items: ScrapedItem[];
      try {
        items = await scanSearch(page, search);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[scan] Recherche "${search}" ignorée après échec définitif : ${message}`);
        failedSearches.push(search);
        continue;
      }
      console.log(`[timing] recherche "${search}" : ${Math.round((Date.now() - searchStartedAt) / 100) / 10}s`);
      perSearchResults.push({ watch, items });

      let invalidPriceCount = 0;
      for (const item of items) {
        // Garde-fou explicite : JSON.stringify(NaN) devient silencieusement
        // `null`, ce qui violerait la contrainte `price not null` et ferait
        // echouer TOUT le lot d'insertion (pas seulement cette ligne) sans
        // message clair - voir insertObservations(). On ecarte la ligne
        // invalide ici, a la source, plutot que de la laisser polluer un
        // lot entier.
        if (!Number.isFinite(item.price)) {
          invalidPriceCount++;
          continue;
        }
        observationRows.push({
          watchlist_id: watch.id,
          vinted_url: item.url,
          brand: watch.brand,
          category: watch.category,
          price: item.price,
          favourites: item.favourites,
        });
      }
      if (invalidPriceCount > 0) {
        console.error(
          `[observations] ${invalidPriceCount} annonce(s) écartée(s) pour "${search}" (prix invalide, non fini)`
        );
      }
    }

    if (failedSearches.length > 0) {
      console.error(
        `[scan] ${failedSearches.length}/${watchlistRows.length} recherche(s) ignorée(s) après échec définitif : ${failedSearches.join(", ")}`
      );
    }

    // Historique recent (fenetre glissante) charge une seule fois pour tout
    // le scan - alimente prix historiques, demande relative et delai de
    // revente (opportunity-engine/context.ts). Un echec ici ne bloque pas le
    // scan : le moteur degrade proprement en absence d'historique.
    //
    // .order + .limit : plafond defensif, pas un chiffre choisi au hasard -
    // un seul scan reel a deja produit ~3400 observations ; a raison d'un
    // cron toutes les 4h, 60 jours sans purge representent un ordre de
    // grandeur de plusieurs centaines de milliers de lignes sans plafond.
    // 20000 = marge generouse au-dessus de l'echelle "dizaines de milliers"
    // explicitement visee, empeche une explosion memoire/calcul. L'ordre
    // (plus recent d'abord) garantit que seules les observations les plus
    // ANCIENNES de la fenetre seraient tronquees si la limite est atteinte -
    // jamais les plus recentes, qui comptent le plus pour context.ts.
    const { data: observations, error: obsError } = await supabase
      .from("market_price_observations")
      .select("vinted_url, brand, category, price, favourites, scanned_at")
      .gte("scanned_at", observationLookbackSince(new Date()))
      .order("scanned_at", { ascending: false })
      .limit(20000);

    if (obsError) {
      console.error("OBSERVATIONS READ ERROR (continue sans historique) :", obsError);
    }

    const scanCtx = buildScanContext(perSearchResults, observations ?? []);

    phaseTimings.push({ phase: "recherches", seconds: Math.round((Date.now() - searchesStartedAt) / 100) / 10 });
    console.log(`[timing] recherches (total) : ${phaseTimings[phaseTimings.length - 1].seconds}s`);

    // Passe 2 - score, avec le contexte complet du batch.
    const totalScraped = perSearchResults.reduce((n, r) => n + r.items.length, 0);
    await logProgress("analyzing", `Analyse de ${totalScraped} annonce${totalScraped === 1 ? "" : "s"} pertinente${totalScraped === 1 ? "" : "s"}…`);

    const allItems: ScoredOpportunity[] = [];

    for (const { watch, items } of perSearchResults) {
      const comparablePrices = items.map((i) => i.price);
      const searchCtx = buildSearchContext(watch, comparablePrices, scanCtx);

      // Calcule une seule fois par recherche watchlist (constant pour tous
      // ses items) -- evite de repeter le calcul et le log de diagnostic
      // ci-dessous pour chaque annonce individuelle d'une meme recherche.
      const normalizedWatchBrand = normalizeBrand(watch.brand);

      // DIAGNOSTIC TEMPORAIRE (P0-1, demande utilisateur 2026-08-04) -- a
      // retirer une fois valide sur quelques scans reels (objectif : confirmer
      // qu'aucune marque rare legitime de la watchlist n'est jamais rejetee,
      // et que seules des valeurs manifestement invalides le sont). Ne
      // s'execute qu'en cas de rejet reel (rare par construction, voir
      // brand.ts) -- au plus une ligne par recherche watchlist concernee,
      // jamais par annonce. Visible dans les logs du run GitHub Actions.
      if (watch.brand && !normalizedWatchBrand) {
        console.warn(
          `[P0-1 diagnostic, a retirer apres validation] normalizeBrand() a rejete la marque watchlist "${watch.brand}" (modele : "${watch.model}")`
        );
      }

      for (const item of items) {
        if (item.favourites < 5) continue;

        const ctx = contextForItem(searchCtx, item.url, scanCtx);
        const analysis = analyzeOpportunity(
          { price: item.price, favourites: item.favourites, priority: watch.priority },
          ctx
        );

        if (analysis.profit < watch.min_profit) continue;
        if (analysis.roi < watch.min_roi) continue;
        if (!meetsOpportunityGate(analysis)) continue;

        allItems.push({
          ...item,
          // P0-1 : jamais le texte scrape du DOM Vinted -- voir types.ts et
          // le commentaire sur ScoredOpportunity.brand plus haut.
          brand: normalizedWatchBrand,
          category: watch.category,
          market_price: analysis.market_price,
          profit: analysis.profit,
          roi: analysis.roi,
          score: analysis.score,
          confidence: analysis.confidence,
          price_source: analysis.price_source,
          risk_level: analysis.risk_level,
          breakdown: analysis.breakdown,
          resale_days_min: analysis.resale_days_min,
          resale_days_max: analysis.resale_days_max,
          resale_confidence: analysis.resale_confidence,
          first_observed_at: analysis.first_observed_at,
          competing_listings_count: analysis.competing_listings_count,
        });
      }
    }

    const unique = allItems.filter(
      (item, index, self) =>
        self.findIndex((i) => i.url === item.url) === index
    );

    await logProgress("ranking", `${unique.length} opportunité${unique.length === 1 ? "" : "s"} classée${unique.length === 1 ? "" : "s"} par score…`);

    console.log("");
    console.log("=======================");
    console.log("TOTAL OPPORTUNITÉS :", unique.length);
    console.log("=======================");

    // Passe 3 - galerie photo complete de chaque opportunite retenue
    // (uniquement le lot final, jamais tous les articles scrapes en passe 1
    // - visiter la page de chaque annonce candidate serait inutilement
    // lourd pour des articles qui ne deviendront jamais des opportunites).
    await logProgress("photos", `Récupération des photos de ${unique.length} opportunité${unique.length === 1 ? "" : "s"}…`);
    const photosStartedAt = Date.now();
    const photosByUrl = new Map<string, string[]>();

    const plan = planGalleryFetches(
      unique.map((i) => ({ url: i.url, score: i.score, profit: i.profit })),
      (url) => knownPhotos.has(url)
    );

    // Les galeries en cache sont servies d'abord : gratuites, elles ne
    // consomment pas le plafond.
    for (const url of plan.reused) photosByUrl.set(url, knownPhotos.get(url)!);

    console.log(
      `Galeries : ${plan.reused.length} reutilisee(s), ${plan.toFetch.length} a recuperer, ${plan.skipped.length} ignoree(s) (vignette de recherche seulement)`
    );

    if (plan.toFetch.length > 0) {
      await logProgress("photos", `Récupération des photos des ${plan.toFetch.length} meilleures opportunités…`);

      // Un onglet par executant, jamais partage : deux page.goto concurrents
      // sur le MEME objet Page se marcheraient dessus (le second annule la
      // navigation du premier).
      const photoPages: Page[] = [page];
      for (let i = 1; i < PHOTO_FETCH_CONCURRENCY; i++) {
        photoPages.push(await browser.newPage());
      }

      let done = 0;
      try {
        const fetched = await mapWithConcurrency(plan.toFetch, PHOTO_FETCH_CONCURRENCY, async (url, _index, workerIndex) => {
          // L'onglet suit l'EXECUTANT, jamais la position de l'element : deux
          // page.goto concurrents sur le meme Page s'annuleraient (voir
          // photoPlan.ts).
          const photos = await scrapeItemPhotos(photoPages[workerIndex], url);
          done++;
          if (done % 10 === 0 || done === plan.toFetch.length) {
            await logProgress("photos", `Photos récupérées : ${done}/${plan.toFetch.length}`);
          }
          return photos;
        });

        plan.toFetch.forEach((url, i) => photosByUrl.set(url, fetched[i]));
      } finally {
        // Ne ferme QUE les onglets ouverts ici -- photoPages[0] est la page
        // principale, encore utilisee ensuite.
        for (const extra of photoPages.slice(1)) await extra.close().catch(() => {});
      }
    }

    phaseTimings.push({ phase: "photos", seconds: Math.round((Date.now() - photosStartedAt) / 100) / 10 });
    console.log(`[timing] photos : ${phaseTimings[phaseTimings.length - 1].seconds}s (${plan.toFetch.length} page(s) visitee(s), concurrence ${PHOTO_FETCH_CONCURRENCY})`);

    console.log(
      "[timing] RECAPITULATIF :",
      phaseTimings.map((t) => `${t.phase} ${t.seconds}s`).join(" | "),
      `| total ${Math.round((Date.now() - scanStartedAt) / 100) / 10}s`
    );

    await logProgress("saving", "Enregistrement des résultats…");

    await insertObservations(observationRows);

    const { error: insertError } = await supabase
      .from("market_opportunities")
      .upsert(
        unique.map((item) => ({
          title: item.title,
          brand: item.brand,
          category: item.category,
          image: item.image,
          images: photosByUrl.get(item.url) ?? [],

          price_found: item.price,
          market_price: item.market_price,
          profit: item.profit,
          roi: item.roi,

          score: item.score,
          confidence: item.confidence,
          price_source: item.price_source,
          favourites: item.favourites,

          risk_level: item.risk_level,
          breakdown: item.breakdown,
          resale_days_min: item.resale_days_min,
          resale_days_max: item.resale_days_max,
          resale_confidence: item.resale_confidence,
          first_observed_at: item.first_observed_at,
          competing_listings_count: item.competing_listings_count,

          vinted_url: item.url,
          status: "live",
          scan_batch_id: scanBatchId,
        })),
        { onConflict: "vinted_url" }
      );

    if (insertError) {
      console.error("INSERT ERROR:", insertError);
      // Les lignes des lots precedents n'ont PAS ete touchees : l'utilisateur
      // garde les opportunites du scan d'avant plutot qu'un ecran vide.
      await writeTerminal("error", { errorMessage: "Échec de l'enregistrement des opportunités." });
      process.exitCode = 1;
    } else {
      console.log(`${unique.length} opportunités enregistrées dans Supabase.`);

      // BASCULE -- le seul moment ou l'on supprime quoi que ce soit, et
      // uniquement apres un upsert reussi.
      //
      // `not(..., 'eq', ...)` et non `neq` : en SQL, `scan_batch_id <> '...'`
      // est NULL (donc faux) pour une ligne dont scan_batch_id EST NULL, et
      // les lignes ecrites avant la migration ne seraient jamais nettoyees.
      // La forme negative attrape aussi les NULL.
      //
      // Une opportunite presente dans l'ancien ET le nouveau lot a ete mise a
      // jour en place par l'upsert (contrainte unique sur vinted_url) : elle
      // porte deja le lot courant et n'est donc pas supprimee ici.
      const { error: swapError, count: removed } = await supabase
        .from("market_opportunities")
        .delete({ count: "exact" })
        .not("scan_batch_id", "eq", scanBatchId);

      if (swapError) {
        // Echec non bloquant : les nouvelles opportunites SONT en base et
        // visibles. Le seul defaut est que des lignes perimees cohabitent
        // avec elles jusqu'au prochain scan reussi -- tres loin de justifier
        // de declarer le scan en echec alors qu'il a produit ses resultats.
        console.error("SWAP ERROR (lignes perimees conservees) :", swapError);
      } else {
        console.log(`Bascule : ${removed ?? 0} ligne(s) de lots precedents supprimee(s).`);
      }

      await writeTerminal("success", {
        resultPayload: { opportunitiesFound: unique.length, failedSearches: failedSearches.length },
      });
    }
  } finally {
    await browser.close();
  }
}

// process.exitCode (pas process.exit()) : laisse Node terminer les écritures
// asynchrones en cours (writeTerminal) avant de quitter, tout en garantissant
// un code de sortie non nul - sans ça, une erreur non rattrapée ici était
// bien loguée mais le process se terminait quand même en code 0, donc
// GitHub Actions rapportait "Success" pour un scan qui avait réellement
// échoué (voir ARCHITECTURE.md §4.8 : cause réelle du "succès" du run où
// market_opportunities et market_price_observations sont restées vides).
main().catch(async (error) => {
  console.error(error);
  const message = error instanceof Error ? error.message : "Le scan a échoué pour une raison inconnue.";
  await writeTerminal("error", { errorMessage: message });
  process.exitCode = 1;
});
