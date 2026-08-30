// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListingCard } from '../ListingCard';
import type { ListingCardProps } from '../ListingCard';
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
    onEditSchedule: vi.fn(),
    onCancelSchedule: vi.fn(),
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

  // Mission "UI DE PROGRAMMATION DES REPUBLICATIONS" (2026-08-20)
  describe('programmation de republication (schedule)', () => {
    it('aucun badge affiché quand la carte n\'a pas de programmation', () => {
      const props = buildProps();
      render(<ListingCard {...props} />);

      expect(screen.queryByText(/Programmée le/)).not.toBeInTheDocument();
    });

    it('affiche "Programmée le ..." quand schedule.mode === "scheduled"', () => {
      const props = buildProps({ schedule: { mode: 'scheduled', date: '2026-08-25', time: '19:30' } });
      render(<ListingCard {...props} />);

      expect(screen.getByText('Programmée le 25 août 2026 à 19:30')).toBeInTheDocument();
    });

    it('clic sur "Modifier" appelle onEditSchedule, jamais onOpenDetail', async () => {
      const user = userEvent.setup();
      const props = buildProps({ schedule: { mode: 'scheduled', date: '2026-08-25', time: '19:30' } });
      render(<ListingCard {...props} />);

      await user.click(screen.getByRole('button', { name: 'Modifier' }));

      expect(props.onEditSchedule).toHaveBeenCalledTimes(1);
      expect(props.onOpenDetail).not.toHaveBeenCalled();
    });

    it('clic sur "Annuler" appelle onCancelSchedule, jamais onOpenDetail', async () => {
      const user = userEvent.setup();
      const props = buildProps({ schedule: { mode: 'scheduled', date: '2026-08-25', time: '19:30' } });
      render(<ListingCard {...props} />);

      await user.click(screen.getByRole('button', { name: 'Annuler' }));

      expect(props.onCancelSchedule).toHaveBeenCalledTimes(1);
      expect(props.onOpenDetail).not.toHaveBeenCalled();
    });
  });
});

// Refonte 2026-08-26 -- carte epuree. Ces tests portent sur le BRUIT retire
// (Achat/Marge/ROI en "—" alors qu'aucun prix d'achat n'est connu, cas
// majoritaire des annonces importees) et sur l'action ajoutee.
describe('ListingCard -- affichage epure', () => {
  it("masque Achat / Marge / ROI quand aucun prix d'achat n'est connu", () => {
    render(<ListingCard {...buildProps({ item: buildListing({ purchase_price: null }) })} />);

    expect(screen.queryByText('Achat')).toBeNull();
    expect(screen.queryByText('Marge')).toBeNull();
    expect(screen.queryByText('ROI')).toBeNull();
    // Le prix, lui, reste toujours visible.
    expect(screen.getByText('Prix')).toBeTruthy();
  });

  it("affiche Achat / Marge / ROI des que le prix d'achat est connu", () => {
    render(<ListingCard {...buildProps({ item: buildListing({ purchase_price: 10, price: 25 }) })} />);

    expect(screen.getByText('Achat')).toBeTruthy();
    expect(screen.getByText('Marge')).toBeTruthy();
    expect(screen.getByText('ROI')).toBeTruthy();
  });

  it("n'affiche pas le ROI quand le prix d'achat est 0 (division sans objet)", () => {
    render(<ListingCard {...buildProps({ item: buildListing({ purchase_price: 0, price: 25 }) })} />);

    expect(screen.getByText('Achat')).toBeTruthy();
    expect(screen.queryByText('ROI')).toBeNull();
  });

  it('bascule le libelle du prix pour une annonce vendue, sans repeter le mot "Vendu" deja porte par le statut', () => {
    render(<ListingCard {...buildProps({ item: buildListing({ status: 'vendu', sold_price: 30 }) })} />);

    expect(screen.getByText('Prix de vente')).toBeTruthy();
    expect(screen.queryByText('Prix')).toBeNull();
    // Un seul "Vendu" sur la carte : celui du statut.
    expect(screen.getAllByText('Vendu')).toHaveLength(1);
  });
});

describe('ListingCard -- action Republier', () => {
  it("propose Republier quand l'annonce en relève, avec un libellé qui nomme l'annonce", async () => {
    const user = userEvent.setup();
    const onRepublish = vi.fn();
    // status en_stock + aucun vinted_item_id => needsRepublish() === true
    const props = buildProps({ item: buildListing({ vinted_item_id: null }), onRepublish });
    render(<ListingCard {...props} />);

    const btn = screen.getByRole('button', { name: 'Republier Polo Ralph Lauren' });
    await user.click(btn);

    expect(onRepublish).toHaveBeenCalledTimes(1);
    // Le clic ne doit jamais ouvrir la fiche en meme temps.
    expect(props.onOpenDetail).not.toHaveBeenCalled();
  });

  it("ne propose PAS Republier pour une annonce deja en ligne sur Vinted", () => {
    render(
      <ListingCard
        {...buildProps({
          item: buildListing({ vinted_item_id: 'v-1', vinted_status: 'online' }),
          onRepublish: vi.fn(),
        })}
      />
    );

    expect(screen.queryByRole('button', { name: /^Republier/ })).toBeNull();
  });

  it("ne propose PAS Republier pour une annonce vendue", () => {
    render(
      <ListingCard
        {...buildProps({ item: buildListing({ status: 'vendu', sold_price: 30 }), onRepublish: vi.fn() })}
      />
    );

    expect(screen.queryByRole('button', { name: /^Republier/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Marquer vendu/ })).toBeNull();
  });

  it("n'affiche rien si l'appelant ne fournit pas de handler", () => {
    render(<ListingCard {...buildProps({ item: buildListing({ vinted_item_id: null }) })} />);

    expect(screen.queryByRole('button', { name: /^Republier/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Marquer vendu/ })).toBeTruthy();
  });
});

// Casier visuel "Mes annonces" (2026-08-30) : contour colore + Copilote
// precis, tous deux calcules en direct depuis les donnees de l'annonce.
describe('ListingCard -- casier visuel (contour qualite + Copilote)', () => {
  const complete = {
    image_urls: ['a.jpg', 'b.jpg'],
    description: 'Une description bien assez longue et détaillée pour compter comme complète.',
    category: 'Polo',
    condition: 'Très bon état',
  };

  it("annonce complete -> aucun message Copilote generique, aucun defaut affiche", () => {
    render(<ListingCard {...buildProps({ item: buildListing(complete) })} />);

    expect(screen.queryByText('Annonce à vérifier')).toBeNull();
    expect(screen.queryByText(/Ajoute au moins \d+ photos/)).toBeNull();
  });

  it('un seul defaut (ex. une seule photo) -> son conseil precis affiche tel quel, sans compteur', () => {
    render(<ListingCard {...buildProps({ item: buildListing({ ...complete, image_urls: ['a.jpg'] }) })} />);

    expect(screen.getByText(/Une seule photo ne suffit pas/)).toBeInTheDocument();
    expect(screen.queryByText(/autre point/)).toBeNull();
  });

  it('plusieurs defauts -> le premier conseil precis + un compteur honnete du reste', () => {
    render(<ListingCard {...buildProps({ item: buildListing({ ...complete, image_urls: [], description: null }) })} />);

    expect(screen.getByText(/Ajoute au moins \d+ photos.*\(\+1 autre point\)/)).toBeInTheDocument();
  });

  it("une annonce vendue n'affiche jamais de conseil Copilote base sur la qualite (hors perimetre)", () => {
    render(<ListingCard {...buildProps({ item: buildListing({ status: 'vendu', sold_price: 30, image_urls: [], description: null }) })} />);

    expect(screen.queryByText(/Ajoute au moins \d+ photos/)).toBeNull();
  });

  it("un defaut reel remplace un texte generique du Decision Engine, jamais les deux a la fois", () => {
    render(
      <ListingCard
        {...buildProps({
          item: buildListing({ ...complete, image_urls: [] }),
          recommendationState: {
            status: 'action',
            kind: 'baisser_prix',
            confidence: 'haute',
            message: 'Baisse de prix conseillée',
            reason: 'Un texte de performance commerciale, sans rapport avec les photos.',
            cta: { type: 'edit_listing', field: 'price' },
            listingId: 'l1',
          },
        })}
      />
    );

    expect(screen.getByText(/Ajoute au moins \d+ photos/)).toBeInTheDocument();
    expect(screen.queryByText('Un texte de performance commerciale, sans rapport avec les photos.')).toBeNull();
  });

  it("aucun defaut structurel -> retombe sur la raison precise du Decision Engine (jamais son libelle generique)", () => {
    render(
      <ListingCard
        {...buildProps({
          item: buildListing(complete),
          recommendationState: {
            status: 'action',
            kind: 'baisser_prix',
            confidence: 'haute',
            message: 'Baisse de prix conseillée',
            reason: 'Peu de vues après 30 jours en ligne, une baisse de prix pourrait relancer l\'intérêt.',
            cta: { type: 'edit_listing', field: 'price' },
            listingId: 'l1',
          },
        })}
      />
    );

    expect(screen.getByText(/Peu de vues après 30 jours en ligne/)).toBeInTheDocument();
    expect(screen.queryByText('Baisse de prix conseillée')).toBeNull();
  });
});
