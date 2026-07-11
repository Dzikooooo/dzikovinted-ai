import type { EngineContext, ResaleEstimate } from './types';
import { MIN_DELISTED_SAMPLES_FOR_RESALE_ESTIMATE } from './constants';

// Fourchette p25-p75 des délais de disparition observés (proxy de revente,
// voir context.ts) pour cette recherche - retourne null explicitement en
// dessous du seuil minimum d'échantillons, jamais un chiffre inventé. La
// confiance renvoyée croît avec la taille de l'échantillon, plafonnée à 90 %
// (jamais 100% : le proxy "disparu des résultats" reste une approximation
// de la vente réelle, pas une confirmation).
export function computeResaleEstimate(ctx: EngineContext): ResaleEstimate | null {
  const samples = ctx.delistingSamples;
  if (samples.length < MIN_DELISTED_SAMPLES_FOR_RESALE_ESTIMATE) return null;

  const days = samples.map((s) => s.daysVisible).sort((a, b) => a - b);
  const p25 = percentile(days, 0.25);
  const p75 = percentile(days, 0.75);
  if (p25 === null || p75 === null) return null;

  const confidence = Math.min(90, 40 + samples.length * 3);

  return {
    minDays: Math.round(p25),
    maxDays: Math.round(p75),
    confidence: Math.round(confidence),
  };
}

function percentile(sortedValues: number[], p: number): number | null {
  if (sortedValues.length === 0) return null;
  const index = Math.min(sortedValues.length - 1, Math.floor(p * sortedValues.length));
  return sortedValues[index];
}
