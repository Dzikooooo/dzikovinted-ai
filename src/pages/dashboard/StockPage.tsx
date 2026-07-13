import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X, Sparkles, Clock, RefreshCw, Eye, Heart, Lightbulb, Pencil, UploadCloud } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useVintedAccountFilter } from '../../contexts/VintedAccountFilterContext';
import { useInsights } from '../../hooks/useInsights';
import { useActionEngine } from '../../hooks/useActionEngine';
import { supabase } from '../../lib/supabase';
import type { Listing } from '../../lib/types';
import { PLAN_PHOTO_LIMITS } from '../../lib/types';
import { StatCard } from '../../components/ui/StatCard';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import AccountAvatar from '../../components/ui/AccountAvatar';
import VintedStatusBadge from '../../components/ui/VintedStatusBadge';
import PublishConfirmationModal, { type PackageSize } from '../../components/publish/PublishConfirmationModal';
import PublishProgressModal from '../../components/publish/PublishProgressModal';
import { EditListingModal } from '../../components/stock/EditListingModal';
import { isExtensionConfigured, pingExtension } from '../../lib/extensionBridge';
import { formatRelativeSync } from '../../lib/formatRelativeTime';
import { AGING_STOCK_DAYS } from '../../lib/insights/constants';
import { isActivelyInStock } from '../../lib/listingStatus';
import { toLocalDateString } from '../../lib/date';
import { isPublishStep, type PublishStep } from '../../lib/actions/publishSteps';
import type { PublishListingPayload } from '../../lib/actions/handlers/publishListing';
import type { EditListingPayload } from '../../lib/actions/handlers/editListing';
import type { VintedAccount } from '../../lib/types';
import { formatTitleWithSku } from '../../lib/sku';
import type { ActionKind } from '../../lib/actions/types';

function buildPublishPayload(listing: Listing, account: VintedAccount, packageSize: PackageSize): PublishListingPayload {
  return {
    title: formatTitleWithSku(listing.title, listing.sku),
    description: listing.description,
    price: listing.price,
    category: listing.category,
    brand: listing.brand || null,
    size: listing.size || null,
    condition: listing.condition,
    color: listing.color || null,
    material: listing.material || null,
    imageUrls: listing.image_urls,
    packageSize,
    expectedVintedUsername: account.vinted_username,
  };
}

// Pas de photos ni de packageSize (limite V1 validee avec l'utilisateur --
// voir editListing.ts) : uniquement les champs texte/attributs deja geres
// par le formulaire d'edition Vinted.
function buildEditPayload(listing: Listing, account: VintedAccount): EditListingPayload {
  return {
    vintedItemId: listing.vinted_item_id!,
    title: formatTitleWithSku(listing.title, listing.sku),
    description: listing.description,
    price: listing.price,
    category: listing.category,
    brand: listing.brand || null,
    size: listing.size || null,
    condition: listing.condition,
    color: listing.color || null,
    material: listing.material || null,
    expectedVintedUsername: account.vinted_username,
  };
}

type StatusFilter = 'all' | 'online' | 'reserved' | 'sold_pending' | 'sold_completed' | 'draft' | 'hidden' | 'unknown';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'online', label: 'En ligne' },
  { key: 'reserved', label: 'Réservées' },
  { key: 'sold_pending', label: 'Ventes en cours' },
  { key: 'sold_completed', label: 'Ventes finalisées' },
  { key: 'draft', label: 'Brouillons' },
  { key: 'hidden', label: 'Masquées' },
  { key: 'unknown', label: 'Problèmes' },
];

// Nom de fenetre fixe : les clics successifs reutilisent le meme onglet.
// Zero permission Chrome requise - le content script deja en place fait le
// reste des qu'il detecte le "propre profil" du compte reellement connecte.
const SYNC_WINDOW_NAME = 'resellos_vinted_sync';
const SYNC_POLL_INTERVAL_MS = 3000;
const SYNC_POLL_MAX_ATTEMPTS = 10;

interface StockPageProps {
  onViewAction?: (actionId: string) => void;
}

export default function StockPage({ onViewAction }: StockPageProps) {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const photoLimit = isAdmin ? PLAN_PHOTO_LIMITS.pro : PLAN_PHOTO_LIMITS[profile?.plan ?? 'free'];
  const {
    accounts,
    selectedAccountId,
    selectedAccount,
    refresh: refreshAccounts,
  } = useVintedAccountFilter();
  const { report: insights } = useInsights();

  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [sellingItem, setSellingItem] = useState<Listing | null>(null);
  const [soldPrice, setSoldPrice] = useState('');
  const [fees, setFees] = useState('0');
  const [extensionState, setExtensionState] = useState<'checking' | 'not-installed' | 'ready'>('checking');
  const [syncing, setSyncing] = useState(false);
  const [syncHint, setSyncHint] = useState<string | null>(null);
  const [publishingItem, setPublishingItem] = useState<Listing | null>(null);
  const [editingItem, setEditingItem] = useState<Listing | null>(null);
  const [publishState, setPublishState] = useState<{
    step: PublishStep | 'done' | null;
    error: string | null;
    historyId: string | null;
  } | null>(null);
  const { prepareAction, confirmAction } = useActionEngine();

  useEffect(() => {
    (async () => {
      if (!isExtensionConfigured()) {
        console.warn('[ResellOS][pairing] VITE_RESELLOS_EXTENSION_ID absent de cette build.');
        setExtensionState('not-installed');
        return;
      }
      const installed = await pingExtension();
      console.log('[ResellOS][pairing] pingExtension ->', installed);
      setExtensionState(installed ? 'ready' : 'not-installed');
    })();
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    // `.is.null` en plus de `.neq.deleted` : un `neq` seul exclurait aussi
    // les lignes jamais liees a Vinted (vinted_status null), pas seulement
    // celles reellement supprimees.
    let query = supabase
      .from('listings')
      .select('*')
      .eq('user_id', user.id)
      .or('vinted_status.neq.deleted,vinted_status.is.null')
      .order('created_at', { ascending: false });
    if (selectedAccountId !== 'all') {
      query = query.eq('vinted_account_id', selectedAccountId);
    }
    const { data, error } = await query;
    if (error) {
      console.error(error);
      setLoadError('Impossible de charger le stock. Réessaie plus tard.');
    } else {
      setLoadError(null);
      setItems((data ?? []) as Listing[]);
    }
    setLoading(false);
  }, [user, selectedAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  const markAsSold = async () => {
    if (!sellingItem) return;

    const { error } = await supabase
      .from('listings')
      .update({
        status: 'vendu',
        sold_price: Number(soldPrice || 0),
        fees: Number(fees || 0),
        sold_date: toLocalDateString(new Date()),
      })
      .eq('id', sellingItem.id);

    if (!error) {
      setSellingItem(null);
      setSoldPrice('');
      setFees('0');
      await load();
    }
  };

  // Partagee entre publish_listing (annonce pas encore liee) et edit_listing
  // (annonce deja liee, Partie 4) -- meme pipeline prepare/confirm, seul le
  // payload et l'ActionKind different selon l'appelant.
  const runVintedAction = async (kind: ActionKind, payload: PublishListingPayload | EditListingPayload, listing: Listing) => {
    setPublishState({ step: 'preparing', error: null, historyId: null });

    const prepared = await prepareAction(kind, payload, { listingId: listing.id, targetListing: listing });
    if (!prepared.ok) {
      setPublishState({ step: null, error: prepared.failure.message, historyId: null });
      return;
    }
    const historyId = prepared.prepared.id;

    const result = await confirmAction(prepared.prepared, (step) => {
      if (isPublishStep(step)) setPublishState({ step, error: null, historyId });
    });

    if (result.outcome.status === 'success') {
      setPublishState({ step: 'syncing', error: null, historyId });
      await load();
      setPublishState({ step: 'done', error: null, historyId });
    } else if (result.outcome.status === 'error') {
      setPublishState({ step: null, error: result.outcome.errorMessage, historyId });
    } else {
      setPublishState({ step: null, error: 'Cette action n’est pas encore disponible.', historyId });
    }
  };

  const handleConfirmPublish = async (packageSize: PackageSize) => {
    if (!publishingItem || !selectedAccount) return;
    const listing = publishingItem;
    setPublishingItem(null);
    await runVintedAction('publish_listing', buildPublishPayload(listing, selectedAccount, packageSize), listing);
  };

  const handleConfirmUpdate = async (listing: Listing) => {
    if (!selectedAccount) return;
    await runVintedAction('edit_listing', buildEditPayload(listing, selectedAccount), listing);
  };

  const handleSync = () => {
    if (selectedAccountId === 'all' || !selectedAccount) {
      window.open('https://www.vinted.fr', SYNC_WINDOW_NAME);
      setSyncHint(
        "Ouvre le profil du compte à synchroniser dans l'onglet qui vient de s'ouvrir — la synchronisation se lance automatiquement, aucune action supplémentaire n'est nécessaire côté ResellOS."
      );
      return;
    }

    const target = selectedAccount;
    const before = target.last_synced_at;
    window.open(`https://www.vinted.fr/member/${target.vinted_user_id}`, SYNC_WINDOW_NAME);
    setSyncing(true);
    setSyncHint(null);

    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      const { data } = await supabase
        .from('vinted_accounts')
        .select('last_synced_at')
        .eq('id', target.id)
        .maybeSingle();

      if (data?.last_synced_at && data.last_synced_at !== before) {
        setSyncing(false);
        await refreshAccounts();
        await load();
        return;
      }

      if (attempts >= SYNC_POLL_MAX_ATTEMPTS) {
        setSyncing(false);
        setSyncHint(
          `Aucune synchronisation détectée. Vérifie que tu es bien connecté à Vinted en tant que ${target.label} dans l'onglet ouvert.`
        );
        return;
      }

      setTimeout(poll, SYNC_POLL_INTERVAL_MS);
    };
    setTimeout(poll, SYNC_POLL_INTERVAL_MS);
  };

  const accountLabel = (vintedAccountId: string | null) => accounts.find((a) => a.id === vintedAccountId)?.label ?? '?';

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      item.title?.toLowerCase().includes(q) ||
      item.brand?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q);
    const matchesFilter = filter === 'all' || item.vinted_status === filter;
    return matchesSearch && matchesFilter;
  });

  const stockItems = items.filter(isActivelyInStock);
  const soldItems = items.filter((item) => item.status === 'vendu');

  const stockValue = stockItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
  // N'inclut que les articles au prix d'achat connu : un article decouvert
  // via Vinted sans prix d'achat saisi ne doit jamais gonfler artificiellement
  // la marge/le ROI (traiter "inconnu" comme 0 EUR d'investissement
  // fabriquerait un chiffre faux, voir la regle "ne jamais inventer de donnees").
  const stockWithCost = stockItems.filter((item) => item.purchase_price !== null);
  const investment = stockWithCost.reduce((sum, item) => sum + Number(item.purchase_price), 0);
  const potentialMargin = stockWithCost.reduce((sum, item) => sum + Number(item.price || 0) - Number(item.purchase_price), 0);
  const averageRoi = investment > 0 ? Math.round((potentialMargin / investment) * 100) : 0;

  const revenue = soldItems.reduce((sum, item) => sum + Number(item.sold_price || 0), 0);
  const soldWithCost = soldItems.filter((item) => item.purchase_price !== null);
  const profit = soldWithCost.reduce(
    (sum, item) => sum + (Number(item.sold_price || 0) - Number(item.purchase_price) - Number(item.fees || 0)),
    0
  );

  const vintedStats = useMemo(() => {
    const by = (status: string) => items.filter((i) => i.vinted_status === status);
    return {
      onlineCount: by('online').length,
      reservedCount: by('reserved').length,
      soldPendingCount: by('sold_pending').length,
      soldCompletedCount: by('sold_completed').length,
    };
  }, [items]);

  const lastSyncedAt =
    selectedAccountId === 'all'
      ? accounts.reduce<string | null>(
          (latest, a) => (!latest || (a.last_synced_at && a.last_synced_at > latest) ? a.last_synced_at : latest),
          null
        )
      : selectedAccount?.last_synced_at ?? null;

  const isAging = (item: Listing) =>
    item.status !== 'vendu' && Date.now() - new Date(item.created_at).getTime() > AGING_STOCK_DAYS * 24 * 60 * 60 * 1000;

  // Code couleur de "Derniere synchro" : gris = fiable, ambre = a surveiller,
  // rouge = perime -- memes seuils que le bandeau de fraicheur du Copilote
  // (DashboardHome.tsx) pour rester coherent sur toute l'app.
  const syncFreshnessClass = (iso: string | null) => {
    if (!iso) return 'text-red-400';
    const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
    if (hours > 48) return 'text-red-400';
    if (hours > 24) return 'text-amber-400';
    return 'text-gray-600';
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black mb-1">Stock</h1>
        <p className="text-gray-400 text-sm">
          Le miroir de ton stock — Vinted et ResellOS, une seule source.
        </p>
      </div>

      {loadError && <ErrorBanner message={loadError} className="mb-6" />}

      {accounts.length > 0 && (
        <div className="mb-4">
          <h2 className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-3">Statut Vinted</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="En ligne" value={vintedStats.onlineCount} />
            <StatCard label="Réservées" value={vintedStats.reservedCount} />
            <StatCard label="Ventes en cours" value={vintedStats.soldPendingCount} />
            <StatCard label="Ventes finalisées" value={vintedStats.soldCompletedCount} />
          </div>
        </div>
      )}

      <div className="mb-6">
        <h2 className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-3">Stock actif</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Articles en stock" value={stockItems.length.toString()} />
          <StatCard label="Valeur du stock" value={`${stockValue.toFixed(0)} €`} />
          <StatCard label="Investissement" value={`${investment.toFixed(0)} €`} />
          <StatCard label="Marge potentielle" value={`${potentialMargin.toFixed(0)} €`} highlight />
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-3">Ventes</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Articles vendus" value={soldItems.length.toString()} />
          <StatCard label="Chiffre d'affaires" value={`${revenue.toFixed(0)} €`} />
          <StatCard label="Bénéfice" value={`${profit.toFixed(0)} €`} highlight />
          <StatCard label="ROI moyen" value={`${averageRoi} %`} highlight />
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 bg-surface border border-white/5 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                extensionState === 'ready' ? 'bg-neon-500' : extensionState === 'checking' ? 'bg-amber-400' : 'bg-gray-600'
              }`}
            />
            {extensionState === 'ready' && 'Extension connectée'}
            {extensionState === 'checking' && "Vérification de l'extension..."}
            {extensionState === 'not-installed' && 'Extension non détectée'}
            <span className={syncFreshnessClass(lastSyncedAt)}>· Dernière synchro : {formatRelativeSync(lastSyncedAt)}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {syncHint && <p className="text-xs text-amber-400 max-w-sm">{syncHint}</p>}
            <button
              onClick={handleSync}
              disabled={syncing || extensionState !== 'ready'}
              className="flex items-center gap-2 bg-neon-500 text-black text-sm font-bold px-4 py-2 rounded-xl hover:bg-neon-600 transition-all disabled:opacity-50 flex-shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Synchronisation...' : selectedAccountId === 'all' ? 'Ouvrir Vinted' : 'Synchroniser maintenant'}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all flex-shrink-0 ${
              filter === key ? 'bg-neon-500/10 text-neon-500 font-medium' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un article..."
          className="w-full bg-surface border border-white/8 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-neon-500/30 focus:ring-2 focus:ring-neon-500/20"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} shape="block" className="h-20" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Aucun article"
          description="Ajoute un article depuis le générateur, ou synchronise un compte Vinted."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((item) => {
            const isSold = item.status === 'vendu';
            const aging = isAging(item);
            const hasCost = item.purchase_price !== null;
            const margin = isSold
              ? Number(item.sold_price || 0) - Number(item.purchase_price || 0) - Number(item.fees || 0)
              : Number(item.price || 0) - Number(item.purchase_price || 0);
            const roi = hasCost && Number(item.purchase_price) > 0 ? Math.round((margin / Number(item.purchase_price)) * 100) : 0;
            const score = insights?.scores.get(item.id)?.score ?? null;
            const recommendation = insights?.recommendations.find((r) => r.listingId === item.id) ?? null;

            return (
              <div
                key={item.id}
                className="bg-surface border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {item.image_urls?.[0] ? (
                      <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border border-white/10">
                        <img src={item.image_urls[0]} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 bg-neon-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-4 h-4 text-neon-500/70" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-gray-100 truncate">{item.title}</p>
                        {item.sku !== null && <span className="text-[10px] text-gray-500 font-mono flex-shrink-0">#{item.sku}</span>}
                        {item.vinted_status && <VintedStatusBadge status={item.vinted_status} />}
                      </div>
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {[item.brand, item.category, item.size].filter(Boolean).join(' · ') || '—'}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`text-[10px] ${isSold ? 'text-blue-400' : 'text-neon-500'}`}>
                          {isSold ? 'Vendu' : item.status === 'draft' ? 'Brouillon' : 'En stock'}
                        </span>
                        {aging && (
                          <span className="flex items-center gap-1 text-[10px] text-amber-400">
                            <Clock className="w-2.5 h-2.5" />
                            +{AGING_STOCK_DAYS}j
                          </span>
                        )}
                        {selectedAccountId === 'all' && item.vinted_account_id && (
                          <span className="flex items-center gap-1 text-[10px] text-gray-500">
                            <AccountAvatar label={accountLabel(item.vinted_account_id)} size="sm" />
                            {accountLabel(item.vinted_account_id)}
                          </span>
                        )}
                        {item.views !== null && (
                          <span className="flex items-center gap-1 text-[10px] text-gray-500">
                            <Eye className="w-2.5 h-2.5" /> {item.views}
                          </span>
                        )}
                        {item.favourites !== null && (
                          <span className="flex items-center gap-1 text-[10px] text-gray-500">
                            <Heart className="w-2.5 h-2.5" /> {item.favourites}
                          </span>
                        )}
                        {recommendation && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-neon-500 bg-neon-500/10 px-1.5 py-0.5 rounded-md">
                            <Lightbulb className="w-2.5 h-2.5" />
                            {recommendation.message}
                          </span>
                        )}
                      </div>
                      {score !== null && (
                        <div className="mt-2 max-w-[160px]">
                          <div className="flex items-center justify-between text-[10px] text-gray-600 mb-1">
                            <span>Score IA</span>
                            <span>{score}/100</span>
                          </div>
                          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-neon-500 rounded-full transition-all duration-500"
                              style={{ width: `${score}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between sm:justify-end gap-3 sm:gap-5 flex-shrink-0">
                    <div className="grid grid-cols-4 gap-3 text-right">
                      <MiniValue label={isSold ? 'Vente' : 'Valeur'} value={`${isSold ? item.sold_price ?? 0 : item.price ?? 0} €`} />
                      <MiniValue label="Achat" value={hasCost ? `${item.purchase_price} €` : '—'} />
                      <MiniValue label={isSold ? 'Bénéfice' : 'Marge'} value={hasCost ? `${margin} €` : '—'} highlight={hasCost} />
                      <MiniValue label="ROI" value={hasCost ? `${roi} %` : '—'} highlight={hasCost} />
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!isSold && (
                        <button
                          onClick={() => setEditingItem(item)}
                          className="flex items-center gap-1.5 text-xs font-semibold bg-dark-400 border border-white/10 text-gray-200 px-3 py-2 rounded-xl hover:border-neon-500/40 transition-all"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Modifier
                        </button>
                      )}
                      {!isSold && item.vinted_account_id === null && selectedAccount && (
                        <button
                          onClick={() => setPublishingItem(item)}
                          className="flex items-center gap-1.5 text-xs font-semibold bg-dark-400 border border-white/10 text-gray-200 px-3 py-2 rounded-xl hover:border-neon-500/40 transition-all"
                        >
                          <UploadCloud className="w-3.5 h-3.5" />
                          Publier sur Vinted
                        </button>
                      )}
                      {!isSold && (
                        <button
                          onClick={() => {
                            setSellingItem(item);
                            setSoldPrice(String(item.price ?? ''));
                            setFees('0');
                          }}
                          className="text-xs font-semibold bg-neon-500 text-black px-3 py-2 rounded-xl hover:bg-neon-600 transition-all"
                        >
                          Marquer vendu
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sellingItem && (
        <Modal onClose={() => setSellingItem(null)} size="md">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-black">Marquer comme vendu</h2>
              <p className="text-xs text-gray-500 mt-1">{sellingItem.title}</p>
            </div>
            <button
              onClick={() => setSellingItem(null)}
              aria-label="Fermer"
              className="p-1.5 rounded-lg hover:bg-white/5"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">
                Prix de vente
              </label>
              <input
                type="number"
                value={soldPrice}
                onChange={(e) => setSoldPrice(e.target.value)}
                className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">
                Frais
              </label>
              <input
                type="number"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
              />
            </div>

            <button
              onClick={markAsSold}
              className="w-full bg-neon-500 text-black font-bold py-3 rounded-xl hover:bg-neon-600 transition-all"
            >
              Confirmer la vente
            </button>
          </div>
        </Modal>
      )}

      {publishingItem && selectedAccount && (
        <PublishConfirmationModal
          listing={publishingItem}
          account={selectedAccount}
          onCancel={() => setPublishingItem(null)}
          onConfirm={handleConfirmPublish}
        />
      )}

      {publishState && (
        <PublishProgressModal
          currentStep={publishState.step}
          error={publishState.error}
          onClose={() => setPublishState(null)}
          onViewAction={
            onViewAction && publishState.historyId
              ? () => {
                  const historyId = publishState.historyId as string;
                  setPublishState(null);
                  onViewAction(historyId);
                }
              : undefined
          }
        />
      )}

      {editingItem && (
        <EditListingModal
          listing={editingItem}
          onClose={() => setEditingItem(null)}
          canPublish={!!selectedAccount}
          canUpdateOnVinted={!!selectedAccount && selectedAccount.id === editingItem.vinted_account_id}
          photoLimit={photoLimit}
          onSaved={(updated, intent) => {
            setEditingItem(null);
            load();
            if (intent === 'publish') setPublishingItem(updated);
            if (intent === 'update') void handleConfirmUpdate(updated);
          }}
        />
      )}
    </div>
  );
}

function MiniValue({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`text-sm font-bold ${highlight ? 'text-neon-500' : 'text-gray-200'}`}>
        {value}
      </p>
    </div>
  );
}
