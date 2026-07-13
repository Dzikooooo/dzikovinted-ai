import { vi } from 'vitest';
import type { Listing, VintedAccount } from '../../types';
import type {
  ActionCheckDeps,
  ActionContext,
  ActionEngineDeps,
  ActionOutcome,
} from '../types';

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function makeAccount(overrides: Partial<VintedAccount> = {}): VintedAccount {
  return {
    id: nextId('account'),
    user_id: 'user-1',
    label: 'Compte test',
    vinted_user_id: '1234',
    vinted_username: 'testuser',
    connected: true,
    last_synced_at: new Date().toISOString(),
    last_error: null,
    is_default: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: nextId('listing'),
    user_id: 'user-1',
    title: 'Article de test',
    description: '',
    brand: 'MarqueTest',
    category: 'Vêtements',
    color: '',
    size: 'M',
    material: '',
    condition: '',
    price: 20,
    quick_price: 20,
    premium_price: 25,
    keywords: [],
    vinted_filters: [],
    image_urls: [],
    purchase_price: null,
    purchase_date: null,
    purchase_location: null,
    status: 'en_stock',
    sold_price: null,
    sold_date: null,
    fees: 0,
    is_favorite: false,
    created_at: new Date().toISOString(),
    vinted_account_id: null,
    vinted_item_id: null,
    vinted_url: null,
    vinted_status: null,
    favourites: null,
    views: null,
    synced_at: null,
    last_edited_at: null,
    sku: null,
    ...overrides,
  };
}

export function makeActionContext(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    userId: 'user-1',
    vintedAccountId: 'account-1',
    listingId: undefined,
    now: new Date('2026-07-10T10:00:00.000Z'),
    ...overrides,
  };
}

export function makeCheckDeps(overrides: Partial<ActionCheckDeps> = {}): ActionCheckDeps {
  return {
    extensionConnected: true,
    selectedAccount: makeAccount({ id: 'account-1' }),
    targetListing: null,
    scanInProgress: false,
    ...overrides,
  };
}

interface FakeEngineDepsOptions {
  runViaExtensionResult?: ActionOutcome;
  nowValues?: Date[];
}

// Fabrique un ActionEngineDeps entierement factice, avec des espions vitest,
// pour tester le moteur sans jamais toucher Supabase ni l'extension reelle.
export function makeFakeDeps(options: FakeEngineDepsOptions = {}) {
  const historyRows = new Map<string, Record<string, unknown>>();
  let nextHistoryId = 0;

  const nowValues = options.nowValues ?? [
    new Date('2026-07-10T10:00:00.000Z'),
    new Date('2026-07-10T10:00:00.500Z'),
  ];
  let nowCallIndex = 0;

  const insertHistoryRow = vi.fn(async (row: Record<string, unknown>) => {
    nextHistoryId += 1;
    const id = `history-${nextHistoryId}`;
    historyRows.set(id, { ...row, id });
    return id;
  });

  const updateHistoryRow = vi.fn(async (id: string, patch: Record<string, unknown>) => {
    const existing = historyRows.get(id) ?? {};
    historyRows.set(id, { ...existing, ...patch });
  });

  const runViaExtension = vi.fn(
    async (): Promise<ActionOutcome> => options.runViaExtensionResult ?? { status: 'not_implemented' }
  );

  const resyncAffectedData = vi.fn(async () => {});

  const now = vi.fn(() => {
    const value = nowValues[Math.min(nowCallIndex, nowValues.length - 1)];
    nowCallIndex += 1;
    return value;
  });

  const deps: ActionEngineDeps = {
    insertHistoryRow: insertHistoryRow as ActionEngineDeps['insertHistoryRow'],
    updateHistoryRow,
    runViaExtension,
    resyncAffectedData,
    now,
  };

  return { deps, historyRows, insertHistoryRow, updateHistoryRow, runViaExtension, resyncAffectedData, now };
}
