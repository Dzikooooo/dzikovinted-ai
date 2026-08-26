// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Les 7 vues enfants ouvrent chacune leurs propres requetes Supabase au
// montage. Elles sont remplacees par des marqueurs inertes : ce test porte sur
// la NAVIGATION (quels piliers existent, lequel est actif, quelle vue est
// montee), pas sur le contenu de chaque vue -- deja couvert ailleurs.
// Consequence directement utile : il verifie aussi qu'aucune vue non
// souhaitee n'est montee, ce qu'un test de contenu ne dirait pas.
vi.mock('../community/DiscordTab', () => ({ DiscordTab: () => <div data-testid="vue-discord" /> }));
vi.mock('../community/ChangelogTab', () => ({ ChangelogTab: () => <div data-testid="vue-changelog" /> }));
vi.mock('../community/RoadmapTab', () => ({ RoadmapTab: () => <div data-testid="vue-roadmap" /> }));
vi.mock('../community/SuggestionsTab', () => ({ SuggestionsTab: () => <div data-testid="vue-suggestions" /> }));
vi.mock('../community/GuidesTab', () => ({ GuidesTab: () => <div data-testid="vue-guides" /> }));
vi.mock('../community/FaqTab', () => ({ FaqTab: () => <div data-testid="vue-faq" /> }));
vi.mock('../community/SupportTab', () => ({ SupportTab: () => <div data-testid="vue-support" /> }));

import CommunityPage from '../CommunityPage';

describe('CommunityPage -- 4 piliers', () => {
  it('expose exactement 4 onglets, et UNE seule barre de navigation', () => {
    render(<CommunityPage />);

    const tablists = screen.getAllByRole('tablist');
    // Le defaut corrige par cette refonte : deux navigations superposees.
    expect(tablists).toHaveLength(1);

    const tabs = within(tablists[0]).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent?.split('\n')[0])).toEqual([
      expect.stringContaining('Discord'),
      expect.stringContaining('Nouveautés & Roadmap'),
      expect.stringContaining('Guides & FAQ'),
      expect.stringContaining('Support'),
    ]);
  });

  it.each(['Tutoriels', 'Ressources', 'Sondages', 'Newsletter'])(
    "n'expose plus l'onglet retire %s",
    (label) => {
      render(<CommunityPage />);
      expect(screen.queryByRole('tab', { name: new RegExp(label, 'i') })).toBeNull();
    },
  );

  it('ouvre sur Discord et ne monte que cette vue', () => {
    render(<CommunityPage />);

    expect(screen.getByTestId('vue-discord')).toBeTruthy();
    expect(screen.queryByTestId('vue-changelog')).toBeNull();
    expect(screen.queryByTestId('vue-support')).toBeNull();
  });

  it('bascule sur "Nouveautés & Roadmap" et y empile changelog + roadmap + suggestions', async () => {
    const user = userEvent.setup();
    render(<CommunityPage />);

    await user.click(screen.getByRole('tab', { name: /Nouveautés & Roadmap/i }));

    expect(screen.getByTestId('vue-changelog')).toBeTruthy();
    expect(screen.getByTestId('vue-roadmap')).toBeTruthy();
    expect(screen.getByTestId('vue-suggestions')).toBeTruthy();
    // Rendu conditionnel STRICT : la vue precedente est demontee, jamais
    // seulement masquee (plusieurs de ces vues portent des requetes).
    expect(screen.queryByTestId('vue-discord')).toBeNull();
  });

  it('bascule sur "Guides & FAQ" et y empile guides + FAQ', async () => {
    const user = userEvent.setup();
    render(<CommunityPage />);

    await user.click(screen.getByRole('tab', { name: /Guides & FAQ/i }));

    expect(screen.getByTestId('vue-guides')).toBeTruthy();
    expect(screen.getByTestId('vue-faq')).toBeTruthy();
    expect(screen.queryByTestId('vue-discord')).toBeNull();
  });

  it("marque l'onglet actif via aria-selected -- un lecteur d'ecran doit pouvoir le dire", async () => {
    const user = userEvent.setup();
    render(<CommunityPage />);

    const discord = screen.getByRole('tab', { name: /Discord/i });
    const support = screen.getByRole('tab', { name: /Support/i });
    expect(discord.getAttribute('aria-selected')).toBe('true');
    expect(support.getAttribute('aria-selected')).toBe('false');

    await user.click(support);

    expect(support.getAttribute('aria-selected')).toBe('true');
    expect(discord.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('vue-support')).toBeTruthy();
  });

  it('respecte initialTab', () => {
    render(<CommunityPage initialTab="support" />);

    expect(screen.getByTestId('vue-support')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Support/i }).getAttribute('aria-selected')).toBe('true');
  });
});
