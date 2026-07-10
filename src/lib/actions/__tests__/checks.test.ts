import { describe, expect, it } from 'vitest';
import {
  checkAccountSelected,
  checkAuthenticated,
  checkExtensionConnected,
  checkListingLoaded,
  checkListingOwnership,
} from '../checks';
import { makeActionContext, makeCheckDeps, makeListing } from './fixtures';

describe('checkAuthenticated', () => {
  it('passes when userId is set', () => {
    const result = checkAuthenticated(makeActionContext({ userId: 'user-1' }), makeCheckDeps());
    expect(result.ok).toBe(true);
  });

  it('fails with not_authenticated when userId is empty', () => {
    const result = checkAuthenticated(makeActionContext({ userId: '' }), makeCheckDeps());
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'not_authenticated' }) });
  });
});

describe('checkExtensionConnected', () => {
  it('passes when the extension is connected', () => {
    const result = checkExtensionConnected(makeActionContext(), makeCheckDeps({ extensionConnected: true }));
    expect(result.ok).toBe(true);
  });

  it('fails with extension_not_connected otherwise', () => {
    const result = checkExtensionConnected(makeActionContext(), makeCheckDeps({ extensionConnected: false }));
    expect(result).toEqual({
      ok: false,
      failure: expect.objectContaining({ code: 'extension_not_connected' }),
    });
  });
});

describe('checkAccountSelected', () => {
  it('passes when the selected account matches ctx.vintedAccountId', () => {
    const result = checkAccountSelected(
      makeActionContext({ vintedAccountId: 'account-1' }),
      makeCheckDeps({ selectedAccount: { id: 'account-1' } as never })
    );
    expect(result.ok).toBe(true);
  });

  it('fails with account_mismatch when no account is selected', () => {
    const result = checkAccountSelected(
      makeActionContext({ vintedAccountId: null }),
      makeCheckDeps({ selectedAccount: null })
    );
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'account_mismatch' }) });
  });

  it('fails with account_mismatch when the selected account id differs', () => {
    const result = checkAccountSelected(
      makeActionContext({ vintedAccountId: 'account-1' }),
      makeCheckDeps({ selectedAccount: { id: 'account-2' } as never })
    );
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'account_mismatch' }) });
  });
});

describe('checkListingLoaded', () => {
  it('passes when a target listing is provided', () => {
    const result = checkListingLoaded(makeActionContext(), makeCheckDeps({ targetListing: makeListing() }));
    expect(result.ok).toBe(true);
  });

  it('fails with listing_not_found otherwise', () => {
    const result = checkListingLoaded(makeActionContext(), makeCheckDeps({ targetListing: null }));
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'listing_not_found' }) });
  });
});

describe('checkListingOwnership', () => {
  it('passes when the listing belongs to the selected account', () => {
    const result = checkListingOwnership(
      makeActionContext({ vintedAccountId: 'account-1' }),
      makeCheckDeps({ targetListing: makeListing({ vinted_account_id: 'account-1' }) })
    );
    expect(result.ok).toBe(true);
  });

  it('fails with listing_account_mismatch when the listing belongs to another account', () => {
    const result = checkListingOwnership(
      makeActionContext({ vintedAccountId: 'account-1' }),
      makeCheckDeps({ targetListing: makeListing({ vinted_account_id: 'account-2' }) })
    );
    expect(result).toEqual({
      ok: false,
      failure: expect.objectContaining({ code: 'listing_account_mismatch' }),
    });
  });

  it('fails with listing_account_mismatch when no listing is loaded', () => {
    const result = checkListingOwnership(
      makeActionContext({ vintedAccountId: 'account-1' }),
      makeCheckDeps({ targetListing: null })
    );
    expect(result).toEqual({
      ok: false,
      failure: expect.objectContaining({ code: 'listing_account_mismatch' }),
    });
  });
});
