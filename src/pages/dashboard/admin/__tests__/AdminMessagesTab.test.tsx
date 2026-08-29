// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { AdminMessagesTab } from '../AdminMessagesTab';
import type { SupportTicket, TicketMessage } from '../../../../lib/types';

// Meme pattern que SupportTab.test.tsx / TicketDetailModal.test.tsx --
// mock des hooks de donnees, isole la presentation (panneau deux-colonnes).

const setTicketStatus = vi.fn();
const deleteTicket = vi.fn();
let tickets: SupportTicket[] = [];
let messages: TicketMessage[] = [];
let profileRows: { id: string; full_name: string | null; email: string }[] = [];

function makeTicket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id: 't-1',
    user_id: 'u-1',
    subject: 'Sujet du ticket',
    status: 'open',
    min_plan: null,
    created_at: '2026-08-29T00:00:00Z',
    updated_at: '2026-08-29T00:00:00Z',
    ...overrides,
  };
}

vi.mock('../../../../hooks/useSupportTickets', () => ({
  useSupportTickets: () => ({ tickets, loading: false, error: null, setTicketStatus, deleteTicket }),
}));
vi.mock('../../../../hooks/useTicketMessages', () => ({
  useTicketMessages: () => ({ messages, loading: false, error: null, sendMessage: vi.fn() }),
}));
vi.mock('../../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin-1' } }) }));
vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const result = Promise.resolve({ data: profileRows, error: null });
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order']) chain[m] = () => chain;
      Object.assign(chain, { then: result.then.bind(result) });
      return chain;
    },
  },
}));

afterEach(() => {
  cleanup();
  tickets = [];
  messages = [];
  profileRows = [];
  vi.clearAllMocks();
});

describe('AdminMessagesTab -- liste des conversations', () => {
  it("affiche un etat vide honnete quand aucun ticket n'existe", async () => {
    tickets = [];
    render(<AdminMessagesTab />);
    await waitFor(() => expect(screen.getByText('Aucun message')).toBeTruthy());
  });

  it('liste chaque ticket avec le contact identifie par nom + email (jamais un uuid brut)', async () => {
    tickets = [makeTicket({ id: 't-1', user_id: 'u-1', subject: 'Problème de synchro' })];
    profileRows = [{ id: 'u-1', full_name: 'Jean Dupont', email: 'jean@example.com' }];
    render(<AdminMessagesTab />);
    await waitFor(() => expect(screen.getByText('Jean Dupont (jean@example.com)')).toBeTruthy());
    expect(screen.getByText('Problème de synchro')).toBeTruthy();
  });

  it("retombe sur l'email seul quand le contact n'a pas de nom complet", async () => {
    tickets = [makeTicket({ user_id: 'u-2' })];
    profileRows = [{ id: 'u-2', full_name: null, email: 'anon@example.com' }];
    render(<AdminMessagesTab />);
    await waitFor(() => expect(screen.getByText('anon@example.com')).toBeTruthy());
  });

  it("propose un etat d'invite tant qu'aucune conversation n'est selectionnee", async () => {
    tickets = [makeTicket()];
    profileRows = [{ id: 'u-1', full_name: 'Jean Dupont', email: 'jean@example.com' }];
    render(<AdminMessagesTab />);
    await waitFor(() => expect(screen.getByText('Sélectionne une conversation')).toBeTruthy());
  });
});

describe('AdminMessagesTab -- ouverture d\'une conversation', () => {
  it('ouvre le fil de discussion au clic sur une conversation, affiche ses messages', async () => {
    tickets = [makeTicket({ id: 't-1', subject: 'Sujet du ticket' })];
    profileRows = [{ id: 'u-1', full_name: 'Jean Dupont', email: 'jean@example.com' }];
    messages = [
      { id: 'm-1', ticket_id: 't-1', author_id: 'u-1', body: 'Bonjour, un souci', is_admin_reply: false, created_at: '2026-08-29T00:00:00Z' },
    ];
    render(<AdminMessagesTab />);
    await waitFor(() => screen.getByText('Jean Dupont (jean@example.com)'));
    fireEvent.click(screen.getByText('Jean Dupont (jean@example.com)'));
    expect(screen.getByText('Bonjour, un souci')).toBeTruthy();
    // Le contact s'affiche aussi en en-tete du fil (contactLabel), en plus
    // de son entree dans la liste de gauche.
    expect(screen.getAllByText('Jean Dupont (jean@example.com)').length).toBeGreaterThan(1);
  });
});
