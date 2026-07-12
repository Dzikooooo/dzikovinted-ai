import { chromium, type Page } from "playwright";
import { supabase } from "./supabase";
import {
  analyzeOpportunity,
  meetsOpportunityGate,
  buildScanContext,
  buildSearchContext,
  contextForItem,
  observationLookbackSince,
} from "./opportunity-engine";
import type { ScrapedItem } from "./types";
import { dedupeWatchlist, type WatchlistRow } from "./watchlistDedup";

// Present uniquement quand ce script est declenche via workflow_dispatch
// depuis "Scanner maintenant" (voir supabase/functions/scan-market et
// src/lib/actions/handlers/scanMarket.ts) - absent lors du cron normal de
// 4h, auquel cas tout ce qui suit est un no-op et le comportement reste
// exactement celui d'avant (aucune regression sur le cron).
const actionId = process.env.ACTION_ID?.trim() || null;
const scanStartedAt = Date.now();

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
  if (!actionId) return;
  try {
    await supabase
      .from("action_log")
      .update({
        status,
        result_payload: extra.resultPayload ?? null,
        error_message: extra.errorMessage ?? null,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - scanStartedAt,
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
        brand: titleEl.textContent?.trim() || "Vinted",
        price,
        image: imageEl?.getAttribute("src") || "",
        url: href,
        favourites: favEl ? parseInt(favEl.textContent || "0", 10) || 0 : 0,
      });
    });

    return results;
  });
}

async function scanSearch(page: Page, search: string) {
  const foundItems: ScrapedItem[] = [];

  for (let pageNum = 1; pageNum <= PAGES_PER_SEARCH; pageNum++) {
    await gotoWithRetry(
      page,
      `https://www.vinted.fr/catalog?search_text=${encodeURIComponent(search)}&page=${pageNum}`
    );
    await page.waitForTimeout(4000);
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
  await logProgress("connecting", "Connexion à Vinted…");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    const { error: deleteError } = await supabase
      .from("market_opportunities")
      .delete()
      .gte("created_at", "1970-01-01");

    if (deleteError) {
      console.error("DELETE ERROR (aborting, refuse de melanger des donnees perimees) :", deleteError);
      await writeTerminal("error", { errorMessage: "Échec de la mise à jour des opportunités (suppression)." });
      process.exitCode = 1;
      return;
    }

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

    for (let i = 0; i < watchlistRows.length; i++) {
      const watch = watchlistRows[i];
      const search = `${watch.brand} ${watch.model}`;

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
    const { data: observations, error: obsError } = await supabase
      .from("market_price_observations")
      .select("vinted_url, brand, category, price, favourites, scanned_at")
      .gte("scanned_at", observationLookbackSince(new Date()));

    if (obsError) {
      console.error("OBSERVATIONS READ ERROR (continue sans historique) :", obsError);
    }

    const scanCtx = buildScanContext(perSearchResults, observations ?? []);

    // Passe 2 - score, avec le contexte complet du batch.
    const totalScraped = perSearchResults.reduce((n, r) => n + r.items.length, 0);
    await logProgress("analyzing", `Analyse de ${totalScraped} annonce${totalScraped === 1 ? "" : "s"} pertinente${totalScraped === 1 ? "" : "s"}…`);

    const allItems: ScoredOpportunity[] = [];

    for (const { watch, items } of perSearchResults) {
      const comparablePrices = items.map((i) => i.price);
      const searchCtx = buildSearchContext(watch, comparablePrices, scanCtx);

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
        })),
        { onConflict: "vinted_url" }
      );

    if (insertError) {
      console.error("INSERT ERROR:", insertError);
      await writeTerminal("error", { errorMessage: "Échec de l'enregistrement des opportunités." });
      process.exitCode = 1;
    } else {
      console.log(`${unique.length} opportunités enregistrées dans Supabase.`);
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
