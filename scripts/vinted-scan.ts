import { chromium } from "playwright";
import { supabase } from "./supabase";
import { analyzeMarket } from "./market-engine";

function isRelevant(item: any, search: string) {
  const title = item.title.toLowerCase();
  const terms = search.toLowerCase().split(" ");

  return terms.every((term) => title.includes(term));
}

async function scanSearch(page: any, search: string) {
  const foundItems: any[] = [];

  const onResponse = async (response: any) => {
    const url = response.url();

    if (!url.includes("vinted.fr/api/v2/promoted_closets")) return;

    try {
      const json = await response.json();

      const items =
        json.promoted_closets?.flatMap((closet: any) =>
          closet.items.map((item: any) => ({
            title: item.title,
            brand: item.brand_title || "Vinted",
            price: Number(item.price?.amount || 0),
            image: item.photos?.[0]?.url || "",
            url: item.url,
            favourites: item.favourite_count || 0,
            seller: closet.user?.login,
          }))
        ) || [];

      foundItems.push(...items);
    } catch {}
  };

  page.on("response", onResponse);

  await page.goto(
    `https://www.vinted.fr/catalog?search_text=${encodeURIComponent(search)}`,
    { waitUntil: "networkidle" }
  );

  await page.waitForTimeout(5000);
  page.off("response", onResponse);

  const cleanItems = foundItems.filter(
    (item, index, self) =>
      item.url &&
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
  const page = await browser.newPage();

  let allItems: any[] = [];

  await supabase.from("market_opportunities").delete().neq("id", "");

  const { data: watchlist, error } = await supabase
    .from("watchlist")
    .select("*")
    .eq("active", true)
    .order("priority", { ascending: false });

  if (error) {
    console.error("WATCHLIST ERROR:", error);
    await browser.close();
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

  await browser.close();
}

main().catch(console.error);