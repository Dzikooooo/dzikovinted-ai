// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Expense } from '../../../hooks/useExpenses';

// Refonte 2026-08-26 de la Comptabilite. Ce fichier couvre ce que la refonte
// a change et qui pourrait casser sans qu'on le voie : l'alignement de TOUTES
// les mesures de depenses sur le selecteur de periode, la neutralite a zero,
// et le bloc d'aide a la declaration URSSAF -- dont les chiffres finissent
// dans une vraie declaration.

const listingsRows: Array<Record<string, unknown>> = [];
let expenseRows: Expense[] = [];

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const result = Promise.resolve({ data: listingsRows, error: null });
      const chain: Record<string, unknown> = {};
      // 'range' ajoute par le chantier #3 (2026-08-28, pagination serveur
      // exhaustive via fetchAllRows -- voir AccountingPage.tsx) : sans lui,
      // le premier appel a .range() de la boucle jetterait "is not a
      // function" et casserait TOUS les tests de ce fichier.
      for (const m of ['select', 'eq', 'order', 'limit', 'range']) chain[m] = () => chain;
      Object.assign(chain, { then: result.then.bind(result) });
      return chain;
    },
  },
}));
// Objet STABLE : `user` est dans les dependances de l'effet de la page. Un
// literal recree a chaque rendu relancerait l'effet en boucle et la page
// resterait bloquee sur ses squelettes.
const AUTH = { user: { id: 'u1' } };
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('../../../contexts/VintedAccountFilterContext', () => ({
  useVintedAccountFilter: () => ({ selectedAccountId: 'all' }),
}));
vi.mock('../../../hooks/useExpenses', () => ({
  useExpenses: () => ({
    expenses: expenseRows,
    loading: false,
    error: null,
    addExpense: vi.fn(),
    deleteExpense: vi.fn(),
  }),
}));

const AccountingPage = (await import('../AccountingPage')).default;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// Une depense de l'annee en cours mais d'un mois anterieur, pour distinguer
// reellement "Ce mois-ci" de "Cette annee". Le 1er du mois, "il y a 40 jours"
// tombe deux mois en arriere -- toujours hors du mois courant, ce qui est la
// seule chose dont le test a besoin.
const OLD_EXPENSE_DATE = isoDaysAgo(40);

function makeExpense(over: Partial<Expense> = {}): Expense {
  return { id: 'e1', category: 'Emballage', amount: 10, note: '', expenseDate: isoDaysAgo(0), vintedAccountId: null, ...over };
}

beforeEach(() => {
  listingsRows.length = 0;
  expenseRows = [];
});

async function renderPage() {
  render(<AccountingPage />);
  await waitFor(() => expect(screen.getByText(/Aide déclaration URSSAF/i)).toBeTruthy());
}

describe('Comptabilité -- neutralité à zéro', () => {
  it("n'affiche pas les pertes à 0 avec l'accent de marque", async () => {
    await renderPage();
    // L'accent violet mettait en vedette une non-information. gray-900 neutre.
    const pertes = screen.getByText('Pertes').closest('div')!;
    expect(within(pertes).getByText('0 €').className).toContain('text-gray-900');
  });

  it('ne peint pas un chiffre d\'affaires nul en vert', async () => {
    await renderPage();
    const ca = screen.getByText("Chiffre d'affaires").closest('div')!;
    expect(within(ca).getByText('0 €').className).not.toContain('text-green');
  });

  it("n'écrit pas \"-0 €\" quand il n'y a aucune dépense", async () => {
    await renderPage();
    expect(screen.queryByText('-0 €')).toBeNull();
  });
});

describe('Comptabilité -- période', () => {
  it('aligne les dépenses sur "Ce mois-ci" par défaut', async () => {
    expenseRows = [
      makeExpense({ id: 'recent', amount: 10 }),
      makeExpense({ id: 'vieux', amount: 500, expenseDate: OLD_EXPENSE_DATE }),
    ];
    await renderPage();

    const total = screen.getByText('Total des dépenses').closest('div')!;
    // 10 et non 510 : la depense d'un mois anterieur est hors periode.
    expect(within(total).getByText('10 €')).toBeTruthy();
    expect(within(total).queryByText('510 €')).toBeNull();
  });

  it('réévalue le total quand on bascule sur "Depuis le début"', async () => {
    const user = userEvent.setup();
    expenseRows = [
      makeExpense({ id: 'recent', amount: 10 }),
      makeExpense({ id: 'vieux', amount: 500, expenseDate: OLD_EXPENSE_DATE }),
    ];
    await renderPage();

    await user.click(screen.getByRole('button', { name: 'Depuis le début' }));

    const total = screen.getByText('Total des dépenses').closest('div')!;
    expect(within(total).getByText('510 €')).toBeTruthy();
  });

  it('compte les dépenses de la période, pas toutes', async () => {
    expenseRows = [
      makeExpense({ id: 'a' }),
      makeExpense({ id: 'b' }),
      makeExpense({ id: 'vieux', expenseDate: OLD_EXPENSE_DATE }),
    ];
    await renderPage();

    const count = screen.getByText('Nombre de dépenses').closest('div')!;
    expect(within(count).getByText('2')).toBeTruthy();
  });
});

describe('Comptabilité -- carte dépenses unifiée', () => {
  it('ne propose plus qu\'un seul bouton d\'ajout', async () => {
    await renderPage();
    expect(screen.getAllByRole('button', { name: /Ajouter une dépense/i })).toHaveLength(1);
  });

  it('ne montre plus deux états vides pour la même absence', async () => {
    await renderPage();
    expect(screen.queryByText(/Aucune dépense enregistrée/i)).toBeNull();
    expect(screen.getByText(/Aucune dépense sur la période/i)).toBeTruthy();
  });
});

describe('Comptabilité -- aide déclaration URSSAF', () => {
  it("dit que le montant à déclarer est le chiffre d'affaires brut", async () => {
    await renderPage();
    expect(screen.getByText(/Montant à déclarer à l'URSSAF/i)).toBeTruthy();
    expect(screen.getByText(/Chiffre d'affaires brut de la période/i)).toBeTruthy();
  });

  it('annonce les deux taux réglementaires', async () => {
    await renderPage();
    expect(screen.getByText(/12,3 % du chiffre d'affaires/i)).toBeTruthy();
    expect(screen.getByText(/Abattement forfaitaire \(IR\) 71 %/i)).toBeTruthy();
  });

  it("avertit que le calcul part des dates de vente, pas d'encaissement", async () => {
    // Le point juridique important : l'URSSAF se declare sur l'encaisse.
    // Sans cet avertissement, le chiffre se recopierait tel quel.
    await renderPage();
    expect(screen.getByText(/encaissées/i)).toBeTruthy();
    expect(screen.getByText(/ne remplace pas l'avis de ton comptable/i)).toBeTruthy();
  });

  it("ne parle plus de TVA sur la marge", async () => {
    // Une micro-entreprise sous le seuil de franchise en base n'en declare pas.
    await renderPage();
    expect(screen.queryByText(/TVA sur la marge/i)).toBeNull();
  });
});
