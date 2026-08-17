import { describe, expect, it } from 'vitest';
import {
  checkAccountSelected,
  checkAuthenticated,
  checkExtensionConnected,
  checkListingAlreadyPublished,
  checkListingHasPhotos,
  checkListingLoaded,
  checkListingNotAlreadyPublished,
  checkListingRepublishEligible,
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

describe('checkListingRepublishEligible', () => {
  it('passes for a listing that was published but is no longer live (hidden)', () => {
    const result = checkListingRepublishEligible(
      makeActionContext(),
      makeCheckDeps({ targetListing: makeListing({ status: 'en_stock', vinted_item_id: '123', vinted_status: 'hidden' }) })
    );
    expect(result.ok).toBe(true);
  });

  it('passes for a listing that was deleted on Vinted', () => {
    const result = checkListingRepublishEligible(
      makeActionContext(),
      makeCheckDeps({ targetListing: makeListing({ status: 'en_stock', vinted_item_id: '123', vinted_status: 'deleted' }) })
    );
    expect(result.ok).toBe(true);
  });

  it('passes for a listing never published at all', () => {
    const result = checkListingRepublishEligible(
      makeActionContext(),
      makeCheckDeps({ targetListing: makeListing({ status: 'en_stock', vinted_item_id: null, vinted_status: null }) })
    );
    expect(result.ok).toBe(true);
  });

  it('fails with listing_not_found when no listing is loaded', () => {
    const result = checkListingRepublishEligible(makeActionContext(), makeCheckDeps({ targetListing: null }));
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'listing_not_found' }) });
  });

  it('fails with listing_sold when the listing is already sold', () => {
    const result = checkListingRepublishEligible(
      makeActionContext(),
      makeCheckDeps({ targetListing: makeListing({ status: 'vendu', vinted_item_id: '123', vinted_status: 'hidden' }) })
    );
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'listing_sold' }) });
  });

  it('fails with listing_not_in_stock when the listing is still a draft', () => {
    const result = checkListingRepublishEligible(
      makeActionContext(),
      makeCheckDeps({ targetListing: makeListing({ status: 'draft', vinted_item_id: null, vinted_status: null }) })
    );
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'listing_not_in_stock' }) });
  });

  // BUG LIVE reel (Republication V2, confirme 2026-08-10) : Albin/test live
  // a reproduit "Cette annonce est deja en ligne sur Vinted." en cliquant
  // Republier sur une annonce genuinement online (prix 24e, marque Polo
  // Ralph Lauren, taille L, sur Vinted au moment du clic) -- exactement le
  // cas d'usage normal d'une republication (relancer une annonce qui
  // performe mal MAIS reste en ligne). Ces deux tests prouvent le fix :
  // l'ancien code retournait already_live ici, desormais ok:true.
  it('passes when the listing is genuinely online on Vinted -- republishing a live listing is the normal case, not a duplicate', () => {
    const result = checkListingRepublishEligible(
      makeActionContext(),
      makeCheckDeps({ targetListing: makeListing({ status: 'en_stock', vinted_item_id: '123', vinted_status: 'online' }) })
    );
    expect(result).toEqual({ ok: true });
  });

  it('passes when the listing is reserved on Vinted', () => {
    const result = checkListingRepublishEligible(
      makeActionContext(),
      makeCheckDeps({ targetListing: makeListing({ status: 'en_stock', vinted_item_id: '123', vinted_status: 'reserved' }) })
    );
    expect(result).toEqual({ ok: true });
  });
});

// Section 17 (Republication V2) : preuve explicite que publish_listing et
// republish_listing restent bien SEPARES sur ce point precis -- meme
// annonce (deja en ligne, vinted_item_id present), deux verdicts opposes,
// chacun logique pour son propre flow.
describe('publish_listing vs republish_listing on an already-live listing', () => {
  it('checkListingNotAlreadyPublished (publish_listing) blocks a listing that already has a vinted_item_id', () => {
    const listing = makeListing({ status: 'en_stock', vinted_item_id: '123', vinted_status: 'online' });
    const result = checkListingNotAlreadyPublished(makeActionContext(), makeCheckDeps({ targetListing: listing }));
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ code: 'already_published' }) });
  });

  it('checkListingRepublishEligible (republish_listing) allows the exact same listing', () => {
    const listing = makeListing({ status: 'en_stock', vinted_item_id: '123', vinted_status: 'online' });
    const result = checkListingRepublishEligible(makeActionContext(), makeCheckDeps({ targetListing: listing }));
    expect(result).toEqual({ ok: true });
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
