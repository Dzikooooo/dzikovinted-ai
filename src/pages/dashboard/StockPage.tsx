import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X, Sparkles, Clock, RefreshCw, Puzzle, Eye, Heart } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useVintedAccountFilter } from '../../contexts/VintedAccountFilterContext';
import { supabase } from '../../lib/supabase';
import type { Listing, VintedListing } from '../../lib/types';
import { StatCard } from '../../components/ui/StatCard';
import AccountAvatar from '../../components/ui/AccountAvatar';
import VintedStatusBadge from '../../components/ui/VintedStatusBadge';
import { isExtensionConfigured, pingExtension } from '../../lib/extensionBridge';
import { formatRelativeSync } from '../../lib/formatRelativeTime';

const AGING_STOCK_DAYS = 21;

type StockTab = 'vinted' | 'resellos';

export default function StockPage() {
  const [activeTab, setActiveTab] = useState<StockTab>('vinted');

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black mb-1">Stock</h1>
        <p className="text-gray-400 text-sm">
          {activeTab === 'vinted'
            ? 'Le miroir fiable de ton stock Vinted, par compte.'
            : 'Gère tes articles générés, leur valeur et leur marge potentielle.'}
        </p>
      </div>

      <div className="flex gap-1 mb-6">
        <button
          onClick={() => setActiveTab('vinted')}
          className={`px-4 py-2 rounded-xl text-sm transition-all duration-200 ${activeTab === 'vinted' ? 'bg-neon-500/10 text-neon-500 font-medium' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
        >
          Vinted
        </button>
        <button
          onClick={() => setActiveTab('resellos')}
          className={`px-4 py-2 rounded-xl text-sm transition-all duration-200 ${activeTab === 'resellos' ? 'bg-neon-500/10 text-neon-500 font-medium' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
        >
          ResellOS
        </button>
      </div>

      {activeTab === 'vinted' ? <VintedStockTab /> : <ResellOsStockTab />}
    </div>
  );
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

// Nom de fenetre fixe pour window.open : les clics successifs reutilisent le
// meme onglet au lieu d'en empiler un nouveau a chaque synchro. Zero
// permission Chrome requise (contrairement a chrome.tabs/scripting) - le
// content script deja en place (voir EXTENSION.md) fait le reste des qu'il
// detecte le "propre profil" du compte reellement connecte sur Vinted dans
// cet onglet. Si un autre compte est connecte, aucune detection n'est
// envoyee (voir marqueur closet-seller-filters-active) : impossible d'ecrire
// par erreur dans le mauvais compte.
const SYNC_WINDOW_NAME = 'resellos_vinted_sync';
const SYNC_POLL_INTERVAL_MS = 3000;
const SYNC_POLL_MAX_ATTEMPTS = 10;

function VintedStockTab() {
  const {
    accounts,
    selectedAccountId,
    selectedAccount,
    loading: accountsLoading,
    refresh: refreshAccounts,
  } = useVintedAccountFilter();
  const [listings, setListings] = useState<VintedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [extensionState, setExtensionState] = useState<'checking' | 'not-installed' | 'ready'>('checking');
  const [syncing, setSyncing] = useState(false);
  const [syncHint, setSyncHint] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!isExtensionConfigured()) {
        setExtensionState('not-installed');
        return;
      }
      const installed = await pingExtension();
      setExtensionState(installed ? 'ready' : 'not-installed');
    })();
  }, []);

  const loadListings = useCallback(
    async (isStale: () => boolean): Promise<void> => {
      if (accounts.length === 0) {
        if (!isStale()) {
          setListings([]);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      let query = supabase
        .from('vinted_listings')
        .select('*')
        .neq('status', 'deleted')
        .order('synced_at', { ascending: false });
      query =
        selectedAccountId === 'all'
          ? query.in('vinted_account_id', accounts.map((a) => a.id))
          : query.eq('vinted_account_id', selectedAccountId);
      const { data } = await query;
      if (!isStale()) {
        setListings((data as VintedListing[] | null) ?? []);
        setLoading(false);
      }
    },
    [accounts, selectedAccountId]
  );

  useEffect(() => {
    let ignore = false;
    void loadListings(() => ignore);
    return () => {
      ignore = true;
    };
  }, [loadListings]);

  const stats = useMemo(() => {
    const by = (status: string) => listings.filter((l) => l.status === status);
    const online = by('online');
    const soldCompleted = by('sold_completed');
    const soldPending = by('sold_pending');
    return {
      onlineCount: online.length,
      reservedCount: by('reserved').length,
      soldPendingCount: soldPending.length,
      soldCompletedCount: soldCompleted.length,
      stockValue: online.reduce((s, l) => s + Number(l.price || 0), 0),
      caConfirmed: soldCompleted.reduce((s, l) => s + Number(l.price || 0), 0),
      caPending: soldPending.reduce((s, l) => s + Number(l.price || 0), 0),
    };
  }, [listings]);

  const filteredListings = filter === 'all' ? listings : listings.filter((l) => l.status === filter);

  const lastSyncedAt =
    selectedAccountId === 'all'
      ? accounts.reduce<string | null>(
          (latest, a) => (!latest || (a.last_synced_at && a.last_synced_at > latest) ? a.last_synced_at : latest),
          null
        )
      : selectedAccount?.last_synced_at ?? null;

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
        await loadListings(() => false);
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

  const accountLabel = (vintedAccountId: string) => accounts.find((a) => a.id === vintedAccountId)?.label ?? '?';

  if (extensionState !== 'checking' && !accountsLoading && accounts.length === 0) {
    return (
      <div className="bg-surface border border-white/5 rounded-2xl p-10 text-center">
        <Puzzle className="w-8 h-8 text-gray-700 mx-auto mb-3" />
        <p className="text-gray-400 font-semibold mb-2">Aucun compte Vinted connecté</p>
        <p className="text-sm text-gray-600">Connecte l'extension depuis « Compte Vinted » pour voir ton stock ici.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="En ligne" value={stats.onlineCount} />
        <StatCard label="Réservées" value={stats.reservedCount} />
        <StatCard label="Ventes en cours" value={stats.soldPendingCount} />
        <StatCard label="Ventes finalisées" value={stats.soldCompletedCount} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Valeur du stock disponible" value={`${stats.stockValue.toFixed(0)} €`} highlight />
        <StatCard label="CA confirmé" value={`${stats.caConfirmed.toFixed(0)} €`} highlight />
        <StatCard label="CA en attente" value={`${stats.caPending.toFixed(0)} €`} />
        <StatCard label="Dernière synchro" value={formatRelativeSync(lastSyncedAt)} />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 bg-surface border border-white/5 rounded-2xl p-4">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              extensionState === 'ready' ? 'bg-neon-500' : extensionState === 'checking' ? 'bg-amber-400' : 'bg-gray-600'
            }`}
          />
          {extensionState === 'ready' && 'Extension connectée'}
          {extensionState === 'checking' && "Vérification de l'extension..."}
          {extensionState === 'not-installed' && 'Extension non détectée'}
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

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-surface rounded-xl animate-pulse" />)}
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="bg-surface border border-white/5 border-dashed rounded-2xl p-10 text-center">
          <p className="text-sm text-gray-500">Aucune annonce pour ce filtre.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {filteredListings.map((listing) => (
            <div key={listing.id} className="flex items-center gap-3 bg-surface border border-white/5 rounded-xl px-4 py-3">
              {listing.image_url ? (
                <img src={listing.image_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-white/5 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm text-gray-200 truncate">{listing.title}</p>
                  <VintedStatusBadge status={listing.status} />
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {[listing.brand, listing.size].filter(Boolean).join(' · ') || '—'}
                </p>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                  {selectedAccountId === 'all' && (
                    <span className="flex items-center gap-1.5">
                      <AccountAvatar label={accountLabel(listing.vinted_account_id)} size="sm" />
                      {accountLabel(listing.vinted_account_id)}
                    </span>
                  )}
                  {listing.views !== null && (
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" /> {listing.views}
                    </span>
                  )}
                  {listing.favourites !== null && (
                    <span className="flex items-center gap-1">
                      <Heart className="w-3 h-3" /> {listing.favourites}
                    </span>
                  )}
                  <span>{formatRelativeSync(listing.synced_at)}</span>
                </div>
              </div>
              {listing.price !== null && (
                <p className="text-sm font-bold text-neon-500 flex-shrink-0">{listing.price.toFixed(2)} €</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResellOsStockTab() {
  const { user } = useAuth();
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sellingItem, setSellingItem] = useState<Listing | null>(null);
  const [soldPrice, setSoldPrice] = useState('');
  const [fees, setFees] = useState('0');

  const load = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error) setItems((data ?? []) as Listing[]);
    setLoading(false);
  }, [user]);

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
        sold_date: new Date().toISOString().slice(0, 10),
      })
      .eq('id', sellingItem.id);

    if (!error) {
      setSellingItem(null);
      setSoldPrice('');
      setFees('0');
      await load();
    }
  };

  const filtered = items.filter((item) =>
    item.title?.toLowerCase().includes(search.toLowerCase()) ||
    item.brand?.toLowerCase().includes(search.toLowerCase()) ||
    item.category?.toLowerCase().includes(search.toLowerCase())
  );

  const stockItems = items.filter((item) => item.status !== 'vendu');
  const soldItems = items.filter((item) => item.status === 'vendu');

  const stockValue = stockItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const investment = stockItems.reduce((sum, item) => sum + Number(item.purchase_price || 0), 0);
  const potentialMargin = stockValue - investment;
  const averageRoi = investment > 0 ? Math.round((potentialMargin / investment) * 100) : 0;

  const revenue = soldItems.reduce((sum, item) => sum + Number(item.sold_price || 0), 0);
  const profit = soldItems.reduce(
    (sum, item) =>
      sum +
      (Number(item.sold_price || 0) -
        Number(item.purchase_price || 0) -
        Number(item.fees || 0)),
    0
  );

  const isAging = (item: Listing) =>
    item.status !== 'vendu' && Date.now() - new Date(item.created_at).getTime() > AGING_STOCK_DAYS * 24 * 60 * 60 * 1000;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-3">Stock actif</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Articles en stock" value={stockItems.length.toString()} />
          <StatCard label="Valeur du stock" value={`${stockValue} €`} />
          <StatCard label="Investissement" value={`${investment} €`} />
          <StatCard label="Marge potentielle" value={`${potentialMargin} €`} highlight />
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-3">Ventes</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Articles vendus" value={soldItems.length.toString()} />
          <StatCard label="Chiffre d'affaires" value={`${revenue} €`} />
          <StatCard label="Bénéfice" value={`${profit} €`} highlight />
          <StatCard label="ROI moyen" value={`${averageRoi} %`} highlight />
        </div>
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
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-surface rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-white/5 border-dashed rounded-2xl p-12 text-center">
          <Sparkles className="w-8 h-8 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-semibold mb-2">Aucun article en stock</p>
          <p className="text-sm text-gray-600">Ajoute un article depuis le générateur.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((item) => {
            const isSold = item.status === 'vendu';
            const aging = isAging(item);
            const margin = isSold
              ? Number(item.sold_price || 0) - Number(item.purchase_price || 0) - Number(item.fees || 0)
              : Number(item.price || 0) - Number(item.purchase_price || 0);

            const roi =
              Number(item.purchase_price || 0) > 0
                ? Math.round((margin / Number(item.purchase_price || 0)) * 100)
                : 0;

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
                      <p className="font-semibold text-sm text-gray-100 truncate">{item.title}</p>
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {item.brand} · {item.category} · {item.size}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-[10px] ${isSold ? 'text-blue-400' : 'text-neon-500'}`}>
                          {isSold ? 'Vendu' : item.status === 'draft' ? 'Brouillon' : 'En stock'}
                        </span>
                        {aging && (
                          <span className="flex items-center gap-1 text-[10px] text-amber-400">
                            <Clock className="w-2.5 h-2.5" />
                            +{AGING_STOCK_DAYS}j
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-5 flex-shrink-0">
                    <div className="grid grid-cols-4 gap-3 text-right">
                      <MiniValue label={isSold ? 'Vente' : 'Valeur'} value={`${isSold ? item.sold_price ?? 0 : item.price ?? 0} €`} />
                      <MiniValue label="Achat" value={`${item.purchase_price ?? 0} €`} />
                      <MiniValue label={isSold ? 'Bénéfice' : 'Marge'} value={`${margin} €`} highlight />
                      <MiniValue label="ROI" value={`${roi} %`} highlight />
                    </div>

                    {!isSold && (
                      <button
                        onClick={() => {
                          setSellingItem(item);
                          setSoldPrice(String(item.price ?? ''));
                          setFees('0');
                        }}
                        className="text-xs font-semibold bg-neon-500 text-black px-3 py-2 rounded-xl hover:bg-neon-600 transition-all flex-shrink-0"
                      >
                        Marquer vendu
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sellingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md bg-surface border border-white/10 rounded-2xl p-5">
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
          </div>
        </div>
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
