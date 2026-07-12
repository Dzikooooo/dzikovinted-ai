import { useEffect, useMemo, useState } from 'react';
import { Sparkles, TrendingUp, Star, ArrowRight, Zap, Clock, Search, Package, ShoppingBag, Puzzle, Layers, Lightbulb } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useVintedAccountFilter } from '../../contexts/VintedAccountFilterContext';
import { useInsights } from '../../hooks/useInsights';
import { supabase } from '../../lib/supabase';
import type { DashboardPage, Listing } from '../../lib/types';
import { PLAN_LIMITS } from '../../lib/types';
import { AGING_STOCK_DAYS } from '../../lib/insights/constants';
import { isActivelyInStock } from '../../lib/listingStatus';
import { startOfLocalDayISO, toLocalDateString } from '../../lib/date';
import { formatRelativeSync } from '../../lib/formatRelativeTime';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Skeleton } from '../../components/ui/Skeleton';

// Au-dela de ce seuil, une synchro Vinted est consideree trop ancienne pour
// que le Copilote affiche ses chiffres comme fiables -- meme convention que
// StockPage.tsx (code couleur "Derniere synchro").
const STALE_SYNC_THRESHOLD_HOURS = 48;

interface DashboardHomeProps {
  onNavigate: (page: DashboardPage) => void;
}

function profitOf(l: Listing) {
  return Number(l.sold_price || 0) - Number(l.purchase_price || 0) - Number(l.fees || 0);
}

export default function DashboardHome({ onNavigate }: DashboardHomeProps) {
  const { profile, user } = useAuth();
  const { accounts, selectedAccountId, selectedAccount } = useVintedAccountFilter();
  const { report: insights } = useInsights();
  const [listings, setListings] = useState<Listing[]>([]);
  const [newOpportunities, setNewOpportunities] = useState(0);
  const [opportunityStats, setOpportunityStats] = useState({ today: 0, avgRoi: 0, avgProfit: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let ignore = false;

    (async () => {
      setLoading(true);
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const todayStart = startOfLocalDayISO(new Date());
      // `.or(...)` plutot qu'un simple `.neq('vinted_status','deleted')` :
      // un neq seul exclurait aussi les articles jamais lies a Vinted
      // (vinted_status null), pas seulement les annonces reellement
      // supprimees - voir StockPage.tsx pour la meme regle.
      let listingsQuery = supabase
        .from('listings')
        .select('*')
        .eq('user_id', user.id)
        .or('vinted_status.neq.deleted,vinted_status.is.null')
        .order('created_at', { ascending: false });
      if (selectedAccountId !== 'all') {
        listingsQuery = listingsQuery.eq('vinted_account_id', selectedAccountId);
      }

      const [
        { data: allListings, error: listingsError },
        { count: oppCount, error: oppCountError },
        { count: oppTodayCount, error: oppTodayError },
        { data: oppStatsRows, error: oppStatsError },
      ] = await Promise.all([
        listingsQuery,
        supabase.from('market_opportunities').select('*', { count: 'exact', head: true }).gte('created_at', dayAgo),
        supabase.from('market_opportunities').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
        // market_opportunities est integralement recreee a chaque scan
        // (~190 lignes) - fetch direct + moyenne cote client, meme
        // convention que le reste de l'app (Opportunities.tsx), plutot
        // qu'une agregation PostgREST non deja utilisee ailleurs.
        supabase.from('market_opportunities').select('roi, profit'),
      ]);

      const firstError = listingsError || oppCountError || oppTodayError || oppStatsError;
      if (!ignore) {
        if (firstError) {
          console.error(firstError);
          setLoadError('Impossible de charger le tableau de bord. Réessaie plus tard.');
        } else {
          setLoadError(null);
        }
        setListings((allListings ?? []) as Listing[]);
        setNewOpportunities(oppCount ?? 0);
        const rows = oppStatsRows ?? [];
        setOpportunityStats({
          today: oppTodayCount ?? 0,
          avgRoi: rows.length > 0 ? Math.round(rows.reduce((s, r) => s + Number(r.roi || 0), 0) / rows.length) : 0,
          avgProfit: rows.length > 0 ? Math.round(rows.reduce((s, r) => s + Number(r.profit || 0), 0) / rows.length) : 0,
        });
        setLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [user, selectedAccountId]);

  // `listings` porte deja les articles lies a Vinted (fusion 2026-07-09) :
  // le compteur se derive directement, plus besoin d'une seconde requete.
  const vintedListingsCount = useMemo(
    () => listings.filter((l) => l.vinted_item_id !== null).length,
    [listings]
  );

  const plan = profile?.plan ?? 'free';
  const credits = profile?.credits ?? 0;
  const isAdmin = profile?.role === 'admin';
  const limit = isAdmin ? null : PLAN_LIMITS[plan];
  const firstName = profile?.full_name?.split(' ')[0] || profile?.email?.split('@')[0] || 'la';

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon apres-midi';
    return 'Bonsoir';
  };

  const metrics = useMemo(() => {
    const today = toLocalDateString(new Date());
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = toLocalDateString(monthStart);

    const soldItems = listings.filter((l) => l.status === 'vendu');
    const stockItems = listings.filter(isActivelyInStock);

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
    const newListingsToday = listings.filter((l) => toLocalDateString(new Date(l.created_at)) === today).length;

    return {
      soldTodayCount: soldToday.length,
      profitToday,
      revenueMonth,
      profitMonth,
      roiMonth,
      stockValue,
      agingStockCount: agingStock.length,
      newListingsToday,
      recentListings: listings.slice(0, 5),
      hasAnyListing: listings.length > 0,
    };
  }, [listings]);

  // Fraicheur de synchro pertinente pour la vue actuelle : tous les comptes
  // connectes si "Tous les comptes" est selectionne, sinon uniquement le
  // compte selectionne. Un seul compte jamais synchronise (ou l'absence de
  // compte connecte) rend l'ensemble non fiable -- ne jamais laisser croire
  // que les chiffres sont a jour si un seul maillon manque.
  const relevantAccounts = accounts
    .filter((a) => a.connected)
    .filter((a) => selectedAccountId === 'all' || a.id === selectedAccountId);
  const hasNeverSyncedAccount = relevantAccounts.some((a) => !a.last_synced_at);
  const oldestSync = hasNeverSyncedAccount || relevantAccounts.length === 0
    ? null
    : relevantAccounts.reduce<string>((oldest, a) => (a.last_synced_at! < oldest ? a.last_synced_at! : oldest), relevantAccounts[0].last_synced_at!);
  const syncStaleHours = oldestSync ? (Date.now() - new Date(oldestSync).getTime()) / 3_600_000 : null;
  const isSyncStale = relevantAccounts.length > 0 && (oldestSync === null || syncStaleHours! > STALE_SYNC_THRESHOLD_HOURS);
  const hasNarrativeContent = !!insights && (insights.narratives.length > 0 || insights.priorities.length > 0);
  const showCopilote = hasNarrativeContent || (relevantAccounts.length > 0 && isSyncStale);

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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {loadError && <ErrorBanner message={loadError} className="mb-6" />}

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
      {(limit !== null || isAdmin) && (
        <div className="bg-gradient-to-r from-surface to-surface border border-white/5 rounded-2xl p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-neon-500/10 rounded-xl flex items-center justify-center">
                <Zap className="w-6 h-6 text-neon-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-200">Credits restants</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  {isAdmin ? (
                    <span className="text-3xl font-black text-neon-500">Illimité</span>
                  ) : (
                    <>
                      <span className="text-3xl font-black text-neon-500">{credits}</span>
                      <span className="text-sm text-gray-500">/ {limit} ce mois</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            {!isAdmin && limit !== null && (
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
            )}
          </div>
        </div>
      )}

      {/* Copilote */}
      {showCopilote && (
        <div className="mb-8 bg-gradient-to-br from-neon-500/10 via-surface to-surface border border-neon-500/20 rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-neon-500" />
              <h2 className="font-bold text-sm text-gray-200">Copilote</h2>
            </div>
            {relevantAccounts.length > 0 && (
              <span className={`text-[10px] font-mono ${isSyncStale ? 'text-amber-400' : 'text-gray-500'}`}>
                {isSyncStale
                  ? oldestSync
                    ? `Dernière synchro : ${formatRelativeSync(oldestSync)}`
                    : 'Jamais synchronisé'
                  : `Dernière synchro : ${formatRelativeSync(oldestSync)}`}
              </span>
            )}
          </div>

          {isSyncStale && relevantAccounts.length > 0 && (
            <div className="flex items-start gap-2.5 bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-3 mb-4">
              <p className="text-xs text-amber-300">
                Données non synchronisées{oldestSync ? ` depuis ${formatRelativeSync(oldestSync)}` : ''} — synchronise
                depuis Stock pour des chiffres à jour.
              </p>
            </div>
          )}

          {!!insights?.narratives.length && (
            <div className="space-y-1.5 mb-4">
              {insights.narratives.map((n, i) => (
                <p key={i} className="text-sm text-gray-300">{n.message}</p>
              ))}
            </div>
          )}

          {!!insights?.priorities.length && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-2">Priorités du jour</p>
              <div className="space-y-1.5">
                {insights.priorities.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => onNavigate('stock')}
                    className="w-full flex items-center gap-2.5 text-left text-xs text-gray-400 hover:text-gray-200 transition-colors py-1"
                  >
                    <span className="w-5 h-5 rounded-full bg-neon-500/10 text-neon-500 font-bold flex items-center justify-center flex-shrink-0 text-[10px]">
                      {i + 1}
                    </span>
                    {p.message}
                  </button>
                ))}
              </div>
            </div>
          )}
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

      {/* Marché */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-sm text-gray-300">Marché</h2>
          <button onClick={() => onNavigate('opportunities')} className="text-xs text-neon-500 hover:underline flex items-center gap-1">
            Voir les opportunités <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Search, label: 'Opportunités aujourd\'hui', value: loading ? '-' : opportunityStats.today.toString(), color: 'text-blue-400', bg: 'bg-blue-400/10' },
            { icon: TrendingUp, label: 'ROI moyen (marché)', value: loading ? '-' : `${opportunityStats.avgRoi} %`, color: 'text-neon-500', bg: 'bg-neon-500/10' },
            { icon: Sparkles, label: 'Bénéfice estimé (marché)', value: loading ? '-' : `${opportunityStats.avgProfit} EUR`, color: 'text-neon-500', bg: 'bg-neon-500/10' },
            { icon: Package, label: 'Nouvelles annonces (stock)', value: loading ? '-' : metrics.newListingsToday.toString(), color: 'text-gray-100', bg: 'bg-white/5' },
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
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} shape="block" className="h-14" />)}</div>
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
