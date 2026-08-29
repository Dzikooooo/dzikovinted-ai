// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from '../SettingsPage';

// Audit DCP (2026-08-29) : la politique de confidentialite promettait deja
// une suppression de compte reelle (LegalPage.tsx section 5/6), mais le
// bouton reel etait desactive ("bientot disponible") -- voir
// supabase/functions/delete-account. Ce test couvre UNIQUEMENT ce nouveau
// flux (onglet Danger) : le reste de SettingsPage n'a pas de couverture
// existante et n'est pas dans le perimetre de cette correction.

const STABLE_PROFILE = { id: 'u1', email: 'test@example.com', plan: 'free' as const, role: 'user' as const };
const refreshProfileMock = vi.fn();
const signOutMock = vi.fn();
const showToastMock = vi.fn();
const deleteAccountMock = vi.fn();

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: STABLE_PROFILE, refreshProfile: refreshProfileMock, signOut: signOutMock }),
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock('../../../lib/accountDeletion', () => ({
  deleteAccount: (...args: unknown[]) => deleteAccountMock(...args),
}));

afterEach(() => {
  vi.clearAllMocks();
});

async function openDeleteModal() {
  const user = userEvent.setup();
  render(<SettingsPage initialTab="danger" />);
  await user.click(await screen.findByRole('button', { name: 'Supprimer mon compte' }));
  return user;
}

describe('SettingsPage -- suppression de compte (onglet Danger)', () => {
  it('le bouton de confirmation reste desactive tant que "SUPPRIMER" n\'est pas tape exactement', async () => {
    const user = await openDeleteModal();

    const confirmButton = screen.getByRole('button', { name: /supprimer définitivement/i });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText('Confirmation'), 'suppr');
    expect(confirmButton).toBeDisabled();

    await user.clear(screen.getByLabelText('Confirmation'));
    await user.type(screen.getByLabelText('Confirmation'), 'SUPPRIMER');
    expect(confirmButton).toBeEnabled();

    expect(deleteAccountMock).not.toHaveBeenCalled();
  });

  it('succes : appelle deleteAccount() puis signOut() -- jamais l\'inverse', async () => {
    const callOrder: string[] = [];
    deleteAccountMock.mockImplementation(async () => {
      callOrder.push('deleteAccount');
      return { ok: true };
    });
    signOutMock.mockImplementation(async () => {
      callOrder.push('signOut');
    });

    const user = await openDeleteModal();
    await user.type(screen.getByLabelText('Confirmation'), 'SUPPRIMER');
    await user.click(screen.getByRole('button', { name: /supprimer définitivement/i }));

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(callOrder).toEqual(['deleteAccount', 'signOut']);
  });

  it('echec : affiche le message d\'erreur reel, ne deconnecte JAMAIS l\'utilisateur, et laisse la modale ouverte', async () => {
    deleteAccountMock.mockResolvedValue({ ok: false, error: 'Erreur serveur, réessaie plus tard ou contacte le support.' });

    const user = await openDeleteModal();
    await user.type(screen.getByLabelText('Confirmation'), 'SUPPRIMER');
    await user.click(screen.getByRole('button', { name: /supprimer définitivement/i }));

    expect(await screen.findByText('Erreur serveur, réessaie plus tard ou contacte le support.')).toBeInTheDocument();
    expect(signOutMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /supprimer définitivement/i })).toBeInTheDocument();
  });

  it('"Annuler" ferme la modale sans jamais appeler deleteAccount()', async () => {
    const user = await openDeleteModal();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByLabelText('Confirmation')).not.toBeInTheDocument();
    expect(deleteAccountMock).not.toHaveBeenCalled();
  });
});
