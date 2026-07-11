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
    await page.goto(
      `https://www.vinted.fr/catalog?search_text=${encodeURIComponent(search)}&page=${pageNum}`,
      { waitUntil: "networkidle" }
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

interface WatchlistRow {
  id: string;
  brand: string;
  model: string;
  category: string;
  priority: number;
  min_profit: number;
  min_roi: number;
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
      return;
    }

    const watchlistRows = (watchlist ?? []) as WatchlistRow[];
    console.log(`Watchlist chargée : ${watchlistRows.length} recherches`);

    // Passe 1 - scrape uniquement. Le score de demande relative (voir
    // opportunity-engine/scoring.ts) a besoin de voir tout le batch avant de
    // noter quoi que ce soit - impossible en mono-passe scrape+score comme
    // avant.
    const perSearchResults: { watch: WatchlistRow; items: ScrapedItem[] }[] = [];
    const observationRows: {
      watchlist_id: string;
      vinted_url: string;
      brand: string;
      category: string;
      price: number;
      favourites: number;
    }[] = [];

    for (let i = 0; i < watchlistRows.length; i++) {
      const watch = watchlistRows[i];
      const search = `${watch.brand} ${watch.model}`;

      console.log("\nRecherche :", search);
      await logProgress("searching", `Recherche : ${i + 1}/${watchlistRows.length} (${search})`);

      const items = await scanSearch(page, search);
      perSearchResults.push({ watch, items });

      for (const item of items) {
        observationRows.push({
          watchlist_id: watch.id,
          vinted_url: item.url,
          brand: watch.brand,
          category: watch.category,
          price: item.price,
          favourites: item.favourites,
        });
      }
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

    if (observationRows.length > 0) {
      const { error: obsInsertError } = await supabase
        .from("market_price_observations")
        .insert(observationRows);
      if (obsInsertError) {
        // Echec doux : l'historique est un enrichissement, pas la sortie
        // principale du scan - ne bloque jamais l'ecriture des opportunites.
        console.error("OBSERVATIONS INSERT ERROR (continue) :", obsInsertError);
      }
    }

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
    } else {
      console.log(`${unique.length} opportunités enregistrées dans Supabase.`);
      await writeTerminal("success", { resultPayload: { opportunitiesFound: unique.length } });
    }
  } finally {
    await browser.close();
  }
}

main().catch(async (error) => {
  console.error(error);
  const message = error instanceof Error ? error.message : "Le scan a échoué pour une raison inconnue.";
  await writeTerminal("error", { errorMessage: message });
});
