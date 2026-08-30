import { describe, expect, it } from 'vitest';
import { computeListingIssues, qualityToneForIssues, describeListingIssues } from '../listingQuality';
import { makeListing } from '../insights/__tests__/fixtures';

function perfectListing(overrides: Parameters<typeof makeListing>[0] = {}) {
  return makeListing({
    image_urls: ['a.jpg', 'b.jpg', 'c.jpg'],
    description: 'Une description bien assez longue et détaillée pour compter.',
    category: 'Pulls',
    condition: 'Très bon état',
    status: 'en_stock',
    vinted_sync_status: null,
    ...overrides,
  });
}

describe('computeListingIssues', () => {
  it('une annonce vendue ne remonte jamais aucun defaut (hors perimetre)', () => {
    expect(computeListingIssues(perfectListing({ status: 'vendu', image_urls: [] }))).toEqual([]);
  });

  it('une annonce complete et bien remplie ne remonte aucun defaut', () => {
    expect(computeListingIssues(perfectListing())).toEqual([]);
  });

  it('aucune photo -> defaut no_photo', () => {
    const issues = computeListingIssues(perfectListing({ image_urls: [] }));
    expect(issues.map((i) => i.kind)).toContain('no_photo');
  });

  it('exactement une photo -> defaut single_photo (distinct de no_photo)', () => {
    const issues = computeListingIssues(perfectListing({ image_urls: ['a.jpg'] }));
    expect(issues.map((i) => i.kind)).toEqual(['single_photo']);
  });

  it('description absente ou trop courte -> defaut missing_description', () => {
    expect(computeListingIssues(perfectListing({ description: null })).map((i) => i.kind)).toContain('missing_description');
    expect(computeListingIssues(perfectListing({ description: 'trop court' })).map((i) => i.kind)).toContain('missing_description');
  });

  it('categorie ou etat absent -> defaut missing_category_or_condition', () => {
    expect(computeListingIssues(perfectListing({ category: null })).map((i) => i.kind)).toContain('missing_category_or_condition');
    expect(computeListingIssues(perfectListing({ condition: '' })).map((i) => i.kind)).toContain('missing_category_or_condition');
  });

  it('sync_failed uniquement pour une annonce en_stock, jamais pour un brouillon/en attente', () => {
    expect(
      computeListingIssues(perfectListing({ status: 'en_stock', vinted_sync_status: 'sync_failed' })).map((i) => i.kind)
    ).toContain('sync_failed');
    expect(
      computeListingIssues(perfectListing({ status: 'draft', vinted_sync_status: 'sync_failed' })).map((i) => i.kind)
    ).not.toContain('sync_failed');
  });

  it('cumule plusieurs defauts reels simultanement', () => {
    const issues = computeListingIssues(perfectListing({ image_urls: [], description: null }));
    expect(issues.map((i) => i.kind).sort()).toEqual(['missing_description', 'no_photo'].sort());
  });
});

describe('qualityToneForIssues', () => {
  it('0 defaut -> quality-ok (vert)', () => {
    expect(qualityToneForIssues([])).toBe('quality-ok');
  });

  it('1 seul defaut -> quality-warning (violet)', () => {
    expect(qualityToneForIssues(computeListingIssues(perfectListing({ image_urls: [] })))).toBe('quality-warning');
  });

  it('plus d\'un defaut -> quality-critical (rouge)', () => {
    expect(qualityToneForIssues(computeListingIssues(perfectListing({ image_urls: [], description: null })))).toBe('quality-critical');
  });
});

describe('describeListingIssues', () => {
  it('aucun defaut -> null (jamais un texte vide affiche)', () => {
    expect(describeListingIssues([])).toBeNull();
  });

  it('un seul defaut -> son message tel quel, sans compteur', () => {
    const issues = computeListingIssues(perfectListing({ image_urls: [] }));
    expect(describeListingIssues(issues)).toBe(issues[0].message);
    expect(describeListingIssues(issues)).not.toContain('autre');
  });

  it('plusieurs defauts -> le premier message + un compteur honnete du reste', () => {
    const issues = computeListingIssues(perfectListing({ image_urls: [], description: null, category: null }));
    const text = describeListingIssues(issues)!;
    expect(text.startsWith(issues[0].message)).toBe(true);
    expect(text).toContain(`+${issues.length - 1} autre`);
  });
});
