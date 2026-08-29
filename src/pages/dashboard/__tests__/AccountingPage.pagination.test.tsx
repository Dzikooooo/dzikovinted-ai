// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { Expense } from '../../../hooks/useExpenses';

// Chantier #3 "Affinage stock & performance" (2026-08-28) : couvre
// fetchAllRows() cote AccountingPage.tsx -- meme risque et meme correctif
// que useInsights.ts (chantier #2) et DashboardHome.tsx, cette fois pour le
// chiffre d'affaires/marge/benefice/ROI (voir `stats` dans AccountingPage.tsx).
// Fichier SEPARE de AccountingPage.test.tsx : son mock supabase existant est
// une liste blanche de methodes qui ignore les arguments et resout toujours
// le meme resultat -- insuffisant pour prouver que .range() est vraiment
// appele avec les bons arguments, exactement le meme constat que pour
// ListingsManagementSection.pagination.test.tsx (chantier #1).

type RecordedCall = { method: string; args: unknown[] };

let fromCalls: RecordedCall[] = [];
let responses: Array<{ data: unknown[] | null; error: { message: string } | null }> = [{ data: [], error: null }];

function makeRecordingChainable() {
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: (typeof responses)[number]) => void) => {
          const next = responses.length > 1 ? responses.shift()! : responses[0];
          resolve(next);
        };
      }
      return (...args: unknown[]) => {
        fromCalls.push({ method: String(prop), args });
        return self;
      };
    },
  });
  return self;
}

const AUTH = { user: { id: 'u1' } };
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('../../../contexts/VintedAccountFilterContext', () => ({
  useVintedAccountFilter: () => ({ selectedAccountId: 'all' }),
}));
vi.mock('../../../hooks/useExpenses', () => ({
  useExpenses: () => ({
    expenses: [] as Expense[],
    loading: false,
    error: null,
    addExpense: vi.fn(),
    deleteExpense: vi.fn(),
  }),
}));
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      fromCalls.push({ method: 'from', args: [table] });
      return makeRecordingChainable();
    },
  },
}));

const AccountingPage = (await import('../AccountingPage')).default;

function listingRow(id: string, soldPrice: number): Record<string, unknown> {
  return {
    id,
    status: 'vendu',
    sold_date: new Date().toISOString().slice(0, 10),
    sold_price: soldPrice,
    purchase_price: 0,
    fees: 0,
    price: soldPrice,
    created_at: new Date().toISOString(),
    brand: null,
    category: null,
    condition: null,
    is_favorite: false,
  };
}

function rangeCalls() {
  return fromCalls.filter((c) => c.method === 'range');
}

afterEach(() => {
  fromCalls = [];
  responses = [{ data: [], error: null }];
});

async function renderAndWaitReady() {
  render(<AccountingPage />);
  await waitFor(() => expect(screen.getByText(/Aide déclaration URSSAF/i)).toBeTruthy());
}

describe('AccountingPage -- fetch exhaustif des annonces au-dela du plafond 1000 lignes (chantier #3)', () => {
  it("boucle sur .range() jusqu'a epuisement et cumule toutes les pages avant de calculer le chiffre d'affaires", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => listingRow(`l${i}`, 10));
    const page2 = Array.from({ length: 5 }, (_, i) => listingRow(`l${1000 + i}`, 10));
    responses = [
      { data: page1, error: null },
      { data: page2, error: null },
    ];

    await renderAndWaitReady();

    expect(rangeCalls().map((c) => c.args)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    // 1005 ventes a 10 EUR : preuve que la 2e page a bien ete integree au
    // calcul, pas seulement chargee puis ignoree (formatEUR ne met pas de
    // separateur de milliers, voir lib/currency.ts -- purchase_price/fees a
    // 0 dans le fixture, donc CA/marge/benefice affichent tous cette meme
    // valeur, d'ou findAllByText plutot que findByText).
    const revenueNodes = await screen.findAllByText('10050 €');
    expect(revenueNodes.length).toBeGreaterThan(0);
  });

  it("un seul appel .range() suffit quand la page contient moins de 1000 lignes", async () => {
    responses = [{ data: [listingRow('l1', 42)], error: null }];

    await renderAndWaitReady();

    expect(rangeCalls()).toHaveLength(1);
    expect(rangeCalls()[0].args).toEqual([0, 999]);
  });

  it('une erreur en cours de boucle affiche le message honnete existant, sans planter la page', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => listingRow(`l${i}`, 10));
    responses = [
      { data: page1, error: null },
      { data: null, error: { message: 'network down' } },
    ];

    render(<AccountingPage />);

    expect(await screen.findByText(/impossible de charger la comptabilité/i)).toBeInTheDocument();
  });
});
