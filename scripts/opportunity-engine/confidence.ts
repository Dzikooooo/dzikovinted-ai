import type { PriceModelResult, ScoreBreakdownEntry, ConfidenceResult } from './types';
import {
  EXTREME_UNDERPRICE_RATIO,
  MODERATE_UNDERPRICE_RATIO,
  PRICE_DISPERSION_HIGH,
  PRICE_DISPERSION_MODERATE,
} from './constants';

// Base identique à l'ancien scripts/market-price.ts (suffisance
// d'échantillon), enrichie de deux pénalités réelles que l'ancienne formule
// ne connaissait pas :
// - dispersion des comparables (un prix très volatil avec 10 comparables
//   n'est pas plus fiable qu'un prix stable avec 10 comparables) ;
// - sous-évaluation extrême de l'item lui-même vs le prix de marché estimé
//   (voir constants.ts - preuve réelle : scan du 2026-07-11, plusieurs
//   items à 1-12% du marché scorés confiance 100% par l'ancien moteur).
// Aucune pénalité si un signal n'est pas calculable (échantillon trop
// petit, prix de marché nul) : l'absence de signal n'est pas un signal
// négatif.
export function computeConfidence(
  comparablesCount: number,
  priceModel: PriceModelResult,
  itemPrice: number
): ConfidenceResult {
  const breakdown: ScoreBreakdownEntry[] = [];
  let confidence = Math.min(100, comparablesCount * 5);
  breakdown.push({ label: `Basée sur ${comparablesCount} annonce(s) comparable(s)`, delta: confidence, kind: 'confidence' });

  if (priceModel.dispersion !== null) {
    if (priceModel.dispersion >= PRICE_DISPERSION_HIGH) {
      const penalty = -20;
      confidence += penalty;
      breakdown.push({ label: 'Prix comparables très dispersés', delta: penalty, kind: 'confidence' });
    } else if (priceModel.dispersion >= PRICE_DISPERSION_MODERATE) {
      const penalty = -10;
      confidence += penalty;
      breakdown.push({ label: 'Prix comparables modérément dispersés', delta: penalty, kind: 'confidence' });
    }
  }

  if (priceModel.marketPrice > 0) {
    const ratio = itemPrice / priceModel.marketPrice;
    if (ratio <= EXTREME_UNDERPRICE_RATIO) {
      const penalty = -30;
      confidence += penalty;
      breakdown.push({ label: 'Prix très éloigné du marché estimé — à vérifier', delta: penalty, kind: 'confidence' });
    } else if (ratio <= MODERATE_UNDERPRICE_RATIO) {
      const penalty = -12;
      confidence += penalty;
      breakdown.push({ label: 'Prix nettement sous le marché estimé', delta: penalty, kind: 'confidence' });
    }
  }

  return { confidence: Math.max(0, Math.min(100, Math.round(confidence))), breakdown };
}
