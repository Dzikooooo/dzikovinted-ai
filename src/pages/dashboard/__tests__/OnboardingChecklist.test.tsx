// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingChecklist } from '../OnboardingChecklist';

// FTUE minimal (audit 2026-08-28) : la checklist ne doit JAMAIS s'afficher
// une fois les deux etapes reelles franchies -- pas de mecanisme de
// fermeture separe a tester, la condition de disparition EST la logique.

describe('OnboardingChecklist', () => {
  it("ne rend rien une fois compte connecte ET au moins une annonce presente (utilisateur etabli)", () => {
    const { container } = render(
      <OnboardingChecklist hasAccount={true} hasAnyListing={true} onNavigate={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("etape 1 non cochee : propose de connecter le compte Vinted", () => {
    render(<OnboardingChecklist hasAccount={false} hasAnyListing={false} onNavigate={vi.fn()} />);
    expect(screen.getByText('Connecte ton compte Vinted')).toBeTruthy();
    expect(screen.getByText('Connecter')).toBeTruthy();
  });

  it("cliquer 'Connecter' navigue vers vinted-account", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<OnboardingChecklist hasAccount={false} hasAnyListing={false} onNavigate={onNavigate} />);

    await user.click(screen.getByText('Connecter'));

    expect(onNavigate).toHaveBeenCalledWith('vinted-account');
  });

  it("compte connecte mais aucune annonce : propose synchroniser ET generer avec l'IA", () => {
    render(<OnboardingChecklist hasAccount={true} hasAnyListing={false} onNavigate={vi.fn()} />);

    expect(screen.getByText('Connecte ton compte Vinted').className).toContain('line-through');
    expect(screen.getByText('Synchroniser')).toBeTruthy();
    expect(screen.getByText("Générer avec l'IA")).toBeTruthy();
  });

  it("aucun compte : le bouton Synchroniser est absent, seul Générer avec l'IA reste possible", () => {
    render(<OnboardingChecklist hasAccount={false} hasAnyListing={false} onNavigate={vi.fn()} />);

    expect(screen.queryByText('Synchroniser')).toBeNull();
    expect(screen.getByText("Générer avec l'IA")).toBeTruthy();
  });

  it("cliquer 'Générer avec l'IA' navigue vers generator, sans dependre de l'etat du compte", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<OnboardingChecklist hasAccount={true} hasAnyListing={false} onNavigate={onNavigate} />);

    await user.click(screen.getByText("Générer avec l'IA"));

    expect(onNavigate).toHaveBeenCalledWith('generator');
  });

  it("etape 1 cochee seule (compte connecte, pas encore d'annonce) : reste affichee tant que l'etape 2 n'est pas franchie", () => {
    render(<OnboardingChecklist hasAccount={true} hasAnyListing={false} onNavigate={vi.fn()} />);
    expect(screen.getByText('Récupère tes premières annonces')).toBeTruthy();
  });
});
