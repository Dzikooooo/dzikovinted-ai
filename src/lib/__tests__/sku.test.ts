import { describe, expect, it } from 'vitest';
import { buildEditSuccessSyncFields, extractSkuFromTitle, formatTitleWithSku, stripSkuSuffix } from '../sku';

describe('formatTitleWithSku', () => {
  it('appends the sku to the title', () => {
    expect(formatTitleWithSku('Sweat Nike', 12)).toBe('Sweat Nike #12');
  });

  it('returns the title unchanged when sku is null', () => {
    expect(formatTitleWithSku('Sweat Nike', null)).toBe('Sweat Nike');
  });
});

describe('extractSkuFromTitle', () => {
  it('extracts a trailing #N and strips it from the title', () => {
    expect(extractSkuFromTitle('Sweat Nike #12')).toEqual({ title: 'Sweat Nike', sku: 12 });
  });

  it('handles multi-digit skus', () => {
    expect(extractSkuFromTitle('Robe vintage #431')).toEqual({ title: 'Robe vintage', sku: 431 });
  });

  it('returns the title unchanged and sku null when no trailing pattern exists', () => {
    expect(extractSkuFromTitle('Sweat Nike')).toEqual({ title: 'Sweat Nike', sku: null });
  });

  it('does not match a hashtag in the middle of the title', () => {
    expect(extractSkuFromTitle('Sweat #vintage Nike')).toEqual({ title: 'Sweat #vintage Nike', sku: null });
  });

  it('trims trailing whitespace left after stripping the sku', () => {
    expect(extractSkuFromTitle('Sweat Nike   #12')).toEqual({ title: 'Sweat Nike', sku: 12 });
  });
});

describe('stripSkuSuffix', () => {
  it('leaves an already-clean title untouched', () => {
    expect(stripSkuSuffix('Sweat Nike')).toBe('Sweat Nike');
  });

  it('strips a single manually-typed suffix', () => {
    expect(stripSkuSuffix('Sweat Nike #17')).toBe('Sweat Nike');
  });

  it('strips a doubled suffix in one call -- exact "#11 #11" regression case', () => {
    // Reproduit precisement le motif reel trouve en audit production
    // (2026-07-26) sur les articles de test edit_listing de cette session.
    expect(stripSkuSuffix('Planche en bois test titre final #11 #11')).toBe('Planche en bois test titre final');
  });

  it('strips more than two accumulated suffixes', () => {
    expect(stripSkuSuffix('Article #1 #2 #3')).toBe('Article');
  });
});

describe('buildEditSuccessSyncFields', () => {
  const baseEditPayload = {
    description: 'Description mise a jour',
    brand: 'Nike',
    category: 'Sweats',
    color: 'Bleu',
    size: 'M',
    material: 'Coton',
    condition: 'Bon etat',
    price: 25,
  };

  it('writes back the clean listing title, never the SKU-formatted payload title', () => {
    // Non-regression du bug reel confirme le 2026-07-25 : l'ancienne
    // ecriture reutilisait editPayload.title (deja formate via
    // formatTitleWithSku pour Vinted) au lieu du titre propre.
    const result = buildEditSuccessSyncFields('Sweat Nike', baseEditPayload);
    expect(result.title).toBe('Sweat Nike');
  });

  it('never accumulates the SKU suffix after two consecutive edit_listing successes on an unchanged title', () => {
    // Simule exactement le scenario du bug reel : deux modifications
    // successives (ex. prix, puis description) sur la MEME annonce, sans
    // jamais toucher au titre -- le titre stocke doit rester strictement
    // identique, pas grossir d'un "#11" supplementaire a chaque cycle.
    const sku = 11;
    let storedTitle = 'Planche en bois test titre final';

    for (let i = 0; i < 2; i++) {
      // Ce que edit_listing envoie reellement a Vinted (voir
      // buildEditPayload, StockPage.tsx) -- ne doit JAMAIS servir a
      // reecrire le titre "propre" en base.
      const editPayload = { ...baseEditPayload, price: 20 + i };
      formatTitleWithSku(storedTitle, sku); // ce que Vinted reçoit, non utilise pour l'ecriture DB

      const syncFields = buildEditSuccessSyncFields(storedTitle, editPayload);
      storedTitle = syncFields.title; // simule l'ecriture reelle .update() en base
    }

    expect(storedTitle).toBe('Planche en bois test titre final');
    expect(extractSkuFromTitle(storedTitle)).toEqual({ title: 'Planche en bois test titre final', sku: null });
  });

  it('normalizes null attribute fields to empty strings, same rule as the rest of the app', () => {
    const result = buildEditSuccessSyncFields('Sweat Nike', {
      ...baseEditPayload,
      brand: null,
      color: null,
      size: null,
      material: null,
    });
    expect(result).toMatchObject({ brand: '', color: '', size: '', material: '' });
  });
});
