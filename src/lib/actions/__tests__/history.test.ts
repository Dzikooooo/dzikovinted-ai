import { describe, expect, it } from 'vitest';
import { buildHistoryInsertRow, buildHistoryTerminalPatch } from '../history';
import { makeActionContext } from './fixtures';
import type { ActionRequest } from '../types';

const request: ActionRequest = {
  kind: 'republish_listing',
  vintedAccountId: 'account-1',
  listingId: 'listing-1',
  payload: { foo: 'bar' },
};

describe('buildHistoryInsertRow', () => {
  it('maps context, request and preview into the insert row shape', () => {
    const ctx = makeActionContext({ vintedAccountId: 'account-1', listingId: 'listing-1' });
    const preview = { summary: 'Republier « Pull Zara »', details: {} };
    const row = buildHistoryInsertRow(ctx, request, preview, '2026-07-10T10:00:00.000Z');

    expect(row).toEqual({
      userId: ctx.userId,
      vintedAccountId: 'account-1',
      listingId: 'listing-1',
      kind: 'republish_listing',
      payload: { foo: 'bar' },
      preview,
      startedAt: '2026-07-10T10:00:00.000Z',
    });
  });

  it('defaults listingId to null when the context has none', () => {
    const ctx = makeActionContext({ listingId: undefined });
    const row = buildHistoryInsertRow(ctx, request, { summary: '', details: {} }, '2026-07-10T10:00:00.000Z');
    expect(row.listingId).toBeNull();
  });
});

describe('buildHistoryTerminalPatch', () => {
  it('maps a success outcome, keeping resultPayload and clearing errorMessage', () => {
    const patch = buildHistoryTerminalPatch(
      { status: 'success', resultPayload: { newPrice: 10 } },
      '2026-07-10T10:00:01.000Z',
      1000
    );
    expect(patch).toEqual({
      status: 'success',
      resultPayload: { newPrice: 10 },
      errorMessage: null,
      completedAt: '2026-07-10T10:00:01.000Z',
      durationMs: 1000,
    });
  });

  it('maps an error outcome, keeping errorMessage and clearing resultPayload', () => {
    const patch = buildHistoryTerminalPatch(
      { status: 'error', errorMessage: 'Échec extension' },
      '2026-07-10T10:00:01.000Z',
      500
    );
    expect(patch).toEqual({
      status: 'error',
      resultPayload: null,
      errorMessage: 'Échec extension',
      completedAt: '2026-07-10T10:00:01.000Z',
      durationMs: 500,
    });
  });

  it('maps a cancelled outcome with no payload/error', () => {
    const patch = buildHistoryTerminalPatch({ status: 'cancelled' }, '2026-07-10T10:00:01.000Z', 200);
    expect(patch).toEqual({
      status: 'cancelled',
      resultPayload: null,
      errorMessage: null,
      completedAt: '2026-07-10T10:00:01.000Z',
      durationMs: 200,
    });
  });

  it('maps a not_implemented outcome with no payload/error', () => {
    const patch = buildHistoryTerminalPatch({ status: 'not_implemented' }, '2026-07-10T10:00:01.000Z', 50);
    expect(patch).toEqual({
      status: 'not_implemented',
      resultPayload: null,
      errorMessage: null,
      completedAt: '2026-07-10T10:00:01.000Z',
      durationMs: 50,
    });
  });
});
