import { useEffect, useMemo, useState } from 'react';
import {
  Info, BarChart2, TrendingUp, Tag, Sparkles, DollarSign, Star, Layers,
  Plus, Trash2, X, Package, Truck, Percent, Wrench, Car, Warehouse, MoreHorizontal, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useVintedAccountFilter } from '../../contexts/VintedAccountFilterContext';
import { useExpenses } from '../../hooks/useExpenses';
import { supabase } from '../../lib/supabase';
import type { Listing } from '../../lib/types';
import { StatCard } from '../../components/ui/StatCard';
import { ProgressBarRow } from '../../components/ui/ProgressBar';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageHeader } from '../../components/ui/PageHeader';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { ClosableSection } from '../../components/ui/ClosableSection';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { toLocalDateString } from '../../lib/date';
import { formatEUR } from '../../lib/currency';
import { isDuplicateFeeRiskCategory } from '../../lib/feeDuplicateRisk';
import { toneForValue } from '../../lib/statTone';

const VAT_RATE = 0.2;
const URSSAF_RATE = 0.123;

const EXPENSE_CATEGORIES = ['Emballage', 'Frais de port', 'Frais Vinted', 'Matériel', 'Déplacement', 'Stockage', 'Autre'];

// Icone par categorie (ex-ExpensesPage.tsx, fusionnee ici -- demande produit
// 2026-07-31 : "Depenses" n'est plus une page a part).
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Emballage: Package,
  'Frais de port': Truck,
  'Frais Vinted': Percent,
  'Matériel': Wrench,
  'Déplacement': Car,
  Stockage: Warehouse,
  Autre: MoreHorizontal,
};

type Period = 'month' | 'year' | 'all';

export default function AccountingPage() {
  const { user } = useAuth();
  const { selectedAccountId } = useVintedAccountFilter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('month');

  const { expenses, loading: expensesLoading, error: expensesError, addExpense, deleteExpense } = useExpenses();
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNote, setExpenseNote] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setListingsLoading(true);
      let listingsQuery = supabase.from('listings').select('*').eq('user_id', user.id);
      if (selectedAccountId !== 'all') {
        listingsQuery = listingsQuery.eq('vinted_account_id', selectedAccountId);
      }
      const { data: l, error: listingsError } = await listingsQuery;
      if (listingsError) {
        console.error(listingsError);
        setLoadError('Impossible de charger la comptabilité. Réessaie plus tard.');
      } else {
        setLoadError(null);
      }
      setListings((l ?? []) as Listing[]);
      setListingsLoading(false);
    })();
  }, [user, selectedAccountId]);

  const loading = listingsLoading || expensesLoading;

  const monthStart = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    return toLocalDateString(d);
  }, []);

  const yearStart = useMemo(() => {
    const d = new Date();
    d.setMonth(0, 1);
    return toLocalDateString(d);
  }, []);

  const stats = useMemo(() => {
    const periodStart = period === 'month' ? monthStart : period === 'year' ? yearStart : null;
    const inPeriod = (dateStr: string | null) => !periodStart || (!!dateStr && dateStr >= periodStart);

    const soldItems = listings.filter((l) => l.status === 'vendu' && inPeriod(l.sold_date));
    const revenue = soldItems.reduce((s, l) => s + Number(l.sold_price || 0), 0);
    const invested = soldItems.reduce((s, l) => s + Number(l.purchase_price || 0), 0);
    const fees = soldItems.reduce((s, l) => s + Number(l.fees || 0), 0);
    const margin = revenue - invested;
    const profit = margin - fees;
    const roi = invested > 0 ? Math.round((profit / invested) * 100) : 0;
    const marginPct = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

    const losses = soldItems.reduce((s, l) => {
      const itemProfit = Number(l.sold_price || 0) - Number(l.purchase_price || 0) - Number(l.fees || 0);
      return itemProfit < 0 ? s + Math.abs(itemProfit) : s;
    }, 0);
    const lossCount = soldItems.filter((l) => Number(l.sold_price || 0) - Number(l.purchase_price || 0) - Number(l.fees || 0) < 0).length;

    const periodExpenses = expenses.filter((e) => inPeriod(e.expenseDate));
    const expensesTotal = periodExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const byCategory = periodExpenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
      return acc;
    }, {});
    const sortedExpenses = Object.entries(byCategory).sort(([, a], [, b]) => b - a);

    const netProfit = profit - expensesTotal;
    const vatDue = margin > 0 ? margin * (VAT_RATE / (1 + VAT_RATE)) : 0;
    const urssafDue = revenue * URSSAF_RATE;

    const thisMonth = new Date().toISOString().slice(0, 7);
    const expensesThisMonth = expenses.filter((e) => e.expenseDate?.startsWith(thisMonth)).reduce((s, e) => s + e.amount, 0);
    const expensesAllTime = expenses.reduce((s, e) => s + e.amount, 0);
    const expensesByCategoryAllTime = expenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.amount;
      return acc;
    }, {});
    const topExpenseCategory = Object.entries(expensesByCategoryAllTime).sort(([, a], [, b]) => b - a)[0];

    return {
      revenue, margin, profit, roi, marginPct, expensesTotal, sortedExpenses, netProfit, vatDue, urssafDue,
      soldCount: soldItems.length, losses, lossCount, expensesThisMonth, expensesAllTime, topExpenseCategory,
    };
  }, [listings, expenses, period, monthStart, yearStart]);

  const maxExpense = stats.sortedExpenses[0]?.[1] ?? 1;

  const resetExpenseForm = () => {
    setExpenseCategory(EXPENSE_CATEGORIES[0]);
    setExpenseAmount('');
    setExpenseNote('');
  };

  const handleAddExpense = async () => {
    const value = Number(expenseAmount);
    if (!value || value <= 0) return;
    setSavingExpense(true);
    const ok = await addExpense(expenseCategory, value, expenseNote);
    setSavingExpense(false);
    // Ne ferme la modale qu'en cas de succes reel (meme motif que
    // WatchlistPage.tsx::handleSubmit, 2026-07-24) -- le bandeau d'erreur du
    // hook reste visible derriere si l'ecriture a echoue.
    if (ok) {
      resetExpenseForm();
      setShowExpenseForm(false);
    }
  };

  // Statistiques catalogue (fusionnees depuis l'ancienne page Statistiques,
  // supprimee -- portee sur l'ensemble du catalogue, pas sur la periode
  // selectionnee ci-dessus qui ne concerne que le chiffre d'affaires).
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const avgPrice = avg(listings.map((l) => l.price));
  const catalogValue = listings.reduce((sum, l) => sum + (l.price ?? 0), 0);
  const favCount = listings.filter((l) => l.is_favorite).length;
  const brandCounts = listings.reduce<Record<string, number>>((acc, l) => { if (l.brand) acc[l.brand] = (acc[l.brand] ?? 0) + 1; return acc; }, {});
  const topBrands = Object.entries(brandCounts).sort(([, a], [, b]) => b - a).slice(0, 6);
  const maxBrandCount = topBrands[0]?.[1] ?? 1;

  const catCounts = listings.reduce<Record<string, number>>((acc, l) => {
    if (l.category) {
      const cat = l.category.includes('>') ? l.category.split('>')[0].trim() : l.category;
      acc[cat] = (acc[cat] ?? 0) + 1;
    }
    return acc;
  }, {});
  const topCats = Object.entries(catCounts).sort(([, a], [, b]) => b - a).slice(0, 6);

  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonthCount = listings.filter((l) => l.created_at.startsWith(thisMonthKey)).length;

  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const key = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('fr-FR', { month: 'short' });
    const count = listings.filter((l) => l.created_at.startsWith(key)).length;
    return { key, label, count };
  });
  const maxMonthCount = Math.max(...last6Months.map((m) => m.count), 1);

  const conditionCounts = listings.reduce<Record<string, number>>((acc, l) => {
    if (l.condition) acc[l.condition] = (acc[l.condition] ?? 0) + 1;
    return acc;
  }, {});
  const conditions = Object.entries(conditionCounts).sort(([, a], [, b]) => b - a);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={
          <>
            Résultat {period === 'month' ? 'du mois' : period === 'year' ? "de l'année" : 'depuis le début'}
            {!loading && (
              <span className={`ml-3 ${stats.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatEUR(stats.netProfit)}
              </span>
            )}
          </>
        }
        description="Chiffre d'affaires, marge et charges de ton activité."
        action={
          <SegmentedControl
            options={[
              { value: 'month', label: 'Ce mois-ci' },
              { value: 'year', label: 'Cette année' },
              { value: 'all', label: 'Depuis le début' },
            ]}
            value={period}
            onChange={setPeriod}
          />
        }
      />

      {loadError && <ErrorBanner message={loadError} className="mb-6" />}
      {expensesError && <ErrorBanner message={expensesError} className="mb-6" />}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} shape="block" className="h-28" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <StatCard label="Chiffre d'affaires" value={formatEUR(stats.revenue)} highlight tone="positive" />
            <StatCard label="Marge brute" value={formatEUR(stats.margin)} highlight tone={toneForValue(stats.margin)} />
            <StatCard label="Bénéfice net" value={formatEUR(stats.netProfit)} highlight tone={toneForValue(stats.netProfit)} />
            <StatCard label="ROI moyen" value={`${stats.roi} %`} highlight tone={toneForValue(stats.roi)} />
            <StatCard
              label="Pertes"
              value={stats.losses > 0 ? `-${formatEUR(stats.losses)}` : formatEUR(0)}
              highlight
              tone={stats.losses > 0 ? 'negative' : undefined}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Depenses par categorie */}
            <div className="bg-surface border border-white/5 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-bold text-sm">Dépenses par catégorie</h2>
                <span className="text-sm font-bold text-gray-300">{formatEUR(stats.expensesTotal)}</span>
              </div>
              {stats.sortedExpenses.length === 0 ? (
                <div className="h-24 flex items-center justify-center text-sm text-gray-600">Aucune dépense sur la période</div>
              ) : (
                <div className="space-y-3">
                  {stats.sortedExpenses.map(([cat, amount]) => (
                    <ProgressBarRow key={cat} label={cat} value={formatEUR(amount)} fraction={amount / maxExpense} />
                  ))}
                </div>
              )}
            </div>

            {/* Marge nette */}
            <div className="bg-surface border border-white/5 rounded-2xl p-6">
              <h2 className="font-bold text-sm mb-6">Répartition de la marge</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Marge brute ({stats.soldCount} vente{stats.soldCount > 1 ? 's' : ''})</span>
                  <span className="font-bold text-gray-200">{formatEUR(stats.margin)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Dépenses</span>
                  <span className="font-bold text-red-400">-{formatEUR(stats.expensesTotal)}</span>
                </div>
                {stats.losses > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Pertes ({stats.lossCount} vente{stats.lossCount > 1 ? 's' : ''} à perte)</span>
                    <span className="font-bold text-red-400">-{formatEUR(stats.losses)}</span>
                  </div>
                )}
                <div className="h-px bg-white/5" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-200">Bénéfice net</span>
                  <span className="text-lg font-black text-green-400">{formatEUR(stats.netProfit)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Marge nette sur CA</span>
                  <span>{stats.marginPct} %</span>
                </div>
              </div>
            </div>
          </div>

          {/* Estimations fiscales */}
          <div className="bg-surface border border-white/5 rounded-2xl p-6 mb-6">
            <div className="flex items-start gap-2 mb-6">
              <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-500">
                Estimations indicatives basées sur le régime de la TVA sur la marge et un taux URSSAF standard de vente de marchandises. Ne remplace pas l'avis de ton comptable.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-dark-400 border border-white/5 rounded-xl p-4">
                <p className="text-gray-500 text-xs mb-1">TVA sur la marge (20%)</p>
                <p className="text-2xl font-black text-gray-200">{formatEUR(stats.vatDue)}</p>
                <p className="text-[10px] text-gray-600 mt-1">Calculée sur la marge brute, taux normal</p>
              </div>
              <div className="bg-dark-400 border border-white/5 rounded-xl p-4">
                <p className="text-gray-500 text-xs mb-1">URSSAF (estimation, 12,3%)</p>
                <p className="text-2xl font-black text-gray-200">{formatEUR(stats.urssafDue)}</p>
                <p className="text-[10px] text-gray-600 mt-1">Calculée sur le chiffre d'affaires</p>
              </div>
            </div>
          </div>

          {/* Depenses (ex-page Depenses, fusionnee ici -- 2026-07-31) */}
          <div className="bg-surface border border-white/5 rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <SectionLabel className="mb-0">Dépenses</SectionLabel>
              <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setShowExpenseForm(true)}>
                Ajouter
              </Button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <StatCard label="Total dépenses" value={formatEUR(stats.expensesAllTime)} />
              <StatCard label="Ce mois-ci" value={formatEUR(stats.expensesThisMonth)} highlight />
              <StatCard label="Catégorie principale" value={stats.topExpenseCategory ? stats.topExpenseCategory[0] : '—'} />
            </div>

            {expenses.length === 0 ? (
              <EmptyState
                icon={Tag}
                title="Aucune dépense enregistrée"
                description="Ajoute ta première dépense pour suivre tes frais."
                action={{ label: 'Ajouter une dépense', onClick: () => setShowExpenseForm(true) }}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {expenses.map((expense) => {
                  const CategoryIcon = CATEGORY_ICONS[expense.category] ?? MoreHorizontal;
                  return (
                    <div
                      key={expense.id}
                      className="bg-dark-400 border border-white/5 rounded-2xl p-4 transition-all hover:border-white/10 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-neon-500/10 flex items-center justify-center flex-shrink-0">
                          <CategoryIcon className="w-4 h-4 text-neon-500/70" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-gray-100">{expense.category}</p>
                          {expense.note && <p className="text-xs text-gray-500 mt-1">{expense.note}</p>}
                          <p className="text-[10px] text-gray-600 mt-1">{expense.expenseDate}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="text-sm font-bold text-gray-200">{formatEUR(expense.amount)}</p>
                        <button
                          onClick={() => deleteExpense(expense.id)}
                          aria-label="Supprimer la dépense"
                          className="p-2 rounded-lg hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <ClosableSection label="Statistiques du catalogue" labelOpen="Masquer les statistiques du catalogue">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <StatCard icon={Sparkles} label="Annonces" value={listings.length} />
              <StatCard icon={DollarSign} label="Prix moyen" value={formatEUR(avgPrice)} />
              <StatCard icon={TrendingUp} label="Valeur du catalogue" value={formatEUR(catalogValue)} highlight />
              <StatCard icon={BarChart2} label="Ce mois-ci" value={thisMonthCount} />
              <StatCard icon={Star} label="Favoris" value={favCount} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-surface border border-white/5 rounded-2xl p-6">
                <SectionLabel className="mb-6">
                  <span className="flex items-center gap-2"><BarChart2 className="w-4 h-4 text-neon-500" />Annonces par mois</span>
                </SectionLabel>
                {listings.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-sm text-gray-600">Pas encore de données</div>
                ) : (
                  <div className="flex items-end gap-3 h-40">
                    {last6Months.map(({ key, label, count }) => (
                      <div key={key} className="flex-1 flex flex-col items-center gap-2">
                        <span className="text-xs font-mono text-neon-500 tabular-nums">{count > 0 ? count : ''}</span>
                        <div
                          className="w-full rounded-t-lg transition-all duration-700 bg-gradient-to-t from-neon-500/30 to-neon-500/60 hover:from-neon-500/40 hover:to-neon-500/80"
                          style={{ height: `${(count / maxMonthCount) * 100}%`, minHeight: count > 0 ? '8px' : '2px' }}
                        />
                        <span className="text-[10px] text-gray-600 capitalize">{label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-surface border border-white/5 rounded-2xl p-6">
                <SectionLabel className="mb-6">
                  <span className="flex items-center gap-2"><Tag className="w-4 h-4 text-neon-500" />Marques les plus fréquentes</span>
                </SectionLabel>
                {topBrands.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-sm text-gray-600">Pas encore de données</div>
                ) : (
                  <div className="space-y-3">
                    {topBrands.map(([brand, count], i) => (
                      <ProgressBarRow key={brand} rank={i + 1} label={brand} value={String(count)} fraction={count / maxBrandCount} valueClassName="w-6 text-neon-500" />
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-surface border border-white/5 rounded-2xl p-6">
                <SectionLabel className="mb-6">
                  <span className="flex items-center gap-2"><Layers className="w-4 h-4 text-neon-500" />Catégories</span>
                </SectionLabel>
                {topCats.length === 0 ? (
                  <div className="flex items-center justify-center h-24 text-sm text-gray-600">Pas encore de données</div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {topCats.map(([cat, count]) => (
                      <div key={cat} className="bg-dark-400 rounded-xl p-3 border border-white/5 hover:border-neon-500/20 transition-colors">
                        <p className="text-lg font-black text-neon-500 mb-1">{count}</p>
                        <p className="text-xs text-gray-500 truncate">{cat}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-surface border border-white/5 rounded-2xl p-6">
                <SectionLabel className="mb-6">
                  <span className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-neon-500" />Distribution des prix</span>
                </SectionLabel>
                {listings.length === 0 ? (
                  <div className="flex items-center justify-center h-24 text-sm text-gray-600">Pas encore de données</div>
                ) : (
                  <div className="space-y-3">
                    {[
                      { label: '< 30 €', count: listings.filter((l) => l.price < 30).length },
                      { label: '30 - 75 €', count: listings.filter((l) => l.price >= 30 && l.price < 75).length },
                      { label: '75 - 150 €', count: listings.filter((l) => l.price >= 75 && l.price < 150).length },
                      { label: '150+ €', count: listings.filter((l) => l.price >= 150).length },
                    ].map(({ label, count }) => (
                      <ProgressBarRow key={label} label={label} value={String(count)} fraction={listings.length > 0 ? count / listings.length : 0} labelClassName="w-20" valueClassName="w-6" />
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-surface border border-white/5 rounded-2xl p-6 lg:col-span-2">
                <SectionLabel className="mb-6">
                  <span className="flex items-center gap-2"><Star className="w-4 h-4 text-neon-500" />État des articles</span>
                </SectionLabel>
                {conditions.length === 0 ? (
                  <div className="flex items-center justify-center h-24 text-sm text-gray-600">Pas encore de données</div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {conditions.map(([condition, count]) => {
                      const pct = ((count / listings.length) * 100).toFixed(0);
                      return (
                        <div key={condition} className="bg-dark-400 rounded-xl px-4 py-3 border border-white/5 flex items-center gap-3 hover:border-neon-500/20 transition-colors">
                          <div className="text-center">
                            <p className="text-lg font-black text-neon-500">{pct}%</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-300 font-medium">{condition}</p>
                            <p className="text-[10px] text-gray-600">{count} article{count > 1 ? 's' : ''}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </ClosableSection>
        </>
      )}

      {showExpenseForm && (
        <Modal onClose={() => setShowExpenseForm(false)} size="md">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-black">Nouvelle dépense</h2>
            <button
              onClick={() => setShowExpenseForm(false)}
              aria-label="Fermer"
              className="p-1.5 rounded-lg hover:bg-white/5"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="space-y-4">
            {expensesError && <ErrorBanner message={expensesError} />}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Catégorie</label>
              <select
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value)}
                className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {/* P1-4 (Freeze Audit correctif) : le champ "Frais" saisi lors
                  d'une vente (ListingsManagementSection.tsx) est deja deduit
                  automatiquement de la marge de cette vente -- sans
                  identifiant commun entre une depense et une vente precise,
                  aucune deduplication automatique fiable n'est possible ici
                  (choix assume : avertir au bon moment plutot qu'inventer un
                  rapprochement incertain). */}
              {isDuplicateFeeRiskCategory(expenseCategory) && (
                <div className="flex items-start gap-2 mt-3 bg-yellow-400/5 border border-yellow-400/15 rounded-xl px-3 py-2.5">
                  <Info className="w-3.5 h-3.5 text-yellow-400/80 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-yellow-200/80 leading-relaxed">
                    As-tu déjà renseigné ce frais dans le champ « Frais » au moment de marquer la vente correspondante comme vendue ? Si oui, ne l'ajoute pas ici aussi — ça compterait le même coût deux fois.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Montant (€)</label>
              <input
                type="number"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Note (optionnel)</label>
              <input
                type="text"
                value={expenseNote}
                onChange={(e) => setExpenseNote(e.target.value)}
                placeholder="Details..."
                className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
              />
            </div>

            <Button fullWidth loading={savingExpense} disabled={!expenseAmount} onClick={handleAddExpense}>
              {savingExpense ? 'Enregistrement...' : 'Ajouter la dépense'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
