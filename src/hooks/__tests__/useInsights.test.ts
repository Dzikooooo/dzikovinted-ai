// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Listing } from '../../lib/types';
import type { InsightsReport } from '../../lib/insights/types';

// Phase 2 "Affinage stock & performance" (2026-08-28), chantier #2 : couvre
// fetchAllRows()/loadGridPage-equivalent d'useInsights.ts -- meme risque que
// celui deja corrige sur ListingsManagementSection.tsx (chantier #1), mais
// ici la fonction ne PEUT PAS se contenter d'exposer une pagination a
// l'ecran : elle calcule des scores/recommandations agreges sur TOUTE
// l'annonce, donc la seule parade est une boucle .range() interne et
// transparente. Ce test prouve que la boucle fonctionne (plusieurs pages
// accumulees), s'arrete au bon moment (page < 1000 lignes), et qu'une
// erreur en cours de boucle n'ecrase jamais le rapport avec des donnees
// partielles.

type TableName = 'listings' | 'listing_metric_snapshots' | 'action_log';
type PageResult = { data: unknown[] | null; error: { message: string } | null };
type RecordedCall = { table: TableName; method: string; args: unknown[] };

let responses: Record<TableName, PageResult[]> = {
  listings: [{ data: [], error: null }],
  listing_metric_snapshots: [{ data: [], error: null }],
  action_log: [{ data: [], error: null }],
};
let fromCalls: RecordedCall[] = [];

// Chainable qui enregistre chaque appel de methode et resout, a chaque
// nouvelle chaine construite (donc a chaque iteration de fetchAllRows), la
// PROCHAINE page configuree pour cette table -- reproduit fidelement le
// comportement reel d'un .range() qui avance page apres page.
function makeChainable(table: TableName) {
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: PageResult) => void) => {
          const queue = responses[table];
          const next = queue.length > 1 ? queue.shift()! : queue[0];
          resolve(next);
        };
      }
      return (...args: unknown[]) => {
        fromCalls.push({ table, method: String(prop), args });
        return self;
      };
    },
  });
  return self;
}

// References STABLES (voir project_dashboard_render_test_gotchas -- memoire
// projet) : fetchInsights() est un useCallback dependant de [user, accounts,
// selectedAccountId]. Un tableau `accounts` recree a chaque rendu du mock
// (ex. `() => ({ accounts: [] })`) change d'identite a chaque appel, ce qui
// change l'identite de fetchInsights, ce qui redeclenche l'effet qui
// l'appelle, boucle infinie -- deja rencontre et corrige sur ce meme repo.
const STABLE_USER = { id: 'u1' };
const STABLE_ACCOUNTS: unknown[] = [];
let mockSelectedAccountId = 'all';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: STABLE_USER }),
}));

vi.mock('../../contexts/VintedAccountFilterContext', () => ({
  useVintedAccountFilter: () => ({ accounts: STABLE_ACCOUNTS, selectedAccountId: mockSelectedAccountId }),
}));

const computeInsightsMock = vi.fn(
  (..._args: unknown[]) => ({ listingRecommendations: new Map(), narratives: [] }) as unknown as InsightsReport
);
vi.mock('../../lib/insights/engine', () => ({
  computeInsights: (...args: unknown[]) => computeInsightsMock(...args),
}));

const syncRecommendationLogMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../lib/recommendationLogSync', () => ({
  syncRecommendationLog: (...args: unknown[]) => syncRecommendationLogMock(...args),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => makeChainable(table as TableName),
  },
}));

const { useInsights } = await import('../useInsights');

function listingRow(id: string): Listing {
  return { id, vinted_account_id: 'acc-1' } as unknown as Listing;
}

function rangeCallsFor(table: TableName) {
  return fromCalls.filter((c) => c.table === table && c.method === 'range');
}

afterEach(() => {
  responses = {
    listings: [{ data: [], error: null }],
    listing_metric_snapshots: [{ data: [], error: null }],
    action_log: [{ data: [], error: null }],
  };
  fromCalls = [];
  mockSelectedAccountId = 'all';
  computeInsightsMock.mockClear();
  syncRecommendationLogMock.mockClear();
});

describe('useInsights -- fetch exhaustif au-dela du plafond 1000 lignes de PostgREST (chantier #2)', () => {
  it("boucle sur .range() jusqu'a epuisement et accumule toutes les pages avant de calculer les insights", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => listingRow(`l${i}`));
    const page2 = Array.from({ length: 200 }, (_, i) => listingRow(`l${1000 + i}`));
    responses.listings = [
      { data: page1, error: null },
      { data: page2, error: null },
    ];

    renderHook(() => useInsights());

    await waitFor(() => expect(computeInsightsMock).toHaveBeenCalled());

    const listingsArg = computeInsightsMock.mock.calls[0][0] as Listing[];
    expect(listingsArg).toHaveLength(1200);
    expect(rangeCallsFor('listings').map((c) => c.args)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("un seul appel .range() suffit quand une page contient moins de 1000 lignes -- et les 3 requetes (listings/snapshots/action_log) passent bien par la meme boucle", async () => {
    responses.listings = [{ data: [listingRow('l1')], error: null }];

    renderHook(() => useInsights());

    await waitFor(() => expect(computeInsightsMock).toHaveBeenCalled());

    expect(rangeCallsFor('listings')).toHaveLength(1);
    expect(rangeCallsFor('listings')[0].args).toEqual([0, 999]);
    expect(rangeCallsFor('listing_metric_snapshots')).toHaveLength(1);
    expect(rangeCallsFor('action_log')).toHaveLength(1);
  });

  it("une erreur au milieu de la boucle interrompt le chargement -- aucun rapport calcule sur des donnees partielles, loading redescend honnetement", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => listingRow(`l${i}`));
    responses.listings = [
      { data: page1, error: null },
      { data: null, error: { message: 'network down' } },
    ];

    const { result } = renderHook(() => useInsights());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/impossible de calculer/i);
    expect(result.current.report).toBeNull();
    expect(computeInsightsMock).not.toHaveBeenCalled();
    expect(syncRecommendationLogMock).not.toHaveBeenCalled();
  });
});
