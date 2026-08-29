import { describe, expect, it } from 'vitest';
import { buildContext } from '../context';
import { computeListingRecommendation, computeListingStates, computeRecommendations } from '../recommendations';
import { DORMANT_LISTING_DAYS, REPUBLISH_AFTER_DAYS } from '../constants';
import type { RecentActionSummary } from '../types';
import { daysAgo, makeListing } from './fixtures';

// Helpers -------------------------------------------------------------

const FRESH = daysAgo(0); // synced_at "maintenant" -> tier 'fraiche'
const TENDUE = daysAgo(30 / 24); // ~30h -> tier 'tendue'
const PERIMEE = daysAgo(3); // 72h -> tier 'perimee'

// image_urls/category/condition non vides par defaut : evite qu'un test qui
// ne s'interesse pas a verifier_annonce ne le declenche par accident (la
// regle 1 est prioritaire sur tout le reste dans la chaine d'arbitrage).
function published(overrides: Parameters<typeof makeListing>[0] = {}) {
  return makeListing({
    vinted_item_id: '999',
    vinted_url: 'https://vinted.fr/items/999',
    synced_at: FRESH,
    image_urls: ['a.jpg'],
    category: 'Vêtements',
    condition: 'Bon état',
    ...overrides,
  });
}

// -----------------------------------------------------------------------
// Regle 1 : verifier_annonce
// -----------------------------------------------------------------------
describe('verifier_annonce', () => {
  it("echec de synchro -> action confiance haute", () => {
    const listing = published({ vinted_sync_status: 'sync_failed', image_urls: ['a.jpg'], category: 'Vêtements', condition: 'Neuf' });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result).toEqual(
      expect.objectContaining({ status: 'action', kind: 'verifier_annonce', confidence: 'haute' })
    );
    expect(result && 'reason' in result ? result.reason : '').toContain('échoué');
  });

  it('aucune photo -> action', () => {
    const listing = published({ image_urls: [], category: 'Vêtements', condition: 'Neuf' });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result?.status).toBe('action');
    expect(result && 'kind' in result ? result.kind : null).toBe('verifier_annonce');
    expect(result && 'reason' in result ? result.reason : '').toContain('photo');
  });

  it('categorie manquante -> action', () => {
    const listing = published({ image_urls: ['a.jpg'], category: '', condition: 'Neuf' });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result && 'kind' in result ? result.kind : null).toBe('verifier_annonce');
  });

  it('etat manquant -> action', () => {
    const listing = published({ image_urls: ['a.jpg'], category: 'Vêtements', condition: '' });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result && 'kind' in result ? result.kind : null).toBe('verifier_annonce');
  });

  it('echec de synchro prioritaire sur photo manquante (une seule cause a la fois)', () => {
    const listing = published({ vinted_sync_status: 'sync_failed', image_urls: [] });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result && 'reason' in result ? result.reason : '').toContain('échoué');
  });

  it("jamais publiee sur Vinted (pas de vinted_item_id) -> pas de verifier_annonce", () => {
    const listing = makeListing({ vinted_item_id: null, vinted_url: null, image_urls: [] });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result && 'kind' in result ? result.kind : null).not.toBe('verifier_annonce');
  });

  it('prioritaire sur la fraicheur de synchro -- matche meme si la synchro est perimee', () => {
    const listing = published({ synced_at: PERIMEE, image_urls: [] });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result?.status).toBe('action');
  });

  it("cede la priorite a considerer_republication quand le statut Vinted est hidden/deleted (P0, audit du 2026-08-05) -- un defaut de fiche ne doit plus masquer indefiniment une invisibilite reelle", () => {
    const listing = published({ vinted_status: 'hidden', image_urls: [] });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result).toMatchObject({ status: 'action', kind: 'considerer_republication', confidence: 'haute' });
  });

  it('meme priorite pour le statut deleted', () => {
    const listing = published({ vinted_status: 'deleted', category: '' });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result).toMatchObject({ status: 'action', kind: 'considerer_republication' });
  });

  it("reste prioritaire quand le statut est online -- la priorite hidden/deleted ne s'applique qu'a ces deux statuts", () => {
    const listing = published({ vinted_status: 'online', image_urls: [] });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result && 'kind' in result ? result.kind : null).toBe('verifier_annonce');
  });

  it("reste prioritaire quand le statut est unknown -- signal trop ambigu pour justifier la meme priorite que hidden/deleted", () => {
    const listing = published({ vinted_status: 'unknown', image_urls: [] });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result && 'kind' in result ? result.kind : null).toBe('verifier_annonce');
  });

  it('la priorite hidden/deleted ne bypasse pas la synchro perimee (le fix ne touche pas ce garde-fou) -- sans defaut structurel par ailleurs, retombe en donnees_insuffisantes comme avant', () => {
    const listing = published({ vinted_status: 'hidden', synced_at: PERIMEE });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result?.status).toBe('donnees_insuffisantes');
  });
});

// -----------------------------------------------------------------------
// Regle 2 : considerer_republication
// -----------------------------------------------------------------------
describe('considerer_republication', () => {
  it('chemin A : statut hidden -> action confiance haute + disclaimer', () => {
    const listing = published({ vinted_status: 'hidden', image_urls: ['a.jpg'], category: 'x', condition: 'x' });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result).toMatchObject({ status: 'action', kind: 'considerer_republication', confidence: 'haute' });
    expect(result && 'reason' in result ? result.reason : '').toContain('jamais un robot');
  });

  it('chemin A : statut deleted -> action confiance haute', () => {
    const listing = published({ vinted_status: 'deleted', image_urls: ['a.jpg'], category: 'x', condition: 'x' });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result).toMatchObject({ status: 'action', kind: 'considerer_republication', confidence: 'haute' });
  });

  it('chemin A : statut unknown + synchro fraiche -> action confiance standard', () => {
    const listing = published({ vinted_status: 'unknown', synced_at: FRESH, image_urls: ['a.jpg'], category: 'x', condition: 'x' });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result).toMatchObject({ status: 'action', kind: 'considerer_republication', confidence: 'standard' });
  });

  it("chemin A : statut unknown + synchro tendue (pas totalement fraiche) -> donnees_insuffisantes, jamais une recommandation a confiance standard", () => {
    const listing = published({ vinted_status: 'unknown', synced_at: TENDUE, image_urls: ['a.jpg'], category: 'x', condition: 'x' });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result?.status).toBe('donnees_insuffisantes');
  });

  it('chemin B : dormance totale (age >= seuil, 0 vue, 0 favori) -> action confiance standard', () => {
    const listing = published({
      vinted_status: 'online',
      views: 0,
      favourites: 0,
      created_at: daysAgo(DORMANT_LISTING_DAYS + 5),
    });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result).toMatchObject({ status: 'action', kind: 'considerer_republication', confidence: 'standard' });
  });

  it('chemin B : jamais sur l\'age seul -- dormance sans engagement nul connu ne matche pas', () => {
    const listing = published({
      vinted_status: 'online',
      views: null,
      favourites: null,
      created_at: daysAgo(DORMANT_LISTING_DAYS + 100),
    });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result && 'kind' in result ? result.kind : null).not.toBe('considerer_republication');
  });

  it('chemin B : age insuffisant malgre un engagement nul -> ne matche pas', () => {
    const listing = published({ vinted_status: 'online', views: 0, favourites: 0, created_at: daysAgo(5) });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result && 'kind' in result ? result.kind : null).not.toBe('considerer_republication');
  });

  it('une republication deja tentee recemment -> recommandation_differee, pas une nouvelle action', () => {
    const listing = published({ vinted_status: 'hidden' });
    const recentActions: RecentActionSummary[] = [
      { listingId: listing.id, kind: 'publish_listing', completedAt: daysAgo(1) },
    ];
    const ctx = buildContext([listing], [], [], recentActions);
    const result = computeListingRecommendation(listing, ctx);
    expect(result).toMatchObject({ status: 'recommandation_differee', kind: 'considerer_republication' });
  });

  it('une synchro perimee bloque la recommandation avant meme d\'evaluer le statut hidden (jamais seule une synchro perimee ne declenche la republication)', () => {
    const listing = published({ vinted_status: 'hidden', synced_at: PERIMEE });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result?.status).toBe('donnees_insuffisantes');
  });
});

// -----------------------------------------------------------------------
// Regle 3 : baisser_prix
// -----------------------------------------------------------------------
describe('baisser_prix', () => {
  function contextWithMedian(targetOverrides: Parameters<typeof makeListing>[0]) {
    const target = published({
      vinted_status: 'online',
      price: 20,
      created_at: daysAgo(REPUBLISH_AFTER_DAYS + 5),
      synced_at: FRESH,
      ...targetOverrides,
    });
    // 4 annonces "actives" avec un engagement fort et homogene -> mediane = 40 vues / 8 favoris,
    // le compte a bien >= 3 annonces actives (hasSufficientSample).
    const fillers = Array.from({ length: 4 }, () =>
      makeListing({ vinted_status: 'online', views: 40, favourites: 8, synced_at: FRESH, created_at: daysAgo(1) })
    );
    const ctx = buildContext([target, ...fillers], [], []);
    return { target, ctx };
  }

  it('vues et favoris tres en dessous de la mediane, annonce assez agee -> action', () => {
    const { target, ctx } = contextWithMedian({ views: 2, favourites: 1 });
    const result = computeListingRecommendation(target, ctx);
    expect(result).toMatchObject({ status: 'action', kind: 'baisser_prix' });
  });

  it("le message ne pretend jamais connaitre le marche (P0, audit du 2026-08-05) -- seule la comparaison au compte est une donnee reelle", () => {
    const { target, ctx } = contextWithMedian({ views: 2, favourites: 1 });
    const result = computeListingRecommendation(target, ctx);
    const reason = result && 'reason' in result ? result.reason : '';
    expect(reason).not.toMatch(/march/i);
    expect(reason).toContain('sur ton compte');
  });

  it('confiance haute quand la synchro est fraiche, standard sinon', () => {
    const { target, ctx } = contextWithMedian({ views: 2, favourites: 1, synced_at: TENDUE });
    const result = computeListingRecommendation(target, ctx);
    expect(result).toMatchObject({ status: 'action', kind: 'baisser_prix', confidence: 'standard' });
  });

  it('vues/favoris a zero -> exclu (domaine de considerer_republication, pas baisser_prix)', () => {
    const { target, ctx } = contextWithMedian({ views: 0, favourites: 0 });
    const result = computeListingRecommendation(target, ctx);
    expect(result && 'kind' in result ? result.kind : null).not.toBe('baisser_prix');
  });

  it('prix absent -> jamais de baisse de prix recommandee', () => {
    const { target, ctx } = contextWithMedian({ views: 2, favourites: 1, price: 0 });
    const result = computeListingRecommendation(target, ctx);
    expect(result && 'kind' in result ? result.kind : null).not.toBe('baisser_prix');
  });

  it('annonce trop recente (age < seuil) -> pas de baisse de prix meme avec un engagement faible', () => {
    const { target, ctx } = contextWithMedian({ views: 2, favourites: 1, created_at: daysAgo(5) });
    const result = computeListingRecommendation(target, ctx);
    expect(result && 'kind' in result ? result.kind : null).not.toBe('baisser_prix');
  });

  it('engagement proche de la mediane (pas assez faible) -> pas de recommandation', () => {
    const { target, ctx } = contextWithMedian({ views: 35, favourites: 7 });
    const result = computeListingRecommendation(target, ctx);
    expect(result && 'kind' in result ? result.kind : null).not.toBe('baisser_prix');
  });

  it('un changement de prix deja effectue recemment -> recommandation_differee, jamais une repetition', () => {
    const { target, ctx: baseCtx } = contextWithMedian({ views: 2, favourites: 1 });
    const recentActions: RecentActionSummary[] = [
      { listingId: target.id, kind: 'edit_listing', completedAt: daysAgo(2), changedFields: ['price'] },
    ];
    const ctx = buildContext(baseCtx.listings, [], [], recentActions);
    const result = computeListingRecommendation(target, ctx);
    expect(result).toMatchObject({ status: 'recommandation_differee', kind: 'baisser_prix' });
  });
});

// -----------------------------------------------------------------------
// Regle 4 : revoir_annonce
// -----------------------------------------------------------------------
describe('revoir_annonce', () => {
  function contextWithMedian(targetOverrides: Parameters<typeof makeListing>[0]) {
    const target = published({ vinted_status: 'online', synced_at: FRESH, created_at: daysAgo(1), ...targetOverrides });
    const fillers = Array.from({ length: 4 }, () =>
      makeListing({ vinted_status: 'online', views: 40, favourites: 8, synced_at: FRESH, created_at: daysAgo(1) })
    );
    const ctx = buildContext([target, ...fillers], [], []);
    return { target, ctx };
  }

  it('beaucoup de vues, tres peu de favoris -> action confiance standard', () => {
    const { target, ctx } = contextWithMedian({ views: 100, favourites: 0 });
    const result = computeListingRecommendation(target, ctx);
    expect(result).toMatchObject({ status: 'action', kind: 'revoir_annonce', confidence: 'standard' });
  });

  it('vues elevees mais favoris au-dessus du seuil -> pas de recommandation', () => {
    const { target, ctx } = contextWithMedian({ views: 100, favourites: 5 });
    const result = computeListingRecommendation(target, ctx);
    expect(result && 'kind' in result ? result.kind : null).not.toBe('revoir_annonce');
  });

  it('vues pas assez au-dessus de la mediane -> pas de recommandation', () => {
    const { target, ctx } = contextWithMedian({ views: 45, favourites: 0 });
    const result = computeListingRecommendation(target, ctx);
    expect(result && 'kind' in result ? result.kind : null).not.toBe('revoir_annonce');
  });
});

// -----------------------------------------------------------------------
// Etats "aucune action" -- 3 statuts distincts
// -----------------------------------------------------------------------
describe('etats sans action', () => {
  it('attendre : donnees suffisantes et fraiches, aucune regle ne matche', () => {
    const target = published({ vinted_status: 'online', views: 25, favourites: 5, created_at: daysAgo(5) });
    const fillers = Array.from({ length: 3 }, () =>
      makeListing({ vinted_status: 'online', views: 25, favourites: 5, synced_at: FRESH })
    );
    const ctx = buildContext([target, ...fillers], [], []);
    const result = computeListingRecommendation(target, ctx);
    expect(result?.status).toBe('attendre');
  });

  it('donnees_insuffisantes : synchro perimee (> 48h)', () => {
    const listing = published({ synced_at: PERIMEE });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result).toMatchObject({ status: 'donnees_insuffisantes' });
    expect(result && 'reason' in result ? result.reason : '').toContain('48h');
  });

  it('donnees_insuffisantes : moins de 3 annonces actives sur le compte pour comparer', () => {
    const listing = published({ vinted_status: 'online', views: 5, favourites: 1, created_at: daysAgo(1) });
    const ctx = buildContext([listing], [], []); // seule annonce active du compte
    const result = computeListingRecommendation(listing, ctx);
    expect(result).toMatchObject({ status: 'donnees_insuffisantes' });
    expect(result && 'reason' in result ? result.reason : '').toContain('minimum 3');
  });

  it("aucun resultat (pas meme 'attendre') pour une annonce hors champ (brouillon jamais publie)", () => {
    const listing = makeListing({ status: 'draft' });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result).toBeNull();
  });

  it("aucun resultat pour une annonce deja vendue", () => {
    const listing = makeListing({ status: 'vendu' });
    const ctx = buildContext([listing], [], []);
    const result = computeListingRecommendation(listing, ctx);
    expect(result).toBeNull();
  });
});

// -----------------------------------------------------------------------
// computeListingStates / computeRecommendations -- wrappers
// -----------------------------------------------------------------------
describe('computeListingStates', () => {
  it("n'inclut que les annonces status='en_stock'", () => {
    const inStock = published({ vinted_status: 'hidden' });
    const sold = makeListing({ status: 'vendu' });
    const ctx = buildContext([inStock, sold], [], []);
    const states = computeListingStates(ctx);
    expect(states.has(inStock.id)).toBe(true);
    expect(states.has(sold.id)).toBe(false);
  });
});

describe('computeRecommendations', () => {
  it("ne retourne que les etats 'action', avec le champ confidence", () => {
    const inStock = published({ vinted_status: 'hidden' }); // action
    const attente = published({
      vinted_item_id: null,
      vinted_url: null,
      vinted_status: 'online',
      views: 25,
      favourites: 5,
      created_at: daysAgo(5),
    });
    const fillers = Array.from({ length: 3 }, () =>
      makeListing({ vinted_status: 'online', views: 25, favourites: 5, synced_at: FRESH })
    );
    const ctx = buildContext([inStock, attente, ...fillers], [], []);
    const recs = computeRecommendations(ctx);
    const ids = recs.map((r) => r.listingId);
    expect(ids).toContain(inStock.id);
    expect(ids).not.toContain(attente.id);
    const rec = recs.find((r) => r.listingId === inStock.id);
    expect(rec?.confidence).toBeDefined();
  });

  it("ne produit jamais 'raise_price' -- hors perimetre MVP, meme avec un engagement tres au-dessus de la mediane", () => {
    const popular = published({ vinted_status: 'online', views: 100, favourites: 20, created_at: daysAgo(1) });
    const fillers = Array.from({ length: 3 }, () =>
      makeListing({ vinted_status: 'online', views: 10, favourites: 2, created_at: daysAgo(1), synced_at: FRESH })
    );
    const ctx = buildContext([popular, ...fillers], [], []);
    const recs = computeRecommendations(ctx);
    expect(recs.every((r) => (r.kind as string) !== 'raise_price')).toBe(true);
  });
});
