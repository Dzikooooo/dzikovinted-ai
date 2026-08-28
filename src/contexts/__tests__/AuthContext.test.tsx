// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../AuthContext';
import { translateAuthError } from '../../lib/errorMessages';

// Filet de securite pour AuthContext.tsx (audit 2026-08-28) : jusqu'ici zero
// test alors que EXTENSION.md documente un incident reel autour de la
// gestion de session (voir extension/README.md, "Piege rencontre en test
// live" -- signOut()/setSession() sans option explicite). Ce fichier ne
// couvre que le cote APP WEB (ce fichier-ci) : le comportement propre a
// l'extension (session self-managed, chrome.storage.local) a son propre
// contexte et n'est pas concerne par ces tests.

type AuthStateCallback = (event: string, session: unknown) => void;

let authStateCallback: AuthStateCallback | null = null;
let sessionOnMount: { user: { id: string; email: string } } | null = null;
let profileRow: Record<string, unknown> | null = null;

// vi.mock() est hissé en tête de fichier -- toute valeur qu'il referme
// dessus doit passer par vi.hoisted() (sinon TDZ : "Cannot access before
// initialization"), contrairement aux `let` primitifs ci-dessus qui n'ont
// besoin que d'exister au moment de l'EXECUTION du mock, pas de sa
// definition.
const { authMock, channelMock, unsubscribeMock } = vi.hoisted(() => {
  const unsubscribeMock = vi.fn();
  return {
    unsubscribeMock,
    authMock: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(() => Promise.resolve()),
      resetPasswordForEmail: vi.fn(),
    },
    channelMock: { on: vi.fn(), subscribe: vi.fn() },
  };
});
channelMock.on.mockReturnValue(channelMock);
channelMock.subscribe.mockReturnValue(channelMock);

// Meme pattern eprouve que VintedAccountFilterContext.test.tsx : `then` lie
// au `.then` d'une vraie Promise plutot qu'un resolveur fait main.
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: authMock,
    from: () => {
      const result = Promise.resolve({ data: profileRow });
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq']) chain[m] = () => chain;
      chain.maybeSingle = () => result;
      return chain;
    },
    channel: () => channelMock,
    removeChannel: vi.fn(),
  },
}));

function Probe() {
  const { user, profile, loading, bannedNotice, passwordRecovery, clearPasswordRecovery, signIn, signUp, signOut } = useAuth();
  return (
    <div>
      <p>loading:{String(loading)}</p>
      <p>user:{user?.id ?? 'none'}</p>
      <p>profile:{profile?.full_name ?? 'none'}</p>
      <p>banned:{String(bannedNotice)}</p>
      <p>recovery:{String(passwordRecovery)}</p>
      <button onClick={clearPasswordRecovery}>clear-recovery</button>
      <button onClick={() => void signIn('a@b.com', 'pw')}>sign-in</button>
      <button onClick={() => void signUp('a@b.com', 'pw', 'Alexis')}>sign-up</button>
      <button onClick={() => void signOut()}>sign-out</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

beforeEach(() => {
  authStateCallback = null;
  sessionOnMount = null;
  profileRow = null;
  vi.clearAllMocks();
  // clearAllMocks() efface aussi les implementations (mockImplementation) --
  // celles qui doivent survivre a chaque test sont re-declarees ici.
  authMock.getSession.mockImplementation(() => Promise.resolve({ data: { session: sessionOnMount } }));
  authMock.onAuthStateChange.mockImplementation((cb: AuthStateCallback) => {
    authStateCallback = cb;
    return { data: { subscription: { unsubscribe: unsubscribeMock } } };
  });
  authMock.signOut.mockImplementation(() => Promise.resolve());
  channelMock.on.mockReturnValue(channelMock);
  channelMock.subscribe.mockReturnValue(channelMock);
});

describe('AuthProvider -- montage initial', () => {
  it('demarre en chargement puis se stabilise sans session (aucun utilisateur)', async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByText('loading:false')).toBeTruthy());
    expect(screen.getByText('user:none')).toBeTruthy();
    expect(screen.getByText('profile:none')).toBeTruthy();
  });

  it('avec une session existante, charge le user ET son profil avant de sortir du chargement', async () => {
    sessionOnMount = { user: { id: 'u1', email: 'a@b.com' } };
    profileRow = { id: 'u1', full_name: 'Alexis', banned: false };

    renderWithProvider();

    await waitFor(() => expect(screen.getByText('loading:false')).toBeTruthy());
    expect(screen.getByText('user:u1')).toBeTruthy();
    expect(screen.getByText('profile:Alexis')).toBeTruthy();
  });

  it("useAuth() hors AuthProvider leve une erreur explicite plutot qu'un crash silencieux", () => {
    function Bare() {
      useAuth();
      return null;
    }
    expect(() => render(<Bare />)).toThrow('useAuth must be used within AuthProvider');
  });
});

describe('AuthProvider -- profil banni (P1, deconnexion immediate)', () => {
  it('un profil banni force la deconnexion et signale bannedNotice, sans jamais exposer user/profile', async () => {
    sessionOnMount = { user: { id: 'u1', email: 'a@b.com' } };
    profileRow = { id: 'u1', full_name: 'Alexis', banned: true };

    renderWithProvider();

    await waitFor(() => expect(screen.getByText('banned:true')).toBeTruthy());
    expect(authMock.signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByText('user:none')).toBeTruthy();
    expect(screen.getByText('profile:none')).toBeTruthy();
  });
});

describe("AuthProvider -- evenements onAuthStateChange", () => {
  it('PASSWORD_RECOVERY passe passwordRecovery a true, clearPasswordRecovery le remet a false', async () => {
    const user = userEvent.setup();
    renderWithProvider();
    await waitFor(() => expect(screen.getByText('loading:false')).toBeTruthy());

    expect(authStateCallback).not.toBeNull();
    authStateCallback!('PASSWORD_RECOVERY', { user: { id: 'u2' } });

    await waitFor(() => expect(screen.getByText('recovery:true')).toBeTruthy());
    await user.click(screen.getByText('clear-recovery'));
    await waitFor(() => expect(screen.getByText('recovery:false')).toBeTruthy());
  });

  it('un evenement sans session (deconnexion externe) efface le profil affiche', async () => {
    sessionOnMount = { user: { id: 'u1', email: 'a@b.com' } };
    profileRow = { id: 'u1', full_name: 'Alexis', banned: false };
    renderWithProvider();
    await waitFor(() => expect(screen.getByText('profile:Alexis')).toBeTruthy());

    authStateCallback!('SIGNED_OUT', null);

    await waitFor(() => expect(screen.getByText('user:none')).toBeTruthy());
    expect(screen.getByText('profile:none')).toBeTruthy();
  });
});

describe('AuthProvider -- signIn/signUp/signOut', () => {
  it('signIn reussi peuple user ET profil', async () => {
    const user = userEvent.setup();
    authMock.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u3', email: 'c@d.com' }, session: { user: { id: 'u3' } } },
      error: null,
    });
    profileRow = { id: 'u3', full_name: 'Nouveau', banned: false };

    renderWithProvider();
    await waitFor(() => expect(screen.getByText('loading:false')).toBeTruthy());
    await user.click(screen.getByText('sign-in'));

    await waitFor(() => expect(screen.getByText('profile:Nouveau')).toBeTruthy());
  });

  it('signIn en erreur traduit le message Supabase (translateAuthError) et ne pose jamais de session', async () => {
    const user = userEvent.setup();
    authMock.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    let capturedError: string | null = 'not-called';
    function Consumer() {
      const { signIn, user: u } = useAuth();
      return (
        <div>
          <p>user:{u?.id ?? 'none'}</p>
          <button
            onClick={async () => {
              const { error } = await signIn('a@b.com', 'wrong');
              capturedError = error;
            }}
          >
            go
          </button>
        </div>
      );
    }
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await user.click(screen.getByText('go'));

    await waitFor(() => expect(capturedError).toBe(translateAuthError('Invalid login credentials')));
    expect(screen.getByText('user:none')).toBeTruthy();
  });

  it("signUp sans session retournee (confirmation email requise) ne pose pas de session", async () => {
    authMock.signUp.mockResolvedValue({
      data: { user: { id: 'u4' }, session: null },
      error: null,
    });

    let result: { error: string | null; confirmEmail: boolean } | null = null;
    function Consumer() {
      const { signUp } = useAuth();
      return (
        <button
          onClick={async () => {
            result = await signUp('a@b.com', 'pw', 'Alexis');
          }}
        >
          go
        </button>
      );
    }
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await user.click(screen.getByText('go'));

    await waitFor(() => expect(result).toEqual({ error: null, confirmEmail: true }));
  });

  it('signOut efface user/session/profil localement', async () => {
    sessionOnMount = { user: { id: 'u1', email: 'a@b.com' } };
    profileRow = { id: 'u1', full_name: 'Alexis', banned: false };
    const user = userEvent.setup();

    renderWithProvider();
    await waitFor(() => expect(screen.getByText('profile:Alexis')).toBeTruthy());

    await user.click(screen.getByText('sign-out'));

    await waitFor(() => expect(screen.getByText('user:none')).toBeTruthy());
    expect(screen.getByText('profile:none')).toBeTruthy();
    expect(authMock.signOut).toHaveBeenCalledTimes(1);
  });
});

afterEach(() => {
  authStateCallback = null;
});
