// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { AdminWaitlistTab } from '../AdminWaitlistTab';
import type { WaitlistSignup } from '../../../../lib/types';
import type { ApproveWaitlistEmailResult } from '../../../../lib/waitlistAdminService';

// Meme pattern que AdminMessagesTab.test.tsx -- mock chainable de supabase,
// isole la presentation (chargement/recherche/actions) du reseau reel.
// approveWaitlistEmail (edge function approve-waitlist-email, 2026-08-30)
// est mocke separement de supabase.rpc : "Approuver" ne passe plus par un
// appel RPC direct depuis ce composant, seul "Rejeter" y reste (voir
// AdminWaitlistTab.tsx).

let rows: WaitlistSignup[] = [];
// vi.hoisted (et non un simple const) : les factories de vi.mock ci-dessous
// sont hoistees par Vitest AU-DESSUS de ce fichier -- un const normal
// referme ici declencherait "Cannot access before initialization".
const { rpc, approveWaitlistEmail } = vi.hoisted(() => ({
  rpc: vi.fn((..._args: unknown[]) => Promise.resolve({ error: null })),
  approveWaitlistEmail: vi.fn((_email: string): Promise<ApproveWaitlistEmailResult> => Promise.resolve({ email_sent: true })),
}));

function makeRow(overrides: Partial<WaitlistSignup> = {}): WaitlistSignup {
  return {
    id: 'w-1',
    email: 'test@example.com',
    created_at: '2026-08-30T00:00:00Z',
    status: 'pending',
    approved_at: null,
    approved_by: null,
    notes: null,
    ...overrides,
  };
}

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const result = Promise.resolve({ data: rows, error: null });
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'order']) chain[m] = () => chain;
      Object.assign(chain, { then: result.then.bind(result) });
      return chain;
    },
    rpc,
  },
}));

vi.mock('../../../../lib/waitlistAdminService', () => ({ approveWaitlistEmail }));

afterEach(() => {
  cleanup();
  rows = [];
  rpc.mockClear();
  approveWaitlistEmail.mockClear();
  approveWaitlistEmail.mockResolvedValue({ email_sent: true });
});

describe('AdminWaitlistTab -- liste des demandes', () => {
  it("affiche un etat vide honnete quand aucune demande n'existe", async () => {
    rows = [];
    render(<AdminWaitlistTab />);
    await waitFor(() => expect(screen.getByText('Aucune demande pour le moment.')).toBeTruthy());
  });

  it('liste chaque demande avec son email et son statut', async () => {
    rows = [makeRow({ email: 'jean@example.com', status: 'pending' })];
    render(<AdminWaitlistTab />);
    await waitFor(() => expect(screen.getByText('jean@example.com')).toBeTruthy());
    expect(screen.getByText('En attente')).toBeTruthy();
  });

  it('compte separement "en attente" et le total', async () => {
    rows = [makeRow({ email: 'a@x.com', status: 'pending' }), makeRow({ id: 'w-2', email: 'b@x.com', status: 'approved' })];
    render(<AdminWaitlistTab />);
    await waitFor(() => expect(screen.getByText('1 en attente · 2 au total')).toBeTruthy());
  });
});

describe('AdminWaitlistTab -- actions', () => {
  it('Approuver appelle approveWaitlistEmail (edge function, envoie aussi le mail) avec le bon email', async () => {
    rows = [makeRow({ email: 'jean@example.com', status: 'pending' })];
    render(<AdminWaitlistTab />);
    await waitFor(() => screen.getByText('jean@example.com'));

    fireEvent.click(screen.getByRole('button', { name: 'Approuver' }));

    await waitFor(() => expect(approveWaitlistEmail).toHaveBeenCalledWith('jean@example.com'));
  });

  it("email non envoye (Resend pas configure) -> notice douce, jamais une erreur (l'acces est deja ouvert)", async () => {
    approveWaitlistEmail.mockResolvedValueOnce({ email_sent: false, reason: 'resend_not_configured' });
    rows = [makeRow({ email: 'jean@example.com', status: 'pending' })];
    render(<AdminWaitlistTab />);
    await waitFor(() => screen.getByText('jean@example.com'));

    fireEvent.click(screen.getByRole('button', { name: 'Approuver' }));

    await waitFor(() => expect(screen.getByText(/Resend n'est pas encore configuré/)).toBeTruthy());
  });

  it('Rejeter appelle admin_reject_waitlist_email avec le bon email', async () => {
    rows = [makeRow({ email: 'jean@example.com', status: 'pending' })];
    render(<AdminWaitlistTab />);
    await waitFor(() => screen.getByText('jean@example.com'));

    fireEvent.click(screen.getByRole('button', { name: 'Rejeter' }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_reject_waitlist_email', { p_email: 'jean@example.com' })
    );
  });

  it("une demande deja approuvee ne propose plus le bouton Approuver, seulement Rejeter", async () => {
    rows = [makeRow({ email: 'jean@example.com', status: 'approved' })];
    render(<AdminWaitlistTab />);
    await waitFor(() => screen.getByText('jean@example.com'));

    expect(screen.queryByRole('button', { name: 'Approuver' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Rejeter' })).toBeTruthy();
  });

  it("le champ d'autorisation directe appelle approveWaitlistEmail meme pour un email hors liste", async () => {
    rows = [];
    render(<AdminWaitlistTab />);
    await waitFor(() => screen.getByText('Aucune demande pour le moment.'));

    fireEvent.change(screen.getByPlaceholderText('email@exemple.com'), { target: { value: 'preapprove@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Autoriser' }));

    await waitFor(() => expect(approveWaitlistEmail).toHaveBeenCalledWith('preapprove@example.com'));
  });
});
