// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Chantier #3 "Affinage stock & performance" (2026-08-28) : couvre
// fetchAllRows() cote DashboardHome.tsx -- meme risque et meme correctif que
// useInsights.ts (chantier #2) et AccountingPage.tsx, cette fois pour les
// KPIs "Valeur du stock"/"Chiffre d'affaires" (voir `metrics` dans
// DashboardHome.tsx). Premier fichier de test pour cette page (aucune
// couverture n'existait avant) -- perimetre volontairement limite a la
// preuve de la boucle .range(), pas une couverture exhaustive du reste de
// la page (hors sujet de ce chantier).

type RecordedCall = { table: string; method: string; args: unknown[] };

let fromCalls: RecordedCall[] = [];
let listingsResponses: Array<{ data: unknown[] | null; error: { message: string } | null }> = [{ data: [], error: null }];

// Seule la table `listings` a un jeu de reponses pagine reel (c'est elle
// qu'on migre) ; les 3 requetes `market_opportunities` recoivent une reponse
// neutre fixe -- suffisant pour {data}/{count}, quel que soit lequel des
// deux la page lit.
function makeChainable(table: string) {
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => {
          if (table === 'listings') {
            const next = listingsResponses.length > 1 ? listingsResponses.shift()! : listingsResponses[0];
            resolve(next);
          } else {
            resolve({ data: [], error: null, count: 0 });
          }
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

const STABLE_USER = { id: 'u1' };
const STABLE_PROFILE = { id: 'u1', plan: 'free' as const, role: 'user' as const, credits: 5 };
const STABLE_ACCOUNTS: unknown[] = [];

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: STABLE_USER, profile: STABLE_PROFILE }),
}));

vi.mock('../../../contexts/VintedAccountFilterContext', () => ({
  useVintedAccountFilter: () => ({ accounts: STABLE_ACCOUNTS, selectedAccountId: 'all', selectedAccount: null }),
}));

vi.mock('../../../hooks/useInsights', () => ({
  useInsights: () => ({ report: null, loading: false, refetch: vi.fn() }),
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      fromCalls.push({ table, method: 'from', args: [table] });
      return makeChainable(table);
    },
  },
}));

const DashboardHome = (await import('../DashboardHome')).default;

function stockListingRow(id: string, price: number): Record<string, unknown> {
  return {
    id,
    status: 'en_stock',
    vinted_status: null,
    price,
    created_at: new Date().toISOString(),
    is_favorite: false,
    image_urls: [],
  };
}

function rangeCallsFor(table: string) {
  return fromCalls.filter((c) => c.table === table && c.method === 'range');
}

afterEach(() => {
  fromCalls = [];
  listingsResponses = [{ data: [], error: null }];
});

describe('DashboardHome -- fetch exhaustif des annonces au-dela du plafond 1000 lignes (chantier #3)', () => {
  it("boucle sur .range() jusqu'a epuisement et cumule toutes les pages avant de calculer la valeur du stock", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => stockListingRow(`l${i}`, 10));
    const page2 = Array.from({ length: 3 }, (_, i) => stockListingRow(`l${1000 + i}`, 10));
    listingsResponses = [
      { data: page1, error: null },
      { data: page2, error: null },
    ];

    render(<DashboardHome onNavigate={() => {}} />);

    await waitFor(() => expect(rangeCallsFor('listings').length).toBeGreaterThan(0));
    await waitFor(() => expect(rangeCallsFor('listings')).toHaveLength(2));
    expect(rangeCallsFor('listings').map((c) => c.args)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);

    // 1003 articles en stock a 10 EUR : preuve que la 2e page a bien ete
    // integree au calcul de "Valeur du stock", pas seulement chargee puis
    // ignoree (formatEUR ne met pas de separateur de milliers).
    expect(await screen.findByText('10030 €')).toBeInTheDocument();
  });

  it("un seul appel .range() suffit quand la page contient moins de 1000 lignes", async () => {
    listingsResponses = [{ data: [stockListingRow('l1', 42)], error: null }];

    render(<DashboardHome onNavigate={() => {}} />);

    await waitFor(() => expect(rangeCallsFor('listings').length).toBeGreaterThan(0));
    expect(rangeCallsFor('listings')).toHaveLength(1);
    expect(rangeCallsFor('listings')[0].args).toEqual([0, 999]);
  });

  it('une erreur en cours de boucle affiche le message honnete existant, sans planter la page', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => stockListingRow(`l${i}`, 10));
    listingsResponses = [
      { data: page1, error: null },
      { data: null, error: { message: 'network down' } },
    ];

    render(<DashboardHome onNavigate={() => {}} />);

    expect(await screen.findByText(/impossible de charger le tableau de bord/i)).toBeInTheDocument();
  });
});
