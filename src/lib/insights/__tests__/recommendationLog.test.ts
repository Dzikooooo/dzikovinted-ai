import { describe, expect, it } from 'vitest';
import { diffRecommendationLog } from '../recommendationLog';
import type { OpenRecommendationLogRow, ResolvableAction } from '../recommendationLog';
import type { ListingRecommendationResult } from '../types';
import { MIN_CONSECUTIVE_FRESH_MISSES_BEFORE_EXPIRY, MIN_DAYS_BEFORE_EXPIRY } from '../constants';

const NOW = new Date('2026-08-06T12:00:00.000Z');

function daysAgoIso(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

function openRow(overrides: Partial<OpenRecommendationLogRow> = {}): OpenRecommendationLogRow {
  return {
    id: 'row-1',
    listingId: 'l1',
    kind: 'baisser_prix',
    confidence: 'standard',
    reason: 'ancienne raison',
    ctaType: 'edit_listing',
    shownAt: daysAgoIso(5),
    lastConfirmedAt: daysAgoIso(1),
    consecutiveMisses: 0,
    firstMissAt: null,
    ...overrides,
  };
}

function actionResult(overrides: Partial<Extract<ListingRecommendationResult, { status: 'action' }>> = {}): ListingRecommendationResult {
  return {
    status: 'action',
    kind: 'baisser_prix',
    confidence: 'haute',
    message: 'Baisse de prix conseillée',
    reason: 'nouvelle raison',
    cta: { type: 'edit_listing', field: 'price' },
    listingId: 'l1',
    ...overrides,
  };
}

function run(
  current: ListingRecommendationResult | undefined,
  freshness: 'fraiche' | 'tendue' | 'perimee',
  open: OpenRecommendationLogRow | undefined,
  actions: ResolvableAction[] = []
) {
  const currentMap = new Map<string, ListingRecommendationResult>();
  if (current) currentMap.set('l1', current);
  const freshnessMap = new Map([['l1', freshness]] as [string, 'fraiche' | 'tendue' | 'perimee'][]);
  const openMap = new Map<string, OpenRecommendationLogRow>();
  if (open) openMap.set('l1', open);
  const actionsMap = new Map([['l1', actions]]);
  return diffRecommendationLog(['l1'], currentMap, freshnessMap, openMap, actionsMap, NOW);
}

describe('diffRecommendationLog', () => {
  it("pas d'episode ouvert + nouvelle action -> insert", () => {
    const diff = run(actionResult(), 'fraiche', undefined);
    expect(diff.inserts).toEqual([
      { listingId: 'l1', kind: 'baisser_prix', confidence: 'haute', reason: 'nouvelle raison', ctaType: 'edit_listing', now: NOW.toISOString() },
    ]);
    expect(diff.updates).toHaveLength(0);
  });

  it("pas d'episode ouvert + attendre -> aucune ecriture", () => {
    const diff = run({ status: 'attendre', message: 'ok', listingId: 'l1' }, 'fraiche', undefined);
    expect(diff.inserts).toHaveLength(0);
    expect(diff.updates).toHaveLength(0);
  });

  it('meme kind actif -> heartbeat, jamais de doublon', () => {
    const diff = run(actionResult({ confidence: 'standard', reason: 'chiffres a jour' }), 'fraiche', openRow());
    expect(diff.inserts).toHaveLength(0);
    expect(diff.updates).toEqual([
      { op: 'heartbeat', id: 'row-1', now: NOW.toISOString(), confidence: 'standard', reason: 'chiffres a jour' },
    ]);
  });

  it('kind different actif -> remplacee + nouvel insert', () => {
    const diff = run(actionResult({ kind: 'revoir_annonce', cta: { type: 'edit_listing', field: null } }), 'fraiche', openRow());
    expect(diff.updates).toEqual([{ op: 'resolve', id: 'row-1', resolution: 'remplacee', resolvedAt: NOW.toISOString(), resolutionActionId: undefined }]);
    expect(diff.inserts[0]?.kind).toBe('revoir_annonce');
  });

  it('action resolvante posterieure a shownAt -> suivie, prioritaire meme si le meme kind semble re-matcher', () => {
    const action: ResolvableAction = { id: 'act-1', listingId: 'l1', kind: 'edit_listing', completedAt: daysAgoIso(2), changedFields: ['price'] };
    const diff = run(actionResult(), 'fraiche', openRow(), [action]);
    expect(diff.updates).toEqual([{ op: 'resolve', id: 'row-1', resolution: 'suivie', resolvedAt: action.completedAt, resolutionActionId: 'act-1' }]);
    expect(diff.inserts).toHaveLength(0);
  });

  it('action resolvante ANTERIEURE a shownAt -> ignoree, ne resout pas', () => {
    const action: ResolvableAction = { id: 'act-1', listingId: 'l1', kind: 'edit_listing', completedAt: daysAgoIso(10), changedFields: ['price'] };
    const row = openRow({ shownAt: daysAgoIso(5) });
    const diff = run(actionResult(), 'fraiche', row, [action]);
    // Retombe sur le cas "meme kind actif" -> heartbeat, pas une resolution.
    expect(diff.updates[0]?.op).toBe('heartbeat');
  });

  it('verifier_annonce ne se resout jamais automatiquement via action_log', () => {
    const action: ResolvableAction = { id: 'act-1', listingId: 'l1', kind: 'edit_listing', completedAt: daysAgoIso(1) };
    const row = openRow({ kind: 'verifier_annonce', shownAt: daysAgoIso(5) });
    const diff = run({ status: 'attendre', message: 'ok', listingId: 'l1' }, 'fraiche', row, [action]);
    expect(diff.updates.find((u) => u.op === 'resolve' && u.resolution === 'suivie')).toBeUndefined();
  });

  it("recommandation_differee meme kind -> heartbeat sans confidence/reason invente", () => {
    const diff = run({ status: 'recommandation_differee', kind: 'baisser_prix', reason: 'deja tente', listingId: 'l1' }, 'fraiche', openRow());
    expect(diff.updates).toEqual([{ op: 'heartbeat', id: 'row-1', now: NOW.toISOString() }]);
  });

  it('recommandation_differee kind different -> remplacee', () => {
    const diff = run({ status: 'recommandation_differee', kind: 'considerer_republication', reason: 'deja tente', listingId: 'l1' }, 'fraiche', openRow());
    expect(diff.updates).toEqual([{ op: 'resolve', id: 'row-1', resolution: 'remplacee', resolvedAt: NOW.toISOString(), resolutionActionId: undefined }]);
  });

  it('annonce hors perimetre (current=undefined) -> expiree immediatement, jamais soumis au compteur de misses', () => {
    const diff = run(undefined, 'fraiche', openRow({ consecutiveMisses: 0, firstMissAt: null }));
    expect(diff.updates).toEqual([{ op: 'resolve', id: 'row-1', resolution: 'expiree', resolvedAt: NOW.toISOString(), resolutionActionId: undefined }]);
  });

  it('donnees_insuffisantes -> aucune ecriture, jamais un miss', () => {
    const diff = run({ status: 'donnees_insuffisantes', reason: 'synchro trop ancienne', listingId: 'l1' }, 'perimee', openRow());
    expect(diff.inserts).toHaveLength(0);
    expect(diff.updates).toHaveLength(0);
  });

  it('attendre avec synchro tendue (pas fraiche) -> jamais un miss', () => {
    const diff = run({ status: 'attendre', message: 'ok', listingId: 'l1' }, 'tendue', openRow());
    expect(diff.inserts).toHaveLength(0);
    expect(diff.updates).toHaveLength(0);
  });

  it('attendre + synchro fraiche : premier miss', () => {
    const diff = run({ status: 'attendre', message: 'ok', listingId: 'l1' }, 'fraiche', openRow({ consecutiveMisses: 0, firstMissAt: null }));
    expect(diff.updates).toEqual([
      { op: 'increment_miss', id: 'row-1', now: NOW.toISOString(), firstMissAt: NOW.toISOString(), consecutiveMisses: 1 },
    ]);
  });

  it("n'expire jamais sur un seul miss, meme frais", () => {
    const diff = run({ status: 'attendre', message: 'ok', listingId: 'l1' }, 'fraiche', openRow({ consecutiveMisses: 0, firstMissAt: null }));
    expect(diff.updates[0]?.op).not.toBe('resolve');
  });

  it("assez de misses consecutifs mais pas assez de duree ecoulee -> pas encore expiree", () => {
    const row = openRow({
      consecutiveMisses: MIN_CONSECUTIVE_FRESH_MISSES_BEFORE_EXPIRY - 1,
      firstMissAt: NOW.toISOString(), // premier miss a l'instant meme -- aucune duree ecoulee
    });
    const diff = run({ status: 'attendre', message: 'ok', listingId: 'l1' }, 'fraiche', row);
    expect(diff.updates[0]?.op).toBe('increment_miss');
  });

  it('assez de misses consecutifs ET assez de duree ecoulee -> expiree', () => {
    const row = openRow({
      consecutiveMisses: MIN_CONSECUTIVE_FRESH_MISSES_BEFORE_EXPIRY - 1,
      firstMissAt: new Date(NOW.getTime() - MIN_DAYS_BEFORE_EXPIRY * 24 * 60 * 60 * 1000).toISOString(),
    });
    const diff = run({ status: 'attendre', message: 'ok', listingId: 'l1' }, 'fraiche', row);
    expect(diff.updates).toEqual([{ op: 'resolve', id: 'row-1', resolution: 'expiree', resolvedAt: NOW.toISOString(), resolutionActionId: undefined }]);
  });

  it('un rematch remet le compteur de misses a zero (heartbeat)', () => {
    const row = openRow({ consecutiveMisses: 2, firstMissAt: daysAgoIso(2) });
    const diff = run(actionResult(), 'fraiche', row);
    expect(diff.updates[0]?.op).toBe('heartbeat');
  });
});
