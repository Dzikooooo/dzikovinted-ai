// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SupportTab } from '../SupportTab';
import type { SupportTicket } from '../../../../lib/types';

// Retour beta (2026-08-27) : "Mes tickets" s'encombrait de tickets clos,
// jamais retires de la liste -- masques par defaut desormais, avec un
// bouton pour les reafficher a la demande. La "File d'attente" admin
// (scope !== 'mine') n'est jamais filtree : un admin doit toujours pouvoir y
// retrouver un ticket deja clos pour verifier son historique.

let isAdmin = false;
const createTicket = vi.fn();
const setTicketStatus = vi.fn();

function makeTicket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id: 't-1',
    user_id: 'u-1',
    subject: 'Sujet',
    status: 'open',
    min_plan: null,
    created_at: '2026-08-27T00:00:00Z',
    updated_at: '2026-08-27T00:00:00Z',
    ...overrides,
  };
}

let tickets: SupportTicket[] = [];

vi.mock('../../../../hooks/useIsAdmin', () => ({ useIsAdmin: () => isAdmin }));
vi.mock('../../../../hooks/useSupportTickets', () => ({
  useSupportTickets: () => ({ tickets, loading: false, error: null, createTicket, setTicketStatus }),
}));
// Isole SupportTab de ses modales -- deja couvertes independamment,
// hors perimetre de ce test (filtrage de liste uniquement).
vi.mock('../../../../components/community/TicketCreateModal', () => ({ TicketCreateModal: () => null }));
vi.mock('../../../../components/community/TicketDetailModal', () => ({ TicketDetailModal: () => null }));

afterEach(() => {
  cleanup();
  tickets = [];
  isAdmin = false;
});

describe('SupportTab -- masquage des tickets clos ("mine")', () => {
  it("masque les tickets clos par defaut", () => {
    // Sujets volontairement distincts des libelles de badge ("Ouvert"/"Clos")
    // pour ne jamais confondre le texte du sujet avec celui du badge de statut.
    tickets = [makeTicket({ id: 'open-1', subject: 'SujetOuvert', status: 'open' }), makeTicket({ id: 'closed-1', subject: 'SujetClos', status: 'closed' })];
    render(<SupportTab />);
    expect(screen.getByText('SujetOuvert')).toBeTruthy();
    expect(screen.queryByText('SujetClos')).toBeNull();
  });

  it("affiche un bouton pour reveler les tickets clos, avec leur nombre", () => {
    tickets = [makeTicket({ id: 'open-1', status: 'open' }), makeTicket({ id: 'closed-1', status: 'closed' }), makeTicket({ id: 'closed-2', status: 'closed' })];
    render(<SupportTab />);
    expect(screen.getByText('Afficher les tickets clos (2)')).toBeTruthy();
  });

  it("revele les tickets clos au clic sur le bouton, puis permet de les remasquer", () => {
    tickets = [makeTicket({ id: 'open-1', subject: 'SujetOuvert', status: 'open' }), makeTicket({ id: 'closed-1', subject: 'SujetClos', status: 'closed' })];
    render(<SupportTab />);
    fireEvent.click(screen.getByText('Afficher les tickets clos (1)'));
    expect(screen.getByText('SujetClos')).toBeTruthy();
    fireEvent.click(screen.getByText('Masquer les tickets clos'));
    expect(screen.queryByText('SujetClos')).toBeNull();
  });

  it("n'affiche aucun bouton de bascule quand il n'y a aucun ticket clos", () => {
    tickets = [makeTicket({ id: 'open-1', status: 'open' })];
    render(<SupportTab />);
    expect(screen.queryByText(/tickets clos/)).toBeNull();
  });

  it("propose de reveler les tickets clos quand TOUS les tickets sont clos (jamais un ecran vide trompeur)", () => {
    tickets = [makeTicket({ id: 'closed-1', status: 'closed' })];
    render(<SupportTab />);
    expect(screen.getByText('Aucun ticket ouvert')).toBeTruthy();
    fireEvent.click(screen.getByText('Afficher les tickets clos'));
    expect(screen.getByText('Sujet')).toBeTruthy();
  });
});

describe('SupportTab -- la "File d\'attente" admin n\'est jamais filtree', () => {
  it("montre les tickets clos sans aucune action -- un admin doit toujours voir l'historique complet", () => {
    isAdmin = true;
    tickets = [makeTicket({ id: 'closed-1', subject: 'ClosVisibleAdmin', status: 'closed' })];
    render(<SupportTab />);
    fireEvent.click(screen.getByText("File d'attente"));
    expect(screen.getByText('ClosVisibleAdmin')).toBeTruthy();
    // Aucun bouton de bascule dans ce scope -- rien a reveler, deja tout visible.
    expect(screen.queryByText(/tickets clos/)).toBeNull();
  });
});
