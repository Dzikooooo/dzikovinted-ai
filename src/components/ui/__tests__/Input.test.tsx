// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { User } from 'lucide-react';
import { Input } from '../Input';

describe('Input', () => {
  it('sans label ni icone ni trailingElement : padding gauche/droit par defaut (pl-4/pr-4)', () => {
    render(<Input data-testid="field" value="" onChange={() => {}} />);
    const el = screen.getByTestId('field');
    expect(el.className).toContain('pl-4');
    expect(el.className).toContain('pr-4');
    expect(el.className).toContain('rounded-xl');
  });

  it('avec label : rend le label associe via htmlFor/id', () => {
    render(<Input id="fullname" label="Nom complet" value="" onChange={() => {}} />);
    const input = screen.getByLabelText('Nom complet');
    expect(input).toBeTruthy();
  });

  it('avec icone : decale le padding gauche (pl-10) et affiche l’icone', () => {
    render(<Input data-testid="field" icon={<User data-testid="icon" />} value="" onChange={() => {}} />);
    expect(screen.getByTestId('field').className).toContain('pl-10');
    expect(screen.getByTestId('icon')).toBeTruthy();
  });

  it('avec trailingElement : decale le padding droit (pr-10) et le rend', async () => {
    const onToggle = vi.fn();
    render(
      <Input
        data-testid="field"
        type="password"
        value=""
        onChange={() => {}}
        trailingElement={<button onClick={onToggle}>afficher</button>}
      />
    );
    expect(screen.getByTestId('field').className).toContain('pr-10');
    const user = userEvent.setup();
    await user.click(screen.getByText('afficher'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('disabled : porte les classes desactivees natives (disabled:*), jamais un style bricole a part', () => {
    render(<Input data-testid="field" disabled value="x" onChange={() => {}} />);
    const el = screen.getByTestId('field') as HTMLInputElement;
    expect(el.disabled).toBe(true);
    expect(el.className).toContain('disabled:cursor-not-allowed');
  });

  it('transmet value/onChange et toute prop HTML supplementaire (placeholder, maxLength...)', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Input value="" onChange={onChange} placeholder="Colle ta clé ici" maxLength={10} />);
    const input = screen.getByPlaceholderText('Colle ta clé ici');
    await user.type(input, 'a');
    expect(onChange).toHaveBeenCalled();
    expect(input.getAttribute('maxlength')).toBe('10');
  });
});
