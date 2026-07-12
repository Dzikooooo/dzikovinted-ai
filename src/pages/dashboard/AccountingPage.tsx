import { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useVintedAccountFilter } from '../../contexts/VintedAccountFilterContext';
import { supabase } from '../../lib/supabase';
import type { Listing } from '../../lib/types';
import { StatCard } from '../../components/ui/StatCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { toLocalDateString } from '../../lib/date';

const VAT_RATE = 0.2;
const URSSAF_RATE = 0.123;

interface ExpenseRow {
  category: string;
  amount: number;
  expense_date: string | null;
}

type Period = 'month' | 'all';

export default function AccountingPage() {
  const { user } = useAuth();
  const { selectedAccountId } = useVintedAccountFilter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('month');

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      let listingsQuery = supabase.from('listings').select('*').eq('user_id', user.id);
      if (selectedAccountId !== 'all') {
        listingsQuery = listingsQuery.eq('vinted_account_id', selectedAccountId);
      }
      const [{ data: l, error: listingsError }, { data: e, error: expensesError }] = await Promise.all([
        listingsQuery,
        supabase.from('expenses').select('category, amount, expense_date'),
      ]);
      const firstError = listingsError || expensesError;
      if (firstError) {
        console.error(firstError);
        setLoadError('Impossible de charger la comptabilité. Réessaie plus tard.');
      } else {
        setLoadError(null);
      }
      setListings((l ?? []) as Listing[]);
      setExpenses((e ?? []) as ExpenseRow[]);
      setLoading(false);
    })();
  }, [user, selectedAccountId]);

  const monthStart = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    return toLocalDateString(d);
  }, []);

  const stats = useMemo(() => {
    const inPeriod = (dateStr: string | null) => period === 'all' || (!!dateStr && dateStr >= monthStart);

    const soldItems = listings.filter((l) => l.status === 'vendu' && inPeriod(l.sold_date));
    const revenue = soldItems.reduce((s, l) => s + Number(l.sold_price || 0), 0);
    const invested = soldItems.reduce((s, l) => s + Number(l.purchase_price || 0), 0);
    const fees = soldItems.reduce((s, l) => s + Number(l.fees || 0), 0);
    const margin = revenue - invested;
    const profit = margin - fees;
    const roi = invested > 0 ? Math.round((profit / invested) * 100) : 0;
    const marginPct = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

    const periodExpenses = expenses.filter((e) => inPeriod(e.expense_date));
    const expensesTotal = periodExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const byCategory = periodExpenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
      return acc;
    }, {});
    const sortedExpenses = Object.entries(byCategory).sort(([, a], [, b]) => b - a);

    const netProfit = profit - expensesTotal;
    const vatDue = margin > 0 ? margin * (VAT_RATE / (1 + VAT_RATE)) : 0;
    const urssafDue = revenue * URSSAF_RATE;

    return { revenue, margin, profit, roi, marginPct, expensesTotal, sortedExpenses, netProfit, vatDue, urssafDue, soldCount: soldItems.length };
  }, [listings, expenses, period, monthStart]);

  const maxExpense = stats.sortedExpenses[0]?.[1] ?? 1;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black mb-1">Comptabilite</h1>
          <p className="text-gray-400 text-sm">Chiffre d'affaires, marge et charges de ton activite.</p>
        </div>
        <div className="flex bg-surface-alt border border-white/10 rounded-xl overflow-hidden flex-shrink-0">
          <button
            onClick={() => setPeriod('month')}
            className={`px-4 py-2.5 text-sm font-bold transition ${period === 'month' ? 'bg-neon-500 text-black' : 'text-gray-400 hover:text-white'}`}
          >
            Ce mois-ci
          </button>
          <button
            onClick={() => setPeriod('all')}
            className={`px-4 py-2.5 text-sm font-bold transition ${period === 'all' ? 'bg-neon-500 text-black' : 'text-gray-400 hover:text-white'}`}
          >
            Depuis le debut
          </button>
        </div>
      </div>

      {loadError && <ErrorBanner message={loadError} className="mb-6" />}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} shape="block" className="h-28" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Chiffre d'affaires" value={`${stats.revenue.toFixed(0)} EUR`} />
            <StatCard label="Marge brute" value={`${stats.margin.toFixed(0)} EUR`} highlight />
            <StatCard label="Benefice net" value={`${stats.netProfit.toFixed(0)} EUR`} highlight />
            <StatCard label="ROI moyen" value={`${stats.roi} %`} highlight />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Depenses par categorie */}
            <div className="bg-surface border border-white/5 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-bold text-sm">Depenses par categorie</h2>
                <span className="text-sm font-bold text-gray-300">{stats.expensesTotal.toFixed(0)} EUR</span>
              </div>
              {stats.sortedExpenses.length === 0 ? (
                <div className="h-24 flex items-center justify-center text-sm text-gray-600">Aucune depense sur la periode</div>
              ) : (
                <div className="space-y-3">
                  {stats.sortedExpenses.map(([cat, amount]) => (
                    <div key={cat} className="flex items-center gap-3">
                      <span className="text-xs text-gray-300 w-28 truncate flex-shrink-0 font-medium">{cat}</span>
                      <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-neon-500/40 to-neon-500/80 transition-all duration-700"
                          style={{ width: `${(amount / maxExpense) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-gray-400 w-16 flex-shrink-0 text-right">{amount.toFixed(0)} EUR</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Marge nette */}
            <div className="bg-surface border border-white/5 rounded-2xl p-6">
              <h2 className="font-bold text-sm mb-6">Repartition de la marge</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Marge brute ({stats.soldCount} vente{stats.soldCount > 1 ? 's' : ''})</span>
                  <span className="font-bold text-gray-200">{stats.margin.toFixed(0)} EUR</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Depenses</span>
                  <span className="font-bold text-red-400">-{stats.expensesTotal.toFixed(0)} EUR</span>
                </div>
                <div className="h-px bg-white/5" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-200">Benefice net</span>
                  <span className="text-lg font-black text-neon-500">{stats.netProfit.toFixed(0)} EUR</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Marge nette sur CA</span>
                  <span>{stats.marginPct} %</span>
                </div>
              </div>
            </div>
          </div>

          {/* Estimations fiscales */}
          <div className="bg-surface border border-white/5 rounded-2xl p-6">
            <div className="flex items-start gap-2 mb-6">
              <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-500">
                Estimations indicatives basees sur le regime de la TVA sur la marge et un taux URSSAF standard de vente de marchandises. Ne remplace pas l'avis de ton comptable.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-dark-400 border border-white/5 rounded-xl p-4">
                <p className="text-gray-500 text-xs mb-1">TVA sur la marge (20%)</p>
                <p className="text-2xl font-black text-gray-200">{stats.vatDue.toFixed(0)} EUR</p>
                <p className="text-[10px] text-gray-600 mt-1">Calculee sur la marge brute, taux normal</p>
              </div>
              <div className="bg-dark-400 border border-white/5 rounded-xl p-4">
                <p className="text-gray-500 text-xs mb-1">URSSAF (estimation, 12,3%)</p>
                <p className="text-2xl font-black text-gray-200">{stats.urssafDue.toFixed(0)} EUR</p>
                <p className="text-[10px] text-gray-600 mt-1">Calculee sur le chiffre d'affaires</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
