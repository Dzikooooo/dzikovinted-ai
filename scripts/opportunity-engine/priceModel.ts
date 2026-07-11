import type { EngineContext, PriceModelResult } from './types';
import { median, coefficientOfVariation } from './math';
import { MIN_COMPARABLES_FOR_PRICE, OBSERVATION_LOOKBACK_DAYS } from './constants';

const OBSERVATION_LOOKBACK_LABEL = `${OBSERVATION_LOOKBACK_DAYS} derniers jours`;

// Comportement historique préservé à l'identique (scripts/market-price.ts) :
// médiane des prix comparables du batch courant, en excluant le prix de
// l'item lui-même quand il reste au moins MIN_COMPARABLES_FOR_PRICE autres
// prix. En dessous, la source d'origine est utilisée quand elle est
// disponible en historique (blend), sinon "Donnees insuffisantes" comme
// avant.
export function computeMarketPrice(item: { price: number }, ctx: EngineContext): PriceModelResult {
  const others = ctx.comparablePrices.filter((p) => p !== item.price);
  const pool = others.length >= MIN_COMPARABLES_FOR_PRICE ? others : ctx.comparablePrices;

  const dispersion = coefficientOfVariation(pool.length >= 2 ? pool : ctx.comparablePrices);

  if (pool.length < MIN_COMPARABLES_FOR_PRICE) {
    // Blend historique : si le batch courant est trop petit mais qu'un
    // historique fiable existe pour cette recherche, on l'utilise plutôt que
    // de renvoyer un prix nul - c'est exactement le cas d'usage que
    // market_price_observations a été introduit pour couvrir.
    if (ctx.historicalPriceStats) {
      return {
        marketPrice: Math.round(ctx.historicalPriceStats.median),
        source: `Historique (n=${ctx.historicalPriceStats.sampleSize}, ${OBSERVATION_LOOKBACK_LABEL})`,
        dispersion: null,
      };
    }
    return { marketPrice: 0, source: 'Donnees insuffisantes', dispersion: null };
  }

  const currentMedian = median(pool);
  if (currentMedian === null) {
    return { marketPrice: 0, source: 'Donnees insuffisantes', dispersion: null };
  }

  // Blend simple avec l'historique quand il est disponible : moyenne du prix
  // courant et du prix historique, pondérée vers le courant (le marché
  // d'aujourd'hui prime, l'historique lisse les variations ponctuelles du
  // batch scrapé).
  if (ctx.historicalPriceStats) {
    const blended = currentMedian * 0.7 + ctx.historicalPriceStats.median * 0.3;
    return {
      marketPrice: Math.round(blended),
      source: `Vinted comps (n=${pool.length}) + historique (n=${ctx.historicalPriceStats.sampleSize})`,
      dispersion,
    };
  }

  return {
    marketPrice: Math.round(currentMedian),
    source: `Vinted comps (n=${pool.length})`,
    dispersion,
  };
}
