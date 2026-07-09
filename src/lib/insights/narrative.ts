import type { EngineContext, NarrativeInsight } from './types';
import { MIN_SAMPLE_SIZE_FOR_COMPARISON } from './constants';
import { daysBetween } from './math';

// Phrases generees par templates a partir d'agregats reels deja calcules
// dans le contexte - jamais d'appel LLM (voir plan : Gemini n'est utilise
// dans ce projet que pour la generation photo->annonce, jamais pour du
// texte d'analyse ; un template elimine tout risque d'invention de chiffre).
// Chaque fonction ne produit une phrase que si la donnee sous-jacente est
// reelle et suffisante - sinon elle ne produit rien, silencieusement.

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function weeklySalesByAccount(ctx: EngineContext): string[] {
  const messages: string[] = [];
  const weekAgo = new Date(ctx.now.getTime() - 7 * 24 * 60 * 60 * 1000);

  for (const account of ctx.accounts) {
    const soldThisWeek = ctx.listings.filter(
      (l) =>
        l.vinted_account_id === account.id &&
        l.status === 'vendu' &&
        l.sold_date &&
        new Date(l.sold_date) >= weekAgo
    );
    if (soldThisWeek.length === 0) continue;

    const withCost = soldThisWeek.filter((l) => l.purchase_price !== null && l.sold_price !== null);
    if (withCost.length === 0) {
      messages.push(`Cette semaine, ${account.label} a vendu ${soldThisWeek.length} article${soldThisWeek.length > 1 ? 's' : ''}.`);
      continue;
    }

    const avgRoi =
      withCost.reduce((sum, l) => {
        const profit = Number(l.sold_price) - Number(l.purchase_price) - Number(l.fees || 0);
        const roi = Number(l.purchase_price) > 0 ? (profit / Number(l.purchase_price)) * 100 : 0;
        return sum + roi;
      }, 0) / withCost.length;

    messages.push(
      `Cette semaine, ${account.label} a vendu ${soldThisWeek.length} article${soldThisWeek.length > 1 ? 's' : ''} avec un ROI moyen de ${Math.round(avgRoi)} %.`
    );
  }

  return messages;
}

function bestPerformingBrand(ctx: EngineContext): string | null {
  const entries = [...ctx.byBrand.entries()].filter(
    ([, stats]) => stats.avgRoi !== null && stats.count >= MIN_SAMPLE_SIZE_FOR_COMPARISON
  );
  if (entries.length < 2) return null;

  entries.sort((a, b) => (b[1].avgRoi ?? 0) - (a[1].avgRoi ?? 0));
  const [topBrand, topStats] = entries[0];
  const [, secondStats] = entries[1];
  if (!topStats.avgRoi || !secondStats.avgRoi || secondStats.avgRoi <= 0) return null;

  const ratio = topStats.avgRoi / secondStats.avgRoi;
  if (ratio < 1.3) return null;

  return `Vos annonces ${capitalize(topBrand)} performent ${ratio.toFixed(1)}x mieux que vos autres marques en ROI moyen.`;
}

function bestMarginCategory(ctx: EngineContext): string | null {
  const entries = [...ctx.byCategory.entries()].filter(
    ([, stats]) => stats.avgRoi !== null && stats.count >= MIN_SAMPLE_SIZE_FOR_COMPARISON
  );
  if (entries.length === 0) return null;

  entries.sort((a, b) => (b[1].avgRoi ?? 0) - (a[1].avgRoi ?? 0));
  const [topCategory] = entries[0];

  return `${capitalize(topCategory)} génère actuellement le meilleur ROI moyen sur votre inventaire.`;
}

function recentListingsShareOfSales(ctx: EngineContext): string | null {
  const soldWithDates = ctx.listings.filter((l) => l.status === 'vendu' && l.sold_date);
  if (soldWithDates.length < MIN_SAMPLE_SIZE_FOR_COMPARISON) return null;

  const soldFast = soldWithDates.filter((l) => daysBetween(l.created_at, l.sold_date as string) < 7);
  const share = Math.round((soldFast.length / soldWithDates.length) * 100);
  if (share < 50) return null;

  return `Les annonces vendues en moins de 7 jours représentent ${share} % de vos ventes.`;
}

function bestPerformingAccount(ctx: EngineContext): string | null {
  if (ctx.accounts.length < 2) return null;
  const entries = [...ctx.byAccount.entries()].filter(
    ([, stats]) => stats.avgRoi !== null && stats.count >= MIN_SAMPLE_SIZE_FOR_COMPARISON
  );
  if (entries.length < 2) return null;

  entries.sort((a, b) => (b[1].avgRoi ?? 0) - (a[1].avgRoi ?? 0));
  const [topAccountId, topStats] = entries[0];
  const topAccount = ctx.accounts.find((a) => a.id === topAccountId);
  if (!topAccount || !topStats.avgRoi) return null;

  return `${topAccount.label} est votre compte le plus performant, avec un ROI moyen de ${Math.round(topStats.avgRoi)} %.`;
}

const NARRATIVE_BUILDERS: ((ctx: EngineContext) => string | string[] | null)[] = [
  weeklySalesByAccount,
  bestPerformingBrand,
  bestMarginCategory,
  recentListingsShareOfSales,
  bestPerformingAccount,
];

export function computeNarratives(ctx: EngineContext): NarrativeInsight[] {
  const messages: string[] = [];
  for (const build of NARRATIVE_BUILDERS) {
    const result = build(ctx);
    if (!result) continue;
    if (Array.isArray(result)) messages.push(...result);
    else messages.push(result);
  }
  return messages.map((message) => ({ message }));
}
