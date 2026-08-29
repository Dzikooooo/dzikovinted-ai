// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toast } from '../Toast';

describe('Toast', () => {
  it.each([
    ['success', 'text-green-700'],
    ['error', 'text-red-600'],
    ['info', 'text-gray-700'],
  ] as const)('tone=%s -> %s (palette deja auditee, jamais une nouvelle teinte)', (tone, expectedText) => {
    render(<Toast tone={tone} onDismiss={() => {}}>message</Toast>);
    expect(screen.getByText('message').className).toContain(expectedText);
  });

  it('role="status", jamais "alert" -- une confirmation ephemere ne doit pas interrompre un lecteur d’ecran', () => {
    render(<Toast tone="success" onDismiss={() => {}}>Enregistré</Toast>);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('affiche le message fourni', () => {
    render(<Toast tone="info" onDismiss={() => {}}>Synchronisation en cours</Toast>);
    expect(screen.getByText('Synchronisation en cours')).toBeTruthy();
  });

  it('le bouton de fermeture appelle onDismiss', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<Toast tone="error" onDismiss={onDismiss}>Échec</Toast>);

    await user.click(screen.getByLabelText('Fermer la notification'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
