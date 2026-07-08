import { chromium, type Page } from "playwright";
import { supabase } from "./supabase";
import { analyzeMarket } from "./market-engine";
import type { AnalyzedItem, ScrapedItem } from "./types";

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

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    const allItems: AnalyzedItem[] = [];

    const { error: deleteError } = await supabase
      .from("market_opportunities")
      .delete()
      .gte("created_at", "1970-01-01");

    if (deleteError) {
      console.error("DELETE ERROR (aborting, refuse de melanger des donnees perimees) :", deleteError);
      return;
    }

    const { data: watchlist, error } = await supabase
      .from("watchlist")
      .select("*")
      .eq("active", true)
      .order("priority", { ascending: false });

    if (error) {
      console.error("WATCHLIST ERROR:", error);
      return;
    }

    console.log(`Watchlist chargée : ${watchlist?.length ?? 0} recherches`);

    for (const watch of watchlist ?? []) {
      const search = `${watch.brand} ${watch.model}`;

      console.log("\nRecherche :", search);

      const items = await scanSearch(page, search);
      const comparablePrices = items.map((i) => i.price);

      for (const item of items) {
        if (item.favourites < 5) continue;

        const analyzedItem = analyzeMarket(
          { ...item, category: watch.category },
          comparablePrices
        );

        if (analyzedItem.profit < watch.min_profit) continue;
        if (analyzedItem.roi < watch.min_roi) continue;

        allItems.push(analyzedItem);
      }
    }

    const unique = allItems.filter(
      (item, index, self) =>
        self.findIndex((i) => i.url === item.url) === index
    );

    console.log("");
    console.log("=======================");
    console.log("TOTAL OPPORTUNITÉS :", unique.length);
    console.log("=======================");

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

          vinted_url: item.url,
          status: "live",
        })),
        { onConflict: "vinted_url" }
      );

    if (insertError) {
      console.error("INSERT ERROR:", insertError);
    } else {
      console.log(`${unique.length} opportunités enregistrées dans Supabase.`);
    }
  } finally {
    await browser.close();
  }
}

main().catch(console.error);