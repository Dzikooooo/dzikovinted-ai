import { describe, expect, it } from 'vitest';
import {
  checkAccountSelected,
  checkAuthenticated,
  checkExtensionConnected,
  checkListingAlreadyPublished,
  checkListingHasPhotos,
  checkListingHasRequiredVintedFields,
  checkListingLoaded,
  checkListingNotAlreadyPublished,
  checkListingOwnership,
  checkNoScanInProgress,
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

describe('checkListingHasPhotos', () => {
  it('passes when the listing has at least one photo', () => {
    const result = checkListingHasPhotos(
      makeActionContext(),
      makeCheckDeps({ targetListing: makeListing({ image_urls: ['https://example.com/photo.jpg'] }) })
    );
    expect(result.ok).toBe(true);
  });

  it('fails with no_photos when image_urls is empty', () => {
    const result = checkListingHasPhotos(
      makeActionContext(),
      makeCheckDeps({ targetListing: makeListing({ image_urls: [] }) })
    );
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'no_photos' }) });
  });

  it('fails with no_photos when no listing is loaded', () => {
    const result = checkListingHasPhotos(makeActionContext(), makeCheckDeps({ targetListing: null }));
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'no_photos' }) });
  });
});

describe('checkListingHasRequiredVintedFields', () => {
  it('passes when category and condition are both set', () => {
    const result = checkListingHasRequiredVintedFields(
      makeActionContext(),
      makeCheckDeps({ targetListing: makeListing({ category: 'Sweats', condition: 'Bon etat' }) })
    );
    expect(result.ok).toBe(true);
  });

  it('fails with missing_category when category is null', () => {
    const result = checkListingHasRequiredVintedFields(
      makeActionContext(),
      makeCheckDeps({ targetListing: makeListing({ category: null, condition: 'Bon etat' }) })
    );
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'missing_category' }) });
  });

  it('fails with missing_condition when condition is null', () => {
    const result = checkListingHasRequiredVintedFields(
      makeActionContext(),
      makeCheckDeps({ targetListing: makeListing({ category: 'Sweats', condition: null }) })
    );
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'missing_condition' }) });
  });

  it('fails with missing_category when no listing is loaded', () => {
    const result = checkListingHasRequiredVintedFields(makeActionContext(), makeCheckDeps({ targetListing: null }));
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'missing_category' }) });
  });

  it('does not flag brand/size/color/material -- only category and condition are objectively required', () => {
    const result = checkListingHasRequiredVintedFields(
      makeActionContext(),
      makeCheckDeps({
        targetListing: makeListing({ category: 'Sweats', condition: 'Bon etat', brand: null, size: null, color: null, material: null }),
      })
    );
    expect(result.ok).toBe(true);
  });
});

describe('checkListingNotAlreadyPublished', () => {
  it('passes when the listing has no vinted_item_id yet', () => {
    const result = checkListingNotAlreadyPublished(
      makeActionContext(),
      makeCheckDeps({ targetListing: makeListing({ vinted_item_id: null }) })
    );
    expect(result.ok).toBe(true);
  });

  it('fails with already_published when vinted_item_id is already set', () => {
    const result = checkListingNotAlreadyPublished(
      makeActionContext(),
      makeCheckDeps({ targetListing: makeListing({ vinted_item_id: '123456' }) })
    );
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'already_published' }) });
  });
});

describe('checkListingAlreadyPublished', () => {
  it('passes when the listing already has a vinted_item_id', () => {
    const result = checkListingAlreadyPublished(
      makeActionContext(),
      makeCheckDeps({ targetListing: makeListing({ vinted_item_id: '123456' }) })
    );
    expect(result.ok).toBe(true);
  });

  it('fails with not_published_yet when vinted_item_id is null', () => {
    const result = checkListingAlreadyPublished(
      makeActionContext(),
      makeCheckDeps({ targetListing: makeListing({ vinted_item_id: null }) })
    );
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'not_published_yet' }) });
  });

  it('fails with not_published_yet when no listing is loaded', () => {
    const result = checkListingAlreadyPublished(makeActionContext(), makeCheckDeps({ targetListing: null }));
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'not_published_yet' }) });
  });
});

describe('checkNoScanInProgress', () => {
  it('passes when no scan is already running', () => {
    const result = checkNoScanInProgress(makeActionContext(), makeCheckDeps({ scanInProgress: false }));
    expect(result.ok).toBe(true);
  });

  it('fails with scan_in_progress when a scan is already running', () => {
    const result = checkNoScanInProgress(makeActionContext(), makeCheckDeps({ scanInProgress: true }));
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'scan_in_progress' }) });
  });
});
