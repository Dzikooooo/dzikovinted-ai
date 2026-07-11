import type { EngineContext, ScoreBreakdownEntry, ScoreResult } from './types';
import { BASE_SCORE, PRIORITY_SCORE_WEIGHT } from './constants';

export interface ScorableItem {
  roi: number;
  profit: number;
  favourites: number;
  priority: number;
  price: number;
}

// Même principe additif que src/lib/insights/scoring.ts : base neutre,
// chaque signal ajoute/retire des points nommés et justifiés via add(),
// jamais de pénalité sur une donnée absente (voir scoreFromDemand).
export function computeScore(item: ScorableItem, ctx: EngineContext): ScoreResult {
  const breakdown: ScoreBreakdownEntry[] = [];
  let score = BASE_SCORE;
  const add = (label: string, delta: number) => {
    if (delta === 0) return;
    score += delta;
    breakdown.push({ label, delta, kind: 'score' });
  };

  scoreFromRoi(item, add);
  scoreFromProfit(item, add);
  scoreFromDemand(item, ctx, add);
  scoreFromPriority(item, add);
  scoreFromPriceBand(item, add);

  return { score: Math.max(0, Math.min(100, Math.round(score))), breakdown };
}

type AddFn = (label: string, delta: number) => void;

function scoreFromRoi(item: ScorableItem, add: AddFn) {
  if (item.roi >= 200) add('ROI exceptionnel (≥200%)', 25);
  else if (item.roi >= 150) add('ROI très élevé (≥150%)', 20);
  else if (item.roi >= 100) add('ROI élevé (≥100%)', 15);
  else if (item.roi >= 80) add('Bon ROI (≥80%)', 10);
}

function scoreFromProfit(item: ScorableItem, add: AddFn) {
  if (item.profit >= 100) add('Profit potentiel élevé (≥100€)', 25);
  else if (item.profit >= 70) add('Bon profit potentiel (≥70€)', 20);
  else if (item.profit >= 40) add('Profit potentiel correct (≥40€)', 15);
  else if (item.profit >= 25) add('Profit potentiel modeste (≥25€)', 10);
}

// Favoris relatifs à la médiane de la catégorie (tout le batch du scan), pas
// des paliers absolus figés - une annonce à 8 favoris est "en forte demande"
// dans une catégorie peu suivie, mais dans la moyenne pour des sneakers très
// populaires. Aucune contribution si la médiane de catégorie est inconnue :
// l'absence de signal n'est pas un signal négatif.
function scoreFromDemand(item: ScorableItem, ctx: EngineContext, add: AddFn) {
  if (ctx.categoryMedianFavourites === null || ctx.categoryMedianFavourites === 0) return;
  const ratio = item.favourites / ctx.categoryMedianFavourites;
  if (ratio >= 2.5) add('Demande nettement supérieure à la catégorie', 15);
  else if (ratio >= 1.5) add('Demande supérieure à la catégorie', 8);
  else if (ratio <= 0.3) add('Demande nettement inférieure à la catégorie', -8);
}

// watchlist.priority (1-3, jamais consommé par l'ancien moteur) remplace ici
// la liste de mots-clés codée en dur - un signal de rareté/désirabilité déjà
// choisi par la personne qui gère la watchlist, enfin exploité.
function scoreFromPriority(item: ScorableItem, add: AddFn) {
  if (item.priority <= 0) return;
  add(`Priorité watchlist (${item.priority})`, item.priority * PRIORITY_SCORE_WEIGHT);
}

function scoreFromPriceBand(item: ScorableItem, add: AddFn) {
  if (item.price <= 50) add('Faible ticket d\'entrée (≤50€)', 5);
  if (item.price >= 150) add('Ticket d\'entrée élevé (≥150€)', -10);
}
