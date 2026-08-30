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

  it('categorie ou etat absent sur une annonce JAMAIS publiee -> defaut missing_category_or_condition', () => {
    expect(
      computeListingIssues(perfectListing({ category: null, vinted_item_id: null })).map((i) => i.kind)
    ).toContain('missing_category_or_condition');
    expect(
      computeListingIssues(perfectListing({ condition: '', vinted_item_id: null })).map((i) => i.kind)
    ).toContain('missing_category_or_condition');
  });

  it('categorie/etat absents sur une annonce DEJA PUBLIEE -> jamais signale (faux positif corrige, 2026-08-30)', () => {
    // Confirme en base de prod : la synchro en masse ne scrape jamais
    // categorie/etat (seulement visibles sur la fiche produit individuelle,
    // hors de portee de la grille de resultats scrapee) -- une annonce deja
    // publiee sans ces champs en base ResellOS n'est PAS un defaut corrigible
    // par l'utilisateur (aucune action possible sur une annonce deja en ligne).
    expect(
      computeListingIssues(perfectListing({ category: null, condition: null, vinted_item_id: '123' })).map((i) => i.kind)
    ).not.toContain('missing_category_or_condition');
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

describe('computeListingIssues -- conseil photo granulaire (2026-08-30)', () => {
  it("aucune photo -> liste des angles concrets attendus, jamais un texte vague", () => {
    const [issue] = computeListingIssues(perfectListing({ image_urls: [] }));
    expect(issue.message).toContain('devant');
    expect(issue.message).toContain('dos');
    expect(issue.message).toContain('étiquette');
    expect(issue.message).not.toBe("Ajoute plus de photos");
  });

  it('une seule photo -> suggere des angles complementaires, sans pretendre savoir ce que montre la photo existante', () => {
    const [issue] = computeListingIssues(perfectListing({ image_urls: ['a.jpg'] }));
    expect(issue.message).toContain('Une seule photo ne suffit pas');
    expect(issue.message).toContain('étiquette');
  });

  it('categorie chaussures -> angles adaptes (semelle), pas le conseil generique vetements', () => {
    const [issue] = computeListingIssues(perfectListing({ image_urls: [], category: 'Chaussures baskets' }));
    expect(issue.message).toContain('semelle');
    expect(issue.message).not.toContain('étiquette de taille et composition');
  });

  it('categorie sacs -> angles adaptes (interieur/fermoir)', () => {
    const [issue] = computeListingIssues(perfectListing({ image_urls: [], category: 'Sacs à main' }));
    expect(issue.message).toContain('intérieur');
    expect(issue.message).toContain('fermoir');
  });

  it('categorie vetement generique (ou absente) -> conseil par defaut (devant/dos/etiquette/logo)', () => {
    const [issue] = computeListingIssues(perfectListing({ image_urls: [], category: null }));
    expect(issue.message).toContain('devant');
    expect(issue.message).toContain('logo');
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
