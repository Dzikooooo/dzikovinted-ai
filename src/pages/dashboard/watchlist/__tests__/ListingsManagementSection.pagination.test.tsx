// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListingsManagementSection } from '../ListingsManagementSection';
import type { Listing, VintedAccount } from '../../../../lib/types';

// Phase 2 "Affinage stock & performance" (2026-08-28), chantier #1 : couvre
// loadGridPage() (pagination serveur reelle de l'onglet "Annonces", voir son
// commentaire dans ListingsManagementSection.tsx). Fichier SEPARE des autres
// suites de ce composant : le mock `makeChainable` pass-through utilise par
// ListingsManagementSection.test.tsx/.sync.test.tsx ignore les arguments de
// chaque appel de chaine et resout toujours le meme resultat -- suffisant
// pour verifier que le composant ne plante pas, mais aveugle a la question
// qui compte ici (est-ce que .range()/.or()/.eq() sont vraiment construits
// avec les bons arguments ?). Le mock ci-dessous ENREGISTRE chaque appel.

const TEST_LISTING: Listing = {
  id: 'l1',
  user_id: 'u1',
  title: 'Polo Ralph Lauren',
  description: 'Tres bon etat',
  brand: 'Ralph Lauren',
  category: 'Polo',
  color: null,
  size: 'M',
  material: null,
  condition: 'Tres bon etat',
  price: 25,
  quick_price: 20,
  premium_price: 30,
  keywords: [],
  vinted_filters: [],
  image_urls: ['https://example.com/1.jpg'],
  purchase_price: null,
  purchase_date: null,
  purchase_location: null,
  status: 'en_stock',
  sold_price: null,
  sold_date: null,
  fees: 0,
  is_favorite: false,
  created_at: new Date().toISOString(),
  vinted_account_id: 'acc-1',
  vinted_item_id: 'old-item-42',
  vinted_url: null,
  vinted_status: 'hidden',
  favourites: 3,
  views: 12,
  synced_at: new Date().toISOString(),
  last_edited_at: null,
  sku: 1,
  vinted_sync_status: null,
};

type RecordedCall = { method: string; args: unknown[] };

let fromCalls: RecordedCall[] = [];
let queryResult: { data: Listing[] | null; error: { message: string } | null; count: number | null } = {
  data: [TEST_LISTING],
  error: null,
  count: 1,
};

// Chainable qui enregistre chaque methode appelee (nom + arguments) dans
// fromCalls avant de se retourner elle-meme, puis resout `queryResult` des
// que la chaine est `await`-ee (proxy thenable, meme principe que les autres
// mocks de ce composant -- seule la partie enregistrement est nouvelle).
function makeRecordingChainable() {
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: typeof queryResult) => void) => resolve(queryResult);
      }
      return (...args: unknown[]) => {
        fromCalls.push({ method: String(prop), args });
        return self;
      };
    },
  });
  return self;
}

// Chantier #3 (2026-08-28) : load() (StatCards + badge Republication)
// appelle desormais LUI AUSSI .range(), mais par tranches de 1000 lignes
// (fetchAllRows exhaustif) -- tres different des tranches de PAGE_SIZE=30
// de loadGridPage. Un simple filtre par methode ne suffit donc plus a isoler
// les appels de la grille : gridRangeCalls() les distingue par la taille de
// tranche (30 << 500 << 1000).
function rangeCalls() {
  return fromCalls.filter((c) => c.method === 'range');
}
function gridRangeCalls() {
  return rangeCalls().filter((c) => (c.args[1] as number) < 500);
}
function orCalls() {
  return fromCalls.filter((c) => c.method === 'or');
}

const STABLE_USER = { id: 'u1' };
const STABLE_PROFILE = { id: 'u1', plan: 'free' as const, role: 'user' as const };
const STABLE_ACCOUNTS: VintedAccount[] = [];
const stableRefresh = vi.fn();
const stablePrepareAction = vi.fn();
const stableConfirmAction = vi.fn();
const stableCancelAction = vi.fn();
const stableInsightsRefetch = vi.fn();

vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: STABLE_USER, profile: STABLE_PROFILE }),
}));

vi.mock('../../../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../../../contexts/VintedAccountFilterContext', () => ({
  useVintedAccountFilter: () => ({
    accounts: STABLE_ACCOUNTS,
    selectedAccountId: 'all',
    selectedAccount: null,
    refresh: stableRefresh,
  }),
}));

vi.mock('../../../../hooks/useInsights', () => ({
  useInsights: () => ({ report: null, loading: false, refetch: stableInsightsRefetch }),
}));

vi.mock('../../../../hooks/useActionEngine', () => ({
  useActionEngine: () => ({ prepareAction: stablePrepareAction, confirmAction: stableConfirmAction, cancelAction: stableCancelAction }),
}));

vi.mock('../../../../lib/extensionBridge', () => ({
  isExtensionConfigured: () => false,
  pingExtension: async () => false,
  RUN_ACTION_TIMEOUT_ERROR: "Delai depasse (aucune reponse de l'extension)",
}));

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      fromCalls.push({ method: 'from', args: [table] });
      return makeRecordingChainable();
    },
  },
}));

describe('ListingsManagementSection -- pagination serveur reelle (loadGridPage, chantier #1)', () => {
  const TEST_TIMEOUT_MS = 20000;

  afterEach(() => {
    fromCalls = [];
    queryResult = { data: [TEST_LISTING], error: null, count: 1 };
  });

  it(
    "au montage sur l'onglet Annonces : charge la premiere page via .range(0, PAGE_SIZE-1), en excluant les ventes",
    async () => {
      render(<ListingsManagementSection />);

      await waitFor(() => expect(gridRangeCalls().length).toBeGreaterThan(0));
      expect(gridRangeCalls()[0].args).toEqual([0, 29]);
      expect(fromCalls.some((c) => c.method === 'neq' && c.args[0] === 'status' && c.args[1] === 'vendu')).toBe(true);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'count superieur aux lignes chargees : "Charger plus" est visible, et un clic recharge avec un .range() decale du nombre de lignes deja en page',
    async () => {
      queryResult = { data: [TEST_LISTING], error: null, count: 50 };
      const user = userEvent.setup();
      render(<ListingsManagementSection />);

      const loadMore = await screen.findByRole('button', { name: /charger plus/i });
      fromCalls = [];
      await user.click(loadMore);

      await waitFor(() => expect(gridRangeCalls().length).toBeGreaterThan(0));
      expect(gridRangeCalls()[0].args).toEqual([1, 30]);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'count egal aux lignes chargees : "Charger plus" ne s\'affiche pas',
    async () => {
      queryResult = { data: [TEST_LISTING], error: null, count: 1 };
      render(<ListingsManagementSection />);

      await waitFor(() => expect(screen.getByText('Polo Ralph Lauren')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: /charger plus/i })).not.toBeInTheDocument();
    },
    TEST_TIMEOUT_MS
  );

  it(
    'la recherche (debouncee 300ms) declenche une nouvelle requete .range(0,...) avec un second .or() ilike',
    async () => {
      const user = userEvent.setup();
      render(<ListingsManagementSection />);
      await waitFor(() => expect(gridRangeCalls().length).toBeGreaterThan(0));

      fromCalls = [];
      await user.type(screen.getByPlaceholderText('Rechercher un article...'), 'polo');

      await waitFor(() => expect(gridRangeCalls().length).toBeGreaterThan(0), { timeout: 3000 });
      const searchOrCall = orCalls().find((c) => String(c.args[0]).includes('ilike'));
      expect(searchOrCall).toBeDefined();
      expect(String(searchOrCall!.args[0])).toContain('title.ilike.%polo%');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'changer le filtre de statut declenche une nouvelle requete avec .eq(vinted_status, <valeur choisie>)',
    async () => {
      const user = userEvent.setup();
      render(<ListingsManagementSection />);
      await waitFor(() => expect(gridRangeCalls().length).toBeGreaterThan(0));

      fromCalls = [];
      await user.selectOptions(screen.getByLabelText('Filtrer par statut'), 'online');

      await waitFor(() => expect(gridRangeCalls().length).toBeGreaterThan(0));
      expect(fromCalls.some((c) => c.method === 'eq' && c.args[0] === 'vinted_status' && c.args[1] === 'online')).toBe(true);
    },
    TEST_TIMEOUT_MS
  );

  it(
    "passer sur l'onglet Republication n'appelle jamais .range() -- mecanisme client-side inchange sur cet onglet",
    async () => {
      const user = userEvent.setup();
      render(<ListingsManagementSection />);
      await waitFor(() => expect(gridRangeCalls().length).toBeGreaterThan(0));

      fromCalls = [];
      await user.click(screen.getByRole('button', { name: /republication/i }));

      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(gridRangeCalls().length).toBe(0);
    },
    TEST_TIMEOUT_MS
  );

  it(
    "une erreur de la requete grille affiche un message honnete, sans bloquer le reste de la page",
    async () => {
      queryResult = { data: null, error: { message: 'network down' }, count: null };
      render(<ListingsManagementSection />);

      const banners = await screen.findAllByText(/impossible de charger tes annonces/i);
      expect(banners.length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS
  );
});

// Chantier #3 (2026-08-28), derniere brique : load() (StatCards + badge
// Republication) migre lui aussi vers fetchAllRows(). La boucle multi-pages
// elle-meme (fetchAllRows) est deja prouvee 3 fois ailleurs (useInsights,
// DashboardHome, AccountingPage) -- ce qui restait a prouver ICI est que
// load() est bien branche dessus (appelle .range() par tranches de 1000, pas
// 30) et que les StatCards refletent reellement ce qui est charge.
describe("ListingsManagementSection -- fetch exhaustif de load() pour les StatCards/badge Republication (chantier #3)", () => {
  const TEST_TIMEOUT_MS = 20000;

  afterEach(() => {
    fromCalls = [];
    queryResult = { data: [TEST_LISTING], error: null, count: 1 };
  });

  function loadRangeCalls() {
    return rangeCalls().filter((c) => (c.args[1] as number) >= 500);
  }

  it(
    "load() appelle .range() par tranches de 1000 (fetchAllRows), et la StatCard \"Valeur du stock\" reflete les donnees chargees",
    async () => {
      render(<ListingsManagementSection />);

      await waitFor(() => expect(loadRangeCalls().length).toBeGreaterThan(0));
      expect(loadRangeCalls()[0].args).toEqual([0, 999]);

      // TEST_LISTING : price 25, activement en stock (status 'en_stock',
      // vinted_status 'hidden') -> "Valeur du stock" doit afficher 25 € --
      // scope sur la StatCard elle-meme, la carte de l'annonce dans la
      // grille affiche aussi son propre prix "25 €".
      const statCard = (await screen.findByText('Valeur du stock')).closest('div')!;
      expect(within(statCard).getByText('25 €')).toBeInTheDocument();
    },
    TEST_TIMEOUT_MS
  );
});
