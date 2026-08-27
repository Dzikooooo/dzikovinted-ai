// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VintedAccount } from '../../../lib/types';

// Retouches 2026-08-26 du selecteur de compte de la sidebar. Ce fichier couvre
// ce qui pourrait regresser sans se voir : la selection portee par autre chose
// que la couleur du libelle, et les libelles reellement lisibles.

function makeAccount(over: Partial<VintedAccount> = {}): VintedAccount {
  return {
    id: 'acc-1',
    user_id: 'u1',
    label: 'dziko0737',
    vinted_user_id: 'v-1',
    vinted_username: 'dziko0737',
    connected: true,
    last_synced_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    listings_synced_at: null,
    last_error: null,
    is_default: true,
    created_at: new Date().toISOString(),
    ...over,
  };
}

let accountsFixture: VintedAccount[] = [];
let selectedIdFixture = 'all';
const selectAccountMock = vi.fn();

vi.mock('../../../contexts/VintedAccountFilterContext', () => ({
  useVintedAccountFilter: () => ({
    accounts: accountsFixture,
    selectedAccountId: selectedIdFixture,
    selectedAccount: accountsFixture.find((a) => a.id === selectedIdFixture) ?? null,
    selectAccount: selectAccountMock,
  }),
}));

import AccountSwitcher from '../AccountSwitcher';

beforeEach(() => {
  accountsFixture = [
    makeAccount(),
    makeAccount({ id: 'acc-2', label: 'compte2', vinted_user_id: 'v-2', is_default: false, connected: false }),
  ];
  selectedIdFixture = 'all';
  selectAccountMock.mockReset();
});

describe('AccountSwitcher -- declencheur', () => {
  it('se presente comme un vrai controle (aria-haspopup/aria-expanded qui bascule)', async () => {
    const user = userEvent.setup();
    render(<AccountSwitcher onManageAccounts={() => {}} />);

    const trigger = screen.getByRole('button', { name: /Tous les comptes/i });
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('resume la vue globale sous le libelle', () => {
    render(<AccountSwitcher onManageAccounts={() => {}} />);

    expect(screen.getByText(/2 comptes · Vue globale/)).toBeTruthy();
  });

  it("affiche statut ET date du compte quand un compte precis est actif", () => {
    selectedIdFixture = 'acc-1';
    render(<AccountSwitcher onManageAccounts={() => {}} />);

    expect(screen.getByText(/Connecté · Il y a 4h/)).toBeTruthy();
  });

  it('ne rend rien tant qu\'aucun compte Vinted n\'existe', () => {
    accountsFixture = [];
    const { container } = render(<AccountSwitcher onManageAccounts={() => {}} />);

    expect(container.firstChild).toBeNull();
  });
});

describe('AccountSwitcher -- popover', () => {
  it('expose une liste d\'options, avec la selection marquee par aria-selected (jamais par la seule couleur)', async () => {
    const user = userEvent.setup();
    render(<AccountSwitcher onManageAccounts={() => {}} />);

    await user.click(screen.getByRole('button', { name: /Tous les comptes/i }));

    const listbox = screen.getByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    // "Tous les comptes" + les 2 comptes
    expect(options).toHaveLength(3);
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[1].getAttribute('aria-selected')).toBe('false');
  });

  it('donne un sous-texte explicite a "Tous les comptes"', async () => {
    const user = userEvent.setup();
    render(<AccountSwitcher onManageAccounts={() => {}} />);

    await user.click(screen.getByRole('button', { name: /Tous les comptes/i }));

    expect(screen.getByText("Vue globale de l'activité")).toBeTruthy();
  });

  it('affiche statut et derniere synchro pour chaque compte', async () => {
    const user = userEvent.setup();
    render(<AccountSwitcher onManageAccounts={() => {}} />);

    await user.click(screen.getByRole('button', { name: /Tous les comptes/i }));

    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText(/Connecté · Il y a 4h/)).toBeTruthy();
    expect(within(listbox).getByText(/Déconnecté · Il y a 4h/)).toBeTruthy();
  });

  it('selectionne un compte et referme le popover', async () => {
    const user = userEvent.setup();
    render(<AccountSwitcher onManageAccounts={() => {}} />);

    await user.click(screen.getByRole('button', { name: /Tous les comptes/i }));
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: /compte2/i }));

    expect(selectAccountMock).toHaveBeenCalledWith('acc-2');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('ouvre la gestion des comptes et referme le popover', async () => {
    const onManage = vi.fn();
    const user = userEvent.setup();
    render(<AccountSwitcher onManageAccounts={onManage} />);

    await user.click(screen.getByRole('button', { name: /Tous les comptes/i }));
    await user.click(screen.getByRole('button', { name: /Gérer les comptes/i }));

    expect(onManage).toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

// Retour beta 2026-08-27 : "Tous les comptes" n'a de sens qu'a partir de
// 2 comptes relies. Un seul compte : le contexte garantit desormais que
// selectedAccountId ne vaut jamais "all" (voir VintedAccountFilterContext),
// donc ces tests fixent un compte precis comme selection courante -- pas
// "all", qui ne devrait plus se produire dans ce cas.
describe('AccountSwitcher -- un seul compte relie', () => {
  beforeEach(() => {
    accountsFixture = [makeAccount()];
    selectedIdFixture = 'acc-1';
  });

  it("n'affiche pas l'option 'Tous les comptes' dans le popover", async () => {
    const user = userEvent.setup();
    render(<AccountSwitcher onManageAccounts={() => {}} />);

    await user.click(screen.getByRole('button', { name: /dziko0737/i }));

    expect(screen.queryByText('Tous les comptes')).toBeNull();
    // Un seul compte : un unique option dans la liste, pas de doublon "all".
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
  });

  it("affiche directement le compte dans le declencheur, jamais 'Tous les comptes'", () => {
    render(<AccountSwitcher onManageAccounts={() => {}} />);

    expect(screen.queryByText('Tous les comptes')).toBeNull();
    expect(screen.getByText('dziko0737')).toBeTruthy();
  });
});
