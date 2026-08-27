// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TicketDetailModal } from '../TicketDetailModal';
import type { SupportTicket, TicketMessage } from '../../../lib/types';

// Retour beta (2026-08-27) : seule la reponse de l'equipe portait un
// libelle -- un message de l'utilisateur restait une bulle nue, ambigue a
// relire ("qui a ecrit ca ?"), proche de l'impression de "s'auto-repondre".
// Ces tests couvrent les libelles attendus pour chaque combinaison
// reellement atteignable (voir le commentaire dans TicketDetailModal.tsx).

const AUTH_USER = { id: 'u-1' };
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: AUTH_USER }) }));

let messages: TicketMessage[] = [];
vi.mock('../../../hooks/useTicketMessages', () => ({
  useTicketMessages: () => ({ messages, loading: false, error: null, sendMessage: vi.fn() }),
}));

function makeMessage(overrides: Partial<TicketMessage> = {}): TicketMessage {
  return {
    id: 'm-1',
    ticket_id: 't-1',
    author_id: 'u-1',
    body: 'Corps du message',
    is_admin_reply: false,
    created_at: '2026-08-27T00:00:00Z',
    ...overrides,
  };
}

const TICKET: SupportTicket = {
  id: 't-1',
  user_id: 'u-1',
  subject: 'Sujet',
  status: 'open',
  min_plan: null,
  created_at: '2026-08-27T00:00:00Z',
  updated_at: '2026-08-27T00:00:00Z',
};

afterEach(() => {
  cleanup();
  messages = [];
});

describe('TicketDetailModal -- libelle explicite sur CHAQUE message', () => {
  it("etiquette 'Toi' le message du proprietaire du ticket dans SA propre vue (non-admin)", () => {
    messages = [makeMessage({ author_id: 'u-1', is_admin_reply: false })];
    render(<TicketDetailModal ticket={TICKET} isAdmin={false} onClose={() => {}} onStatusChange={async () => true} />);
    expect(screen.getByText('Toi')).toBeTruthy();
  });

  it("etiquette \"Réponse de l'équipe\" un message admin vu par le proprietaire du ticket (jamais 'Toi')", () => {
    messages = [makeMessage({ author_id: 'admin-1', is_admin_reply: true })];
    render(<TicketDetailModal ticket={TICKET} isAdmin={false} onClose={() => {}} onStatusChange={async () => true} />);
    expect(screen.getByText("Réponse de l'équipe")).toBeTruthy();
    expect(screen.queryByText('Toi')).toBeNull();
  });

  it("etiquette 'Toi (équipe)' quand l'admin relit SA PROPRE reponse passee depuis la file d'attente", () => {
    messages = [makeMessage({ author_id: 'u-1', is_admin_reply: true })];
    render(<TicketDetailModal ticket={TICKET} isAdmin={true} onClose={() => {}} onStatusChange={async () => true} />);
    expect(screen.getByText('Toi (équipe)')).toBeTruthy();
  });

  it("affiche un horodatage relatif sous chaque message", () => {
    messages = [makeMessage({ created_at: new Date().toISOString() })];
    render(<TicketDetailModal ticket={TICKET} isAdmin={false} onClose={() => {}} onStatusChange={async () => true} />);
    expect(screen.getByText("À l'instant")).toBeTruthy();
  });
});
