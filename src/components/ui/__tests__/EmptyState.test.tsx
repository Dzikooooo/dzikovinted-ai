// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

// `bare` ajoute le 2026-08-26 pour la page Communication (etat vide place
// DANS un panneau deja borde -> carte dans une carte). Ce composant est
// utilise par 20 fichiers : le test le plus important ici est celui qui
// verifie que le rendu PAR DEFAUT n'a pas bouge.
describe('EmptyState', () => {
  it('garde sa coquille bordée par défaut -- les 20 usages existants sont inchangés', () => {
    const { container } = render(<EmptyState title="Rien ici" />);
    const root = container.firstElementChild!;

    expect(root.className).toContain('border-dashed');
    expect(root.className).toContain('bg-surface');
    expect(root.className).toContain('rounded-2xl');
  });

  it('retire bordure, fond et gros padding en mode bare', () => {
    const { container } = render(<EmptyState title="Rien ici" bare />);
    const root = container.firstElementChild!;

    expect(root.className).not.toContain('border-dashed');
    expect(root.className).not.toContain('bg-surface');
    expect(root.className).not.toContain('rounded-2xl');
  });

  it('affiche le même contenu dans les deux modes', () => {
    const { rerender } = render(<EmptyState title="Aucun modèle" description="Crée-en un" />);
    expect(screen.getByText('Aucun modèle')).toBeTruthy();
    expect(screen.getByText('Crée-en un')).toBeTruthy();

    rerender(<EmptyState title="Aucun modèle" description="Crée-en un" bare />);
    expect(screen.getByText('Aucun modèle')).toBeTruthy();
    expect(screen.getByText('Crée-en un')).toBeTruthy();
  });
});
