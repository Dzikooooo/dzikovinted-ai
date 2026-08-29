import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActionEngine } from '../engine';
import { ACTION_DEFINITIONS } from '../handlers';
import { checkAuthenticated, checkExtensionConnected } from '../checks';
import { makeActionContext, makeCheckDeps, makeFakeDeps } from './fixtures';
import type { ActionDefinition, ActionRequest } from '../types';

// engine.ts consulte le registre via findActionDefinition(), qui lit
// ACTION_DEFINITIONS (tableau exporté par handlers/index.ts, qui contient
// déjà les vraies actions enregistrées, ex. publish_listing). On y pousse
// temporairement des définitions de test (kind 'pause_listing', toujours
// pas réel après l'ajout de republish_listing le 2026-08-01) puis on
// restaure exactement le contenu d'origine après chaque test - jamais un
// tableau vide, pour ne pas faire disparaître les vraies actions pour le
// reste de la suite (voir registry.test.ts).
let originalDefinitions: ActionDefinition[];

beforeEach(() => {
  originalDefinitions = [...ACTION_DEFINITIONS];
});

afterEach(() => {
  ACTION_DEFINITIONS.length = 0;
  ACTION_DEFINITIONS.push(...originalDefinitions);
});

function registerTestDefinition(definition: ActionDefinition): void {
  ACTION_DEFINITIONS.push(definition);
}

const request: ActionRequest = {
  kind: 'pause_listing',
  vintedAccountId: 'account-1',
  listingId: 'listing-1',
  payload: {},
};

describe('createActionEngine().prepare', () => {
  it('returns unknown_action when no definition is registered for the kind', async () => {
    const { deps, insertHistoryRow } = makeFakeDeps();
    const engine = createActionEngine(deps);

    const result = await engine.prepare(request, makeActionContext(), makeCheckDeps());

    expect(result).toEqual({ ok: false, failure: { code: 'unknown_action', message: expect.any(String) } });
    expect(insertHistoryRow).not.toHaveBeenCalled();
  });

  it('stops at the first failing check and never produces a token', async () => {
    registerTestDefinition({
      kind: 'pause_listing',
      label: 'Mettre en pause',
      checks: [checkAuthenticated, checkExtensionConnected],
      buildPreview: () => ({ summary: 'preview', details: {} }),
    });
    const { deps, insertHistoryRow } = makeFakeDeps();
    const engine = createActionEngine(deps);

    const result = await engine.prepare(
      request,
      makeActionContext({ userId: '' }),
      makeCheckDeps({ extensionConnected: true })
    );

    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'not_authenticated' }) });
    expect(insertHistoryRow).not.toHaveBeenCalled();
  });

  it('Phase 2 (2026-08-28) : insertHistoryRow qui rejette ne fait jamais rejeter prepare() -- retourne ok:false, jamais de token produit', async () => {
    registerTestDefinition({
      kind: 'pause_listing',
      label: 'Mettre en pause',
      checks: [],
      buildPreview: () => ({ summary: 'preview', details: {} }),
    });
    const { deps, insertHistoryRow } = makeFakeDeps();
    insertHistoryRow.mockRejectedValueOnce(new Error('réseau indisponible'));
    const engine = createActionEngine(deps);

    const result = await engine.prepare(request, makeActionContext(), makeCheckDeps());

    expect(result).toEqual({ ok: false, failure: { code: 'prepare_failed', message: 'réseau indisponible' } });
  });

  it('on success, builds the preview, inserts a pending_confirmation history row and returns a token', async () => {
    registerTestDefinition({
      kind: 'pause_listing',
      label: 'Mettre en pause',
      checks: [checkAuthenticated],
      buildPreview: () => ({ summary: 'Republier « Pull Zara »', details: { foo: 'bar' } }),
    });
    const { deps, insertHistoryRow } = makeFakeDeps();
    const engine = createActionEngine(deps);

    const result = await engine.prepare(request, makeActionContext(), makeCheckDeps());

    expect(result.ok).toBe(true);
    expect(insertHistoryRow).toHaveBeenCalledTimes(1);
    if (result.ok) {
      expect(result.prepared.preview).toEqual({ summary: 'Republier « Pull Zara »', details: { foo: 'bar' } });
      expect(result.prepared.id).toBe('history-1');
      expect(result.prepared.__brand).toBe('PreparedAction');
    }
  });
});

describe('createActionEngine().confirm', () => {
  it('falls back to runViaExtension when the definition has no execute(), resolving not_implemented', async () => {
    registerTestDefinition({
      kind: 'pause_listing',
      label: 'Mettre en pause',
      checks: [],
      buildPreview: () => ({ summary: 'preview', details: {} }),
    });
    const { deps, runViaExtension, updateHistoryRow, resyncAffectedData } = makeFakeDeps();
    const engine = createActionEngine(deps);

    const prepared = await engine.prepare(request, makeActionContext(), makeCheckDeps());
    if (!prepared.ok) throw new Error('expected prepare to succeed');

    const result = await engine.confirm(prepared.prepared);

    expect(runViaExtension).toHaveBeenCalledTimes(1);
    expect(runViaExtension).toHaveBeenCalledWith(prepared.prepared.id, request);
    expect(result.outcome).toEqual({ status: 'not_implemented' });
    expect(updateHistoryRow).toHaveBeenCalledWith(
      prepared.prepared.id,
      expect.objectContaining({ status: 'not_implemented' })
    );
    expect(resyncAffectedData).not.toHaveBeenCalled();
  });

  it('calls a definition-provided execute() instead of runViaExtension when present', async () => {
    const execute = vi.fn().mockResolvedValue({ status: 'success', resultPayload: { ok: true } });
    registerTestDefinition({
      kind: 'pause_listing',
      label: 'Mettre en pause',
      checks: [],
      buildPreview: () => ({ summary: 'preview', details: {} }),
      execute,
    });
    const { deps, runViaExtension, resyncAffectedData } = makeFakeDeps();
    const engine = createActionEngine(deps);

    const prepared = await engine.prepare(request, makeActionContext(), makeCheckDeps());
    if (!prepared.ok) throw new Error('expected prepare to succeed');

    const result = await engine.confirm(prepared.prepared);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(runViaExtension).not.toHaveBeenCalled();
    expect(result.outcome).toEqual({ status: 'success', resultPayload: { ok: true } });
    expect(resyncAffectedData).toHaveBeenCalledTimes(1);
    expect(resyncAffectedData).toHaveBeenCalledWith(request, { status: 'success', resultPayload: { ok: true } });
  });

  it('does not call resyncAffectedData on an error outcome', async () => {
    registerTestDefinition({
      kind: 'pause_listing',
      label: 'Mettre en pause',
      checks: [],
      buildPreview: () => ({ summary: 'preview', details: {} }),
    });
    const { deps, resyncAffectedData } = makeFakeDeps({
      runViaExtensionResult: { status: 'error', errorMessage: 'Échec extension' },
    });
    const engine = createActionEngine(deps);

    const prepared = await engine.prepare(request, makeActionContext(), makeCheckDeps());
    if (!prepared.ok) throw new Error('expected prepare to succeed');

    const result = await engine.confirm(prepared.prepared);

    expect(result.outcome).toEqual({ status: 'error', errorMessage: 'Échec extension' });
    expect(resyncAffectedData).not.toHaveBeenCalled();
  });

  it('computes durationMs from the injected now() between prepare() and confirm()', async () => {
    registerTestDefinition({
      kind: 'pause_listing',
      label: 'Mettre en pause',
      checks: [],
      buildPreview: () => ({ summary: 'preview', details: {} }),
    });
    const { deps } = makeFakeDeps({
      nowValues: [new Date('2026-07-10T10:00:00.000Z'), new Date('2026-07-10T10:00:02.500Z')],
    });
    const engine = createActionEngine(deps);

    const prepared = await engine.prepare(request, makeActionContext(), makeCheckDeps());
    if (!prepared.ok) throw new Error('expected prepare to succeed');

    const result = await engine.confirm(prepared.prepared);

    expect(result.durationMs).toBe(2500);
  });

  it('Phase 2 (2026-08-28) : execute() qui rejette ne fait jamais rejeter confirm() -- outcome error, ET la ligne history recoit quand meme son statut terminal (jamais bloquee en pending_confirmation)', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('extension deconnectee en cours de route'));
    registerTestDefinition({
      kind: 'pause_listing',
      label: 'Mettre en pause',
      checks: [],
      buildPreview: () => ({ summary: 'preview', details: {} }),
      execute,
    });
    const { deps, updateHistoryRow } = makeFakeDeps();
    const engine = createActionEngine(deps);

    const prepared = await engine.prepare(request, makeActionContext(), makeCheckDeps());
    if (!prepared.ok) throw new Error('expected prepare to succeed');

    const result = await engine.confirm(prepared.prepared);

    expect(result.outcome).toEqual({ status: 'error', errorMessage: 'extension deconnectee en cours de route' });
    expect(updateHistoryRow).toHaveBeenCalledWith(
      prepared.prepared.id,
      expect.objectContaining({ status: 'error', errorMessage: 'extension deconnectee en cours de route' })
    );
  });

  it('Phase 2 (2026-08-28) : runViaExtension() qui rejette (pas de execute() defini) -- meme garantie', async () => {
    registerTestDefinition({
      kind: 'pause_listing',
      label: 'Mettre en pause',
      checks: [],
      buildPreview: () => ({ summary: 'preview', details: {} }),
    });
    const { deps, runViaExtension } = makeFakeDeps();
    runViaExtension.mockRejectedValueOnce(new Error('Could not establish connection'));
    const engine = createActionEngine(deps);

    const prepared = await engine.prepare(request, makeActionContext(), makeCheckDeps());
    if (!prepared.ok) throw new Error('expected prepare to succeed');

    const result = await engine.confirm(prepared.prepared);

    expect(result.outcome).toEqual({ status: 'error', errorMessage: 'Could not establish connection' });
  });

  it('Phase 2 (2026-08-28) : updateHistoryRow qui rejette reste non-bloquant -- confirm() renvoie quand meme le vrai outcome a l’UI', async () => {
    const execute = vi.fn().mockResolvedValue({ status: 'success', resultPayload: { ok: true } });
    registerTestDefinition({
      kind: 'pause_listing',
      label: 'Mettre en pause',
      checks: [],
      buildPreview: () => ({ summary: 'preview', details: {} }),
      execute,
    });
    const { deps, updateHistoryRow, resyncAffectedData } = makeFakeDeps();
    updateHistoryRow.mockRejectedValueOnce(new Error('journal indisponible'));
    const engine = createActionEngine(deps);

    const prepared = await engine.prepare(request, makeActionContext(), makeCheckDeps());
    if (!prepared.ok) throw new Error('expected prepare to succeed');

    const result = await engine.confirm(prepared.prepared);

    expect(result.outcome).toEqual({ status: 'success', resultPayload: { ok: true } });
    // La resynchronisation doit quand meme avoir lieu -- un journal en panne
    // ne doit pas non plus bloquer la resynchronisation des vraies donnees.
    expect(resyncAffectedData).toHaveBeenCalledTimes(1);
  });

  it('Phase 2 (2026-08-28) : resyncAffectedData qui rejette reste non-bloquant -- le succes reste rapporte a l’UI', async () => {
    const execute = vi.fn().mockResolvedValue({ status: 'success', resultPayload: { ok: true } });
    registerTestDefinition({
      kind: 'pause_listing',
      label: 'Mettre en pause',
      checks: [],
      buildPreview: () => ({ summary: 'preview', details: {} }),
      execute,
    });
    const { deps, resyncAffectedData } = makeFakeDeps();
    resyncAffectedData.mockRejectedValueOnce(new Error('resync indisponible'));
    const engine = createActionEngine(deps);

    const prepared = await engine.prepare(request, makeActionContext(), makeCheckDeps());
    if (!prepared.ok) throw new Error('expected prepare to succeed');

    const result = await engine.confirm(prepared.prepared);

    expect(result.outcome).toEqual({ status: 'success', resultPayload: { ok: true } });
  });
});

describe('createActionEngine().cancel', () => {
  it('writes a cancelled history entry without calling runViaExtension or resyncAffectedData', async () => {
    registerTestDefinition({
      kind: 'pause_listing',
      label: 'Mettre en pause',
      checks: [],
      buildPreview: () => ({ summary: 'preview', details: {} }),
    });
    const { deps, runViaExtension, resyncAffectedData, updateHistoryRow } = makeFakeDeps();
    const engine = createActionEngine(deps);

    const prepared = await engine.prepare(request, makeActionContext(), makeCheckDeps());
    if (!prepared.ok) throw new Error('expected prepare to succeed');

    const result = await engine.cancel(prepared.prepared);

    expect(result.outcome).toEqual({ status: 'cancelled' });
    expect(runViaExtension).not.toHaveBeenCalled();
    expect(resyncAffectedData).not.toHaveBeenCalled();
    expect(updateHistoryRow).toHaveBeenCalledWith(
      prepared.prepared.id,
      expect.objectContaining({ status: 'cancelled' })
    );
  });

  it('Phase 2 (2026-08-28) : updateHistoryRow qui rejette ne fait jamais rejeter cancel() -- l’UI recoit quand meme cancelled', async () => {
    registerTestDefinition({
      kind: 'pause_listing',
      label: 'Mettre en pause',
      checks: [],
      buildPreview: () => ({ summary: 'preview', details: {} }),
    });
    const { deps, updateHistoryRow } = makeFakeDeps();
    updateHistoryRow.mockRejectedValueOnce(new Error('journal indisponible'));
    const engine = createActionEngine(deps);

    const prepared = await engine.prepare(request, makeActionContext(), makeCheckDeps());
    if (!prepared.ok) throw new Error('expected prepare to succeed');

    const result = await engine.cancel(prepared.prepared);

    expect(result.outcome).toEqual({ status: 'cancelled' });
  });
});
