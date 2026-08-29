// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from '../Textarea';

describe('Textarea', () => {
  it('meme base visuelle que Input (rounded-xl, focus ring), padding fixe (jamais de variante icone)', () => {
    render(<Textarea data-testid="field" value="" onChange={() => {}} />);
    const el = screen.getByTestId('field');
    expect(el.className).toContain('rounded-xl');
    expect(el.className).toContain('focus:ring-neon-500/20');
    expect(el.className).toContain('px-4');
    expect(el.className).toContain('resize-none');
  });

  it('avec label : rend le label associe via htmlFor/id', () => {
    render(<Textarea id="style" label="Style de titre souhaité" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Style de titre souhaité')).toBeTruthy();
  });

  it('transmet value/onChange et les props HTML (rows, maxLength, placeholder)', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Textarea value="" onChange={onChange} rows={3} maxLength={500} placeholder="Ex : titre court" />);
    const el = screen.getByPlaceholderText('Ex : titre court') as HTMLTextAreaElement;
    expect(el.rows).toBe(3);
    expect(el.maxLength).toBe(500);
    await user.type(el, 'a');
    expect(onChange).toHaveBeenCalled();
  });

  it('disabled : porte les classes desactivees natives', () => {
    render(<Textarea data-testid="field" disabled value="x" onChange={() => {}} />);
    const el = screen.getByTestId('field') as HTMLTextAreaElement;
    expect(el.disabled).toBe(true);
    expect(el.className).toContain('disabled:cursor-not-allowed');
  });
});
