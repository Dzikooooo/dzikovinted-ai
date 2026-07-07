import { getMarketPrice } from "./market-price";

export async function analyzeMarket(item: any) {
  const market = await getMarketPrice(item);

  const marketPrice = market.marketPrice;
  const profit = Math.round((marketPrice - item.price) * 100) / 100;
  const roi = Math.round((profit / item.price) * 100);

  const scoredItem = {
    ...item,
    market_price: marketPrice,
    profit,
    roi,
    confidence: market.confidence,
    price_source: market.source,
  };

  return {
    ...scoredItem,
    score: calculateScore(scoredItem),
  };
}

function calculateScore(item: any) {
  let score = 40;

  if (item.roi >= 200) score += 25;
  else if (item.roi >= 150) score += 20;
  else if (item.roi >= 100) score += 15;
  else if (item.roi >= 80) score += 10;

  if (item.profit >= 100) score += 25;
  else if (item.profit >= 70) score += 20;
  else if (item.profit >= 40) score += 15;
  else if (item.profit >= 25) score += 10;

  if (item.favourites >= 100) score += 15;
  else if (item.favourites >= 50) score += 12;
  else if (item.favourites >= 20) score += 8;
  else if (item.favourites >= 5) score += 4;

  const title = item.title.toLowerCase();

  if (
    title.includes("shox") ||
    title.includes("tn") ||
    title.includes("samba") ||
    title.includes("2002r") ||
    title.includes("xt-6") ||
    title.includes("nuptse") ||
    title.includes("stone island")
  ) {
    score += 10;
  }

  if (item.price <= 50) score += 5;
  if (item.price >= 150) score -= 10;

  return Math.max(0, Math.min(100, score));
}