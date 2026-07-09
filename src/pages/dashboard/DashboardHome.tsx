import { useEffect, useMemo, useState } from 'react';
import { Sparkles, TrendingUp, Star, ArrowRight, Zap, Clock, Search, Package, ShoppingBag, Puzzle, Layers } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useVintedAccountFilter } from '../../contexts/VintedAccountFilterContext';
import { supabase } from '../../lib/supabase';
import type { DashboardPage, Listing } from '../../lib/types';
import { PLAN_LIMITS } from '../../lib/types';

interface DashboardHomeProps {
  onNavigate: (page: DashboardPage) => void;
}

const AGING_STOCK_DAYS = 21;

function profitOf(l: Listing) {
  return Number(l.sold_price || 0) - Number(l.purchase_price || 0) - Number(l.fees || 0);
}

export default function DashboardHome({ onNavigate }: DashboardHomeProps) {
  const { profile, user } = useAuth();
  const { accounts, selectedAccountId, selectedAccount } = useVintedAccountFilter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [newOpportunities, setNewOpportunities] = useState(0);
  const [vintedListingsCount, setVintedListingsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [{ data: allListings }, { count: oppCount }] = await Promise.all([
        supabase.from('listings').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('market_opportunities').select('*', { count: 'exact', head: true }).gte('created_at', dayAgo),
      ]);
      setListings((allListings ?? []) as Listing[]);
      setNewOpportunities(oppCount ?? 0);
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    let ignore = false;

    (async () => {
      if (selectedAccountId === 'all') {
        const accountIds = accounts.map((a) => a.id);
        if (accountIds.length === 0) {
          if (!ignore) setVintedListingsCount(0);
          return;
        }
        const { count } = await supabase
          .from('vinted_listings')
          .select('*', { count: 'exact', head: true })
          .in('vinted_account_id', accountIds);
        if (!ignore) setVintedListingsCount(count ?? 0);
      } else {
        const { count } = await supabase
          .from('vinted_listings')
          .select('*', { count: 'exact', head: true })
          .eq('vinted_account_id', selectedAccountId);
        if (!ignore) setVintedListingsCount(count ?? 0);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [accounts, selectedAccountId]);

  const plan = profile?.plan ?? 'free';
  const credits = profile?.credits ?? 0;
  const limit = PLAN_LIMITS[plan];
  const firstName = profile?.full_name?.split(' ')[0] || profile?.email?.split('@')[0] || 'la';

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon apres-midi';
    return 'Bonsoir';
  };

  const metrics = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().slice(0, 10);

    const soldItems = listings.filter((l) => l.status === 'vendu');
    const stockItems = listings.filter((l) => l.status !== 'vendu');

    const soldToday = soldItems.filter((l) => l.sold_date === today);
    const soldThisMonth = soldItems.filter((l) => l.sold_date && l.sold_date >= monthStartStr);

    const profitToday = soldToday.reduce((s, l) => s + profitOf(l), 0);
    const profitMonth = soldThisMonth.reduce((s, l) => s + profitOf(l), 0);
    const revenueMonth = soldThisMonth.reduce((s, l) => s + Number(l.sold_price || 0), 0);
    const investedMonth = soldThisMonth.reduce((s, l) => s + Number(l.purchase_price || 0), 0);
    const roiMonth = investedMonth > 0 ? Math.round((profitMonth / investedMonth) * 100) : 0;

    const stockValue = stockItems.reduce((s, l) => s + Number(l.price || 0), 0);
    const agingStock = stockItems.filter(
      (l) => Date.now() - new Date(l.created_at).getTime() > AGING_STOCK_DAYS * 24 * 60 * 60 * 1000
    );

    return {
      soldTodayCount: soldToday.length,
      profitToday,
      revenueMonth,
      profitMonth,
      roiMonth,
      stockValue,
      agingStockCount: agingStock.length,
      recentListings: listings.slice(0, 5),
      hasAnyListing: listings.length > 0,
    };
  }, [listings]);

  const todayCards = [
    {
      icon: ShoppingBag,
      label: metrics.soldTodayCount > 0 ? `${metrics.soldTodayCount} vente${metrics.soldTodayCount > 1 ? 's' : ''} aujourd'hui` : 'Aucune vente aujourd\'hui',
      detail: metrics.profitToday > 0 ? `+${metrics.profitToday.toFixed(0)} EUR de benefice` : 'Reviens plus tard',
      page: 'stock' as DashboardPage,
      color: 'text-neon-500',
      bg: 'bg-neon-500/10',
    },
    {
      icon: Search,
      label: newOpportunities > 0 ? `${newOpportunities} nouvelle${newOpportunities > 1 ? 's' : ''} opportunite${newOpportunities > 1 ? 's' : ''}` : 'Aucune opportunite recente',
      detail: 'Detectees sur les dernieres 24h',
      page: 'opportunities' as DashboardPage,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
    },
    {
      icon: Clock,
      label: metrics.agingStockCount > 0 ? `${metrics.agingStockCount} article${metrics.agingStockCount > 1 ? 's' : ''} a surveiller` : 'Stock sain',
      detail: `En stock depuis plus de ${AGING_STOCK_DAYS} jours`,
      page: 'stock' as DashboardPage,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black">
              {greeting()}, <span className="text-neon-500">{firstName}</span>
            </h1>
            {accounts.length > 0 && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-white/5 px-2.5 py-1 rounded-full">
                <Layers className="w-3 h-3" />
                Vue : {selectedAccountId === 'all' ? 'Tous les comptes' : selectedAccount?.label}
              </span>
            )}
          </div>
          <p className="text-gray-400 text-sm mt-1">Voici ce qui demande ton attention aujourd'hui.</p>
        </div>
        <button
          onClick={() => onNavigate('generator')}
          className="flex items-center gap-2 bg-neon-500 text-black font-bold px-5 py-2.5 rounded-xl hover:bg-neon-600 transition-all hover:shadow-[0_0_20px_rgba(255,196,0,0.25)] text-sm"
        >
          <Sparkles className="w-4 h-4" />
          Nouvelle annonce
        </button>
      </div>

      {/* Credits banner */}
      {limit !== null && (
        <div className="bg-gradient-to-r from-surface to-surface border border-white/5 rounded-2xl p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-neon-500/10 rounded-xl flex items-center justify-center">
                <Zap className="w-6 h-6 text-neon-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-200">Credits restants</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-3xl font-black text-neon-500">{credits}</span>
                  <span className="text-sm text-gray-500">/ {limit} ce mois</span>
                </div>
              </div>
            </div>
            <div className="flex-1 max-w-xs">
              <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.min((credits / limit) * 100, 100)}%`,
                    background: credits > 3 ? '#FFC400' : credits > 0 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
              {credits <= 0 && (
                <p className="text-xs text-red-400 mt-2">
                  Limite atteinte.{' '}
                  <button onClick={() => onNavigate('subscription')} className="underline hover:text-red-300">
                    Passer au Pro
                  </button>
                </p>
              )}
              {credits > 0 && credits <= 3 && (
                <p className="text-xs text-amber-400 mt-2">Plus que {credits} credit{credits > 1 ? 's' : ''} disponible{credits > 1 ? 's' : ''}.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Aujourd'hui */}
      <div className="mb-8">
        <h2 className="font-bold text-sm text-gray-300 mb-4">Aujourd'hui</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {todayCards.map(({ icon: Icon, label, detail, page, color, bg }) => (
            <button
              key={label}
              onClick={() => onNavigate(page)}
              className="bg-surface border border-white/5 rounded-2xl p-5 text-left hover:border-white/10 hover:-translate-y-0.5 transition-all duration-200 group"
            >
              <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <h3 className="font-semibold text-sm mb-1">{loading ? '...' : label}</h3>
              <p className="text-xs text-gray-500">{detail}</p>
              <ArrowRight className={`w-4 h-4 ${color} mt-3 opacity-0 group-hover:opacity-100 transition-opacity`} />
            </button>
          ))}
        </div>
      </div>

      {/* Vue financiere */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-sm text-gray-300">Ce mois-ci</h2>
          <button onClick={() => onNavigate('stats')} className="text-xs text-neon-500 hover:underline flex items-center gap-1">
            Voir le detail <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: TrendingUp, label: "Chiffre d'affaires", value: loading ? '-' : `${metrics.revenueMonth.toFixed(0)} EUR`, color: 'text-gray-100', bg: 'bg-white/5' },
            { icon: Sparkles, label: 'Benefice', value: loading ? '-' : `${metrics.profitMonth.toFixed(0)} EUR`, color: 'text-neon-500', bg: 'bg-neon-500/10' },
            { icon: TrendingUp, label: 'ROI moyen', value: loading ? '-' : `${metrics.roiMonth} %`, color: 'text-neon-500', bg: 'bg-neon-500/10' },
            { icon: Package, label: 'Valeur du stock', value: loading ? '-' : `${metrics.stockValue.toFixed(0)} EUR`, color: 'text-blue-400', bg: 'bg-blue-400/10' },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className="bg-surface border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-colors">
              <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className={`text-xl sm:text-2xl font-black ${color} mb-1`}>{value}</p>
              <p className="text-[11px] text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Compte Vinted */}
      <button
        onClick={() => onNavigate('vinted-account')}
        className="w-full bg-surface/50 border border-white/5 border-dashed rounded-2xl p-5 mb-8 flex items-center gap-4 text-left hover:border-white/10 transition-colors"
      >
        <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center flex-shrink-0">
          <Puzzle className="w-4 h-4 text-gray-500" />
        </div>
        <div>
          {accounts.length === 0 ? (
            <>
              <p className="text-sm font-semibold text-gray-300">Synchronisation Vinted</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Messages, offres et republications automatiques apparaitront ici une fois l'extension Chrome connectee.
              </p>
            </>
          ) : selectedAccountId === 'all' ? (
            <>
              <p className="text-sm font-semibold text-gray-300">
                {accounts.filter((a) => a.connected).length} compte{accounts.filter((a) => a.connected).length > 1 ? 's' : ''} connecté{accounts.filter((a) => a.connected).length > 1 ? 's' : ''}
                {vintedListingsCount > 0 && ` · ${vintedListingsCount} annonce${vintedListingsCount > 1 ? 's' : ''} synchronisée${vintedListingsCount > 1 ? 's' : ''} au total`}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Vue cumulée de tous tes comptes Vinted.</p>
            </>
          ) : selectedAccount?.connected ? (
            <>
              <p className="text-sm font-semibold text-gray-300">
                Connecté — {selectedAccount.label}
                {vintedListingsCount > 0 && ` · ${vintedListingsCount} annonce${vintedListingsCount > 1 ? 's' : ''} synchronisée${vintedListingsCount > 1 ? 's' : ''}`}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedAccount.last_synced_at
                  ? `Dernière synchro : ${new Date(selectedAccount.last_synced_at).toLocaleString('fr-FR')}`
                  : 'Synchronisation en cours...'}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-300">{selectedAccount?.label} — déconnecté</p>
              <p className="text-xs text-gray-500 mt-0.5">Ré-appaire l'extension pour relancer la synchronisation.</p>
            </>
          )}
        </div>
      </button>

      {/* Recent listings */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-sm text-gray-300 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            Annonces recentes
          </h2>
          {metrics.hasAnyListing && (
            <button onClick={() => onNavigate('stock')} className="text-xs text-neon-500 hover:underline flex items-center gap-1">
              Voir tout <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-surface rounded-xl animate-pulse" />)}</div>
        ) : metrics.recentListings.length === 0 ? (
          <div className="bg-surface border border-white/5 border-dashed rounded-2xl p-10 text-center">
            <Sparkles className="w-8 h-8 text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-1">Aucune annonce encore</p>
            <p className="text-xs text-gray-600 mb-4">Lance ton premier generateur et vois le resultat.</p>
            <button onClick={() => onNavigate('generator')} className="text-sm text-neon-500 hover:underline font-medium">
              Generer maintenant
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {metrics.recentListings.map((l) => (
              <div key={l.id} className="bg-surface border border-white/5 rounded-xl px-4 py-3 flex items-center gap-4 hover:border-white/10 transition-colors group">
                {l.image_urls?.[0] ? (
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-white/10">
                    <img src={l.image_urls[0]} alt="" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-neon-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-neon-500/70" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-gray-100 transition-colors">{l.title}</p>
                  <p className="text-xs text-gray-500">{l.brand} &middot; {new Date(l.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</p>
                </div>
                {l.is_favorite && <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400 flex-shrink-0" />}
                <p className="text-sm font-bold text-neon-500 flex-shrink-0">{l.price} EUR</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
