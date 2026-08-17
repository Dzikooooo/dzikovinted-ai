// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListingsManagementSection } from '../ListingsManagementSection';
import type { Listing, VintedAccount } from '../../../../lib/types';
import type { SyncVintedAccountResult } from '../../../../lib/extensionBridge';

// Mission "SYNC_VINTED_ACCOUNT" (2026-08-16, lot 2 fiabilisation synchro) :
// couvre le comportement du bouton "Synchroniser maintenant" cote UI --
// fichier SEPARE de ListingsManagementSection.test.tsx (qui garde
// STABLE_ACCOUNTS vide, voir son commentaire d'en-tete) pour ne pas
// perturber ses mocks deja valides. Ici accounts.length > 0 est requis pour
// que le bandeau de synchro s'affiche du tout.

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
  last_error: null,
  created_at: new Date().toISOString(),
};

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

const STABLE_USER = { id: 'u1' };
const STABLE_PROFILE = { id: 'u1', plan: 'free' as const, role: 'user' as const };
const STABLE_ACCOUNTS: VintedAccount[] = [TEST_ACCOUNT];
const stableRefresh = vi.fn();
const stablePrepareAction = vi.fn();
const stableConfirmAction = vi.fn();
const stableCancelAction = vi.fn();
const stableInsightsRefetch = vi.fn();

const mockSyncVintedAccount = vi.fn<
  (vintedUserId: string, vintedUsername: string, options?: { onProgress?: (step: string) => void }) => Promise<SyncVintedAccountResult>
>();

vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: STABLE_USER, profile: STABLE_PROFILE }),
}));

vi.mock('../../../../contexts/VintedAccountFilterContext', () => ({
  useVintedAccountFilter: () => ({
    accounts: STABLE_ACCOUNTS,
    selectedAccountId: 'acc-1',
    selectedAccount: TEST_ACCOUNT,
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
  isExtensionConfigured: () => true,
  pingExtension: async () => true,
  RUN_ACTION_TIMEOUT_ERROR: "Delai depasse (aucune reponse de l'extension)",
  syncVintedAccount: (...args: Parameters<typeof mockSyncVintedAccount>) => mockSyncVintedAccount(...args),
}));

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: () => makeChainable({ data: [TEST_LISTING], error: null }),
  },
}));

function okResult(overrides: Partial<SyncVintedAccountResult> = {}): SyncVintedAccountResult {
  return { ok: true, complete: true, created: 2, updated: 1, deletedMarked: 0, pagesRead: 1, pagesExpected: 1, reason: 'success', ...overrides };
}

async function getSyncButton() {
  return waitFor(() => screen.getByRole('button', { name: /synchroniser maintenant/i }));
}

describe('ListingsManagementSection -- bouton Synchroniser maintenant (SYNC_VINTED_ACCOUNT)', () => {
  const TEST_TIMEOUT_MS = 20000;

  afterEach(() => {
    mockSyncVintedAccount.mockReset();
    stableRefresh.mockReset();
  });

  it(
    'un clic lance syncVintedAccount() avec le compte selectionne, desactive le bouton pendant la synchro, puis le reactive avec un message de succes honnete',
    async () => {
      let resolveSync!: (result: SyncVintedAccountResult) => void;
      mockSyncVintedAccount.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSync = resolve;
          })
      );

      const user = userEvent.setup();
      render(<ListingsManagementSection />);

      const button = await getSyncButton();
      await user.click(button);

      expect(mockSyncVintedAccount).toHaveBeenCalledWith('vinted-1', 'testuser', expect.objectContaining({ onProgress: expect.any(Function) }));
      await waitFor(() => expect(button).toBeDisabled());

      resolveSync(okResult({ created: 3, updated: 1, deletedMarked: 0 }));

      await waitFor(() => expect(button).toBeEnabled());
      expect(await screen.findByText(/4 annonce\(s\) synchronisée\(s\)/i)).toBeInTheDocument();
    },
    TEST_TIMEOUT_MS
  );

  it(
    'un second clic pendant qu\'une synchro est deja en cours n\'appelle JAMAIS syncVintedAccount() une deuxieme fois (protection anti double-clic)',
    async () => {
      let resolveSync!: (result: SyncVintedAccountResult) => void;
      mockSyncVintedAccount.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSync = resolve;
          })
      );

      const user = userEvent.setup();
      render(<ListingsManagementSection />);

      const button = await getSyncButton();
      await user.click(button);
      await waitFor(() => expect(button).toBeDisabled());

      // Le bouton est deja disabled (React Testing Library n'envoie pas de
      // clic reel sur un element disabled), mais handleSync() lui-meme a
      // AUSSI son propre garde (if (syncing) return) -- on le prouve en
      // invoquant directement un second clic natif, qui doit rester sans
      // effet quel que soit le mecanisme qui l'empeche.
      button.click();
      button.click();

      expect(mockSyncVintedAccount).toHaveBeenCalledTimes(1);

      resolveSync(okResult());
      await waitFor(() => expect(button).toBeEnabled());
    },
    TEST_TIMEOUT_MS
  );

  it(
    'un scan partiel (complete:false) n\'affiche JAMAIS un message de succes -- reste dans un etat visuellement partiel/warning',
    async () => {
      mockSyncVintedAccount.mockResolvedValue(
        okResult({ complete: false, created: 1, updated: 0, deletedMarked: 0, pagesRead: 1, pagesExpected: 3, reason: 'partial_scan' })
      );

      const user = userEvent.setup();
      render(<ListingsManagementSection />);

      const button = await getSyncButton();
      await user.click(button);

      const hint = await screen.findByText(/synchronisation partielle/i);
      expect(hint).toBeInTheDocument();
      expect(hint.textContent).toMatch(/1\/3 pages lues/i);
      expect(screen.queryByText(/^\d+ annonce\(s\) synchronisée\(s\)$/i)).not.toBeInTheDocument();
      await waitFor(() => expect(button).toBeEnabled());
    },
    TEST_TIMEOUT_MS
  );

  it(
    'un echec (session expiree) affiche un message d\'echec honnete, jamais "synchronisé"',
    async () => {
      mockSyncVintedAccount.mockResolvedValue({
        ok: false,
        complete: false,
        created: 0,
        updated: 0,
        deletedMarked: 0,
        pagesRead: 0,
        pagesExpected: 0,
        reason: 'timeout',
        error: 'Aucune réponse de Vinted dans le délai imparti (session expirée ou profil injoignable)',
      });

      const user = userEvent.setup();
      render(<ListingsManagementSection />);

      const button = await getSyncButton();
      await user.click(button);

      expect(await screen.findByText(/échec/i)).toBeInTheDocument();
      // "Jamais synchronisé" (etat de fraicheur, distinct du hint de resultat)
      // contient legitimement le mot "synchronisé" -- seul le hint de
      // resultat de CETTE synchro ne doit jamais pretendre avoir reussi.
      expect(screen.queryByText(/^\d+ annonce\(s\) synchronisée\(s\)$/i)).not.toBeInTheDocument();
      await waitFor(() => expect(button).toBeEnabled());
      // Un echec pur ne doit jamais declencher de rafraichissement optimiste.
      expect(stableRefresh).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT_MS
  );
});
