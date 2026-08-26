// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimePicker } from '../DatePicker';

// Le selecteur d'heure etait fait de deux <select> natifs, dont le menu
// debordait par-dessus les photos de la modale de republication. La liste est
// reconstruite DANS le document pour pouvoir etre plafonnee et rognee -- ce
// qu'aucune regle CSS ne peut faire sur un menu natif, dessine par l'OS.
//
// Ces tests verrouillent les deux choses qu'on risque de perdre en quittant
// le natif : le plafond/defilement demandes, et le clavier qui venait gratuit
// avec un <select>.

describe('TimePicker -- menu contenu dans le document', () => {
  it('rend un vrai listbox, pas un select natif dont le menu echappe a la page', async () => {
    const user = userEvent.setup();
    render(<TimePicker value={null} onChange={vi.fn()} />);

    expect(screen.queryByRole('combobox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Heure' }));
    expect(screen.getByRole('listbox', { name: 'Heure' })).toBeTruthy();
  });

  it('plafonne la hauteur du menu et le rend defilant', async () => {
    const user = userEvent.setup();
    render(<TimePicker value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Heure' }));
    const list = screen.getByRole('listbox', { name: 'Heure' });
    // 24 heures ne peuvent pas s'afficher d'un bloc sans recouvrir la modale.
    expect(list.className).toContain('max-h-40');
    expect(list.className).toContain('overflow-y-auto');
  });

  it("s'ouvre vers le haut : le champ est en bas d'une modale deja haute", async () => {
    const user = userEvent.setup();
    render(<TimePicker value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Minutes' }));
    expect(screen.getByRole('listbox', { name: 'Minutes' }).className).toContain('bottom-full');
  });

  it('propose les 24 heures et les minutes par pas de 5', async () => {
    const user = userEvent.setup();
    render(<TimePicker value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Heure' }));
    expect(within(screen.getByRole('listbox', { name: 'Heure' })).getAllByRole('option')).toHaveLength(24);

    await user.click(screen.getByRole('button', { name: 'Minutes' }));
    expect(within(screen.getByRole('listbox', { name: 'Minutes' })).getAllByRole('option')).toHaveLength(12);
  });
});

describe('TimePicker -- selection', () => {
  it('compose HH:mm en conservant la partie deja choisie', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimePicker value="19:30" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Heure' }));
    await user.click(within(screen.getByRole('listbox', { name: 'Heure' })).getByRole('option', { name: '08' }));

    expect(onChange).toHaveBeenCalledWith('08:30');
  });

  it('complete par 00 quand la minute n\'a pas encore ete choisie', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimePicker value={null} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Heure' }));
    await user.click(within(screen.getByRole('listbox', { name: 'Heure' })).getByRole('option', { name: '14' }));

    expect(onChange).toHaveBeenCalledWith('14:00');
  });

  it('affiche le placeholder tant que rien n\'est choisi', () => {
    render(<TimePicker value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Heure' })).toHaveTextContent('HH');
    expect(screen.getByRole('button', { name: 'Minutes' })).toHaveTextContent('MM');
  });

  it('marque la valeur courante comme selectionnee', async () => {
    const user = userEvent.setup();
    render(<TimePicker value="19:30" onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Heure' }));
    const selected = within(screen.getByRole('listbox', { name: 'Heure' })).getByRole('option', { selected: true });
    expect(selected).toHaveTextContent('19');
  });

  it('referme le menu apres un choix', async () => {
    const user = userEvent.setup();
    render(<TimePicker value="19:30" onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Heure' }));
    await user.click(within(screen.getByRole('listbox', { name: 'Heure' })).getByRole('option', { name: '08' }));

    expect(screen.queryByRole('listbox', { name: 'Heure' })).toBeNull();
  });
});

describe('TimePicker -- clavier', () => {
  it('se ferme avec Echap', async () => {
    const user = userEvent.setup();
    render(<TimePicker value="19:30" onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Heure' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox', { name: 'Heure' })).toBeNull();
  });

  it('parcourt les options aux fleches une fois ouvert', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimePicker value="19:30" onChange={onChange} />);

    const trigger = screen.getByRole('button', { name: 'Heure' });
    trigger.focus();
    await user.keyboard('{ArrowDown}'); // ouvre
    await user.keyboard('{ArrowDown}'); // 19 -> 20

    expect(onChange).toHaveBeenLastCalledWith('20:30');
  });

  it('ne deborde pas au-dela de la premiere et de la derniere option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimePicker value="00:00" onChange={onChange} />);

    const trigger = screen.getByRole('button', { name: 'Heure' });
    trigger.focus();
    await user.keyboard('{ArrowDown}'); // ouvre
    onChange.mockClear();
    await user.keyboard('{ArrowUp}'); // deja a 00, rien au-dessus

    expect(onChange).not.toHaveBeenCalled();
  });
});
