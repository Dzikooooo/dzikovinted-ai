import { createContext, useContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { useRefreshOnFocus } from '../hooks/useRefreshOnFocus';
import type { VintedAccount } from '../lib/types';

const STORAGE_KEY = 'resellos_selected_vinted_account';

export type SelectedAccountId = string | 'all';

interface VintedAccountFilterValue {
  accounts: VintedAccount[];
  loading: boolean;
  selectedAccountId: SelectedAccountId;
  selectedAccount: VintedAccount | null;
  selectAccount: (id: SelectedAccountId) => void;
  refresh: () => Promise<void>;
}

const VintedAccountFilterContext = createContext<VintedAccountFilterValue | null>(null);

export function VintedAccountFilterProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<VintedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<SelectedAccountId>(() => {
    return localStorage.getItem(STORAGE_KEY) ?? 'all';
  });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('vinted_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('label', { ascending: true });
    const rows = (data as VintedAccount[] | null) ?? [];
    setAccounts(rows);
    setSelectedAccountId((current) => {
      // Un seul compte relie : "all" et "ce compte" filtrent exactement les
      // memes donnees, mais l'un des deux merite d'etre EFFACE de l'etat --
      // sinon un utilisateur solo reste bloque sur "Tous les comptes / Vue
      // globale" sans jamais pouvoir choisir explicitement son propre
      // compte (2026-08-27, retour beta : la "Vue globale" n'a pas de sens
      // pour un seul compte, l'option est desormais masquee cote UI --
      // AccountSwitcher.tsx). Couvre aussi bien le defaut jamais touche que
      // localStorage contenant un "all" d'une session passee a plusieurs
      // comptes.
      if (rows.length === 1 && current === 'all') return rows[0].id;
      if (current === 'all') return current;
      return rows.some((a) => a.id === current) ? current : 'all';
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // P1-2 (Freeze Audit correctif) : sans ceci, `accounts` (et donc le badge
  // "Connecte" de DashboardHome.tsx) ne se rafraichit qu'au montage --
  // aucune trace d'une deconnexion Vinted survenue pendant que l'onglet
  // restait ouvert tant que l'utilisateur ne recharge pas la page.
  useRefreshOnFocus(() => void load());

  const selectAccount = useCallback((id: SelectedAccountId) => {
    setSelectedAccountId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const selectedAccount = useMemo(
    () => (selectedAccountId === 'all' ? null : accounts.find((a) => a.id === selectedAccountId) ?? null),
    [accounts, selectedAccountId]
  );

  const value = useMemo(
    () => ({ accounts, loading, selectedAccountId, selectedAccount, selectAccount, refresh: load }),
    [accounts, loading, selectedAccountId, selectedAccount, selectAccount, load]
  );

  return <VintedAccountFilterContext.Provider value={value}>{children}</VintedAccountFilterContext.Provider>;
}

export function useVintedAccountFilter() {
  const ctx = useContext(VintedAccountFilterContext);
  if (!ctx) throw new Error('useVintedAccountFilter must be used within VintedAccountFilterProvider');
  return ctx;
}
