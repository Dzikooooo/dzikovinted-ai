// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// 2026-08-27 : une fois le compte Discord LIE (isLinked), le bouton doit
// pointer vers le serveur directement plutot que vers l'invitation --
// meilleure experience pour qui l'a deja rejoint (aucune invitation a
// re-accepter). "Lie" et "membre du serveur" restent deux choses
// independantes cote Discord (voir discordGuildChannelsUrl) : ce test
// verrouille le texte ET le href, pas seulement l'un des deux.

const mockDiscordAccount = vi.fn();
vi.mock('../../../../hooks/useDiscordAccount', () => ({
  useDiscordAccount: () => mockDiscordAccount(),
}));

const { DiscordTab } = await import('../DiscordTab');

function baseState(overrides: Partial<ReturnType<typeof mockDiscordAccount>> = {}) {
  return {
    profile: { plan: 'free', discord_user_id: null, discord_username: null },
    isLinked: false,
    activity: { status: 'not_configured' },
    state: 'idle',
    error: null,
    roleSync: null,
    link: vi.fn(),
    unlink: vi.fn(),
    ...overrides,
  };
}

describe('DiscordTab -- lien Rejoindre/Ouvrir le Discord', () => {
  it("affiche 'Rejoindre le Discord' vers l'invitation quand le compte n'est pas lie", () => {
    mockDiscordAccount.mockReturnValue(baseState());
    render(<DiscordTab />);

    const link = screen.getByRole('link', { name: /Rejoindre le Discord/i });
    expect(link.getAttribute('href')).not.toContain('discord.com/channels');
  });

  it("affiche 'Ouvrir le Discord' vers le lien direct du serveur une fois le compte lie", () => {
    mockDiscordAccount.mockReturnValue(
      baseState({
        isLinked: true,
        profile: { plan: 'pro', discord_user_id: '999', discord_username: 'Dziko' },
      })
    );
    render(<DiscordTab />);

    const link = screen.getByRole('link', { name: /Ouvrir le Discord/i });
    expect(link.getAttribute('href')).toContain('discord.com/channels/');
    expect(screen.queryByRole('link', { name: /Rejoindre le Discord/i })).toBeNull();
  });

  it('ouvre le lien dans un nouvel onglet, sans exposer la fenetre appelante', () => {
    mockDiscordAccount.mockReturnValue(baseState({ isLinked: true }));
    render(<DiscordTab />);

    const link = screen.getByRole('link', { name: /Ouvrir le Discord/i });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});
