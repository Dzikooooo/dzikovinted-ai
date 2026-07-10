import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActionEngine } from '../engine';
import { ACTION_DEFINITIONS } from '../handlers';
import { checkAuthenticated, checkExtensionConnected } from '../checks';
import { makeActionContext, makeCheckDeps, makeFakeDeps } from './fixtures';
import type { ActionDefinition, ActionRequest } from '../types';

// engine.ts consulte le registre via findActionDefinition(), qui lit
// ACTION_DEFINITIONS (tableau exporté par handlers/index.ts). On y pousse
// temporairement des définitions de test, puis on restaure un tableau vide
// après chaque test pour ne jamais faire fuiter d'état entre les tests
// (et ne jamais casser registry.test.ts, qui vérifie que le registre réel
// est vide en Phase 3).
function registerTestDefinition(definition: ActionDefinition): void {
  ACTION_DEFINITIONS.push(definition);
}

afterEach(() => {
  ACTION_DEFINITIONS.length = 0;
});

const request: ActionRequest = {
  kind: 'republish_listing',
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
      kind: 'republish_listing',
      label: 'Republier une annonce',
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

  it('on success, builds the preview, inserts a pending_confirmation history row and returns a token', async () => {
    registerTestDefinition({
      kind: 'republish_listing',
      label: 'Republier une annonce',
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
      kind: 'republish_listing',
      label: 'Republier une annonce',
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
      kind: 'republish_listing',
      label: 'Republier une annonce',
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
    expect(resyncAffectedData).toHaveBeenCalledWith(request);
  });

  it('does not call resyncAffectedData on an error outcome', async () => {
    registerTestDefinition({
      kind: 'republish_listing',
      label: 'Republier une annonce',
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
      kind: 'republish_listing',
      label: 'Republier une annonce',
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
});

describe('createActionEngine().cancel', () => {
  it('writes a cancelled history entry without calling runViaExtension or resyncAffectedData', async () => {
    registerTestDefinition({
      kind: 'republish_listing',
      label: 'Republier une annonce',
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
});
