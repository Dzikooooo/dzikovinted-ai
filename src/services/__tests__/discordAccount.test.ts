import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Le service lit ses variables d'env au CHARGEMENT du module : chaque cas doit
// donc poser l'environnement voulu AVANT l'import. `vi.resetModules()` +
// import dynamique permettent de re-evaluer le module par test, ce qu'un
// import statique en tete de fichier rendrait impossible.
const invokeMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    auth: { linkIdentity: vi.fn() },
  },
}));

async function loadService(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.stubEnv('VITE_DISCORD_GUILD_ID', env.guildId ?? '');
  vi.stubEnv('VITE_DISCORD_INVITE_URL', env.inviteUrl ?? '');
  vi.stubEnv('VITE_DISCORD_ROLE_SYNC_FUNCTION', env.roleSyncFn ?? '');
  return import('../discordAccount');
}

beforeEach(() => {
  invokeMock.mockReset();
  rpcMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('fetchGuildActivity', () => {
  it("ne tente AUCUN appel reseau et ne fabrique aucun compteur sans guild configuree", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { fetchGuildActivity } = await loadService({});

    const res = await fetchGuildActivity();

    expect(res).toEqual({ status: 'not_configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('remonte le nombre reel de membres en ligne quand le widget repond', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ name: 'Discord ResellOS', presence_count: 42, instant_invite: 'https://discord.gg/abc' }),
      })),
    );
    const { fetchGuildActivity } = await loadService({ guildId: '123' });

    const res = await fetchGuildActivity();

    expect(res).toEqual({
      status: 'ok',
      name: 'Discord ResellOS',
      presenceCount: 42,
      inviteUrl: 'https://discord.gg/abc',
    });
  });

  it("distingue le widget DESACTIVE (403) d'une vraie panne -- les deux n'appellent pas la meme action", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })));
    const { fetchGuildActivity } = await loadService({ guildId: '123' });

    expect(await fetchGuildActivity()).toEqual({ status: 'widget_disabled' });
  });

  it('signale une erreur plutot que de deviner un compteur si la reponse est inattendue', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ name: 'X' }) })));
    const { fetchGuildActivity } = await loadService({ guildId: '123' });

    const res = await fetchGuildActivity();

    expect(res.status).toBe('error');
  });
});

describe('requestDiscordRoleSync', () => {
  const profile = { plan: 'pro', discord_user_id: '999' } as never;

  it("retourne not_linked sans rien appeler quand aucun compte Discord n'est relie", async () => {
    const { requestDiscordRoleSync } = await loadService({ roleSyncFn: 'sync-discord-role' });

    expect(await requestDiscordRoleSync({ plan: 'pro', discord_user_id: null } as never)).toEqual({
      status: 'not_linked',
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("retourne not_configured -- et n'affirme JAMAIS un role accorde -- tant que la fonction serveur n'existe pas", async () => {
    const { requestDiscordRoleSync } = await loadService({});

    expect(await requestDiscordRoleSync(profile)).toEqual({ status: 'not_configured' });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('ne transmet JAMAIS le discord_user_id au serveur -- il doit le relire depuis le JWT', async () => {
    invokeMock.mockResolvedValue({ error: null });
    const { requestDiscordRoleSync } = await loadService({ roleSyncFn: 'sync-discord-role' });

    const res = await requestDiscordRoleSync(profile);

    expect(res).toEqual({ status: 'synced', plan: 'pro' });
    expect(invokeMock).toHaveBeenCalledWith('sync-discord-role', { body: { plan: 'pro' } });
    const sentBody = JSON.stringify(invokeMock.mock.calls[0][1]);
    expect(sentBody).not.toContain('999');
    expect(sentBody).not.toContain('discord_user_id');
  });
});

describe('syncDiscordIdentity / unlinkDiscordAccount', () => {
  it("n'envoie AUCUN parametre a sync_discord_identity : la valeur vient de l'identite OAuth verifiee", async () => {
    rpcMock.mockResolvedValue({ data: { id: 'u1' }, error: null });
    const { syncDiscordIdentity } = await loadService({});

    const res = await syncDiscordIdentity();

    expect(res).toEqual({ ok: true, profile: { id: 'u1' } });
    expect(rpcMock).toHaveBeenCalledWith('sync_discord_identity');
    expect(rpcMock.mock.calls[0]).toHaveLength(1);
  });

  it("remonte le message d'erreur reel plutot qu'un message generique", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Aucun compte Discord relie a cet utilisateur' } });
    const { syncDiscordIdentity } = await loadService({});

    expect(await syncDiscordIdentity()).toEqual({
      ok: false,
      message: 'Aucun compte Discord relie a cet utilisateur',
    });
  });

  it('dissocie sans parametre non plus', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const { unlinkDiscordAccount } = await loadService({});

    expect(await unlinkDiscordAccount()).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith('unlink_discord_account');
  });
});

// ===========================================================================
// ECHEC LIVE 2026-08-27 : le retour du flux linkIdentity() laissait la page
// sur "Lier mon compte Discord", sans erreur visible. GoTrue avale en
// interne 3 codes d'erreur precis (auth-js GoTrueClient.js::_initialize()),
// dont "identity_already_exists" -- jamais remontes a onAuthStateChange.
// Seule une lecture manuelle de l'URL de retour les revele.
// ===========================================================================
describe('readDiscordOAuthErrorFromLocation', () => {
  it('lit error_code/error_description en query string', async () => {
    const { readDiscordOAuthErrorFromLocation } = await loadService({});
    expect(
      readDiscordOAuthErrorFromLocation({
        search: '?error=server_error&error_code=identity_already_exists&error_description=already+linked',
        hash: '',
      })
    ).toEqual({ errorCode: 'identity_already_exists', errorDescription: 'already linked' });
  });

  it('lit les memes cles dans le FRAGMENT (callback implicite)', async () => {
    const { readDiscordOAuthErrorFromLocation } = await loadService({});
    expect(
      readDiscordOAuthErrorFromLocation({ search: '', hash: '#error=access_denied&error_description=user+cancelled' })
    ).toEqual({ errorCode: 'access_denied', errorDescription: 'user cancelled' });
  });

  it("retombe sur 'error' quand 'error_code' est absent", async () => {
    const { readDiscordOAuthErrorFromLocation } = await loadService({});
    expect(readDiscordOAuthErrorFromLocation({ search: '?error=access_denied', hash: '' })).toEqual({
      errorCode: 'access_denied',
      errorDescription: null,
    });
  });

  it('rend null sur une URL de retour propre (cas nominal)', async () => {
    const { readDiscordOAuthErrorFromLocation } = await loadService({});
    expect(readDiscordOAuthErrorFromLocation({ search: '', hash: '' })).toBeNull();
  });

  it('la query string a priorite sur le fragment', async () => {
    const { readDiscordOAuthErrorFromLocation } = await loadService({});
    expect(
      readDiscordOAuthErrorFromLocation({ search: '?error_code=identity_already_exists', hash: '#error_code=access_denied' })
    ).toEqual({ errorCode: 'identity_already_exists', errorDescription: null });
  });
});

describe('translateDiscordOAuthError', () => {
  it('traduit access_denied explicitement', async () => {
    const { translateDiscordOAuthError } = await loadService({});
    expect(translateDiscordOAuthError({ errorCode: 'access_denied', errorDescription: null })).toMatch(/refusée/i);
  });

  it('retombe sur un message generique pour un code inconnu -- jamais le code technique brut', async () => {
    const { translateDiscordOAuthError } = await loadService({});
    const message = translateDiscordOAuthError({ errorCode: 'server_error', errorDescription: 'boom' });
    expect(message).not.toContain('server_error');
    expect(message.length).toBeGreaterThan(0);
  });
});
