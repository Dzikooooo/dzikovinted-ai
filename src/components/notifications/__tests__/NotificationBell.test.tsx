// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NotificationBell } from '../NotificationBell';
import type { AppNotification } from '../../../lib/types';

// Meme pattern que SupportTab.test.tsx (mock du hook de donnees, isolation
// du composant de presentation) -- ici applique a useNotifications.

const markRead = vi.fn();
const markAllRead = vi.fn();
const clearAll = vi.fn();
const requestPermission = vi.fn();
const onNavigate = vi.fn();

let notifications: AppNotification[] = [];
let unread: AppNotification[] = [];
let permission: NotificationPermission = 'default';

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n-1',
    user_id: 'u-1',
    type: 'sale',
    title: 'Vente enregistrée',
    body: '"Pull" vendu pour 20 €.',
    target_page: 'watchlist',
    created_by: null,
    created_at: '2026-08-29T10:00:00Z',
    ...overrides,
  };
}

vi.mock('../../../hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications,
    unread,
    loading: false,
    markRead,
    markAllRead,
    clearAll,
    refresh: vi.fn(),
    permission,
    requestPermission,
  }),
}));

afterEach(() => {
  cleanup();
  notifications = [];
  unread = [];
  permission = 'default';
  vi.clearAllMocks();
});

describe('NotificationBell -- badge et ouverture', () => {
  it("n'affiche aucun badge quand tout est lu", () => {
    notifications = [makeNotification()];
    unread = [];
    render(<NotificationBell onNavigate={onNavigate} />);
    expect(screen.queryByText('1')).toBeNull();
  });

  it('affiche le nombre de notifications non lues sur le badge', () => {
    notifications = [makeNotification({ id: 'n-1' }), makeNotification({ id: 'n-2' })];
    unread = notifications;
    render(<NotificationBell onNavigate={onNavigate} />);
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('plafonne le badge a "9+" au dela de 9 non lues', () => {
    notifications = Array.from({ length: 10 }, (_, i) => makeNotification({ id: `n-${i}` }));
    unread = notifications;
    render(<NotificationBell onNavigate={onNavigate} />);
    expect(screen.getByText('9+')).toBeTruthy();
  });

  it('le tiroir est ferme par defaut, puis s\'ouvre au clic sur la cloche', () => {
    notifications = [makeNotification({ title: 'Vente enregistrée' })];
    render(<NotificationBell onNavigate={onNavigate} />);
    expect(screen.queryByText('Vente enregistrée')).toBeNull();
    fireEvent.click(screen.getByLabelText('Notifications'));
    expect(screen.getByText('Vente enregistrée')).toBeTruthy();
  });

  it('affiche un etat vide honnete quand il n\'y a aucune notification', () => {
    notifications = [];
    render(<NotificationBell onNavigate={onNavigate} />);
    fireEvent.click(screen.getByLabelText('Notifications'));
    expect(screen.getByText('Aucune notification.')).toBeTruthy();
  });
});

describe('NotificationBell -- actions', () => {
  it('cliquer une notification la marque comme lue et navigue vers sa cible', () => {
    const n = makeNotification({ id: 'n-1', title: 'Vente enregistrée', target_page: 'watchlist' });
    notifications = [n];
    unread = [n];
    render(<NotificationBell onNavigate={onNavigate} />);
    fireEvent.click(screen.getByLabelText('Notifications'));
    fireEvent.click(screen.getByText('Vente enregistrée'));
    expect(markRead).toHaveBeenCalledWith('n-1');
    expect(onNavigate).toHaveBeenCalledWith('watchlist');
  });

  it('"Tout marquer comme lu" appelle markAllRead, invisible s\'il n\'y a rien a marquer', () => {
    const n = makeNotification();
    notifications = [n];
    unread = [];
    render(<NotificationBell onNavigate={onNavigate} />);
    fireEvent.click(screen.getByLabelText('Notifications'));
    expect(screen.queryByLabelText('Tout marquer comme lu')).toBeNull();

    cleanup();
    unread = [n];
    render(<NotificationBell onNavigate={onNavigate} />);
    fireEvent.click(screen.getByLabelText('Notifications'));
    fireEvent.click(screen.getByLabelText('Tout marquer comme lu'));
    expect(markAllRead).toHaveBeenCalled();
  });

  it('"Tout effacer" appelle clearAll', () => {
    notifications = [makeNotification()];
    render(<NotificationBell onNavigate={onNavigate} />);
    fireEvent.click(screen.getByLabelText('Notifications'));
    fireEvent.click(screen.getByLabelText('Tout effacer'));
    expect(clearAll).toHaveBeenCalled();
  });
});

describe('NotificationBell -- permission des notifications bureau', () => {
  it('propose d\'activer les notifications bureau quand la permission est encore "default"', () => {
    permission = 'default';
    notifications = [makeNotification()];
    render(<NotificationBell onNavigate={onNavigate} />);
    fireEvent.click(screen.getByLabelText('Notifications'));
    expect(screen.getByText('Activer')).toBeTruthy();
    fireEvent.click(screen.getByText('Activer'));
    expect(requestPermission).toHaveBeenCalled();
  });

  it('ne propose plus rien une fois la permission tranchee (accordee ou refusee)', () => {
    permission = 'granted';
    notifications = [makeNotification()];
    render(<NotificationBell onNavigate={onNavigate} />);
    fireEvent.click(screen.getByLabelText('Notifications'));
    expect(screen.queryByText('Activer')).toBeNull();
  });
});
