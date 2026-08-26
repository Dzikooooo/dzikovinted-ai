// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VintedAccount } from '../../../lib/types';
import type { SyncVintedAccountResult } from '../../../lib/extensionBridge';

// Refonte 2026-08-26 de la page Compte Vinted. Ce fichier couvre ce que la
// refonte a REELLEMENT change et ce qui pourrait casser sans qu'on le voie :
// l'en-tete unifie (un seul bloc d'etat au lieu de trois), la grille de
// cartes avec leurs vraies donnees, et surtout le garde-fou du retrait --
// une action destructive qui ne doit jamais partir en un clic.

function makeAccount(over: Partial<VintedAccount> = {}): VintedAccount {
  return {
    id: 'acc-1',
    user_id: 'u1',
    label: 'dziko0737',
    vinted_user_id: 'v-1',
    vinted_username: 'dziko0737',
    connected: true,
    last_synced_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    listings_synced_at: null,
    last_error: null,
    is_default: true,
    created_at: new Date().toISOString(),
    ...over,
  };
}

let accountsFixture: VintedAccount[] = [makeAccount()];
let selectedIdFixture: string = 'all';
const refreshMock = vi.fn();
const selectAccountMock = vi.fn();
const syncMock = vi.fn<(...a: unknown[]) => Promise<SyncVintedAccountResult>>();
const deleteEqMock = vi.fn(async () => ({ error: null }));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ session: { access_token: 'a', refresh_token: 'r' }, user: { id: 'u1' } }),
}));

vi.mock('../../../contexts/VintedAccountFilterContext', () => ({
  useVintedAccountFilter: () => ({
    accounts: accountsFixture,
    loading: false,
    selectedAccountId: selectedIdFixture,
    selectedAccount: accountsFixture.find((a) => a.id === selectedIdFixture) ?? null,
    selectAccount: selectAccountMock,
    refresh: refreshMock,
  }),
}));

vi.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: () => {} }));

vi.mock('../../../lib/extensionBridge', () => ({
  isExtensionConfigured: () => true,
  getConfiguredExtensionId: () => 'abcdef',
  getExtensionStatus: async () => ({ paired: true, pairedUserId: 'u1' }),
  pairExtension: async () => ({ ok: true }),
  unpairExtension: async () => ({ ok: true }),
  syncVintedAccount: (...args: unknown[]) => syncMock(...args),
}));

// `listings` : compteur par compte (select head + count). `vinted_accounts` :
// suppression. Une seule fabrique, aiguillee par le nom de table.
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'vinted_accounts') {
        return { delete: () => ({ eq: deleteEqMock }) };
      }
      return { select: () => ({ eq: async () => ({ count: 7, error: null }) }) };
    },
    auth: { getSession: async () => ({ data: { session: { access_token: 'a', refresh_token: 'r' } }, error: null }) },
  },
}));

import VintedAccountPage from '../VintedAccountPage';

beforeEach(() => {
  accountsFixture = [makeAccount()];
  selectedIdFixture = 'all';
  refreshMock.mockReset();
  selectAccountMock.mockReset();
  syncMock.mockReset();
  deleteEqMock.mockClear();
});

describe('VintedAccountPage -- en-tete unifie', () => {
  it("annonce un seul etat clair, et n'affiche plus ni checklist ni grille 'en un coup d'oeil'", async () => {
    render(<VintedAccountPage />);

    expect(await screen.findByText('Extension opérationnelle')).toBeTruthy();
    expect(screen.getByText('Synchronisation automatique active')).toBeTruthy();
    // Les trois blocs fusionnes ne doivent plus exister.
    expect(screen.queryByText('Étapes de connexion')).toBeNull();
    expect(screen.queryByText("En un coup d'œil")).toBeNull();
  });

  it("n'annonce PAS la synchro automatique active quand aucune session Vinted n'est detectee", async () => {
    accountsFixture = [makeAccount({ connected: false })];
    render(<VintedAccountPage />);

    expect(await screen.findByText('Extension opérationnelle')).toBeTruthy();
    expect(screen.getByText('Synchronisation automatique en attente')).toBeTruthy();
    expect(screen.queryByText('Synchronisation automatique active')).toBeNull();
  });

  it('lance une vraie synchro et affiche le resultat REEL renvoye par l\'extension', async () => {
    syncMock.mockResolvedValue({
      ok: true, complete: true, created: 2, updated: 1, deletedMarked: 0,
      pagesRead: 1, pagesExpected: 1, reason: 'success',
    });
    const user = userEvent.setup();
    render(<VintedAccountPage />);

    await user.click(await screen.findByRole('button', { name: /Synchroniser maintenant/i }));

    await waitFor(() => expect(syncMock).toHaveBeenCalledWith('v-1', 'dziko0737', expect.anything()));
    expect(await screen.findByText(/3 annonce\(s\) synchronisée\(s\)/)).toBeTruthy();
  });

  it("n'invente jamais un succes : une synchro partielle est annoncee comme telle", async () => {
    syncMock.mockResolvedValue({
      ok: true, complete: false, created: 1, updated: 0, deletedMarked: 0,
      pagesRead: 1, pagesExpected: 4, reason: 'success',
    });
    const user = userEvent.setup();
    render(<VintedAccountPage />);

    await user.click(await screen.findByRole('button', { name: /Synchroniser maintenant/i }));

    expect(await screen.findByText(/Synchronisation partielle — 1\/4 pages lues/)).toBeTruthy();
  });
});

describe('VintedAccountPage -- grille de comptes', () => {
  it('affiche pseudo, statut, nombre reel d\'annonces et date relative', async () => {
    render(<VintedAccountPage />);

    expect(await screen.findByText('dziko0737')).toBeTruthy();
    expect(screen.getByText('Actif')).toBeTruthy();
    expect(await screen.findByText('7')).toBeTruthy();
    expect(screen.getByText('Il y a 4h')).toBeTruthy();
  });

  it('marque une session Vinted expiree plutot que de la presenter comme active', async () => {
    accountsFixture = [makeAccount({ connected: false })];
    render(<VintedAccountPage />);

    expect(await screen.findByText('Session expirée')).toBeTruthy();
    expect(screen.queryByText('Actif')).toBeNull();
  });

  it('"Basculer" selectionne le compte, et devient inerte sur le compte deja actif', async () => {
    accountsFixture = [makeAccount(), makeAccount({ id: 'acc-2', label: 'compte2', vinted_user_id: 'v-2', is_default: false })];
    selectedIdFixture = 'acc-1';
    const user = userEvent.setup();
    render(<VintedAccountPage />);

    expect(await screen.findByRole('button', { name: /Compte actif/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /^Basculer$/i }));
    expect(selectAccountMock).toHaveBeenCalledWith('acc-2');
  });

  it("conserve une carte d'ajout pointant vers Vinted", async () => {
    render(<VintedAccountPage />);

    const lien = await screen.findByRole('link', { name: /Ouvrir Vinted/i });
    expect(lien.getAttribute('href')).toBe('https://www.vinted.fr');
  });
});

describe('VintedAccountPage -- retrait de compte (destructif)', () => {
  it('ne supprime JAMAIS en un clic : une confirmation annonce le nombre reel d\'annonces perdues', async () => {
    const user = userEvent.setup();
    render(<VintedAccountPage />);

    await user.click(await screen.findByRole('button', { name: /Retirer le compte dziko0737/i }));

    // Rien n'est parti tant que la confirmation n'est pas validee.
    expect(deleteEqMock).not.toHaveBeenCalled();
    const dialog = await screen.findByText('Retirer ce compte Vinted ?');
    expect(dialog).toBeTruthy();
    expect(screen.getByText(/7 annonce\(s\) importée\(s\) seront supprimées/)).toBeTruthy();
    // L'utilisateur doit savoir que Vinted lui-meme n'est pas touche.
    expect(screen.getByText(/Tes annonces sur Vinted ne sont pas touchées/)).toBeTruthy();
  });

  it('annule sans rien supprimer', async () => {
    const user = userEvent.setup();
    render(<VintedAccountPage />);

    await user.click(await screen.findByRole('button', { name: /Retirer le compte dziko0737/i }));
    await user.click(await screen.findByRole('button', { name: /^Annuler$/i }));

    expect(deleteEqMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Retirer ce compte Vinted ?')).toBeNull());
  });

  it('supprime le bon compte une fois confirme, puis rafraichit', async () => {
    const user = userEvent.setup();
    render(<VintedAccountPage />);

    await user.click(await screen.findByRole('button', { name: /Retirer le compte dziko0737/i }));
    const modal = (await screen.findByText('Retirer ce compte Vinted ?')).closest('div')!;
    await user.click(within(modal.parentElement!).getByRole('button', { name: /^Retirer$/i }));

    await waitFor(() => expect(deleteEqMock).toHaveBeenCalledWith('id', 'acc-1'));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});
