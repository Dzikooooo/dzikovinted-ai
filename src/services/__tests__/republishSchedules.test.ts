import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mission "ROUND 2 -- PERSISTANCE APP" (2026-08-20) : verifie la FORME exacte
// des requetes Supabase emises par ce service (table/colonnes/filtres), et
// la traduction des erreurs (23505 -> conflit clair, jamais le code Postgres
// brut). Chaine mockee generique (Proxy) -- meme discipline que
// ListingsManagementSection.test.tsx::makeChainable, adaptee pour tracer
// chaque appel de methode plutot que de les ignorer.

interface ChainResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

function makeChain(result: ChainResult) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_target, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: ChainResult) => void) => resolve(result);
      }
      if (prop === 'single') {
        return () => Promise.resolve(result);
      }
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return self;
      };
    },
  });
  return { chain: self, calls };
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: fromMock } }));

import {
  cancelRepublishSchedule,
  createRepublishSchedule,
  listActiveRepublishSchedules,
  listRecentRepublishOutcomes,
  updateRepublishSchedule,
} from '../republishSchedules';

beforeEach(() => {
  fromMock.mockReset();
});

describe('listActiveRepublishSchedules', () => {
  it('interroge republish_schedules, filtre sur status in (scheduled, running)', async () => {
    const { chain, calls } = makeChain({ data: [{ id: 's1', listing_id: 'l1' }], error: null });
    fromMock.mockReturnValue(chain);

    const result = await listActiveRepublishSchedules();

    expect(fromMock).toHaveBeenCalledWith('republish_schedules');
    const inCall = calls.find((c) => c.method === 'in');
    expect(inCall?.args).toEqual(['status', ['scheduled', 'running']]);
    expect(result).toEqual({ ok: true, data: [{ id: 's1', listing_id: 'l1' }] });
  });

  it('erreur Supabase -> resultat {ok:false}, jamais une exception non geree', async () => {
    const { chain } = makeChain({ data: null, error: { message: 'network down' } });
    fromMock.mockReturnValue(chain);

    const result = await listActiveRepublishSchedules();

    expect(result).toEqual({ ok: false, code: 'error', message: 'network down' });
  });
});

// Mission "ROUND 5 -- RESULTAT D'UNE REPUBLICATION PROGRAMMEE" (2026-08-23).
describe('listRecentRepublishOutcomes', () => {
  it('filtre sur les statuts TERMINAUX uniquement -- jamais scheduled/running, jamais cancelled', async () => {
    const { chain, calls } = makeChain({ data: [], error: null });
    fromMock.mockReturnValue(chain);

    await listRecentRepublishOutcomes();

    expect(fromMock).toHaveBeenCalledWith('republish_schedules');
    const inCall = calls.find((c) => c.method === 'in');
    expect(inCall?.args).toEqual(['status', ['succeeded', 'failed']]);
  });

  it('selectionne les colonnes de resultat necessaires a l\'explication', async () => {
    const { chain, calls } = makeChain({ data: [], error: null });
    fromMock.mockReturnValue(chain);

    await listRecentRepublishOutcomes();

    const selectCall = calls.find((c) => c.method === 'select');
    const columns = String(selectCall?.args[0]);
    expect(columns).toContain('result_vinted_url');
    expect(columns).toContain('error_message');
    expect(columns).toContain('completed_at');
    // Jamais select('*') -- meme discipline que le reste du service.
    expect(columns).not.toBe('*');
  });

  it('borne la recherche a 7 jours et trie du plus recent au plus ancien', async () => {
    const { chain, calls } = makeChain({ data: [], error: null });
    fromMock.mockReturnValue(chain);

    await listRecentRepublishOutcomes(new Date('2026-08-23T12:00:00.000Z'));

    const gteCall = calls.find((c) => c.method === 'gte');
    expect(gteCall?.args).toEqual(['completed_at', '2026-08-16T12:00:00.000Z']);

    const orderCall = calls.find((c) => c.method === 'order');
    expect(orderCall?.args).toEqual(['completed_at', { ascending: false }]);
  });

  it('erreur Supabase -> {ok:false}, jamais une exception (chargement non bloquant)', async () => {
    const { chain } = makeChain({ data: null, error: { message: 'network down' } });
    fromMock.mockReturnValue(chain);

    const result = await listRecentRepublishOutcomes();

    expect(result).toEqual({ ok: false, code: 'error', message: 'network down' });
  });
});

describe('createRepublishSchedule', () => {
  it('insert correct : convertit date+time locale en scheduled_for ISO, status="scheduled"', async () => {
    const { chain, calls } = makeChain({
      data: { id: 's1', listing_id: 'l1', vinted_account_id: 'a1', scheduled_for: '2026-08-25T17:30:00.000Z', package_size: 'medium', status: 'scheduled' },
      error: null,
    });
    fromMock.mockReturnValue(chain);

    const result = await createRepublishSchedule({
      userId: 'u1',
      listingId: 'l1',
      vintedAccountId: 'a1',
      date: '2026-08-25',
      time: '19:30',
      packageSize: 'medium',
    });

    expect(fromMock).toHaveBeenCalledWith('republish_schedules');
    const insertCall = calls.find((c) => c.method === 'insert');
    expect(insertCall).toBeDefined();
    const payload = insertCall!.args[0] as Record<string, unknown>;
    expect(payload.listing_id).toBe('l1');
    expect(payload.vinted_account_id).toBe('a1');
    expect(payload.package_size).toBe('medium');
    expect(payload.status).toBe('scheduled');
    // scheduled_for est une vraie conversion (voir localDateTimeToISO,
    // teste independamment dans lib/__tests__/republishSchedule.test.ts) --
    // ici on verifie seulement qu'une chaine ISO parsable a ete envoyee,
    // jamais une concatenation naive avec "Z".
    expect(typeof payload.scheduled_for).toBe('string');
    expect(new Date(payload.scheduled_for as string).toISOString()).toBe(payload.scheduled_for);

    expect(result.ok).toBe(true);
  });

  // Mission "ROUND 2 -- BUG RLS user_id manquant" (2026-08-20) : REGRESSION
  // du bug live reel -- "new row violates row-level security policy for
  // table \"republish_schedules\"" au clic sur "Programmer la republication".
  // CAUSE CONFIRMEE et reproduite sur la base reelle (npx supabase db query
  // --linked, session simulee role authenticated + auth.uid() reel) :
  // createRepublishSchedule() n'envoyait jamais `user_id` dans l'INSERT --
  // la colonne (NOT NULL, aucun `default auth.uid()`) restait donc NULL, et
  // `auth.uid() = NULL` n'est jamais vrai dans le with_check de
  // insert_own_republish_schedules -- alors meme que listing_id et
  // vinted_account_id appartenaient reellement au bon utilisateur (verifie
  // separement, hors de ce fichier, directement contre la table listings/
  // vinted_accounts en prod). Ce test echoue si `user_id` disparait a
  // nouveau du payload -- garde-fou direct contre la regression exacte.
  it('REGRESSION : le payload d\'insert contient bien user_id (root cause du bug RLS live "new row violates row-level security policy")', async () => {
    const { chain, calls } = makeChain({
      data: { id: 's1', listing_id: 'l1', vinted_account_id: 'a1', scheduled_for: '2026-08-20T19:00:00.000Z', package_size: 'medium', status: 'scheduled' },
      error: null,
    });
    fromMock.mockReturnValue(chain);

    await createRepublishSchedule({
      userId: 'u-real-authenticated-user',
      listingId: 'l1',
      vintedAccountId: 'a1',
      date: '2026-08-20',
      time: '21:00',
      packageSize: 'medium',
    });

    const insertCall = calls.find((c) => c.method === 'insert');
    const payload = insertCall!.args[0] as Record<string, unknown>;
    expect(payload.user_id).toBe('u-real-authenticated-user');
  });

  it('conflit 23505 -> {ok:false, code:"conflict"} avec un message clair, jamais le SQL brut', async () => {
    const { chain } = makeChain({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "republish_schedules_one_active_per_listing"' },
    });
    fromMock.mockReturnValue(chain);

    const result = await createRepublishSchedule({
      userId: 'u1',
      listingId: 'l1',
      vintedAccountId: 'a1',
      date: '2026-08-25',
      time: '19:30',
      packageSize: 'medium',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('conflict');
      expect(result.message).not.toContain('23505');
      expect(result.message).not.toContain('duplicate key');
      expect(result.message.toLowerCase()).toContain('programmation active');
    }
  });

  it('autre erreur Supabase -> {ok:false, code:"error"}, message Supabase transmis tel quel', async () => {
    const { chain } = makeChain({ data: null, error: { code: '23503', message: 'foreign key violation' } });
    fromMock.mockReturnValue(chain);

    const result = await createRepublishSchedule({
      userId: 'u1',
      listingId: 'l1',
      vintedAccountId: 'a1',
      date: '2026-08-25',
      time: '19:30',
      packageSize: 'medium',
    });

    expect(result).toEqual({ ok: false, code: 'error', message: 'foreign key violation' });
  });
});

describe('updateRepublishSchedule', () => {
  it('update la ligne par id (jamais un insert), envoie scheduled_for + package_size', async () => {
    const { chain, calls } = makeChain({
      data: { id: 's1', listing_id: 'l1', vinted_account_id: 'a1', scheduled_for: '2026-08-26T10:00:00.000Z', package_size: 'small', status: 'scheduled' },
      error: null,
    });
    fromMock.mockReturnValue(chain);

    const result = await updateRepublishSchedule('s1', { date: '2026-08-26', time: '12:00', packageSize: 'small' });

    expect(fromMock).toHaveBeenCalledWith('republish_schedules');
    expect(calls.find((c) => c.method === 'insert')).toBeUndefined();
    const updateCall = calls.find((c) => c.method === 'update');
    expect((updateCall!.args[0] as Record<string, unknown>).package_size).toBe('small');
    const eqCall = calls.find((c) => c.method === 'eq');
    expect(eqCall?.args).toEqual(['id', 's1']);
    expect(result.ok).toBe(true);
  });
});

describe('cancelRepublishSchedule', () => {
  it('update status="cancelled" par id, jamais un delete', async () => {
    const { chain, calls } = makeChain({ data: null, error: null });
    fromMock.mockReturnValue(chain);

    const result = await cancelRepublishSchedule('s1');

    expect(calls.find((c) => c.method === 'delete')).toBeUndefined();
    const updateCall = calls.find((c) => c.method === 'update');
    expect(updateCall?.args[0]).toEqual({ status: 'cancelled' });
    const eqCall = calls.find((c) => c.method === 'eq');
    expect(eqCall?.args).toEqual(['id', 's1']);
    expect(result).toEqual({ ok: true, data: undefined });
  });
});
