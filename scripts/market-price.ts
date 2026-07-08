import type { MarketPriceResult } from "./types";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function getMarketPrice(item: { price: number }, comparablePrices: number[]): MarketPriceResult {
  const others = comparablePrices.filter((p) => p !== item.price);
  const pool = others.length >= 3 ? others : comparablePrices;

  if (pool.length < 3) {
    return { marketPrice: 0, confidence: 0, source: "Donnees insuffisantes" };
  }

  return {
    marketPrice: Math.round(median(pool)),
    confidence: Math.min(100, pool.length * 5),
    source: `Vinted comps (n=${pool.length})`,
  };
}
