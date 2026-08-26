// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MarketOpportunity } from '../../../lib/types';

// Refonte 2026-08-26 des cartes d'opportunite. Ce fichier couvre surtout la
// consequence structurelle de la refonte : la carte etait un <button>
// englobant TOUT, un lien "Voir sur Vinted" ne pouvait pas y vivre (un <a>
// dans un <button> est invalide). Le balisage doit maintenant rester plat.

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../../hooks/useActionEngine', () => ({
  useActionEngine: () => ({ prepareAction: vi.fn(), confirmAction: vi.fn() }),
}));

const { OpportunityCard } = await import('../Opportunities');

function makeOpportunity(over: Partial<MarketOpportunity> = {}): MarketOpportunity {
  return {
    id: 'o1',
    title: 'Veste Carhartt Detroit',
    brand: 'Carhartt',
    category: 'Jackets',
    image: null,
    images: null,
    price_found: 30,
    market_price: 60,
    profit: 22,
    roi: 73,
    score: 80,
    confidence: 65,
    price_source: 'ventes récentes',
    favourites: 3,
    vinted_url: 'https://www.vinted.fr/items/1',
    status: 'active',
    created_at: '2026-08-20T10:00:00Z',
    risk_level: 'faible',
    breakdown: null,
    resale_days_min: 10,
    resale_days_max: 20,
    resale_confidence: 60,
    first_observed_at: '2026-08-18T10:00:00Z',
    competing_listings_count: 12,
    ...over,
  };
}

function renderCard(over: Partial<MarketOpportunity> = {}, onToggleFavourite = vi.fn()) {
  render(<OpportunityCard item={makeOpportunity(over)} isFavourited={false} onToggleFavourite={onToggleFavourite} />);
  return { onToggleFavourite };
}

describe('OpportunityCard -- structure', () => {
  it("n'imbrique aucune commande dans une autre", () => {
    const { container } = render(
      <OpportunityCard item={makeOpportunity()} isFavourited={false} onToggleFavourite={vi.fn()} />
    );
    // Le bug que la refonte corrige : un <a> ou un <button> a l'interieur
    // d'un <button> est du HTML invalide, et le clavier s'y perd.
    expect(container.querySelectorAll('button button, button a, a button')).toHaveLength(0);
  });

  it('expose le favori comme un vrai bouton, plus comme un span bricole', async () => {
    const user = userEvent.setup();
    const onToggleFavourite = vi.fn();
    render(<OpportunityCard item={makeOpportunity()} isFavourited={false} onToggleFavourite={onToggleFavourite} />);

    const fav = screen.getByRole('button', { name: /Ajouter aux favoris/i });
    expect(fav.tagName).toBe('BUTTON');
    await user.click(fav);
    expect(onToggleFavourite).toHaveBeenCalledOnce();
  });

  it('donne au declencheur de detail un nom qui distingue la carte des autres', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /Voir le détail de Veste Carhartt Detroit/i })).toBeTruthy();
  });
});

describe('OpportunityCard -- potentiel', () => {
  it('affiche le trajet prix payé -> revente estimée, gain et ROI', () => {
    renderCard();
    expect(screen.getByText('30 €')).toBeTruthy();
    expect(screen.getByText('60 €')).toBeTruthy();
    expect(screen.getByText(/\+22 €/)).toBeTruthy();
    expect(screen.getByText(/\+73 %/)).toBeTruthy();
  });

  it('met le gain et le ROI en green-700 -- 5.02:1 sur blanc, le vert clair du theme sombre etait a 1.74:1', () => {
    renderCard();
    expect(screen.getByText(/\+22 €/).className).toContain('text-green-700');
    expect(screen.getByText(/\+73 %/).className).toContain('text-green-700');
  });

  it("n'affiche ni gain ni ROI quand le moteur ne les a pas calcules", () => {
    renderCard({ profit: null, roi: null });
    // Libelles exacts, pas /roi/i : le titre "Det-roi-t" le matcherait.
    expect(screen.queryByText('gain')).toBeNull();
    expect(screen.queryByText('roi')).toBeNull();
  });

  it("le dit plutot que d'afficher un prix invente quand l'estimation manque", () => {
    renderCard({ market_price: null });
    expect(screen.getByText(/Estimation indisponible/i)).toBeTruthy();
  });

  it("badge d'estimation sur la photo quand elle existe", () => {
    renderCard();
    expect(screen.getByText(/≈ 60 € estimés/)).toBeTruthy();
  });
});

describe('OpportunityCard -- puces cles', () => {
  it('remplace le pave textuel par au plus 3 puces', () => {
    const { container } = render(
      <OpportunityCard item={makeOpportunity()} isFavourited={false} onToggleFavourite={vi.fn()} />
    );
    expect(screen.queryByText(/Pourquoi cette opportunité/i)).toBeNull();
    expect(container.querySelectorAll('ul li').length).toBeLessThanOrEqual(3);
    expect(screen.getByText('50 % sous le marché')).toBeTruthy();
  });
});

describe('OpportunityCard -- lien Vinted', () => {
  it('ouvre la vraie annonce dans un nouvel onglet', () => {
    renderCard();
    const link = screen.getByRole('link', { name: /Voir sur Vinted/i });
    expect(link.getAttribute('href')).toBe('https://www.vinted.fr/items/1');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('utilise VINTED_INK et non VINTED_TEAL : du blanc sur #09B1BA echoue AA (2.62:1)', () => {
    renderCard();
    const link = screen.getByRole('link', { name: /Voir sur Vinted/i });
    expect(link.getAttribute('style')).toContain('rgb(0, 119, 130)');
    expect(link.getAttribute('style')).not.toContain('rgb(9, 177, 186)');
  });

  it("n'affiche pas de lien mort quand l'URL manque", () => {
    renderCard({ vinted_url: null });
    expect(screen.queryByRole('link', { name: /Voir sur Vinted/i })).toBeNull();
    expect(screen.getByText(/Lien Vinted indisponible/i)).toBeTruthy();
  });
});
