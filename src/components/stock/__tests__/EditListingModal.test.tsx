// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditListingModal } from '../EditListingModal';
import type { Listing } from '../../../lib/types';

// Validation P0 #10 (audit pre-lancement 2026-07-10, "editer une annonce
// apres sauvegarde cree une deuxieme ligne") : par lecture de code,
// EditListingModal.tsx::save() ne fait qu'un .update().eq('id', ...) --
// aucun .insert() nulle part dans ce fichier. Ce test le prouve
// STRUCTURELLEMENT plutot que par une simple assertion : le chainable
// mocke n'expose AUCUNE methode .insert()/.upsert(), une tentative
// d'appel ferait planter le test avec "not a function", preuve plus forte
// qu'un spy qu'on espere non appele.

const TEST_LISTING: Listing = {
  id: 'l1',
  user_id: 'u1',
  title: 'Polo Ralph Lauren',
  description: 'Tres bon etat',
  brand: 'Ralph Lauren',
  category: 'Polo',
  color: null,
  size: 'M',
  material: null,
  condition: 'Tres bon etat',
  price: 25,
  quick_price: 20,
  premium_price: 30,
  keywords: [],
  vinted_filters: [],
  image_urls: ['https://example.com/1.jpg'],
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
  vinted_status: null,
  favourites: null,
  views: null,
  synced_at: null,
  last_edited_at: null,
  sku: 1,
  vinted_sync_status: null,
};

type RecordedCall = { method: string; args: unknown[] };
let fromCalls: RecordedCall[] = [];

// Aucune methode .insert()/.upsert() n'est definie sur ce chainable --
// volontaire, voir le commentaire d'en-tete.
function makeUpdateOnlyChainable() {
  const ALLOWED = new Set(['update', 'eq', 'select']);
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: { data: { id: string }[]; error: null }) => void) =>
          resolve({ data: [{ id: TEST_LISTING.id }], error: null });
      }
      const method = String(prop);
      if (!ALLOWED.has(method)) {
        throw new Error(`EditListingModal ne doit jamais appeler .${method}() sur 'listings' -- seul .update() est attendu (P0 #10)`);
      }
      return (...args: unknown[]) => {
        fromCalls.push({ method, args });
        return self;
      };
    },
  });
  return self;
}

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      fromCalls.push({ method: 'from', args: [table] });
      return makeUpdateOnlyChainable();
    },
  },
}));

vi.mock('../../../lib/aiService', () => ({
  analyzeWithAI: vi.fn(),
}));

vi.mock('../../../lib/storage', () => ({
  uploadListingPhotos: vi.fn(),
}));

afterEach(() => {
  fromCalls = [];
});

describe('EditListingModal -- validation P0 #10 : pas de duplication a la sauvegarde', () => {
  it('"Enregistrer les modifications" appelle .update().eq(id) sur la table listings, jamais .insert()', async () => {
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(
      <EditListingModal
        listing={TEST_LISTING}
        onClose={() => {}}
        onSaved={onSaved}
        canPublish={false}
        canUpdateOnVinted={false}
        photoLimit={10}
      />
    );

    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));

    const updateCalls = fromCalls.filter((c) => c.method === 'update');
    expect(updateCalls).toHaveLength(1);

    const eqCalls = fromCalls.filter((c) => c.method === 'eq');
    expect(eqCalls).toHaveLength(1);
    expect(eqCalls[0].args).toEqual(['id', TEST_LISTING.id]);

    // Une seule requete .from('listings') au total pour toute la sauvegarde
    // -- pas de second appel qui trahirait une tentative d'ecriture
    // additionnelle (ex. un insert deguise en amont/aval de l'update).
    expect(fromCalls.filter((c) => c.method === 'from')).toHaveLength(1);

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved.mock.calls[0][1]).toBe('none');
  });
});
