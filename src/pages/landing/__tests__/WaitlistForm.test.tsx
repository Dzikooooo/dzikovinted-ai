// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { WaitlistForm } from '../WaitlistForm';

let insertResult: { error: { code?: string; message?: string } | null } = { error: null };
const insertMock = vi.fn((_row?: unknown) => Promise.resolve(insertResult));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({ insert: (row: unknown) => insertMock(row) }),
  },
}));

afterEach(() => {
  cleanup();
  insertResult = { error: null };
  insertMock.mockClear();
});

describe('WaitlistForm', () => {
  it("soumet l'email normalise (minuscules, sans espaces) vers waitlist_signups", async () => {
    render(<WaitlistForm />);
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: '  Jean@Example.com  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Rejoindre la liste d'attente/ }));

    await waitFor(() => expect(insertMock).toHaveBeenCalledWith({ email: 'jean@example.com' }));
  });

  it('affiche une confirmation apres un envoi reussi', async () => {
    render(<WaitlistForm />);
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: 'jean@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Rejoindre la liste d'attente/ }));

    await waitFor(() => expect(screen.getByText(/Tu es sur la liste/)).toBeTruthy());
  });

  it("un doublon (email deja inscrit, code 23505) affiche la MEME confirmation, jamais une erreur", async () => {
    insertResult = { error: { code: '23505', message: 'duplicate key' } };
    render(<WaitlistForm />);
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: 'jean@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Rejoindre la liste d'attente/ }));

    await waitFor(() => expect(screen.getByText(/Tu es sur la liste/)).toBeTruthy());
    expect(screen.queryByText(/Impossible d'enregistrer/)).toBeNull();
  });

  it('une vraie erreur (hors doublon) affiche un message explicite, sans faire croire a un succes', async () => {
    insertResult = { error: { code: '500', message: 'server error' } };
    render(<WaitlistForm />);
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: 'jean@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Rejoindre la liste d'attente/ }));

    await waitFor(() => expect(screen.getByText(/Impossible d'enregistrer ta demande/)).toBeTruthy());
    expect(screen.queryByText(/Tu es sur la liste/)).toBeNull();
  });

  it('accepte un libelle de bouton personnalise', () => {
    render(<WaitlistForm buttonLabel="Je veux un accès" />);
    expect(screen.getByRole('button', { name: /Je veux un accès/ })).toBeTruthy();
  });
});
