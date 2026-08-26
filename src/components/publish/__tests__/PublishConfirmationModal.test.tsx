// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PublishConfirmationModal from '../PublishConfirmationModal';
import type { Listing, VintedAccount } from '../../../lib/types';

// Le selecteur d'heure n'est plus un <select> natif (2026-08-26) : son menu
// natif debordait sur les photos de la modale et n'etait pas rognable en CSS.
// C'est desormais un listbox construit dans le document -- donc ouvrir puis
// cliquer, au lieu de selectOptions().
async function pickTimeUnit(
  user: ReturnType<typeof userEvent.setup>,
  label: 'Heure' | 'Minutes',
  value: string
): Promise<void> {
  await user.click(screen.getByRole('button', { name: label }));
  await user.click(within(screen.getByRole('listbox', { name: label })).getByRole('option', { name: value }));
}


// Mission "UI DE PROGRAMMATION DES REPUBLICATIONS" (2026-08-20) : couvre le
// nouveau choix Maintenant/Programmer ajoute a cette modale, en isolation
// (aucun rendu de ListingsManagementSection, plus rapide et deterministe).
// `now` fige via vi.setSystemTime -- uniquement `Date` est mockee
// (toFake: ['Date']), jamais setTimeout/setInterval, pour ne jamais
// interferer avec les delais internes de userEvent.

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
    vinted_account_id: 'acc-1',
    vinted_item_id: 'old-item-42',
    vinted_url: null,
    vinted_status: 'hidden',
    favourites: 3,
    views: 12,
    synced_at: new Date().toISOString(),
    last_edited_at: null,
    sku: 1,
    vinted_sync_status: null,
    ...overrides,
  };
}

const TEST_ACCOUNT: VintedAccount = {
  id: 'acc-1',
  user_id: 'u1',
  vinted_user_id: 'vinted-1',
  vinted_username: 'testuser',
  label: 'Compte test',
  is_default: true,
  connected: true,
  last_synced_at: null,
  listings_synced_at: null,
  created_at: new Date().toISOString(),
} as VintedAccount;

// Jeudi 20 aout 2026, 15h00 -- reference fixe pour tous les tests de
// validation date/heure ci-dessous.
const NOW = new Date('2026-08-20T15:00:00');

describe('PublishConfirmationModal -- programmation de republication', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publication fraiche (isRepublish=false) : aucun choix Maintenant/Programmer, comportement inchange', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onSchedule = vi.fn();
    render(
      <PublishConfirmationModal
        listing={buildListing({ vinted_item_id: null })}
        account={TEST_ACCOUNT}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        onSchedule={onSchedule}
      />
    );

    expect(screen.queryByText('Quand ?')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publier' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onSchedule).not.toHaveBeenCalled();
  });

  it('republication, mode par defaut "Maintenant" : continue d\'appeler onConfirm, jamais onSchedule', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onSchedule = vi.fn();
    render(
      <PublishConfirmationModal
        listing={buildListing()}
        account={TEST_ACCOUNT}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        onSchedule={onSchedule}
        isRepublish
      />
    );

    expect(screen.getByText('Quand ?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Republier' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onSchedule).not.toHaveBeenCalled();
  });

  it('toggle vers "Programmer" affiche le calendrier/l\'heure et masque le bouton Republier direct', async () => {
    const user = userEvent.setup();
    render(
      <PublishConfirmationModal
        listing={buildListing()}
        account={TEST_ACCOUNT}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onSchedule={vi.fn()}
        isRepublish
      />
    );

    await user.click(screen.getByRole('button', { name: 'Programmer' }));

    expect(screen.queryByRole('button', { name: 'Republier' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Programmer la republication' })).toBeInTheDocument();
  });

  it('date passée refusée : le jour 19 (avant aujourd\'hui 20) est désactivé dans le calendrier', async () => {
    const user = userEvent.setup();
    render(
      <PublishConfirmationModal
        listing={buildListing()}
        account={TEST_ACCOUNT}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onSchedule={vi.fn()}
        isRepublish
      />
    );
    await user.click(screen.getByRole('button', { name: 'Programmer' }));

    expect(screen.getByRole('button', { name: '2026-08-19' })).toBeDisabled();
  });

  it('date obligatoire : bouton "Programmer la republication" disabled tant qu\'aucune date n\'est choisie', async () => {
    const user = userEvent.setup();
    render(
      <PublishConfirmationModal
        listing={buildListing()}
        account={TEST_ACCOUNT}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onSchedule={vi.fn()}
        isRepublish
      />
    );
    await user.click(screen.getByRole('button', { name: 'Programmer' }));

    expect(screen.getByRole('button', { name: 'Programmer la republication' })).toBeDisabled();
  });

  it('heure obligatoire : bouton disabled tant qu\'une date est choisie sans heure', async () => {
    const user = userEvent.setup();
    render(
      <PublishConfirmationModal
        listing={buildListing()}
        account={TEST_ACCOUNT}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onSchedule={vi.fn()}
        isRepublish
      />
    );
    await user.click(screen.getByRole('button', { name: 'Programmer' }));
    await user.click(screen.getByRole('button', { name: '2026-08-25' }));

    expect(screen.getByRole('button', { name: 'Programmer la republication' })).toBeDisabled();
  });

  it('heure passée aujourd\'hui refusée : bouton disabled et message affiché si l\'heure choisie est avant maintenant (15:00)', async () => {
    const user = userEvent.setup();
    render(
      <PublishConfirmationModal
        listing={buildListing()}
        account={TEST_ACCOUNT}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onSchedule={vi.fn()}
        isRepublish
      />
    );
    await user.click(screen.getByRole('button', { name: 'Programmer' }));
    await user.click(screen.getByRole('button', { name: '2026-08-20' })); // aujourd'hui
    await pickTimeUnit(user, 'Heure', '10');
    await pickTimeUnit(user, 'Minutes', '00');

    expect(screen.getByRole('button', { name: 'Programmer la republication' })).toBeDisabled();
    expect(screen.getByText(/déjà passée aujourd'hui/i)).toBeInTheDocument();
  });

  it('programmation valide : date+heure future active le bouton, le clic appelle onSchedule(date, time, packageSize) et jamais onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onSchedule = vi.fn().mockResolvedValue({ ok: true });
    render(
      <PublishConfirmationModal
        listing={buildListing()}
        account={TEST_ACCOUNT}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        onSchedule={onSchedule}
        isRepublish
      />
    );
    await user.click(screen.getByRole('button', { name: 'Programmer' }));
    await user.click(screen.getByRole('button', { name: '2026-08-25' }));
    await pickTimeUnit(user, 'Heure', '19');
    await pickTimeUnit(user, 'Minutes', '30');

    const submit = screen.getByRole('button', { name: 'Programmer la republication' });
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(onSchedule).toHaveBeenCalledTimes(1);
    // category:'Polo' (buildListing par defaut) ne matche ni le motif petit
    // ni le motif grand de defaultPackageSize() -> 'medium'.
    expect(onSchedule).toHaveBeenCalledWith('2026-08-25', '19:30', 'medium');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('echec de onSchedule (ex. conflit 23505 traduit par le service) : affiche le message, garde la modale ouverte, jamais de fermeture silencieuse', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSchedule = vi.fn().mockResolvedValue({
      ok: false,
      error: "Cette annonce a déjà une programmation active. Annule-la avant d'en créer une nouvelle.",
    });
    render(
      <PublishConfirmationModal
        listing={buildListing()}
        account={TEST_ACCOUNT}
        onCancel={onCancel}
        onConfirm={vi.fn()}
        onSchedule={onSchedule}
        isRepublish
      />
    );
    await user.click(screen.getByRole('button', { name: 'Programmer' }));
    await user.click(screen.getByRole('button', { name: '2026-08-25' }));
    await pickTimeUnit(user, 'Heure', '19');
    await pickTimeUnit(user, 'Minutes', '30');
    await user.click(screen.getByRole('button', { name: 'Programmer la republication' }));

    expect(await screen.findByText(/déjà une programmation active/i)).toBeInTheDocument();
    // La modale (donc son bouton) reste presente -- jamais de fermeture sur echec.
    expect(screen.getByRole('button', { name: 'Programmer la republication' })).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('pendant la soumission : bouton disabled et libelle "Programmation..." (jamais de faux succes avant reponse)', async () => {
    const user = userEvent.setup();
    let resolveSchedule: (v: { ok: true }) => void;
    const onSchedule = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          resolveSchedule = resolve;
        })
    );
    render(
      <PublishConfirmationModal
        listing={buildListing()}
        account={TEST_ACCOUNT}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onSchedule={onSchedule}
        isRepublish
      />
    );
    await user.click(screen.getByRole('button', { name: 'Programmer' }));
    await user.click(screen.getByRole('button', { name: '2026-08-25' }));
    await pickTimeUnit(user, 'Heure', '19');
    await pickTimeUnit(user, 'Minutes', '30');
    await user.click(screen.getByRole('button', { name: 'Programmer la republication' }));

    expect(await screen.findByRole('button', { name: 'Programmation...' })).toBeDisabled();
    resolveSchedule!({ ok: true });
  });

  it('"Modifier" (initialSchedule) préremplit le mode Programmer avec la date/heure existantes', () => {
    render(
      <PublishConfirmationModal
        listing={buildListing()}
        account={TEST_ACCOUNT}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onSchedule={vi.fn()}
        isRepublish
        initialSchedule={{ mode: 'scheduled', date: '2026-08-25', time: '19:30' }}
      />
    );

    expect(screen.getByRole('button', { name: 'Programmer la republication' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2026-08-25' })).toHaveAttribute('aria-pressed', 'true');
    // Le declencheur AFFICHE la valeur choisie, il ne la porte plus dans
    // un attribut value : c'est un bouton, plus un <select>.
    expect(screen.getByRole('button', { name: 'Heure' })).toHaveTextContent('19');
    expect(screen.getByRole('button', { name: 'Minutes' })).toHaveTextContent('30');
  });

  it('"Modifier" préremplit aussi le package_size depuis la ligne existante (jamais recalcule via defaultPackageSize)', async () => {
    const user = userEvent.setup();
    const onSchedule = vi.fn().mockResolvedValue({ ok: true });
    render(
      <PublishConfirmationModal
        listing={buildListing({ category: 'Polo' })} // defaultPackageSize('Polo') -> 'medium', jamais 'small'
        account={TEST_ACCOUNT}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onSchedule={onSchedule}
        isRepublish
        initialSchedule={{ mode: 'scheduled', date: '2026-08-25', time: '19:30', packageSize: 'small' }}
      />
    );

    // Le bouton "Petit" doit deja etre selectionne visuellement (classe active).
    const smallButton = screen.getByRole('button', { name: 'Petit' });
    expect(smallButton.className).toContain('bg-neon-600');

    await user.click(screen.getByRole('button', { name: 'Programmer la republication' }));
    expect(onSchedule).toHaveBeenCalledWith('2026-08-25', '19:30', 'small');
  });
});
