// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '../Card';

// Composant fondation (Phase 1 "Design irreprochable") -- ces tests figent
// le CONTRAT de classes (rayon, fond, bordure, ombre) plutot que le rendu
// visuel : c'est precisement le risque a couvrir, une regression ici
// romprait la coherence que ce composant existe pour garantir.

describe('Card', () => {
  it('rayon fige a rounded-2xl, padding md et fond surface par defaut', () => {
    render(<Card data-testid="card">contenu</Card>);
    const el = screen.getByTestId('card');
    expect(el.className).toContain('rounded-2xl');
    expect(el.className).toContain('p-5');
    expect(el.className).toContain('bg-surface');
    expect(el.className).not.toContain('bg-surface-alt');
    expect(el.className).toContain('border-gray-200');
  });

  it.each([
    ['sm', 'p-4'],
    ['md', 'p-5'],
    ['lg', 'p-6'],
    ['none', ''],
  ] as const)('padding=%s -> %s', (padding, expectedClass) => {
    render(<Card data-testid="card" padding={padding}>x</Card>);
    const el = screen.getByTestId('card');
    if (expectedClass) expect(el.className).toContain(expectedClass);
    else {
      expect(el.className).not.toContain('p-4');
      expect(el.className).not.toContain('p-5');
      expect(el.className).not.toContain('p-6');
    }
  });

  it("tone='danger' reprend la bordure red-500/20 deja utilisee en zone Danger", () => {
    render(<Card data-testid="card" tone="danger">x</Card>);
    expect(screen.getByTestId('card').className).toContain('border-red-500/20');
  });

  it("background='alt' bascule sur bg-surface-alt (zone secondaire imbriquee)", () => {
    render(<Card data-testid="card" background="alt">x</Card>);
    const el = screen.getByTestId('card');
    expect(el.className).toContain('bg-surface-alt');
  });

  it('interactive ajoute le hover de bordure et le curseur pointer', () => {
    render(<Card data-testid="card" interactive>x</Card>);
    const el = screen.getByTestId('card');
    expect(el.className).toContain('cursor-pointer');
    expect(el.className).toContain('hover:border-neon-500/30');
  });

  it("selected reprend EXACTEMENT bordure + ombre deja en usage sur ListingCard, et supprime le hover (deja selectionnee)", () => {
    render(<Card data-testid="card" interactive selected>x</Card>);
    const el = screen.getByTestId('card');
    expect(el.className).toContain('border-neon-500/60');
    expect(el.className).toContain('shadow-[0_0_0_1px_rgba(124,92,255,0.3),0_20px_50px_rgba(0,0,0,0.35)]');
    expect(el.className).not.toContain('hover:border-neon-500/30');
    expect(el.className).not.toContain('border-gray-200');
  });

  it('sans interactive ni selected, aucune ombre -- Card ne decore jamais sans etat reel derriere', () => {
    render(<Card data-testid="card">x</Card>);
    expect(screen.getByTestId('card').className).not.toContain('shadow-');
  });

  it.each([
    ['quality-ok', 'border-green-500/60'],
    ['quality-warning', 'border-neon-500/60'],
    ['quality-critical', 'border-red-500/60'],
  ] as const)("tone=%s reprend la bordure epaisse (2px) et l'ombre assorties -- casier visuel", (tone, expectedBorder) => {
    render(<Card data-testid="card" tone={tone}>x</Card>);
    const el = screen.getByTestId('card');
    expect(el.className).toContain(expectedBorder);
    expect(el.className).toContain('border-2');
    expect(el.className).toContain('shadow-');
  });

  it('selected reste prioritaire sur un ton qualite -- jamais les deux contours en meme temps', () => {
    render(<Card data-testid="card" tone="quality-critical" selected>x</Card>);
    const el = screen.getByTestId('card');
    expect(el.className).toContain('border-neon-500/60');
    expect(el.className).not.toContain('border-red-500/60');
    expect(el.className).not.toContain('border-2');
  });

  it('className et props HTML supplementaires (onClick, aria-label...) passent tels quels', () => {
    render(
      <Card data-testid="card" className="mt-6" aria-label="ma carte">
        x
      </Card>
    );
    const el = screen.getByTestId('card');
    expect(el.className).toContain('mt-6');
    expect(el.getAttribute('aria-label')).toBe('ma carte');
  });
});
