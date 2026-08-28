import { useEffect, useMemo, useState } from 'react';
import { Sparkles, TrendingUp, Star, ArrowRight, Zap, Search, Package, Layers, Lightbulb, Lock, Eye, Receipt, type LucideIcon } from 'lucide-react';
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
import { OnboardingChecklist } from './OnboardingChecklist';

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



// Carte de KPI unique pour les deux lignes de la grille. Extraite parce que le
// markup etait duplique a l'identique dans trois blocs ("Aujourd'hui", "Ce
// mois-ci", "Marché") -- et que les trois avaient deja diverge.
//
// ATTENTION AUX COULEURS : les valeurs etaient rendues en `text-green-400` /
// `text-yellow-400` / `text-amber-400`, teintes heritees du theme SOMBRE et
// jamais reprises lors du passage au blanc. Contrastes mesures sur blanc :
// green-400 1.74:1, yellow-400 1.53:1, amber-400 1.67:1, red-400 2.77:1 --
// toutes tres en dessous du seuil AA (4.5:1). Les tons ci-dessous utilisent
// les paliers 600/700, mesures au-dessus du seuil (voir CLAUDE.md, section
// Tokens de couleur & accessibilite).
type KpiTone = 'money' | 'brand' | 'warn' | 'alert' | 'neutral';

const KPI_TONES: Record<KpiTone, { text: string; icon: string; bg: string }> = {
  money: { text: 'text-green-700', icon: 'text-green-700', bg: 'bg-green-500/10' },
  brand: { text: 'text-neon-500', icon: 'text-neon-500', bg: 'bg-neon-500/10' },
  warn: { text: 'text-amber-700', icon: 'text-amber-700', bg: 'bg-amber-500/10' },
  alert: { text: 'text-red-600', icon: 'text-red-600', bg: 'bg-red-500/10' },
  neutral: { text: 'text-gray-900', icon: 'text-gray-500', bg: 'bg-gray-100' },
};

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'neutral',
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: KpiTone;
  onClick?: () => void;
}) {
  const t = KPI_TONES[tone];
  const content = (
    <>
      <div className={`w-8 h-8 ${t.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-3.5 h-3.5 ${t.icon}`} />
      </div>
      <div className="min-w-0">
        <p className={`text-base font-bold ${t.text} leading-tight truncate tabular-nums`}>{value}</p>
        <p className="text-[11px] text-gray-500 truncate">{label}</p>
        {hint && <p className="text-[10px] text-gray-400 truncate">{hint}</p>}
      </div>
    </>
  );

  // Un bouton UNIQUEMENT quand il mene reellement quelque part : rendre toutes
  // les cartes cliquables donnerait des affordances qui ne font rien.
  if (!onClick) {
    return <div className="bg-surface border border-gray-200 rounded-xl px-3.5 py-3 flex items-center gap-3">{content}</div>;
  }
  return (
    <button
      onClick={onClick}
      className="bg-surface border border-gray-200 rounded-xl px-3.5 py-3 flex items-center gap-3 text-left hover:border-neon-500/30 hover:bg-neon-500/5 transition-colors"
    >
      {content}
    </button>
  );
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


  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {loadError && <ErrorBanner message={loadError} className="mb-6" />}

      {/* ============ 1. EN-TETE : salutation + credits + actions ============ */}
      <PageHeader
        title={<>{greeting()}, <span className="text-neon-500">{firstName}</span></>}
        description="Voici ce qui demande ton attention aujourd'hui."
        meta={
          accounts.length > 0 && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
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

      {/* FTUE minimal (audit 2026-08-28) : disparait d'elle-meme des que le
          compte Vinted est connecte ET qu'au moins une annonce existe --
          jamais affichee a un utilisateur deja etabli. */}
      <OnboardingChecklist hasAccount={accounts.length > 0} hasAnyListing={metrics.hasAnyListing} onNavigate={onNavigate} />

      {/* Credits et actions rapides sur la MEME ligne : les credits
          conditionnent ce que ces actions permettent de faire. Les separer
          obligeait a chercher l'information ailleurs sur la page. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,260px)_1fr] gap-3 mb-6">
        {(limit !== null || unlimitedCredits) && (
          <div className="bg-surface border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
            {unlimitedCredits ? (
              <div className="w-11 h-11 bg-neon-500/10 rounded-full flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-neon-500" />
              </div>
            ) : (
              <UsageRing
                value={limit ? (credits / limit) * 100 : 0}
                colorClassName={credits > 3 ? 'text-neon-500' : credits > 0 ? 'text-amber-600' : 'text-red-600'}
                size={44}
              >
                <span className="text-sm font-black text-gray-900">{credits}</span>
              </UsageRing>
            )}
            <div className="min-w-0">
              <p className="text-xs text-gray-500">Crédits restants</p>
              {unlimitedCredits ? (
                <p className="text-sm font-bold text-neon-500">Illimité</p>
              ) : (
                <p className="text-sm font-bold text-gray-900">
                  {credits} <span className="text-gray-500 font-semibold">/ {limit}</span>
                </p>
              )}
              {isLimitReached && (
                <button onClick={() => onNavigate('subscription')} className="text-[11px] text-red-600 underline hover:text-red-700">
                  Passer au Pro
                </button>
              )}
              {!unlimitedCredits && limit !== null && credits > 0 && credits <= 3 && (
                <p className="text-[11px] text-amber-700">Bientôt épuisés</p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map(({ icon: Icon, label, page }) => (
            <button
              key={label}
              onClick={() => onNavigate(page)}
              className="flex items-center gap-2.5 bg-surface border border-gray-200 rounded-xl px-3 py-3 text-left hover:border-neon-500/30 hover:bg-neon-500/5 transition-all"
            >
              <div className="w-8 h-8 bg-neon-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-neon-500" />
              </div>
              <span className="text-xs font-semibold text-gray-700 leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {showZeroCreditModal && (
        <Modal onClose={() => setShowZeroCreditModal(false)} size="sm">
          <div className="text-center">
            <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock className="w-5 h-5 text-red-600" />
            </div>
            <h2 className="font-bold text-lg mb-2">Limite de crédits atteinte</h2>
            <p className="text-sm text-gray-500 mb-6">
              Tu as utilisé tous tes crédits {plan === 'free' ? 'du plan Free' : 'de ce mois-ci'}. Passe au plan Pro pour générer des annonces en illimité.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => { setShowZeroCreditModal(false); onNavigate('subscription'); }}>
                Passer au Pro
              </Button>
              <button
                onClick={() => setShowZeroCreditModal(false)}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors py-2"
              >
                Plus tard
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ============ 2. INSIGHTS & MARCHE (Copilote) ============
          Bloc DISCRET : il informe, il ne reclame pas l'attention. C'est lui
          qui remplace l'ancien grand bandeau colore -- celui-ci occupait le
          haut de page en permanence alors qu'il ne disait, la plupart du
          temps, rien de plus que les KPIs juste en dessous. */}
      {(showCopilote || newOpportunities > 0) && (
        <div className="bg-surface border border-gray-200 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-neon-500" />
              <h2 className="font-bold text-sm text-gray-900">Copilote</h2>
            </div>
            {relevantAccounts.length > 0 && (
              <span className={`text-[11px] ${isSyncStale ? 'text-amber-700' : 'text-gray-500'}`}>
                {oldestSync ? `Dernière synchro : ${formatRelativeSync(oldestSync)}` : 'Jamais synchronisé'}
              </span>
            )}
          </div>

          {isSyncStale && relevantAccounts.length > 0 && (
            <p className="text-xs text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">
              Données non synchronisées{oldestSync ? ` depuis ${formatRelativeSync(oldestSync)}` : ''} — synchronise
              depuis Mes annonces pour des chiffres à jour.
            </p>
          )}

          {!!insights?.narratives.length && (
            <div className="space-y-1.5">
              {insights.narratives.map((n, i) => (
                <p key={i} className="text-sm text-gray-700">{n.message}</p>
              ))}
            </div>
          )}

          {/* Alerte opportunites : cliquable, et affichee UNIQUEMENT s'il y en
              a reellement -- jamais une ligne "0 opportunité" qui occuperait
              de la place pour ne rien dire. */}
          {newOpportunities > 0 && (
            <button
              onClick={() => onNavigate('actions')}
              className="mt-3 w-full flex items-center gap-2.5 text-left bg-neon-500/5 border border-neon-500/20 rounded-lg px-3 py-2.5 hover:bg-neon-500/10 transition-colors group"
            >
              <span className="relative flex h-2 w-2 flex-shrink-0" aria-hidden="true">
                <span className="live-ping absolute inline-flex h-full w-full rounded-full bg-neon-500" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-500" />
              </span>
              <span className="text-sm text-gray-800 flex-1 min-w-0">
                <span className="font-bold">{newOpportunities}</span> opportunité{newOpportunities > 1 ? 's' : ''} détectée
                {newOpportunities > 1 ? 's' : ''} ces dernières 24h
              </span>
              <ArrowRight className="w-4 h-4 text-neon-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>
      )}

      {/* ============ 3. KPIs ============
          Deux lignes, deux natures : ce que TU as fait, puis ce que le MARCHE
          propose. L'ancienne organisation melangeait les deux et repetait les
          memes metriques dans "Aujourd'hui", "Ce mois-ci" et "Marché" -- le
          stock sain et les opportunites apparaissaient chacun deux a trois
          fois sur la meme page. */}
      <div className="space-y-5 mb-8">
        <div>
          <SectionLabel
            className="mb-3"
            action={
              <button onClick={() => onNavigate('accounting')} className="text-xs text-neon-500 hover:underline flex items-center gap-1">
                Voir le détail <ArrowRight className="w-3 h-3" />
              </button>
            }
          >
            Ta performance · ce mois-ci
          </SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <KpiCard icon={TrendingUp} label="Chiffre d'affaires" value={loading ? '—' : formatEUR(metrics.revenueMonth)} tone="money" />
            <KpiCard
              icon={Sparkles}
              label="Bénéfice net"
              value={loading ? '—' : formatEUR(metrics.profitMonth)}
              tone={metrics.profitMonth >= 0 ? 'money' : 'alert'}
            />
            <KpiCard icon={TrendingUp} label="ROI moyen" value={loading ? '—' : `${metrics.roiMonth} %`} tone="money" />
            <KpiCard icon={Package} label="Valeur du stock" value={loading ? '—' : formatEUR(metrics.stockValue)} tone="neutral" />
          </div>
        </div>

        <div>
          <SectionLabel
            className="mb-3"
            action={
              <button onClick={() => onNavigate('actions')} className="text-xs text-neon-500 hover:underline flex items-center gap-1">
                Voir les opportunités <ArrowRight className="w-3 h-3" />
              </button>
            }
          >
            Veille marché
          </SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <KpiCard
              icon={Search}
              label="Opportunités 24h"
              value={loading ? '—' : newOpportunities.toString()}
              tone={newOpportunities > 0 ? 'brand' : 'neutral'}
              onClick={() => onNavigate('actions')}
            />
            <KpiCard icon={TrendingUp} label="ROI moyen (marché)" value={loading ? '—' : `${opportunityStats.avgRoi} %`} tone="money" />
            <KpiCard icon={Sparkles} label="Bénéfice estimé (marché)" value={loading ? '—' : formatEUR(opportunityStats.avgProfit)} tone="money" />
            <KpiCard
              icon={Package}
              label="Santé du stock"
              value={loading || !metrics.hasAnyListing ? '—' : `${metrics.stockHealthPct} %`}
              hint={
                !metrics.hasAnyListing
                  ? undefined
                  : metrics.agingStockCount > 0
                    ? `${metrics.agingStockCount} article${metrics.agingStockCount > 1 ? 's' : ''} > ${AGING_STOCK_DAYS} j`
                    : 'Aucun article dormant'
              }
              tone={!metrics.hasAnyListing ? 'neutral' : metrics.stockHealthPct >= 80 ? 'money' : metrics.stockHealthPct >= 50 ? 'warn' : 'alert'}
              onClick={metrics.hasAnyListing ? () => onNavigate('watchlist') : undefined}
            />
          </div>
        </div>
      </div>

      {/* ============ 4. ANNONCES RECENTES ============ */}
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
                <div key={l.id} className="bg-surface border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4 hover:border-gray-300 transition-colors group">
                  {l.image_urls?.[0] ? (
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
                      <img src={l.image_urls[0]} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 bg-neon-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-neon-500/70" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-gray-900 transition-colors">{l.title}</p>
                    <p className="text-xs text-gray-500">{l.brand} &middot; {new Date(l.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</p>
                  </div>
                  {l.is_favorite && <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 flex-shrink-0" />}
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
