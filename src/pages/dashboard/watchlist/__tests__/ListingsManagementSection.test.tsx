// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListingsManagementSection } from '../ListingsManagementSection';
import type { Listing, VintedAccount } from '../../../../lib/types';

// BUG REEL confirme en test live (2026-08-11) : le bouton "Republier"
// appelait setPublishingItem(listing) inconditionnellement, mais
// PublishConfirmationModal n'est monte que si {publishingItem &&
// selectedAccount} -- avec le filtre de compte sur "Tous les comptes"
// (etat par defaut, voir VintedAccountFilterContext.tsx), selectedAccount
// vaut null et la modale ne s'affichait jamais : clic silencieux, aucune
// erreur visible, le flow extension n'etait meme pas atteint. Ce test
// reproduit les DEUX chemins : compte selectionne (la modale doit
// s'ouvrir) et aucun compte selectionne (une erreur explicite doit
// s'afficher, jamais un silence).

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

const TEST_ACCOUNT: VintedAccount = {
  id: 'acc-1',
  user_id: 'u1',
  vinted_user_id: 'vinted-1',
  vinted_username: 'testuser',
  label: 'Compte test',
  is_default: true,
  connected: true,
  last_synced_at: null,
  listings_synced_at: null,
  created_at: new Date().toISOString(),
} as VintedAccount;

// Chainable minimal reproduisant uniquement la requete reellement faite par
// ListingsManagementSection::load() (select/eq/or/order, puis `await query`
// directement -- l'objet doit donc etre thenable). Aucune autre methode
// Supabase n'est necessaire : ce test ne declenche jamais markAsSold/
// runBulkDelete/etc.
function makeChainable(result: { data: Listing[]; error: null }) {
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: typeof result) => void) => resolve(result);
      }
      return () => self;
    },
  });
  return self;
}

let mockSelectedAccount: VintedAccount | null = TEST_ACCOUNT;

// Objets/fonctions HOISTED (references stables entre deux rendus) --
// premiere version de ce test (crash reel confirme : heap OOM apres 80
// minutes) recreait un nouvel objet litteral `{ user: {...}, ... }` a
// CHAQUE appel du hook mocke. useAuth() est une dependance de
// ListingsManagementSection::load() (useCallback([user, selectedAccountId])) --
// une reference `user` qui change a chaque rendu recree `load` a chaque
// rendu, ce qui redeclenche le useEffect(load) qui l'appelle, qui fait
// setLoading()/setItems(), qui re-render, qui recree `user`... boucle
// infinie. Bug de mock de test, jamais reproductible en production (le
// vrai AuthContext ne recree son `user` que lorsque les donnees changent
// reellement) -- mais un piege classique de mock naif a eviter ici.
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
    selectedAccountId: mockSelectedAccount ? 'acc-1' : 'all',
    selectedAccount: mockSelectedAccount,
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
    from: () => makeChainable({ data: [TEST_LISTING], error: null }),
  },
}));

async function selectTheOnlyListing(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByText('Polo Ralph Lauren')).toBeInTheDocument());
  // Nom exact (pas une regex substring) : "Tout selectionner" (bouton de
  // la barre) contient aussi "selectionner" et serait ambigu avec un
  // match partiel.
  await user.click(screen.getByRole('button', { name: 'Sélectionner' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Republier' })).toBeEnabled());
}

describe('ListingsManagementSection -- bouton Republier', () => {
  // Timeout explicite par test (2026-08-11) : ce composant rend le
  // tableau de bord complet (stats stock/ventes, filtres, chargement
  // Supabase mocke) -- plus lourd qu'un test unitaire typique. En
  // isolation il resout en quelques secondes, mais peut depasser le
  // timeout PAR DEFAUT de vitest (5000ms) quand la suite complete tourne
  // en parallele avec les 48 autres fichiers de test (contention
  // CPU/memoire reelle, pas un defaut de logique -- confirme en execution
  // isolee : 2/2 verts en ~23s total).
  const TEST_TIMEOUT_MS = 20000;

  it(
    'avec un compte Vinted selectionne : clic sur Republier ouvre PublishConfirmationModal',
    async () => {
      mockSelectedAccount = TEST_ACCOUNT;
      const user = userEvent.setup();
      render(<ListingsManagementSection />);

      await selectTheOnlyListing(user);
      await user.click(screen.getByRole('button', { name: 'Republier' }));

      expect(await screen.findByText('Republier sur Vinted')).toBeInTheDocument();
    },
    TEST_TIMEOUT_MS
  );

  it(
    'sans compte Vinted selectionne (filtre "Tous les comptes") : clic sur Republier n\'ouvre JAMAIS la modale silencieusement -- affiche une erreur explicite',
    async () => {
      mockSelectedAccount = null;
      const user = userEvent.setup();
      render(<ListingsManagementSection />);

      await selectTheOnlyListing(user);
      await user.click(screen.getByRole('button', { name: 'Republier' }));

      expect(screen.queryByText('Republier sur Vinted')).not.toBeInTheDocument();
      expect(
        await screen.findByText(/aucun compte vinted sélectionné dans le filtre en haut de page/i)
      ).toBeInTheDocument();
    },
    TEST_TIMEOUT_MS
  );
});
