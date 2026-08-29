// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from '../ToastContext';

function Probe() {
  const { showToast } = useToast();
  return (
    <div>
      <button onClick={() => showToast('Profil mis à jour !', 'success')}>fire-success</button>
      <button onClick={() => showToast('Erreur lors de la sauvegarde.', 'error')}>fire-error</button>
      <button onClick={() => showToast('Sans ton précisé')}>fire-default</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <ToastProvider>
      <Probe />
    </ToastProvider>
  );
}

describe('ToastProvider / useToast', () => {
  it("useToast() hors ToastProvider leve une erreur explicite", () => {
    function Bare() {
      useToast();
      return null;
    }
    expect(() => render(<Bare />)).toThrow('useToast must be used within ToastProvider');
  });

  it('showToast affiche un toast avec le message et le ton demandes', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText('fire-success'));

    const toast = await screen.findByText('Profil mis à jour !');
    expect(toast.className).toContain('text-green-700');
  });

  it('ton par defaut = info quand omis', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText('fire-default'));

    const toast = await screen.findByText('Sans ton précisé');
    expect(toast.className).toContain('text-gray-700');
  });

  it('plusieurs toasts se cumulent (jamais un seul remplace le precedent)', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText('fire-success'));
    await user.click(screen.getByText('fire-error'));

    expect(await screen.findByText('Profil mis à jour !')).toBeTruthy();
    expect(await screen.findByText('Erreur lors de la sauvegarde.')).toBeTruthy();
  });

  it('le bouton de fermeture retire uniquement CE toast', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText('fire-success'));
    await user.click(screen.getByText('fire-error'));
    await screen.findByText('Erreur lors de la sauvegarde.');

    const closeButtons = screen.getAllByLabelText('Fermer la notification');
    await user.click(closeButtons[0]);

    await waitFor(() => expect(screen.queryByText('Profil mis à jour !')).toBeNull());
    expect(screen.getByText('Erreur lors de la sauvegarde.')).toBeTruthy();
  });
});

describe('ToastProvider -- auto-dismiss', () => {
  // Timers reels + waitFor (meme convention que FavouritesFollowUp.test.tsx
  // pour son propre setTimeout de reinitialisation "Copié !") -- userEvent +
  // fake timers est une combinaison fragile (le premier essai avec
  // vi.useFakeTimers() faisait timeout sur le clic lui-meme).
  it(
    'un toast disparait tout seul apres 4 secondes',
    async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByText('fire-success'));
      expect(screen.getByText('Profil mis à jour !')).toBeTruthy();

      await waitFor(() => expect(screen.queryByText('Profil mis à jour !')).toBeNull(), { timeout: 5000 });
    },
    6000
  );
});
