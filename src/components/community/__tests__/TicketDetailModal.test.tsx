// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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
    render(<TicketDetailModal ticket={TICKET} isAdmin={false} onClose={() => {}} onStatusChange={async () => true} onDelete={async () => true} />);
    expect(screen.getByText('Toi')).toBeTruthy();
  });

  it("etiquette \"Réponse de l'équipe\" un message admin vu par le proprietaire du ticket (jamais 'Toi')", () => {
    messages = [makeMessage({ author_id: 'admin-1', is_admin_reply: true })];
    render(<TicketDetailModal ticket={TICKET} isAdmin={false} onClose={() => {}} onStatusChange={async () => true} onDelete={async () => true} />);
    expect(screen.getByText("Réponse de l'équipe")).toBeTruthy();
    expect(screen.queryByText('Toi')).toBeNull();
  });

  it("etiquette 'Toi (équipe)' quand l'admin relit SA PROPRE reponse passee depuis la file d'attente", () => {
    messages = [makeMessage({ author_id: 'u-1', is_admin_reply: true })];
    render(<TicketDetailModal ticket={TICKET} isAdmin={true} onClose={() => {}} onStatusChange={async () => true} onDelete={async () => true} />);
    expect(screen.getByText('Toi (équipe)')).toBeTruthy();
  });

  it("affiche un horodatage relatif sous chaque message", () => {
    messages = [makeMessage({ created_at: new Date().toISOString() })];
    render(<TicketDetailModal ticket={TICKET} isAdmin={false} onClose={() => {}} onStatusChange={async () => true} onDelete={async () => true} />);
    expect(screen.getByText("À l'instant")).toBeTruthy();
  });
});

// Suppression definitive (demande explicite -- tickets de test/obsoletes),
// reservee a l'admin cote base (policy delete_admin_support_tickets,
// `using (is_admin())`) : le bouton n'est donc rendu que si isAdmin, jamais
// propose a un utilisateur pour qui l'appel echouerait de toute facon.
describe('TicketDetailModal -- suppression du ticket', () => {
  it("n'affiche aucun bouton de suppression pour un utilisateur non-admin", () => {
    render(<TicketDetailModal ticket={TICKET} isAdmin={false} onClose={() => {}} onStatusChange={async () => true} onDelete={async () => true} />);
    expect(screen.queryByLabelText('Supprimer ce ticket')).toBeNull();
  });

  it("affiche le bouton de suppression pour un admin, qui ouvre une modale de confirmation", () => {
    render(<TicketDetailModal ticket={TICKET} isAdmin={true} onClose={() => {}} onStatusChange={async () => true} onDelete={async () => true} />);
    expect(screen.queryByText('Supprimer ce ticket ?')).toBeNull();
    fireEvent.click(screen.getByLabelText('Supprimer ce ticket'));
    expect(screen.getByText('Supprimer ce ticket ?')).toBeTruthy();
  });

  it("n'appelle jamais onDelete tant que la confirmation n'a pas ete cliquee -- 'Annuler' referme sans rien supprimer", () => {
    const onDelete = vi.fn().mockResolvedValue(true);
    render(<TicketDetailModal ticket={TICKET} isAdmin={true} onClose={() => {}} onStatusChange={async () => true} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText('Supprimer ce ticket'));
    fireEvent.click(screen.getByText('Annuler'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('Supprimer ce ticket ?')).toBeNull();
  });

  it("appelle onDelete(ticket.id) puis ferme la modale de detail (onClose) apres une suppression reussie", async () => {
    const onDelete = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<TicketDetailModal ticket={TICKET} isAdmin={true} onClose={onClose} onStatusChange={async () => true} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText('Supprimer ce ticket'));
    fireEvent.click(screen.getByText('Supprimer'));
    await vi.waitFor(() => expect(onDelete).toHaveBeenCalledWith('t-1'));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("referme la confirmation sans fermer la modale de detail (onClose) quand la suppression echoue -- l'erreur reste visible pour reessayer", async () => {
    const onDelete = vi.fn().mockResolvedValue(false);
    const onClose = vi.fn();
    render(<TicketDetailModal ticket={TICKET} isAdmin={true} onClose={onClose} onStatusChange={async () => true} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText('Supprimer ce ticket'));
    fireEvent.click(screen.getByText('Supprimer'));
    // La confirmation se referme (second calque, ne masque plus l'erreur
    // eventuelle de la modale de detail en dessous) mais la modale de
    // detail ELLE-MEME reste ouverte -- onClose n'est jamais appele en echec.
    await vi.waitFor(() => expect(screen.queryByText('Supprimer ce ticket ?')).toBeNull());
    expect(onDelete).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(TICKET.subject)).toBeTruthy();
  });
});
