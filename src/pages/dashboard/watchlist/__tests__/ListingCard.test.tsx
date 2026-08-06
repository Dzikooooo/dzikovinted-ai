// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListingCard } from '../ListingsManagementSection';
import type { ListingCardProps } from '../ListingsManagementSection';
import type { Listing } from '../../../../lib/types';

// Premier test de composant du projet (voir vitest.config.ts) -- couvre le
// bug UX confirme en production : la carte "Mes annonces" doit ouvrir la
// fiche annonce (ListingDetailModal) au clic, sans jamais interferer avec
// la selection multiple ni les actions de la carte (checkbox, "Marquer
// vendu"), qui doivent stopper la propagation vers le clic de carte.

function buildListing(overrides: Partial<Listing> = {}): Listing {
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
    favourites: 3,
    views: 12,
    synced_at: new Date().toISOString(),
    last_edited_at: null,
    sku: 1,
    vinted_sync_status: null,
    ...overrides,
  };
}

function buildProps(overrides: Partial<ListingCardProps> = {}): ListingCardProps {
  return {
    item: buildListing(),
    selected: false,
    onToggleSelect: vi.fn(),
    showAccount: false,
    accountLabel: () => '',
    score: null,
    recommendationState: undefined,
    aging: false,
    onMarkSold: vi.fn(),
    onOpenDetail: vi.fn(),
    ...overrides,
  };
}

describe('ListingCard', () => {
  it('clic sur la carte ouvre la fiche (onOpenDetail)', async () => {
    const user = userEvent.setup();
    const props = buildProps();
    render(<ListingCard {...props} />);

    await user.click(screen.getByRole('button', { name: /voir le détail de polo ralph lauren/i }));

    expect(props.onOpenDetail).toHaveBeenCalledTimes(1);
    expect(props.onToggleSelect).not.toHaveBeenCalled();
  });

  it('clic sur la checkbox ne déclenche jamais onOpenDetail, seulement onToggleSelect', async () => {
    const user = userEvent.setup();
    const props = buildProps();
    render(<ListingCard {...props} />);

    await user.click(screen.getByRole('button', { name: /sélectionner/i }));

    expect(props.onToggleSelect).toHaveBeenCalledTimes(1);
    expect(props.onOpenDetail).not.toHaveBeenCalled();
  });

  it('clic sur "Marquer vendu" ne déclenche jamais onOpenDetail, seulement onMarkSold', async () => {
    const user = userEvent.setup();
    const props = buildProps();
    render(<ListingCard {...props} />);

    await user.click(screen.getByRole('button', { name: /marquer vendu/i }));

    expect(props.onMarkSold).toHaveBeenCalledTimes(1);
    expect(props.onOpenDetail).not.toHaveBeenCalled();
  });

  it('"Marquer vendu" est absent pour une annonce déjà vendue (pas de conflit de zone cliquable)', () => {
    const props = buildProps({ item: buildListing({ status: 'vendu', sold_price: 25 }) });
    render(<ListingCard {...props} />);

    expect(screen.queryByRole('button', { name: /marquer vendu/i })).not.toBeInTheDocument();
  });

  it('la sélection multiple reste intacte : toggler deux cartes différentes appelle chaque callback indépendamment', async () => {
    const user = userEvent.setup();
    const propsA = buildProps({ item: buildListing({ id: 'a', title: 'Article A' }) });
    const propsB = buildProps({ item: buildListing({ id: 'b', title: 'Article B' }) });
    render(
      <>
        <ListingCard {...propsA} />
        <ListingCard {...propsB} />
      </>
    );

    const checkboxes = screen.getAllByRole('button', { name: /sélectionner/i });
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);

    expect(propsA.onToggleSelect).toHaveBeenCalledTimes(1);
    expect(propsB.onToggleSelect).toHaveBeenCalledTimes(1);
    expect(propsA.onOpenDetail).not.toHaveBeenCalled();
    expect(propsB.onOpenDetail).not.toHaveBeenCalled();
  });

  it('carte sélectionnée affiche l\'état "Désélectionner" et le reflète visuellement', () => {
    const props = buildProps({ selected: true });
    render(<ListingCard {...props} />);

    expect(screen.getByRole('button', { name: /désélectionner/i })).toBeInTheDocument();
  });

  it('support clavier : Enter sur la carte ouvre la fiche', async () => {
    const user = userEvent.setup();
    const props = buildProps();
    render(<ListingCard {...props} />);

    const card = screen.getByRole('button', { name: /voir le détail de polo ralph lauren/i });
    card.focus();
    await user.keyboard('{Enter}');

    expect(props.onOpenDetail).toHaveBeenCalledTimes(1);
  });

  it('support clavier : Espace sur la carte ouvre la fiche', async () => {
    const user = userEvent.setup();
    const props = buildProps();
    render(<ListingCard {...props} />);

    const card = screen.getByRole('button', { name: /voir le détail de polo ralph lauren/i });
    card.focus();
    await user.keyboard(' ');

    expect(props.onOpenDetail).toHaveBeenCalledTimes(1);
  });

  it('la carte est focusable au clavier (tabIndex 0)', () => {
    const props = buildProps();
    render(<ListingCard {...props} />);

    const card = screen.getByRole('button', { name: /voir le détail de polo ralph lauren/i });
    expect(card).toHaveAttribute('tabindex', '0');
  });

  it('fermeture puis réouverture : onOpenDetail rappelable plusieurs fois de suite (état contrôlé par le parent, jamais par la carte)', async () => {
    const user = userEvent.setup();
    const props = buildProps();
    render(<ListingCard {...props} />);

    const card = screen.getByRole('button', { name: /voir le détail de polo ralph lauren/i });
    await user.click(card);
    await user.click(card);

    expect(props.onOpenDetail).toHaveBeenCalledTimes(2);
  });
});
