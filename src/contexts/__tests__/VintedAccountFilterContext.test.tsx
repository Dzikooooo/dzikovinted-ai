// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { VintedAccountFilterProvider, useVintedAccountFilter } from '../VintedAccountFilterContext';

// Retour beta 2026-08-27 : "Tous les comptes" n'a de sens qu'a partir de
// 2 comptes relies -- masque cote UI (AccountSwitcher.tsx) sous ce seuil.
// Sans ce correctif ICI, un utilisateur solo resterait bloque sur
// selectedAccountId==='all' sans aucun moyen de revenir vers son propre
// compte (l'option qui permettait de le faire vient d'etre masquee).

let accountsRows: Array<{ id: string; label: string; is_default: boolean }> = [];

// Meme pattern eprouve qu'ailleurs dans le repo (ex. AccountingPage.test.tsx) :
// `then` LIE au `.then` d'une vraie Promise, plutot qu'un resolveur fait
// main -- garantit un comportement de thenable correct avec le scheduling
// React reel (mon premier essai, un `then(resolve) => resolve(...)` a la
// main, restait bloque de facon intermittente).
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const result = Promise.resolve({ data: accountsRows });
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order']) chain[m] = () => chain;
      Object.assign(chain, { then: result.then.bind(result) });
      return chain;
    },
  },
}));

// Objet STABLE : `user` est dans les dependances de useCallback(load)/useEffect
// du contexte teste. Un literal recree a chaque rendu change d'identite a
// chaque appel de useAuth(), relance donc l'effet de chargement en boucle --
// piege deja rencontre et documente (voir AccountingPage.test.tsx).
const AUTH = { user: { id: 'u1' } };
vi.mock('../AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: () => {} }));

function Probe() {
  const { selectedAccountId, accounts, loading } = useVintedAccountFilter();
  if (loading) return <p>chargement</p>;
  return (
    <p>
      selected:{selectedAccountId} count:{accounts.length}
    </p>
  );
}

function renderWithProvider() {
  return render(
    <VintedAccountFilterProvider>
      <Probe />
    </VintedAccountFilterProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  accountsRows = [];
});

afterEach(() => {
  localStorage.clear();
});

describe('VintedAccountFilterContext -- un seul compte', () => {
  it("selectionne automatiquement l'unique compte au lieu de rester sur 'all'", async () => {
    accountsRows = [{ id: 'acc-1', label: 'dziko0737', is_default: true }];

    renderWithProvider();

    await waitFor(() => expect(screen.getByText(/selected:acc-1/)).toBeTruthy());
  });

  it("corrige aussi un 'all' deja present en localStorage (session precedente a plusieurs comptes)", async () => {
    localStorage.setItem('resellos_selected_vinted_account', 'all');
    accountsRows = [{ id: 'acc-1', label: 'dziko0737', is_default: true }];

    renderWithProvider();

    await waitFor(() => expect(screen.getByText(/selected:acc-1/)).toBeTruthy());
  });
});

describe('VintedAccountFilterContext -- plusieurs comptes', () => {
  it("garde 'all' quand il y a reellement plusieurs comptes -- la vue globale reste un choix valide", async () => {
    accountsRows = [
      { id: 'acc-1', label: 'dziko0737', is_default: true },
      { id: 'acc-2', label: 'compte2', is_default: false },
    ];

    renderWithProvider();

    await waitFor(() => expect(screen.getByText(/selected:all count:2/)).toBeTruthy());
  });
});

describe('VintedAccountFilterContext -- aucun compte', () => {
  it("reste sur 'all' sans planter quand la liste est vide", async () => {
    accountsRows = [];

    renderWithProvider();

    await waitFor(() => expect(screen.getByText(/selected:all count:0/)).toBeTruthy());
  });
});
