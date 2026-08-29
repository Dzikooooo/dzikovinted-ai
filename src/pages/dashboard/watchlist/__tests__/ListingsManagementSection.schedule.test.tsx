// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListingsManagementSection } from '../ListingsManagementSection';
import type { Listing, VintedAccount } from '../../../../lib/types';

// Le selecteur d'heure n'est plus un <select> natif (2026-08-26) : son menu
// natif debordait sur les photos de la modale et n'etait pas rognable en CSS.
// C'est desormais un listbox construit dans le document -- donc ouvrir puis
// cliquer, au lieu de selectOptions().
async function pickTimeUnit(
  user: ReturnType<typeof userEvent.setup>,
  label: 'Heure' | 'Minutes',
  value: string
): Promise<void> {
  await user.click(screen.getByRole('button', { name: label }));
  await user.click(within(screen.getByRole('listbox', { name: label })).getByRole('option', { name: value }));
}


// Mission "UI DE PROGRAMMATION DES REPUBLICATIONS" (2026-08-20, round 1) puis
// "ROUND 2 -- PERSISTANCE APP" (2026-08-20) : tests d'INTEGRATION (page
// complete, meme harnais que ListingsManagementSection.test.tsx) --
// verifient le cablage reel entre PublishConfirmationModal et Supabase
// (republish_schedules), indexation par listing_id, jamais d'appel a
// runVintedAction pour "Programmer", "Maintenant" continue d'appeler le flow
// existant, et surtout : une programmation survit a un remount complet du
// composant (proxy fidele d'un refresh de page -- tout le state React est
// perdu, seul un vrai refetch Supabase peut restaurer le badge). Le detail
// fin de la validation date/heure est deja couvert en isolation, beaucoup
// plus rapidement, dans PublishConfirmationModal.test.tsx -- pas duplique
// ici. Le detail fin de la FORME des requetes Supabase (colonnes, 23505 ->
// message clair) est deja couvert dans
// src/services/__tests__/republishSchedules.test.ts -- ce fichier-ci
// verifie uniquement le CABLAGE bout en bout.

function buildListing(overrides: Partial<Listing> = {}): Listing {
  return {
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
    ...overrides,
  };
}

const LISTING_A = buildListing({ id: 'l1', title: 'Polo Ralph Lauren' });
const LISTING_B = buildListing({ id: 'l2', title: 'Sneakers Nike', sku: 2 });

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

let mockListings: Listing[] = [LISTING_A];

// Mission "ROUND 2 -- PERSISTANCE APP" (2026-08-20) : "base" en memoire pour
// republish_schedules -- contrairement a `mockListings` (fixe pour toute la
// suite), CET etat doit reellement persister create/update/cancel a travers
// un remount du composant pour prouver "survit a un refresh" -- c'est
// exactement le role d'une vraie base de donnees ici, jamais reinitialise
// entre deux render() du MEME test.
interface MockScheduleRow {
  id: string;
  listing_id: string;
  vinted_account_id: string;
  scheduled_for: string;
  package_size: string;
  status: string;
}
let mockScheduleRows: MockScheduleRow[] = [];
let mockScheduleIdCounter = 0;

// Meme discipline Proxy que makeChainable ci-dessus, mais avec un etat REEL
// (insert/update persistent dans mockScheduleRows) -- necessaire pour tester
// honnetement create -> conflit -> annuler -> reprogrammer -> remount, pas
// seulement la forme des appels (deja couvert au niveau service, voir
// src/services/__tests__/republishSchedules.test.ts).
function makeScheduleTableMock() {
  let op: 'select' | 'insert' | 'update' | null = null;
  let insertValues: Record<string, unknown> | null = null;
  let updateValues: Record<string, unknown> | null = null;
  let matchId: string | null = null;

  function resolveQuery(): { data: unknown; error: unknown } {
    if (op === 'insert' && insertValues) {
      const listingId = insertValues.listing_id as string;
      const conflict = mockScheduleRows.some((r) => r.listing_id === listingId && (r.status === 'scheduled' || r.status === 'running'));
      if (conflict) {
        return {
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint "republish_schedules_one_active_per_listing"' },
        };
      }
      const row: MockScheduleRow = {
        id: `sched-${++mockScheduleIdCounter}`,
        listing_id: listingId,
        vinted_account_id: insertValues.vinted_account_id as string,
        scheduled_for: insertValues.scheduled_for as string,
        package_size: insertValues.package_size as string,
        status: 'scheduled',
      };
      mockScheduleRows.push(row);
      return { data: row, error: null };
    }
    if (op === 'update' && matchId) {
      const idx = mockScheduleRows.findIndex((r) => r.id === matchId);
      if (idx === -1) return { data: null, error: { message: 'ligne introuvable (mock)' } };
      mockScheduleRows[idx] = { ...mockScheduleRows[idx], ...updateValues };
      return { data: mockScheduleRows[idx], error: null };
    }
    return { data: mockScheduleRows.filter((r) => r.status === 'scheduled' || r.status === 'running'), error: null };
  }

  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_target, prop: string) {
      if (prop === 'select') {
        return () => {
          if (!op) op = 'select';
          return self;
        };
      }
      if (prop === 'insert') {
        return (values: Record<string, unknown>) => {
          op = 'insert';
          insertValues = values;
          return self;
        };
      }
      if (prop === 'update') {
        return (values: Record<string, unknown>) => {
          op = 'update';
          updateValues = values;
          return self;
        };
      }
      if (prop === 'eq') {
        return (_col: string, value: string) => {
          matchId = value;
          return self;
        };
      }
      if (prop === 'in') return () => self;
      if (prop === 'single') return () => Promise.resolve(resolveQuery());
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(resolveQuery());
      return () => self;
    },
  });
  return self;
}

const STABLE_USER = { id: 'u1' };
const STABLE_PROFILE = { id: 'u1', plan: 'free' as const, role: 'user' as const };
const STABLE_ACCOUNTS: VintedAccount[] = [];
const stableRefresh = vi.fn();
// resolue en echec explicite (jamais throw) : suffisant pour prouver
// "runVintedAction a bien demarre" (kind + payload transmis) sans avoir a
// simuler tout le reste du cycle prepare/confirm -- meme discipline que le
// reste de la suite (aucune tentative d'atteindre l'extension reelle).
const stablePrepareAction = vi.fn().mockResolvedValue({ ok: false, failure: { message: 'stub-prepare-failure' } });
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
  isExtensionConfigured: () => false,
  pingExtension: async () => false,
  RUN_ACTION_TIMEOUT_ERROR: "Delai depasse (aucune reponse de l'extension)",
}));

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => (table === 'republish_schedules' ? makeScheduleTableMock() : makeChainable({ data: mockListings, error: null })),
  },
}));

// Jeudi 20 aout 2026, 15h00 -- meme reference que PublishConfirmationModal.test.tsx.
const NOW = new Date('2026-08-20T15:00:00');
const TEST_TIMEOUT_MS = 20000;

async function openScheduleModalForFirstListing(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByText(LISTING_A.title)).toBeInTheDocument());
  const selectButtons = screen.getAllByRole('button', { name: 'Sélectionner' });
  await user.click(selectButtons[0]); // ordre = ordre de mockListings, LISTING_A en premier
  await waitFor(() => expect(screen.getByRole('button', { name: 'Republier' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Republier' }));
  await user.click(screen.getByRole('button', { name: 'Programmer' }));
  await user.click(screen.getByRole('button', { name: '2026-08-25' }));
  await pickTimeUnit(user, 'Heure', '19');
  await pickTimeUnit(user, 'Minutes', '30');
}

describe('ListingsManagementSection -- programmation de republication', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mockListings = [LISTING_A];
    mockScheduleRows = [];
    mockScheduleIdCounter = 0;
    stablePrepareAction.mockClear();
    stableConfirmAction.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(
    '"Programmer" ferme la modale, affiche le badge sur la BONNE annonce parmi plusieurs, sans jamais appeler prepareAction/confirmAction',
    async () => {
      mockListings = [LISTING_A, LISTING_B];
      const user = userEvent.setup();
      render(<ListingsManagementSection />);

      await openScheduleModalForFirstListing(user);
      await user.click(screen.getByRole('button', { name: 'Programmer la republication' }));

      expect(screen.queryByText('Republier sur Vinted')).not.toBeInTheDocument();
      const badge = screen.getByText('Programmée le 25 août 2026 à 19:30');
      const card = badge.closest('[role="button"]');
      expect(card).toHaveTextContent(LISTING_A.title);
      expect(card).not.toHaveTextContent(LISTING_B.title);
      expect(stablePrepareAction).not.toHaveBeenCalled();
      expect(stableConfirmAction).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT_MS
  );

  it(
    '"Maintenant" (mode par defaut) continue d\'appeler le flow republish_listing actuel via prepareAction',
    async () => {
      const user = userEvent.setup();
      render(<ListingsManagementSection />);

      await waitFor(() => expect(screen.getByText(LISTING_A.title)).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: 'Sélectionner' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Republier' })).toBeEnabled());
      await user.click(screen.getByRole('button', { name: 'Republier' }));
      // Mode "Maintenant" est le defaut -- pas besoin de toucher au toggle.
      // Le bouton "Republier" de la barre d'action reste dans le DOM
      // pendant que la modale est ouverte (juste recouvert visuellement) --
      // deux boutons portent le meme nom accessible, scope explicitement au
      // dialogue pour cibler celui de la modale sans ambiguite.
      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Republier' }));

      await waitFor(() => expect(stablePrepareAction).toHaveBeenCalledTimes(1));
      expect(stablePrepareAction.mock.calls[0][0]).toBe('republish_listing');
      expect(screen.queryByText(/Programmée le/)).not.toBeInTheDocument();
    },
    TEST_TIMEOUT_MS
  );

  it(
    '"Modifier" rouvre la modale avec la date/heure deja programmees',
    async () => {
      const user = userEvent.setup();
      render(<ListingsManagementSection />);

      await openScheduleModalForFirstListing(user);
      await user.click(screen.getByRole('button', { name: 'Programmer la republication' }));
      // La barre d'action groupee expose aussi un bouton "Modifier" (edition
      // de l'annonce, sans rapport) tant qu'une annonce reste selectionnee --
      // scope explicitement a la carte pour cibler le "Modifier" de la
      // programmation, jamais celui de la barre d'action.
      const card = screen.getByRole('button', { name: /voir le détail de/i });
      await user.click(within(card).getByRole('button', { name: 'Modifier' }));

      expect(await screen.findByRole('button', { name: 'Programmer la republication' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '2026-08-25' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Heure' })).toHaveTextContent('19');
      expect(screen.getByRole('button', { name: 'Minutes' })).toHaveTextContent('30');
    },
    TEST_TIMEOUT_MS
  );

  it(
    '"Annuler" supprime uniquement la programmation locale (status="cancelled" cote Supabase) -- le badge disparait',
    async () => {
      const user = userEvent.setup();
      render(<ListingsManagementSection />);

      await openScheduleModalForFirstListing(user);
      await user.click(screen.getByRole('button', { name: 'Programmer la republication' }));
      expect(screen.getByText(/Programmée le/)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Annuler' }));

      await waitFor(() => expect(screen.queryByText(/Programmée le/)).not.toBeInTheDocument());
      // Verifie que c'est bien un UPDATE de statut, jamais un DELETE -- la
      // ligne existe toujours cote "Supabase" (mock), seulement resolue.
      expect(mockScheduleRows).toHaveLength(1);
      expect(mockScheduleRows[0].status).toBe('cancelled');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'refresh (remount complet du composant) : le badge est restaure depuis Supabase, pas depuis un state React perdu',
    async () => {
      const user = userEvent.setup();
      const { unmount } = render(<ListingsManagementSection />);

      await openScheduleModalForFirstListing(user);
      await user.click(screen.getByRole('button', { name: 'Programmer la republication' }));
      expect(screen.getByText('Programmée le 25 août 2026 à 19:30')).toBeInTheDocument();

      // Simule un vrai refresh de page : tout le state React (y compris
      // activeSchedulesByListingId) est perdu ici -- seul mockScheduleRows
      // (la "base" persistante) survit, exactement comme Supabase survivrait
      // reellement a un F5.
      unmount();
      render(<ListingsManagementSection />);

      expect(await screen.findByText('Programmée le 25 août 2026 à 19:30')).toBeInTheDocument();
    },
    TEST_TIMEOUT_MS
  );
});
