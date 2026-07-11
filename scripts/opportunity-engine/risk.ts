import type { EngineContext, PriceModelResult, RiskLevel, RiskResult, ScoreBreakdownEntry } from './types';
import { median } from './math';
import {
  EXTREME_UNDERPRICE_RATIO,
  MIN_DELISTED_SAMPLES_FOR_RESALE_ESTIMATE,
  MODERATE_UNDERPRICE_RATIO,
  PRICE_DISPERSION_HIGH,
  PRICE_DISPERSION_MODERATE,
  RISK_CONFIDENCE_LOW,
  RISK_CONFIDENCE_MODERATE,
  RISK_HIGH_COMPETITION_COUNT,
  RISK_LEVEL_THRESHOLDS,
  RISK_SLOW_RESALE_DAYS,
} from './constants';

export interface RiskInput {
  confidence: number;
  priceModel: PriceModelResult;
  competingListingsCount: number;
  itemPrice: number;
}

type RiskFactor = (input: RiskInput, ctx: EngineContext) => { label: string; points: number } | null;

// Même pattern de registre que src/lib/insights/alerts.ts : chaque facteur
// est une fonction pure indépendante, retourne null quand il ne s'applique
// pas (jamais 0 points affichés comme un signal réel).
function factorPriceVolatility(input: RiskInput): ReturnType<RiskFactor> {
  if (input.priceModel.dispersion === null) return null;
  if (input.priceModel.dispersion >= PRICE_DISPERSION_HIGH) {
    return { label: 'Prix comparables très volatils', points: 12 };
  }
  if (input.priceModel.dispersion >= PRICE_DISPERSION_MODERATE) {
    return { label: 'Prix comparables modérément volatils', points: 5 };
  }
  return null;
}

function factorDataScarcity(input: RiskInput): ReturnType<RiskFactor> {
  if (input.confidence < RISK_CONFIDENCE_LOW) {
    return { label: 'Peu de données de marché disponibles', points: 15 };
  }
  if (input.confidence < RISK_CONFIDENCE_MODERATE) {
    return { label: 'Données de marché limitées', points: 6 };
  }
  return null;
}

function factorCompetition(input: RiskInput): ReturnType<RiskFactor> {
  if (input.competingListingsCount >= RISK_HIGH_COMPETITION_COUNT) {
    return { label: 'Forte concurrence sur ce marché', points: 6 };
  }
  return null;
}

// Preuve réelle (scan du 2026-07-11, ancien moteur) : "doudoune the north
// face nuptse 700" à 1€ pour un marché estimé à 85€ (ROI 8400%) affiché en
// confiance 100% / risque faible - dans l'immense majorité des cas, un
// écart aussi extrême reflète une erreur de prix ou une annonce trompeuse,
// pas une vraie affaire. Voir constants.ts pour les seuils.
function factorExtremeUnderpricing(input: RiskInput): ReturnType<RiskFactor> {
  if (input.priceModel.marketPrice <= 0) return null;
  const ratio = input.itemPrice / input.priceModel.marketPrice;
  if (ratio <= EXTREME_UNDERPRICE_RATIO) {
    return { label: 'Prix très éloigné du marché — vérifier l\'annonce avant achat', points: 20 };
  }
  if (ratio <= MODERATE_UNDERPRICE_RATIO) {
    return { label: 'Prix nettement sous le marché — à vérifier', points: 8 };
  }
  return null;
}

// Inerte tant que market_price_observations n'a pas accumulé assez
// d'échantillons de disparition (voir context.ts) - retourne null plutôt
// qu'une estimation fabriquée, s'active automatiquement plus tard sans
// changement de code.
function factorLiquidity(_input: RiskInput, ctx: EngineContext): ReturnType<RiskFactor> {
  if (ctx.delistingSamples.length < MIN_DELISTED_SAMPLES_FOR_RESALE_ESTIMATE) return null;
  const days = median(ctx.delistingSamples.map((s) => s.daysVisible));
  if (days === null || days < RISK_SLOW_RESALE_DAYS) return null;
  return { label: 'Revente historiquement lente sur ce marché', points: 10 };
}

const RISK_FACTORS: RiskFactor[] = [
  factorPriceVolatility,
  factorDataScarcity,
  factorCompetition,
  factorExtremeUnderpricing,
  factorLiquidity,
];

export function computeRiskLevel(input: RiskInput, ctx: EngineContext): RiskResult {
  const breakdown: ScoreBreakdownEntry[] = [];
  let points = 0;
  for (const factor of RISK_FACTORS) {
    const result = factor(input, ctx);
    if (!result) continue;
    points += result.points;
    breakdown.push({ label: result.label, delta: -result.points, kind: 'risk' });
  }

  let riskLevel: RiskLevel = 'faible';
  if (points >= RISK_LEVEL_THRESHOLDS.eleve) riskLevel = 'eleve';
  else if (points >= RISK_LEVEL_THRESHOLDS.modere) riskLevel = 'modere';

  return { riskLevel, breakdown };
}
