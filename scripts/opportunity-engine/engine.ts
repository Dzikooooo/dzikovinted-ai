import type { EngineContext, OpportunityAnalysis } from './types';
import { computeMarketPrice } from './priceModel';
import { computeScore } from './scoring';
import { computeConfidence } from './confidence';
import { computeRiskLevel } from './risk';
import { computeResaleEstimate } from './resaleEstimate';
import { buildChecklist } from './explanation';
import { MIN_CONFIDENCE_FOR_OPPORTUNITY, MIN_SCORE_FOR_OPPORTUNITY } from './constants';

export interface OpportunityInput {
  price: number;
  favourites: number;
  priority: number;
}

// Orchestrateur, remplace l'ancien analyzeMarket() de scripts/market-engine.ts :
// priceModel -> score -> confidence -> risk -> resaleEstimate -> explanation.
// Chaque étape est une fonction pure indépendante, testée séparément (voir
// __tests__/).
export function analyzeOpportunity(item: OpportunityInput, ctx: EngineContext): OpportunityAnalysis {
  const priceModel = computeMarketPrice(item, ctx);
  const profit = Math.round((priceModel.marketPrice - item.price) * 100) / 100;
  const roi = item.price > 0 ? Math.round((profit / item.price) * 100) : 0;

  const scoreResult = computeScore(
    { roi, profit, favourites: item.favourites, priority: item.priority, price: item.price },
    ctx
  );

  const others = ctx.comparablePrices.filter((p) => p !== item.price);
  const comparablesCount = others.length > 0 ? others.length : ctx.comparablePrices.length;
  const confidenceResult = computeConfidence(comparablesCount, priceModel, item.price);

  const competingListingsCount = ctx.comparablePrices.length;
  const riskResult = computeRiskLevel(
    { confidence: confidenceResult.confidence, priceModel, competingListingsCount, itemPrice: item.price },
    ctx
  );

  const resale = computeResaleEstimate(ctx);

  const breakdown = [...scoreResult.breakdown, ...confidenceResult.breakdown, ...riskResult.breakdown];
  const opportunityValidated =
    scoreResult.score >= MIN_SCORE_FOR_OPPORTUNITY && confidenceResult.confidence >= MIN_CONFIDENCE_FOR_OPPORTUNITY;

  const checklist = buildChecklist(breakdown, {
    score: scoreResult.score,
    confidence: confidenceResult.confidence,
    riskLevel: riskResult.riskLevel,
    opportunityValidated,
  });

  return {
    market_price: priceModel.marketPrice,
    price_source: priceModel.source,
    profit,
    roi,
    score: scoreResult.score,
    confidence: confidenceResult.confidence,
    risk_level: riskResult.riskLevel,
    breakdown,
    resale_days_min: resale?.minDays ?? null,
    resale_days_max: resale?.maxDays ?? null,
    resale_confidence: resale?.confidence ?? null,
    first_observed_at: ctx.firstSeenAt,
    competing_listings_count: competingListingsCount,
    checklist,
  };
}

// Filtre de sélectivité ("20 excellentes plutôt que 500 moyennes") - appliqué
// par l'appelant EN PLUS des seuils min_profit/min_roi existants de la
// watchlist, jamais à leur place. Le risque "élevé" est exclu même si
// score/confiance suffisent par ailleurs : preuve réelle (scan du
// 2026-07-11) qu'un item avec une pénalité de confiance déjà appliquée (ex.
// prix extrêmement sous le marché) peut encore atterrir exactement au
// plancher MIN_CONFIDENCE_FOR_OPPORTUNITY - "risque élevé" est le signal
// destiné à l'utilisateur, il doit aussi conditionner l'affichage lui-même,
// conformément à "si une annonce est douteuse, je préfère qu'elle ne soit
// pas affichée".
export function meetsOpportunityGate(analysis: OpportunityAnalysis): boolean {
  return (
    analysis.score >= MIN_SCORE_FOR_OPPORTUNITY &&
    analysis.confidence >= MIN_CONFIDENCE_FOR_OPPORTUNITY &&
    analysis.risk_level !== 'eleve'
  );
}
