import { describe, expect, it } from 'vitest';
import { resolveMessageTemplate } from '../messageTemplate';
import type { Listing } from '../types';

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'l1',
    user_id: 'u1',
    title: 'Polo Ralph Lauren',
    description: null,
    brand: 'Ralph Lauren',
    category: 'Polo',
    color: null,
    size: 'M',
    material: null,
    condition: null,
    price: 25,
    quick_price: 20,
    premium_price: 30,
    keywords: [],
    vinted_filters: [],
    image_urls: [],
    purchase_price: null,
    purchase_date: null,
    purchase_location: null,
    status: 'en_stock',
    sold_price: null,
    sold_date: null,
    fees: 0,
    is_favorite: false,
    created_at: new Date().toISOString(),
    vinted_account_id: null,
    vinted_item_id: null,
    vinted_url: null,
    vinted_status: 'online',
    favourites: null,
    views: null,
    synced_at: null,
    last_edited_at: null,
    sku: null,
    vinted_sync_status: null,
    ...overrides,
  };
}

describe('resolveMessageTemplate', () => {
  it('remplace {titre}/{prix}/{marque}/{taille}/{categorie} par les vraies valeurs', () => {
    const listing = makeListing();
    const result = resolveMessageTemplate(
      'Bonjour, "{titre}" ({marque}, taille {taille}, {categorie}) est à {prix} !',
      listing
    );
    expect(result).toBe('Bonjour, "Polo Ralph Lauren" (Ralph Lauren, taille M, Polo) est à 25 € !');
  });

  it('formate le prix avec formatEUR (entier arrondi, espace, symbole €)', () => {
    const listing = makeListing({ price: 19.6 });
    expect(resolveMessageTemplate('{prix}', listing)).toBe('20 €');
  });

  it("laisse le jeton tel quel quand la donnée réelle est null (n'invente jamais)", () => {
    const listing = makeListing({ brand: null, size: null, category: null });
    const result = resolveMessageTemplate('{marque} / {taille} / {categorie}', listing);
    expect(result).toBe('{marque} / {taille} / {categorie}');
  });

  it("laisse le jeton tel quel quand la donnée réelle est une chaîne vide", () => {
    const listing = makeListing({ brand: '' });
    expect(resolveMessageTemplate('{marque}', listing)).toBe('{marque}');
  });

  it('jeton inconnu reste inchangé (pas de variable définie pour lui)', () => {
    const listing = makeListing();
    expect(resolveMessageTemplate('{inconnu}', listing)).toBe('{inconnu}');
  });

  it('texte sans aucune variable reste inchangé', () => {
    const listing = makeListing();
    expect(resolveMessageTemplate('Bonjour, toujours disponible ?', listing)).toBe('Bonjour, toujours disponible ?');
  });

  it('plusieurs occurrences du même jeton sont toutes remplacées', () => {
    const listing = makeListing({ title: 'Sac Longchamp' });
    expect(resolveMessageTemplate('{titre} - vraiment {titre} !', listing)).toBe('Sac Longchamp - vraiment Sac Longchamp !');
  });
});
