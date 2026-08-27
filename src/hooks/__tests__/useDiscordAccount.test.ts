// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ECHEC LIVE 2026-08-27 : le retour du flux linkIdentity() (redirection
// Discord -> resellosapp.com/dashboard/community) laissait la page sur
// "Lier mon compte Discord", sans erreur visible. Deux causes distinctes,
// couvertes ici :
//
//   1. `user.identities` du cache local (getSession()) peut ne PAS refleter
//      une identite qui vient d'etre liee cote serveur -- il faut retomber
//      sur un appel reseau reel (getUser()) avant de conclure que rien n'est
//      lie.
//   2. GoTrue avale en interne l'erreur "identity_already_exists" (et 2
//      codes voisins) -- jamais remontee a onAuthStateChange. Seule une
//      lecture manuelle de l'URL de retour la revele, et dans ce cas precis
//      on retente la synchro plutot que d'abandonner (l'identite existe
//      probablement deja cote serveur, seule la copie vers `profiles`
//      manque).

const getUserMock = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getUser: (...args: unknown[]) => getUserMock(...args) } },
}));

const syncDiscordIdentityMock = vi.fn();
const fetchGuildActivityMock = vi.fn();
const requestDiscordRoleSyncMock = vi.fn();
vi.mock('../../services/discordAccount', async () => {
  const actual = await vi.importActual<typeof import('../../services/discordAccount')>('../../services/discordAccount');
  return {
    ...actual,
    fetchGuildActivity: (...args: unknown[]) => fetchGuildActivityMock(...args),
    requestDiscordRoleSync: (...args: unknown[]) => requestDiscordRoleSyncMock(...args),
    syncDiscordIdentity: (...args: unknown[]) => syncDiscordIdentityMock(...args),
  };
});

const refreshProfileMock = vi.fn();
let mockUser: { id: string; identities: Array<{ provider: string }> } | null = null;
let mockProfile: { plan: string; discord_user_id: string | null } | null = null;

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, profile: mockProfile, refreshProfile: refreshProfileMock }),
}));

const { useDiscordAccount } = await import('../useDiscordAccount');

function setLocation(search: string, hash: string): void {
  window.history.replaceState({}, '', `${window.location.pathname}${search}${hash}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchGuildActivityMock.mockResolvedValue({ status: 'not_configured' });
  requestDiscordRoleSyncMock.mockResolvedValue({ status: 'not_linked' });
  getUserMock.mockResolvedValue({ data: { user: null }, error: null });
  mockUser = { id: 'u1', identities: [{ provider: 'email' }] };
  mockProfile = { plan: 'free', discord_user_id: null };
  setLocation('', '');
});

afterEach(() => {
  setLocation('', '');
});

describe('useDiscordAccount -- synchronisation au retour du flux OAuth', () => {
  it("tente la synchro quand l'identite discord est deja dans le cache local", async () => {
    mockUser = { id: 'u1', identities: [{ provider: 'email' }, { provider: 'discord' }] };
    syncDiscordIdentityMock.mockResolvedValue({ ok: true, profile: {} });

    renderHook(() => useDiscordAccount());

    await waitFor(() => expect(syncDiscordIdentityMock).toHaveBeenCalledTimes(1));
    expect(getUserMock).not.toHaveBeenCalled();
    expect(refreshProfileMock).toHaveBeenCalledTimes(1);
  });

  it("retombe sur un appel reseau (getUser) quand le cache local ne montre pas encore l'identite", async () => {
    // Le cas exact du bug : la session mise en cache par getSession() est
    // anterieure a la liaison, elle ne contient pas encore 'discord'.
    getUserMock.mockResolvedValue({ data: { user: { identities: [{ provider: 'discord' }] } }, error: null });
    syncDiscordIdentityMock.mockResolvedValue({ ok: true, profile: {} });

    renderHook(() => useDiscordAccount());

    await waitFor(() => expect(getUserMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(syncDiscordIdentityMock).toHaveBeenCalledTimes(1));
  });

  it("ne tente rien si ni le cache ni getUser() ne montrent d'identite discord, et sans erreur dans l'URL", async () => {
    renderHook(() => useDiscordAccount());

    await waitFor(() => expect(getUserMock).toHaveBeenCalledTimes(1));
    expect(syncDiscordIdentityMock).not.toHaveBeenCalled();
  });

  it("retente la synchro sur identity_already_exists dans l'URL, meme sans identite visible", async () => {
    // Le coeur du correctif : GoTrue a avale cette erreur en interne, elle
    // n'apparait QUE dans l'URL de retour -- jamais dans user.identities ni
    // dans un evenement onAuthStateChange.
    setLocation('?error=server_error&error_code=identity_already_exists', '');
    syncDiscordIdentityMock.mockResolvedValue({ ok: true, profile: {} });

    renderHook(() => useDiscordAccount());

    await waitFor(() => expect(syncDiscordIdentityMock).toHaveBeenCalledTimes(1));
  });

  it("nettoie les parametres d'erreur de l'URL une fois traites, pour qu'un F5 ne rejoue pas le meme traitement", async () => {
    setLocation('?error=server_error&error_code=identity_already_exists&error_description=x', '');
    syncDiscordIdentityMock.mockResolvedValue({ ok: true, profile: {} });

    renderHook(() => useDiscordAccount());

    await waitFor(() => expect(syncDiscordIdentityMock).toHaveBeenCalledTimes(1));
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
  });

  it("affiche une erreur honnete pour un code d'erreur OAuth qui n'est PAS identity_already_exists", async () => {
    setLocation('?error=access_denied', '');

    const { result } = renderHook(() => useDiscordAccount());

    await waitFor(() => expect(result.current.error).toMatch(/refusée/i));
    expect(syncDiscordIdentityMock).not.toHaveBeenCalled();
  });

  it('ne tente la synchro qu\'une seule fois meme si le hook se re-rend', async () => {
    mockUser = { id: 'u1', identities: [{ provider: 'discord' }] };
    syncDiscordIdentityMock.mockResolvedValue({ ok: true, profile: {} });

    const { rerender } = renderHook(() => useDiscordAccount());
    await waitFor(() => expect(syncDiscordIdentityMock).toHaveBeenCalledTimes(1));

    rerender();
    rerender();

    expect(syncDiscordIdentityMock).toHaveBeenCalledTimes(1);
  });

  it('ne tente rien tant que le profil ou le user ne sont pas encore charges', () => {
    mockUser = null;
    mockProfile = null;

    renderHook(() => useDiscordAccount());

    expect(syncDiscordIdentityMock).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("ne tente rien si le profil porte deja discord_user_id (deja synchronise)", () => {
    mockUser = { id: 'u1', identities: [{ provider: 'discord' }] };
    mockProfile = { plan: 'pro', discord_user_id: '999' };

    renderHook(() => useDiscordAccount());

    expect(syncDiscordIdentityMock).not.toHaveBeenCalled();
  });

  it('remonte le message reel si la synchro echoue (ex. identite liee a un autre compte)', async () => {
    mockUser = { id: 'u1', identities: [{ provider: 'discord' }] };
    syncDiscordIdentityMock.mockResolvedValue({
      ok: false,
      message: 'Ce compte Discord est deja relie a un autre compte ResellOS',
    });

    const { result } = renderHook(() => useDiscordAccount());

    await waitFor(() => expect(result.current.error).toBe('Ce compte Discord est deja relie a un autre compte ResellOS'));
    expect(refreshProfileMock).not.toHaveBeenCalled();
  });
});
