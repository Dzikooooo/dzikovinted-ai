import { useEffect, useMemo, useState } from 'react';
import { Sparkles, TrendingUp, Star, ArrowRight, Zap, Clock, Search, Package, ShoppingBag, Puzzle, Layers, Lightbulb, AlertTriangle, Lock, Receipt, Eye, type LucideIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useVintedAccountFilter } from '../../contexts/VintedAccountFilterContext';
import { useInsights } from '../../hooks/useInsights';
import { useIsAdmin } from '../../hooks/useIsAdmin';
import { supabase } from '../../lib/supabase';
import type { DashboardPage, Listing } from '../../lib/types';
import { PLAN_LIMITS } from '../../lib/types';
import { AGING_STOCK_DAYS } from '../../lib/insights/constants';
import { isActivelyInStock } from '../../lib/listingStatus';
import { startOfLocalDayISO, toLocalDateString } from '../../lib/date';
import { formatRelativeSync } from '../../lib/formatRelativeTime';
import { computeDominantSignal, type DominantSignalTier } from '../../lib/dominantSignal';
import { formatEUR } from '../../lib/currency';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Skeleton } from '../../components/ui/Skeleton';
import { OneScoreBar } from '../../components/ui/OneScoreBar';
import { UsageRing } from '../../components/ui/UsageRing';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { EmptyState } from '../../components/ui/EmptyState';

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

// Raccourcis vers les actions les plus frequentes (audit personnel
// utilisateur, 2026-08-02 : "actions rapides") -- navigation pure, aucune
// nouvelle fonctionnalite, juste un acces plus direct a ce qui existe deja.
const QUICK_ACTIONS: { icon: LucideIcon; label: string; page: DashboardPage }[] = [
  { icon: Sparkles, label: 'Générer une annonce', page: 'generator' },
  { icon: Search, label: 'Voir les opportunités', page: 'actions' },
  { icon: Eye, label: 'Mes annonces', page: 'watchlist' },
  { icon: Receipt, label: 'Comptabilité', page: 'accounting' },
];

const DOMINANT_SIGNAL_STYLES: Record<DominantSignalTier, { bg: string; border: string; text: string; icon: typeof AlertTriangle; label: string }> = {
  critical_alert: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: AlertTriangle, label: 'Alerte critique' },
  warning_alert: { bg: 'bg-amber-400/10', border: 'border-amber-400/30', text: 'text-amber-400', icon: AlertTriangle, label: 'À surveiller' },
  // Pas de bleu dans la palette (regle explicite 2026-07-28) -- jaune
  // reserve aux elements d'attention/opportunites/badges.
  opportunity: { bg: 'bg-yellow-400/10', border: 'border-yellow-400/30', text: 'text-yellow-400', icon: Search, label: 'Opportunité' },
  recommendation: { bg: 'bg-neon-500/10', border: 'border-neon-500/30', text: 'text-neon-500', icon: Lightbulb, label: 'Recommandation' },
  // 'stat' affiche toujours un chiffre de benefice pur (voir dominantSignal.ts
  // -- "Benefice ce mois-ci : +X€"), jamais une action -- vert (benefice).
  stat: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', icon: TrendingUp, label: 'Aperçu du mois' },
};

export default function DashboardHome({ onNavigate }: DashboardHomeProps) {
  const { profile, user } = useAuth();
  const { accounts, selectedAccountId, selectedAccount } = useVintedAccountFilter();
  const { report: insights } = useInsights();
  const [listings, setListings] = useState<Listing[]>([]);
  const [newOpportunities, setNewOpportunities] = useState(0);
  const [opportunityStats, setOpportunityStats] = useState({ today: 0, avgRoi: 0, avgProfit: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showZeroCreditModal, setShowZeroCreditModal] = useState(false);

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
  const isAdmin = useIsAdmin();
  // Programme Beta ResellOS (Lot 4) : credits_mode='unlimited' affiche le
  // meme etat "Illimite" qu'un admin, sans jamais modifier profiles.credits
  // (le solde reel reste intact -- voir _shared/credits.ts cote serveur).
  const unlimitedCredits = isAdmin || profile?.credits_mode === 'unlimited';
  const limit = unlimitedCredits ? null : PLAN_LIMITS[plan];
  const isLimitReached = !unlimitedCredits && limit !== null && credits <= 0;
  const firstName = profile?.full_name?.split(' ')[0] || profile?.email?.split('@')[0] || '';

  const handleNewListing = () => {
    if (isLimitReached) {
      setShowZeroCreditModal(true);
      return;
    }
    onNavigate('generator');
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
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
      stockHealthPct: stockItems.length > 0 ? Math.round(((stockItems.length - agingStock.length) / stockItems.length) * 100) : 100,
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
  const hasNarrativeContent = !!insights && insights.narratives.length > 0;
  const showCopilote = hasNarrativeContent || (relevantAccounts.length > 0 && isSyncStale);

  // Information dominante de l'ecran (decision produit validee le
  // 2026-07-23) : une seule chaine de conditions deterministe, voir
  // src/lib/dominantSignal.ts pour l'ordre exact et sa justification.
  // Remplace l'ancienne liste "Priorites du jour" (score continu).
  const dominantSignal = useMemo(
    () =>
      computeDominantSignal({
        alerts: insights?.alerts ?? [],
        recommendations: insights?.recommendations ?? [],
        newOpportunitiesLast24h: newOpportunities,
        profitMonth: metrics.profitMonth,
      }),
    [insights, newOpportunities, metrics.profitMonth]
  );

  const todayCards = [
    {
      icon: ShoppingBag,
      label: metrics.soldTodayCount > 0 ? `${metrics.soldTodayCount} vente${metrics.soldTodayCount > 1 ? 's' : ''} aujourd'hui` : 'Aucune vente aujourd\'hui',
      detail: metrics.soldTodayCount === 0
        ? 'Ton prochain article pourrait se vendre aujourd\'hui'
        : metrics.profitToday > 0
          ? `+${formatEUR(metrics.profitToday)} de bénéfice`
          : `${formatEUR(metrics.profitToday)} de bénéfice`,
      page: 'watchlist' as DashboardPage,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
      live: false,
    },
    {
      icon: Search,
      label: newOpportunities > 0 ? `${newOpportunities} nouvelle${newOpportunities > 1 ? 's' : ''} opportunité${newOpportunities > 1 ? 's' : ''}` : 'Aucune opportunité récente',
      detail: 'Détectées sur les dernières 24h',
      page: 'actions' as DashboardPage,
      color: 'text-yellow-400',
      bg: 'bg-yellow-400/10',
      // Petit point pulsant -- signale une vraie detection recente, pas
      // une decoration permanente (audit personnel utilisateur, 2026-08-04 :
      // "je voudrais sentir... de nouvelles opportunites").
      live: newOpportunities > 0,
    },
    {
      icon: Clock,
      label: metrics.agingStockCount > 0 ? `${metrics.agingStockCount} article${metrics.agingStockCount > 1 ? 's' : ''} a surveiller` : 'Stock sain',
      detail: metrics.agingStockCount > 0
        ? `En stock depuis plus de ${AGING_STOCK_DAYS} jours`
        : metrics.hasAnyListing
          ? 'Aucun article dormant'
          : 'Génère ta première annonce pour commencer',
      page: 'watchlist' as DashboardPage,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
      live: false,
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {loadError && <ErrorBanner message={loadError} className="mb-6" />}

      {/* Header */}
      <PageHeader
        title={<>{greeting()}, <span className="text-neon-500">{firstName}</span></>}
        description="Voici ce qui demande ton attention aujourd'hui."
        meta={
          accounts.length > 0 && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-white/5 px-2.5 py-1 rounded-full">
              <Layers className="w-3 h-3" />
              Vue : {selectedAccountId === 'all' ? 'Tous les comptes' : selectedAccount?.label}
            </span>
          )
        }
        action={
          <Button icon={<Sparkles className="w-4 h-4" />} onClick={handleNewListing}>
            Nouvelle annonce
          </Button>
        }
      />

      {/* Actions rapides -- acces direct aux 4 taches les plus frequentes,
          distinct des cartes "Aujourd'hui" ci-dessous qui informent plutot
          qu'elles n'agissent. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {QUICK_ACTIONS.map(({ icon: Icon, label, page }) => (
          <button
            key={label}
            onClick={() => onNavigate(page)}
            className="flex items-center gap-2.5 bg-surface border border-white/5 rounded-xl px-4 py-3 text-left hover:border-neon-500/30 hover:bg-neon-500/5 transition-all"
          >
            <div className="w-8 h-8 bg-neon-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-neon-500" />
            </div>
            <span className="text-xs font-semibold text-gray-300">{label}</span>
          </button>
        ))}
      </div>

      {showZeroCreditModal && (
        <Modal onClose={() => setShowZeroCreditModal(false)} size="sm">
          <div className="text-center">
            <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock className="w-5 h-5 text-red-400" />
            </div>
            <h2 className="font-bold text-lg mb-2">Limite de crédits atteinte</h2>
            <p className="text-sm text-gray-400 mb-6">
              Tu as utilisé tous tes crédits {plan === 'free' ? 'du plan Free' : 'de ce mois-ci'}. Passe au plan Pro pour générer des annonces en illimité.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => { setShowZeroCreditModal(false); onNavigate('subscription'); }}>
                Passer au Pro
              </Button>
              <button
                onClick={() => setShowZeroCreditModal(false)}
                className="text-sm text-gray-500 hover:text-gray-300 transition-colors py-2"
              >
                Plus tard
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Information dominante -- deplacee en tete de contenu et agrandie
          (audit personnel utilisateur, 2026-08-04 : "il faudrait davantage
          guider l'oeil") : c'est la seule chose qui merite l'attention
          immediate, voir src/lib/dominantSignal.ts pour la regle
          deterministe -- elle doit donc etre lue avant les anneaux et le
          reste, pas apres. */}
      {!loading && (
        <button
          onClick={() => onNavigate(dominantSignal.actionPage)}
          className={`w-full text-left mb-6 ${DOMINANT_SIGNAL_STYLES[dominantSignal.tier].bg} border ${DOMINANT_SIGNAL_STYLES[dominantSignal.tier].border} rounded-3xl p-6 flex items-center gap-5 hover:-translate-y-0.5 transition-all duration-200 group`}
        >
          <div className={`w-14 h-14 ${DOMINANT_SIGNAL_STYLES[dominantSignal.tier].bg} rounded-2xl flex items-center justify-center flex-shrink-0`}>
            {(() => {
              const Icon = DOMINANT_SIGNAL_STYLES[dominantSignal.tier].icon;
              return <Icon className={`w-6 h-6 ${DOMINANT_SIGNAL_STYLES[dominantSignal.tier].text}`} />;
            })()}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[10px] font-mono uppercase tracking-wider ${DOMINANT_SIGNAL_STYLES[dominantSignal.tier].text} mb-1`}>
              {DOMINANT_SIGNAL_STYLES[dominantSignal.tier].label}
            </p>
            <p className="text-lg sm:text-xl font-black text-gray-100">{dominantSignal.message}</p>
          </div>
          <ArrowRight className={`w-5 h-5 ${DOMINANT_SIGNAL_STYLES[dominantSignal.tier].text} flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity`} />
        </button>
      )}

      {/* Bandeau circulaire -- deux anneaux plutot qu'un (restructuration
          2026-07-29) : credits ET sante du stock partagent le meme langage
          visuel (anneau colore par etat, jamais une seconde couleur
          concurrente ajoutee autour). Volontairement plus compact que le
          signal dominant ci-dessus : ce sont des jauges de reference,
          jamais l'element qui doit capter l'oeil en premier. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {(limit !== null || unlimitedCredits) && (
          <div className={`bg-surface border border-white/5 rounded-2xl p-4 flex items-center gap-4 ${
            !loading && !metrics.hasAnyListing ? 'sm:col-span-2' : ''
          }`}>
            {unlimitedCredits ? (
              <div className="w-14 h-14 bg-neon-500/10 rounded-full flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-neon-500" />
              </div>
            ) : (
              <UsageRing
                value={limit ? (credits / limit) * 100 : 0}
                colorClassName={credits > 3 ? 'text-neon-500' : credits > 0 ? 'text-amber-400' : 'text-red-500'}
                size={56}
              >
                <span className="text-base font-black text-gray-100">{credits}</span>
              </UsageRing>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-200">Crédits restants</p>
              {unlimitedCredits ? (
                <p className="text-base font-black text-neon-500 mt-0.5">Illimité</p>
              ) : (
                <p className="text-sm text-gray-500 mt-0.5">{credits} / {limit} ce mois</p>
              )}
              {isLimitReached && (
                <p className="text-xs text-red-400 mt-1.5">
                  Limite atteinte.{' '}
                  <button onClick={() => onNavigate('subscription')} className="underline hover:text-red-300">
                    Passer au Pro
                  </button>
                </p>
              )}
              {!unlimitedCredits && limit !== null && credits > 0 && credits <= 3 && (
                <p className="text-xs text-amber-400 mt-1.5">Plus que {credits} crédit{credits > 1 ? 's' : ''} disponible{credits > 1 ? 's' : ''}.</p>
              )}
            </div>
          </div>
        )}

        {!loading && metrics.hasAnyListing && (
          <div className="bg-surface border border-white/5 rounded-2xl p-4 flex items-center gap-4">
            <UsageRing
              value={metrics.stockHealthPct}
              colorClassName={metrics.stockHealthPct >= 80 ? 'text-neon-500' : metrics.stockHealthPct >= 50 ? 'text-amber-400' : 'text-red-500'}
              size={56}
            >
              <span className="text-base font-black text-gray-100">{metrics.stockHealthPct}%</span>
            </UsageRing>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-200">Santé du stock</p>
              <p className="text-sm text-gray-500 mt-0.5">
                {metrics.agingStockCount > 0
                  ? `${metrics.agingStockCount} article${metrics.agingStockCount > 1 ? 's' : ''} en stock depuis plus de ${AGING_STOCK_DAYS} jours`
                  : 'Aucun article dormant'}
              </p>
            </div>
          </div>
        )}
      </div>

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
                depuis Mes annonces pour des chiffres à jour.
              </p>
            </div>
          )}

          {!!insights?.narratives.length && (
            <div className="space-y-1.5">
              {insights.narratives.map((n, i) => (
                <p key={i} className="text-sm text-gray-300">{n.message}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail toujours visible (restructuration 2026-07-29, remplace
          l'ancien "Voir le detail" replie) -- l'information dominante
          ci-dessus reste la premiere lecture, mais le reste n'est plus
          cache derriere un clic. */}
      <div className="space-y-8 mb-8">
          {/* Aujourd'hui */}
          <div>
            <SectionLabel className="mb-4">Aujourd'hui</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {todayCards.map(({ icon: Icon, label, detail, page, color, bg, live }, i) => (
                <button
                  key={label}
                  onClick={() => onNavigate(page)}
                  style={{ animationDelay: `${i * 60}ms` }}
                  className="rise-in bg-surface border border-white/5 rounded-2xl p-5 text-left hover:border-white/10 hover:-translate-y-0.5 transition-all duration-200 group"
                >
                  <div className={`relative w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                    {/* Point pulsant -- signale une detection reelle et recente
                        (nouvelles opportunites), jamais affiche sans fait a
                        l'appui (audit personnel utilisateur, 2026-08-04). */}
                    {live && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3" aria-hidden="true">
                        <span className={`live-ping absolute inline-flex h-full w-full rounded-full ${bg.replace('/10', '')}`} />
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${bg.replace('/10', '')}`} />
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-sm mb-1">{loading ? '...' : label}</h3>
                  <p className="text-xs text-gray-500">{detail}</p>
                  <ArrowRight className={`w-4 h-4 ${color} mt-3 opacity-0 group-hover:opacity-100 transition-opacity`} />
                </button>
              ))}
            </div>
          </div>

          {/* Vue financiere */}
          <div>
            <SectionLabel
              className="mb-3"
              action={
                <button onClick={() => onNavigate('accounting')} className="text-xs text-neon-500 hover:underline flex items-center gap-1">
                  Voir le détail <ArrowRight className="w-3 h-3" />
                </button>
              }
            >
              Ce mois-ci
            </SectionLabel>
            {/* Chiffres de reference, volontairement plus denses que les cartes
                "Aujourd'hui" ci-dessus (audit personnel utilisateur,
                2026-08-04) : purement informatifs, jamais l'element qui doit
                capter l'oeil en premier sur la page. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {[
                { icon: TrendingUp, label: "Chiffre d'affaires", value: loading ? '-' : formatEUR(metrics.revenueMonth), color: 'text-green-400', bg: 'bg-green-500/10' },
                { icon: Sparkles, label: 'Bénéfice', value: loading ? '-' : formatEUR(metrics.profitMonth), color: 'text-green-400', bg: 'bg-green-500/10' },
                { icon: TrendingUp, label: 'ROI moyen', value: loading ? '-' : `${metrics.roiMonth} %`, color: 'text-green-400', bg: 'bg-green-500/10' },
                { icon: Package, label: 'Valeur du stock', value: loading ? '-' : formatEUR(metrics.stockValue), color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
              ].map(({ icon: Icon, label, value, color, bg }) => (
                <div key={label} className="bg-surface/60 border border-white/5 rounded-xl px-3.5 py-3 flex items-center gap-3">
                  <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-3.5 h-3.5 ${color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-base font-bold ${color} leading-tight truncate`}>{value}</p>
                    <p className="text-[10px] text-gray-500 truncate">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Marché */}
          <div>
            <SectionLabel
              className="mb-3"
              action={
                <button onClick={() => onNavigate('actions')} className="text-xs text-neon-500 hover:underline flex items-center gap-1">
                  Voir les opportunités <ArrowRight className="w-3 h-3" />
                </button>
              }
            >
              Marché
            </SectionLabel>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {[
                { icon: Search, label: 'Opportunités aujourd\'hui', value: loading ? '-' : opportunityStats.today.toString(), color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
                { icon: TrendingUp, label: 'ROI moyen (marché)', value: loading ? '-' : `${opportunityStats.avgRoi} %`, color: 'text-green-400', bg: 'bg-green-500/10' },
                { icon: Sparkles, label: 'Bénéfice estimé (marché)', value: loading ? '-' : formatEUR(opportunityStats.avgProfit), color: 'text-green-400', bg: 'bg-green-500/10' },
                { icon: Package, label: 'Nouvelles annonces (stock)', value: loading ? '-' : metrics.newListingsToday.toString(), color: 'text-gray-100', bg: 'bg-white/5' },
              ].map(({ icon: Icon, label, value, color, bg }) => (
                <div key={label} className="bg-surface/60 border border-white/5 rounded-xl px-3.5 py-3 flex items-center gap-3">
                  <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-3.5 h-3.5 ${color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-base font-bold ${color} leading-tight truncate`}>{value}</p>
                    <p className="text-[10px] text-gray-500 truncate">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      {/* Compte Vinted */}
      <button
        onClick={() => onNavigate('vinted-account')}
        className="w-full bg-surface/50 border border-white/5 border-dashed rounded-2xl p-5 mb-8 flex items-center gap-4 text-left hover:border-white/10 transition-colors"
      >
        <div className="relative w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center flex-shrink-0">
          <Puzzle className="w-4 h-4 text-gray-500" />
          {/* Point pulsant -- reflete une vraie session Vinted active,
              retire des qu'aucun compte pertinent n'est connecte (audit
              personnel utilisateur, 2026-08-04 : "je voudrais sentir...
              de la synchronisation"). */}
          {(selectedAccountId === 'all' ? accounts.some((a) => a.connected) : selectedAccount?.connected) && (
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5" aria-hidden="true">
              <span className="live-ping absolute inline-flex h-full w-full rounded-full bg-neon-500" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-neon-500" />
            </span>
          )}
        </div>
        <div>
          {accounts.length === 0 ? (
            <>
              <p className="text-sm font-semibold text-gray-300">Synchronisation Vinted</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Connecte l'extension Chrome pour synchroniser automatiquement tes annonces Vinted et piloter tes publications depuis Resell OS.
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
        <SectionLabel
          className="mb-4"
          action={
            metrics.hasAnyListing && (
              <button onClick={() => onNavigate('watchlist')} className="text-xs text-neon-500 hover:underline flex items-center gap-1">
                Voir tout <ArrowRight className="w-3 h-3" />
              </button>
            )
          }
        >
          Annonces récentes
        </SectionLabel>
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} shape="block" className="h-14" />)}</div>
        ) : metrics.recentListings.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Aucune annonce encore"
            description="Génère ta première annonce et regarde le résultat."
            action={{ label: 'Générer maintenant', onClick: () => onNavigate('generator') }}
          />
        ) : (
          <div className="space-y-2">
            {metrics.recentListings.map((l) => {
              const listingScore = insights?.scores.get(l.id)?.score;
              return (
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
                  <p className="text-sm font-bold text-neon-500 flex-shrink-0">{formatEUR(l.price)}</p>
                  {/* Indicateur secondaire de comparaison, pas l'element dominant de la
                      ligne (decision produit validee le 2026-07-23) -- titre et prix
                      restent la lecture principale, le score n'aide qu'a comparer. */}
                  {listingScore !== undefined && (
                    <OneScoreBar score={listingScore} size="sm" className="hidden sm:block w-20 flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
