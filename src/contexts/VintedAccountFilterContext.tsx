import { createContext, useContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
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
      if (current === 'all') return current;
      return rows.some((a) => a.id === current) ? current : 'all';
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

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
