import { useCallback, useEffect, useState } from 'react';
import {
  X, Sparkles, Clock, RefreshCw, Eye, Heart, Lightbulb, Pencil, UploadCloud,
  CheckSquare, Square, Trash2, FileEdit, Layers, Info, History,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useVintedAccountFilter } from '../../../contexts/VintedAccountFilterContext';
import { useInsights } from '../../../hooks/useInsights';
import { useActionEngine } from '../../../hooks/useActionEngine';
import { useIsAdmin } from '../../../hooks/useIsAdmin';
import { supabase } from '../../../lib/supabase';
import type { Listing, VintedAccount } from '../../../lib/types';
import { PLAN_PHOTO_LIMITS } from '../../../lib/types';
import { StatCard } from '../../../components/ui/StatCard';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { SectionLabel } from '../../../components/ui/SectionLabel';
import { FilterPill } from '../../../components/ui/FilterPill';
import { SearchInput } from '../../../components/ui/SearchInput';
import AccountAvatar from '../../../components/ui/AccountAvatar';
import VintedStatusBadge from '../../../components/ui/VintedStatusBadge';
import { OneScoreBar } from '../../../components/ui/OneScoreBar';
import PublishConfirmationModal, { type PackageSize } from '../../../components/publish/PublishConfirmationModal';
import PublishProgressModal from '../../../components/publish/PublishProgressModal';
import { EditListingModal } from '../../../components/stock/EditListingModal';
import { ListingDetailModal } from '../../../components/listings/ListingDetailModal';
import { isExtensionConfigured, pingExtension, RUN_ACTION_TIMEOUT_ERROR } from '../../../lib/extensionBridge';
import { formatRelativeSync } from '../../../lib/formatRelativeTime';
import { AGING_STOCK_DAYS } from '../../../lib/insights/constants';
import { isActivelyInStock } from '../../../lib/listingStatus';
import { toLocalDateString } from '../../../lib/date';
import { isPublishStep, type PublishStep } from '../../../lib/actions/publishSteps';
import { EDIT_STEP_ORDER, buildEditStepLabels, normalizeEditStepForDisplay } from '../../../lib/actions/editListingSteps';
import { isManualClickTimeout, MANUAL_CLICK_TIMEOUT_MESSAGE, MANUAL_CLICK_HINT } from '../../../lib/actions/editListingManualClick';
import type { PublishListingPayload } from '../../../lib/actions/handlers/publishListing';
import type { RepublishListingPayload } from '../../../lib/actions/handlers/republishListing';
import type { EditableFieldName, EditListingPayload } from '../../../lib/actions/handlers/editListing';
import { buildEditSuccessSyncFields, formatTitleWithSku, runSkuRepair } from '../../../lib/sku';
import { formatEUR } from '../../../lib/currency';
import type { ActionKind } from '../../../lib/actions/types';
import type { ListingRecommendationResult } from '../../../lib/insights/types';
import { needsRepublish } from '../../../lib/listingStatus';
import { devLog, devWarn, devError } from '../../../lib/devLog';
import { notifySale } from '../../../hooks/useNotifications';

// description/category/condition sont ici garantis non-vides par
// checkListingHasRequiredVintedFields (checks.ts) avant que publish_listing
// ne puisse etre prepare -- le "?? ''" satisfait uniquement le type
// (PublishListingPayload les declare `string`, jamais envoyes vides en
// pratique pour cette action).
function buildPublishPayload(listing: Listing, account: VintedAccount, packageSize: PackageSize): PublishListingPayload {
  return {
    title: formatTitleWithSku(listing.title, listing.sku),
    description: listing.description ?? '',
    price: listing.price,
    category: listing.category ?? '',
    brand: listing.brand || null,
    size: listing.size || null,
    condition: listing.condition ?? '',
    color: listing.color || null,
    material: listing.material || null,
    imageUrls: listing.image_urls,
    packageSize,
    expectedVintedUsername: account.vinted_username,
  };
}

// Meme champs que buildPublishPayload : republish_listing cree une NOUVELLE
// fiche Vinted via la meme mecanique que publish_listing (voir
// republishListing.ts) -- previousVintedItemId n'est ajoute que pour la
// tracabilite (preview + historique du Centre des Actions), jamais lu par
// le content script.
function buildRepublishPayload(listing: Listing, account: VintedAccount, packageSize: PackageSize): RepublishListingPayload {
  return {
    ...buildPublishPayload(listing, account, packageSize),
    previousVintedItemId: listing.vinted_item_id!,
  };
}

function buildEditPayload(listing: Listing, account: VintedAccount, changedFields: EditableFieldName[]): EditListingPayload {
  return {
    vintedItemId: listing.vinted_item_id!,
    title: formatTitleWithSku(listing.title, listing.sku),
    description: listing.description ?? '',
    price: listing.price,
    category: listing.category ?? '',
    brand: listing.brand || null,
    size: listing.size || null,
    condition: listing.condition ?? '',
    color: listing.color || null,
    material: listing.material || null,
    expectedVintedUsername: account.vinted_username,
    changedFields,
  };
}

type ManagementTab = 'annonces' | 'republication';
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

const SYNC_WINDOW_NAME = 'resellos_vinted_sync';
const SYNC_POLL_INTERVAL_MS = 3000;
const SYNC_POLL_MAX_ATTEMPTS = 10;
const PAGE_SIZE = 30;

interface ListingsManagementSectionProps {
  onViewAction?: (actionId: string) => void;
}

// "Gestion des annonces" (ex-StockPage.tsx, fusionnee ici -- demande produit
// 2026-07-31 : Stock disparait, tout vit dans "Mes annonces"). Cartes
// selectionnables façon Opportunites, plutot qu'une liste simple : une
// selection ouvre une barre d'action groupee (Modifier/Republier/Faire
// brouillon/Supprimer). Modifier/Republier restent limites a une seule
// annonce a la fois (chacun ouvre sa propre modale, deja confirm-gated) --
// jamais d'ecriture Vinted en masse non supervisee. Faire brouillon et
// Supprimer sont reellement groupables : ils ne touchent que ResellOS.
export function ListingsManagementSection({ onViewAction }: ListingsManagementSectionProps) {
  const { user, profile } = useAuth();
  const isAdmin = useIsAdmin();
  const photoLimit = isAdmin ? PLAN_PHOTO_LIMITS.pro : PLAN_PHOTO_LIMITS[profile?.plan ?? 'free'];
  const { accounts, selectedAccountId, selectedAccount, refresh: refreshAccounts } = useVintedAccountFilter();
  const { report: insights } = useInsights();

  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<ManagementTab>('annonces');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [sellingItem, setSellingItem] = useState<Listing | null>(null);
  const [soldPrice, setSoldPrice] = useState('');
  const [fees, setFees] = useState('0');
  const [sellSaving, setSellSaving] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);

  const [extensionState, setExtensionState] = useState<'checking' | 'not-installed' | 'ready'>('checking');
  const [syncing, setSyncing] = useState(false);
  const [syncHint, setSyncHint] = useState<string | null>(null);

  const [publishingItem, setPublishingItem] = useState<Listing | null>(null);
  const [editingItem, setEditingItem] = useState<Listing | null>(null);
  // Fiche annonce (Lot "Suivi des annonces") -- distincte de editingItem
  // (formulaire d'edition) : ouvre une vue lecture-seule (etat courant +
  // historique), jamais un formulaire.
  const [detailItem, setDetailItem] = useState<Listing | null>(null);
  // Etape d'explication avant ouverture de l'onglet Vinted pour edit_listing
  // (audit RC, 2026-08-05) -- meme principe que PublishConfirmationModal
  // pour publish/republish, qui elle existait deja. Jusqu'ici "Enregistrer
  // et mettre a jour sur Vinted" declenchait handleConfirmUpdate() (et donc
  // l'ouverture reelle de l'onglet) sans aucune etape intermediaire.
  const [pendingUpdate, setPendingUpdate] = useState<{ listing: Listing; changedFields: EditableFieldName[] } | null>(null);
  const [publishState, setPublishState] = useState<{
    step: PublishStep | 'done' | null;
    error: string | null;
    historyId: string | null;
    kind: ActionKind | null;
    changedFields: EditableFieldName[] | null;
    // Conserve pour "Réessayer" sur un timeout edit_listing (audit RC,
    // 2026-08-05) -- seule la relance complete de l'action est possible
    // sans toucher aux fichiers P-04 (pas de reprise ciblee de la seule
    // phase de verification, voir le plan valide).
    listing: Listing | null;
  } | null>(null);
  const { prepareAction, confirmAction } = useActionEngine();
  // Desactive "Réessayer" des le premier clic, le temps que runVintedAction()
  // reprenne la main (son propre garde interne bloque toute nouvelle action
  // tant que publishState.step n'est pas null/'done', mais cette fenetre
  // initiale synchrone merite son propre verrou local, demande explicite).
  const [retryInFlight, setRetryInFlight] = useState(false);

  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkDrafting, setBulkDrafting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!isExtensionConfigured()) {
        devWarn('[ResellOS][pairing] VITE_RESELLOS_EXTENSION_ID absent de cette build.');
        setExtensionState('not-installed');
        return;
      }
      const installed = await pingExtension();
      devLog('[ResellOS][pairing] pingExtension ->', installed);
      setExtensionState(installed ? 'ready' : 'not-installed');
    })();
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
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
      setLoadError('Impossible de charger tes annonces. Réessaie plus tard.');
    } else {
      setLoadError(null);
      setItems((data ?? []) as Listing[]);
    }
    setLoading(false);
  }, [user, selectedAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setSelected(new Set());
  }, [search, filter, selectedAccountId, tab]);

  const markAsSold = async () => {
    if (!sellingItem || sellSaving) return;
    setSellSaving(true);
    setSellError(null);
    const { error } = await supabase
      .from('listings')
      .update({
        status: 'vendu',
        sold_price: Number(soldPrice || 0),
        fees: Number(fees || 0),
        sold_date: toLocalDateString(new Date()),
      })
      .eq('id', sellingItem.id);
    if (error) {
      console.error(error);
      setSellError("Impossible d'enregistrer la vente. Réessaie plus tard.");
      setSellSaving(false);
    } else {
      if (user) void notifySale(user.id, sellingItem.title, Number(soldPrice || 0));
      setSellingItem(null);
      setSoldPrice('');
      setFees('0');
      setSellSaving(false);
      await load();
    }
  };

  const runVintedAction = async (kind: ActionKind, payload: PublishListingPayload | RepublishListingPayload | EditListingPayload, listing: Listing) => {
    if (publishState && publishState.step !== 'done' && !publishState.error) {
      devWarn('[ResellOS][action] runVintedAction ignore : une action est deja en cours', {
        kind,
        listingId: listing.id,
        etapeEnCours: publishState.step,
      });
      return;
    }

    const changedFields = kind === 'edit_listing' ? (payload as EditListingPayload).changedFields : null;
    setPublishState({ step: 'preparing', error: null, historyId: null, kind, changedFields, listing });
    devLog(`[ResellOS][action] prepareAction('${kind}')`, { listingId: listing.id, payload });

    if (kind === 'edit_listing') {
      const { error: pendingError } = await supabase
        .from('listings')
        .update({ vinted_sync_status: 'sync_pending' as const })
        .eq('id', listing.id);
      if (pendingError) {
        devWarn("[ResellOS][action] echec de l'ecriture de sync_pending (non bloquant)", pendingError.message);
      } else {
        setItems((prev) => prev.map((i) => (i.id === listing.id ? { ...i, vinted_sync_status: 'sync_pending' } : i)));
      }
    }

    const prepared = await prepareAction(kind, payload, { listingId: listing.id, targetListing: listing });
    if (!prepared.ok) {
      devWarn('[ResellOS][action] prepare() refuse par les checks :', prepared.failure);
      setPublishState({ step: null, error: prepared.failure.message, historyId: null, kind, changedFields, listing });
      return;
    }
    const historyId = prepared.prepared.id;
    devLog(`[ResellOS][action][${historyId}] prepare() ok, confirmAction() lance`);

    const result = await confirmAction(prepared.prepared, (step) => {
      devLog(`[ResellOS][action][${historyId}] progression :`, step);
      if (!isPublishStep(step)) return;
      const displayStep = kind === 'edit_listing' ? normalizeEditStepForDisplay(step) : step;
      setPublishState({ step: displayStep, error: null, historyId, kind, changedFields, listing });
    });
    devLog(`[ResellOS][action][${historyId}] retour dans ResellOS, resultat :`, result.outcome);

    if (kind === 'edit_listing') {
      const editPayload = payload as EditListingPayload;
      if (result.outcome.status === 'success') {
        const { error: statusError } = await supabase
          .from('listings')
          .update({
            ...buildEditSuccessSyncFields(listing.title, editPayload),
            vinted_sync_status: 'sync_success' as const,
          })
          .eq('id', listing.id);
        if (statusError) devError(`[ResellOS][action][${historyId}] echec de l'ecriture de la confirmation Vinted`, statusError);
      } else if (result.outcome.status === 'error' && result.outcome.errorMessage === RUN_ACTION_TIMEOUT_ERROR) {
        devWarn(`[ResellOS][action][${historyId}] delai local depasse -- statut laisse a sync_pending`);
      } else {
        const { error: statusError } = await supabase
          .from('listings')
          .update({ vinted_sync_status: 'sync_failed' as const })
          .eq('id', listing.id);
        if (statusError) devError(`[ResellOS][action][${historyId}] echec de l'ecriture du statut de synchronisation`, statusError);
      }
    }

    if (result.outcome.status === 'success') {
      if (user) {
        void runSkuRepair(supabase, user.id)
          .then((r) => devLog(`[ResellOS][action][${historyId}] auto-reparation SKU (post-${kind})`, r))
          .catch(() => devWarn(`[ResellOS][action][${historyId}] auto-reparation SKU (post-${kind}) : echec ignore (best-effort)`));
      }
      setPublishState({ step: 'syncing', error: null, historyId, kind, changedFields, listing });
      await load();
      setPublishState({ step: 'done', error: null, historyId, kind, changedFields, listing });
    } else if (result.outcome.status === 'error') {
      await load();
      // Simplifie le seul cas "clic manuel non detecte" pour l'affichage
      // client (audit RC, 2026-08-05) -- le detail technique original reste
      // visible juste au-dessus, deja logue sans changement (devLog "retour
      // dans ResellOS, resultat :"). Tout autre message edit_listing (session
      // expiree, marque verrouillee, timeout de chargement...) est deja
      // redige pour un client, inchange.
      const displayError =
        kind === 'edit_listing' && isManualClickTimeout(result.outcome.errorMessage)
          ? MANUAL_CLICK_TIMEOUT_MESSAGE
          : result.outcome.errorMessage;
      setPublishState({ step: null, error: displayError, historyId, kind, changedFields, listing });
    } else {
      setPublishState({ step: null, error: "Cette action n'est pas encore disponible.", historyId, kind, changedFields, listing });
    }
  };

  const handleConfirmPublish = async (packageSize: PackageSize) => {
    if (!publishingItem || !selectedAccount) return;
    const listing = publishingItem;
    setPublishingItem(null);
    // vinted_item_id present = annonce deja publiee (mais plus en ligne,
    // voir checks.ts::checkListingNeedsRepublish) -> republish_listing.
    // Absent = jamais publiee -> publish_listing classique. Choix invisible
    // pour l'utilisateur (un seul bouton "Republier"/"Publier" en amont),
    // mais determine la bonne action et donc le bon check cote moteur.
    if (listing.vinted_item_id) {
      await runVintedAction('republish_listing', buildRepublishPayload(listing, selectedAccount, packageSize), listing);
    } else {
      await runVintedAction('publish_listing', buildPublishPayload(listing, selectedAccount, packageSize), listing);
    }
  };

  const handleConfirmUpdate = async (listing: Listing, changedFields: EditableFieldName[]) => {
    if (!selectedAccount) {
      setPublishState({
        step: null,
        error: "Aucun compte Vinted sélectionné dans le filtre en haut de page. Sélectionne le compte de cette annonce avant de réessayer.",
        historyId: null,
        kind: 'edit_listing',
        changedFields,
        listing,
      });
      return;
    }
    await runVintedAction('edit_listing', buildEditPayload(listing, selectedAccount, changedFields), listing);
  };

  // "Ouvrir Vinted" (audit RC, 2026-08-05) : best-effort uniquement -- ne
  // pretend jamais retrouver l'onglet exact ouvert par l'extension (le web
  // app n'a aucune reference a ce tabId, extensionBridge.ts est P-04, hors
  // perimetre). Ouvre/reutilise simplement un onglet sur la meme URL
  // d'edition.
  const openVintedEditTab = (vintedItemId: string) => {
    window.open(`https://www.vinted.fr/items/${vintedItemId}/edit`, '_blank', 'noopener,noreferrer');
  };

  // "Réessayer" (edit_listing uniquement) : relance complete de l'action
  // (nouvel onglet, nouveau clic requis) -- pas une reprise ciblee de la
  // seule verification, impossible sans toucher a P-04 (voir le plan
  // valide). Le garde existant de runVintedAction() empeche deja tout
  // double-declenchement pendant qu'une action tourne ; retryInFlight
  // couvre en plus la toute premiere fenetre synchrone avant que
  // publishState ne soit mis a jour.
  const retryEditListing = (listing: Listing, changedFields: EditableFieldName[]) => {
    if (retryInFlight) return;
    setRetryInFlight(true);
    void handleConfirmUpdate(listing, changedFields).finally(() => setRetryInFlight(false));
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
    const before = target.listings_synced_at;
    window.open(`https://www.vinted.fr/member/${target.vinted_user_id}`, SYNC_WINDOW_NAME);
    setSyncing(true);
    setSyncHint(null);

    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      const { data } = await supabase
        .from('vinted_accounts')
        .select('listings_synced_at')
        .eq('id', target.id)
        .maybeSingle();
      if (data?.listings_synced_at && data.listings_synced_at !== before) {
        setSyncing(false);
        await refreshAccounts();
        await load();
        return;
      }
      if (attempts >= SYNC_POLL_MAX_ATTEMPTS) {
        setSyncing(false);
        setSyncHint(`Aucune synchronisation détectée. Vérifie que tu es bien connecté à Vinted en tant que ${target.label} dans l'onglet ouvert.`);
        return;
      }
      setTimeout(poll, SYNC_POLL_INTERVAL_MS);
    };
    setTimeout(poll, SYNC_POLL_INTERVAL_MS);
  };

  const accountLabel = (vintedAccountId: string | null) => accounts.find((a) => a.id === vintedAccountId)?.label ?? '?';

  const republicationList = items.filter(needsRepublish);
  const baseList = tab === 'republication' ? republicationList : items.filter((l) => l.status !== 'vendu');
  const filtered = baseList.filter((item) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      item.title?.toLowerCase().includes(q) ||
      item.brand?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q);
    const matchesFilter = filter === 'all' || item.vinted_status === filter;
    return matchesSearch && matchesFilter;
  });
  const visibleItems = filtered.slice(0, visibleCount);
  const hasMoreItems = filtered.length > visibleCount;

  const stockItems = items.filter(isActivelyInStock);
  const soldItems = items.filter((item) => item.status === 'vendu');
  const stockValue = stockItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
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

  const lastSyncedAt =
    selectedAccountId === 'all'
      ? accounts.reduce<string | null>(
          (latest, a) => (!latest || (a.last_synced_at && a.last_synced_at > latest) ? a.last_synced_at : latest),
          null
        )
      : selectedAccount?.last_synced_at ?? null;

  const isAging = (item: Listing) =>
    item.status !== 'vendu' && Date.now() - new Date(item.created_at).getTime() > AGING_STOCK_DAYS * 24 * 60 * 60 * 1000;

  const syncFreshnessClass = (iso: string | null) => {
    if (!iso) return 'text-red-400';
    const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
    if (hours > 48) return 'text-red-400';
    if (hours > 24) return 'text-amber-400';
    return 'text-gray-600';
  };

  // Bandeau de sync plus discret une fois l'etat stable (demande produit
  // 2026-08-05, test live) : aucun nouveau signal, uniquement une
  // combinaison de ceux deja calcules ci-dessus. "Besoin d'attention" =
  // extension pas prete, derniere synchro pas fraiche (<24h, meme classe
  // que syncFreshnessClass), compte selectionne non detecte cote Vinted, ou
  // un hint de synchro deja affiche (echec/action requise).
  const accountNotDetected =
    selectedAccountId === 'all' ? accounts.every((a) => !a.connected) : !!selectedAccount && !selectedAccount.connected;
  const syncNeedsAttention =
    extensionState !== 'ready' || syncFreshnessClass(lastSyncedAt) !== 'text-gray-600' || accountNotDetected || !!syncHint;

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((i) => selected.has(i.id));
  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleItems.forEach((i) => next.delete(i.id));
        return next;
      }
      const next = new Set(prev);
      visibleItems.forEach((i) => next.add(i.id));
      return next;
    });
  };

  const selectedItems = items.filter((i) => selected.has(i.id));
  const singleSelected = selected.size === 1 ? selectedItems[0] : null;
  // P-03 (audit pre-beta 2026-08-03) : publish_listing/republish_listing
  // echouent a 100% aujourd'hui (resolveCategory() casse depuis le 26/07,
  // voir extension/src/content/formFill.ts) -- bouton desactive plutot que
  // de laisser cliquer vers un echec garanti. checkPublishTemporarilyDisabled
  // (src/lib/actions/checks.ts) bloque deja le moteur d'action en defense en
  // profondeur ; ce commentaire documente pourquoi le bouton lui-meme est
  // aussi grise, pas seulement le moteur.

  const runBulkDelete = async () => {
    setBulkDeleting(true);
    setBulkError(null);
    const { error } = await supabase.from('listings').delete().in('id', Array.from(selected));
    setBulkDeleting(false);
    if (error) {
      console.error(error);
      setBulkError('La suppression a échoué pour certaines annonces. Réessaie.');
      return;
    }
    setConfirmBulkDelete(false);
    setSelected(new Set());
    await load();
  };

  const runBulkDraft = async () => {
    setBulkDrafting(true);
    setBulkError(null);
    const { error } = await supabase.from('listings').update({ status: 'draft' as const }).in('id', Array.from(selected));
    setBulkDrafting(false);
    if (error) {
      console.error(error);
      setBulkError('Le passage en brouillon a échoué pour certaines annonces. Réessaie.');
      return;
    }
    setSelected(new Set());
    await load();
  };

  return (
    <div>
      <div className="mb-6">
        <SectionLabel>Stock actif</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Articles en stock" value={stockItems.length.toString()} />
          <StatCard label="Valeur du stock" value={formatEUR(stockValue)} />
          <StatCard label="Investissement" value={formatEUR(investment)} />
          <StatCard label="Marge potentielle" value={formatEUR(potentialMargin)} highlight tone="positive" />
        </div>
      </div>

      <div className="mb-6">
        <SectionLabel>Ventes</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Articles vendus" value={soldItems.length.toString()} />
          <StatCard label="Chiffre d'affaires" value={formatEUR(revenue)} highlight tone="positive" />
          <StatCard label="Bénéfice" value={formatEUR(profit)} highlight tone="positive" />
          <StatCard label="ROI moyen" value={`${averageRoi} %`} highlight tone="positive" />
        </div>
      </div>

      {accounts.length > 0 && (
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 transition-colors ${
            syncNeedsAttention ? 'bg-surface border border-white/5 rounded-2xl p-4' : 'border-b border-white/5 py-2.5'
          }`}
        >
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
            <Button
              onClick={handleSync}
              disabled={syncing || extensionState !== 'ready'}
              size="sm"
              variant={syncNeedsAttention ? 'primary' : 'ghost'}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />}
            >
              {syncing ? 'Synchronisation...' : selectedAccountId === 'all' ? 'Ouvrir Vinted' : 'Synchroniser maintenant'}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 overflow-x-auto pb-1">
          <FilterPill label="Annonces" active={tab === 'annonces'} onClick={() => setTab('annonces')} />
          <FilterPill
            label={`Republication${republicationList.length > 0 ? ` (${republicationList.length})` : ''}`}
            active={tab === 'republication'}
            onClick={() => setTab('republication')}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          />
        </div>
        {/* "Tout selectionner" -- transparent, effet lumineux au survol
            (demande produit 2026-07-31), distinct des boutons pleins du
            reste du produit puisque ce n'est pas une action destructive. */}
        <button
          onClick={toggleSelectAll}
          disabled={visibleItems.length === 0}
          className="flex items-center gap-1.5 text-xs font-bold text-neon-500 border border-neon-500/30 bg-transparent px-3 py-1.5 rounded-lg hover:border-neon-500/70 hover:shadow-[0_0_16px_rgba(124,92,255,0.45)] hover:text-white transition-all disabled:opacity-40 disabled:pointer-events-none flex-shrink-0"
        >
          <Layers className="w-3.5 h-3.5" />
          {allVisibleSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
        </button>
      </div>

      {loadError && <ErrorBanner message={loadError} className="mb-4" />}
      {bulkError && <ErrorBanner message={bulkError} className="mb-4" />}

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 bg-surface-alt border border-neon-500/30 rounded-2xl px-4 py-3 mb-4 shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
          <p className="text-sm font-semibold text-gray-200 mr-auto">
            {selected.size} annonce{selected.size > 1 ? 's' : ''} sélectionnée{selected.size > 1 ? 's' : ''}
          </p>
          <Button
            variant="secondary"
            size="sm"
            icon={<Pencil className="w-3.5 h-3.5" />}
            disabled={!singleSelected}
            title={!singleSelected ? 'Sélectionne une seule annonce pour la modifier' : undefined}
            onClick={() => singleSelected && setEditingItem(singleSelected)}
          >
            Modifier
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<UploadCloud className="w-3.5 h-3.5" />}
            disabled
            title="Publication automatique sur Vinted temporairement indisponible (correctif en cours) -- réessaie plus tard"
            onClick={() => singleSelected && setPublishingItem(singleSelected)}
          >
            Republier
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<FileEdit className="w-3.5 h-3.5" />}
            loading={bulkDrafting}
            onClick={runBulkDraft}
          >
            Faire brouillon
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={() => setConfirmBulkDelete(true)}
          >
            Supprimer
          </Button>
        </div>
      )}

      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {FILTERS.map(({ key, label }) => (
          <FilterPill key={key} label={label} active={filter === key} onClick={() => setFilter(key)} />
        ))}
      </div>

      <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un article..." className="mb-6" />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} shape="block" className="h-64" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={tab === 'republication' ? RefreshCw : Sparkles}
          title={tab === 'republication' ? 'Rien à republier' : 'Aucun article'}
          description={
            tab === 'republication'
              ? 'Toutes tes annonces en stock sont déjà en ligne sur Vinted.'
              : 'Ajoute un article depuis le générateur, ou synchronise un compte Vinted.'
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleItems.map((item) => (
              <ListingCard
                key={item.id}
                item={item}
                selected={selected.has(item.id)}
                onToggleSelect={() => toggleSelected(item.id)}
                showAccount={selectedAccountId === 'all'}
                accountLabel={accountLabel}
                score={insights?.scores.get(item.id)?.score ?? null}
                recommendationState={insights?.listingRecommendations.get(item.id)}
                aging={isAging(item)}
                onMarkSold={() => {
                  setSellingItem(item);
                  setSoldPrice(String(item.price ?? ''));
                  setFees('0');
                }}
                onOpenDetail={() => setDetailItem(item)}
              />
            ))}
          </div>
          {hasMoreItems && (
            <Button variant="secondary" size="sm" fullWidth className="mt-4" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
              Charger plus
            </Button>
          )}
        </>
      )}

      {sellingItem && (
        <Modal onClose={() => { setSellingItem(null); setSellError(null); }} size="md">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-black">Marquer comme vendu</h2>
              <p className="text-xs text-gray-500 mt-1">{sellingItem.title}</p>
            </div>
            <button onClick={() => { setSellingItem(null); setSellError(null); }} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-white/5">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="space-y-4">
            {sellError && <ErrorBanner message={sellError} />}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Prix de vente</label>
              <input
                type="number"
                value={soldPrice}
                onChange={(e) => setSoldPrice(e.target.value)}
                className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Frais</label>
              <input
                type="number"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
              />
            </div>
            <Button fullWidth loading={sellSaving} onClick={markAsSold}>
              {sellSaving ? 'Enregistrement...' : 'Confirmer la vente'}
            </Button>
          </div>
        </Modal>
      )}

      {publishingItem && selectedAccount && (
        <PublishConfirmationModal
          listing={publishingItem}
          account={selectedAccount}
          onCancel={() => setPublishingItem(null)}
          onConfirm={handleConfirmPublish}
          isRepublish={!!publishingItem.vinted_item_id}
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
          {...(publishState.kind === 'edit_listing'
            ? {
                stepOrder: EDIT_STEP_ORDER,
                stepLabels: buildEditStepLabels(publishState.changedFields ?? []),
                title: 'Mise à jour Vinted en cours',
                errorTitle: 'Échec de la mise à jour',
                // Hint + "Ouvrir Vinted" pendant l'attente du clic manuel
                // (audit RC, 2026-08-05) -- l'attente du clic (voir
                // vinted-edit.ts::submitEdit, WAITING_FOR_MANUAL_CLICK) n'est
                // jamais rapportee comme un step distinct, elle correspond en
                // pratique a l'etape "publishing" affichee ici.
                hint:
                  publishState.step && publishState.step !== 'done' && !publishState.error
                    ? normalizeEditStepForDisplay(publishState.step) === 'publishing'
                      ? MANUAL_CLICK_HINT
                      : undefined
                    : undefined,
                onOpenVinted: publishState.listing?.vinted_item_id
                  ? () => openVintedEditTab(publishState.listing!.vinted_item_id!)
                  : undefined,
                // "Réessayer" uniquement sur le timeout de clic manuel precis
                // (comparaison au message deja simplifie, voir runVintedAction) --
                // pas pour les autres erreurs edit_listing (session expiree,
                // marque verrouillee...) ou relancer n'aiderait pas.
                onRetry:
                  publishState.error === MANUAL_CLICK_TIMEOUT_MESSAGE && publishState.listing
                    ? () => retryEditListing(publishState.listing!, publishState.changedFields ?? [])
                    : undefined,
                retryDisabled: retryInFlight,
              }
            : publishState.kind === 'republish_listing'
              ? {
                  title: 'Republication en cours',
                  errorTitle: 'Échec de la republication',
                }
              : {})}
        />
      )}

      {editingItem && (
        <EditListingModal
          listing={editingItem}
          onClose={() => setEditingItem(null)}
          canPublish={!!selectedAccount}
          canUpdateOnVinted={!!selectedAccount && selectedAccount.id === editingItem.vinted_account_id}
          photoLimit={photoLimit}
          onSaved={(updated, intent, changedFields) => {
            setEditingItem(null);
            setSelected(new Set());
            load();
            if (intent === 'publish') setPublishingItem(updated);
            if (intent === 'update') setPendingUpdate({ listing: updated, changedFields });
          }}
        />
      )}

      {detailItem && (
        <ListingDetailModal
          listing={detailItem}
          score={insights?.scores.get(detailItem.id)?.score ?? null}
          recommendationState={insights?.listingRecommendations.get(detailItem.id)}
          onClose={() => setDetailItem(null)}
        />
      )}

      {pendingUpdate && (
        <Modal onClose={() => setPendingUpdate(null)} size="sm">
          <h2 className="text-lg font-black mb-2">Mettre à jour sur Vinted ?</h2>
          <p className="text-sm text-gray-400 mb-6">
            Un nouvel onglet Vinted va s'ouvrir avec les champs déjà préparés. Il te suffira de cliquer une fois sur
            Valider dans cet onglet pour terminer la modification.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              fullWidth
              onClick={() => {
                const { listing, changedFields } = pendingUpdate;
                setPendingUpdate(null);
                void handleConfirmUpdate(listing, changedFields);
              }}
            >
              Continuer vers Vinted
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setPendingUpdate(null)}>
              Annuler
            </Button>
          </div>
        </Modal>
      )}

      {confirmBulkDelete && (
        <Modal onClose={() => setConfirmBulkDelete(false)} size="sm">
          <h2 className="text-lg font-black mb-2">Supprimer {selected.size} annonce{selected.size > 1 ? 's' : ''} ?</h2>
          <p className="text-sm text-gray-400 mb-5">
            Cette action supprime ces annonces de ResellOS uniquement (jamais de suppression automatique sur Vinted). Irréversible côté ResellOS.
          </p>
          <div className="flex items-center gap-3">
            <Button variant="secondary" fullWidth onClick={() => setConfirmBulkDelete(false)}>Annuler</Button>
            <Button variant="danger" fullWidth loading={bulkDeleting} onClick={runBulkDelete}>
              {bulkDeleting ? 'Suppression...' : 'Supprimer'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

interface ListingCardProps {
  item: Listing;
  selected: boolean;
  onToggleSelect: () => void;
  showAccount: boolean;
  accountLabel: (id: string | null) => string;
  score: number | null;
  recommendationState: ListingRecommendationResult | undefined;
  aging: boolean;
  onMarkSold: () => void;
  onOpenDetail: () => void;
}

function ListingCard({ item, selected, onToggleSelect, showAccount, accountLabel, score, recommendationState, aging, onMarkSold, onOpenDetail }: ListingCardProps) {
  const isSold = item.status === 'vendu';
  const hasCost = item.purchase_price !== null;
  const margin = isSold
    ? Number(item.sold_price || 0) - Number(item.purchase_price || 0) - Number(item.fees || 0)
    : Number(item.price || 0) - Number(item.purchase_price || 0);
  const roi = hasCost && Number(item.purchase_price) > 0 ? Math.round((margin / Number(item.purchase_price)) * 100) : 0;

  return (
    <div
      className={`group bg-surface-alt rounded-2xl border overflow-hidden transition-all duration-300 ${
        selected ? 'border-neon-500/60 shadow-[0_0_0_1px_rgba(124,92,255,0.3),0_20px_50px_rgba(0,0,0,0.35)]' : 'border-white/5 hover:border-neon-500/30'
      }`}
    >
      <div className="relative h-32 bg-dark-400 border-b border-white/10 overflow-hidden">
        {item.image_urls?.[0] ? (
          <img src={item.image_urls[0]} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700">
            <Sparkles className="w-8 h-8" />
          </div>
        )}
        <button
          onClick={onToggleSelect}
          aria-label={selected ? 'Désélectionner' : 'Sélectionner'}
          className={`absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors ${
            selected ? 'bg-neon-600 text-white' : 'bg-black/60 text-white hover:bg-black/80'
          }`}
        >
          {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
        </button>
        {item.vinted_status && (
          <div className="absolute top-2 right-2">
            <VintedStatusBadge status={item.vinted_status} />
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <button
            type="button"
            onClick={onOpenDetail}
            className="font-semibold text-sm text-gray-100 truncate text-left hover:text-neon-400 transition-colors"
            title="Voir le détail de l'annonce"
          >
            {item.title}
          </button>
        </div>
        {item.sku !== null && <p className="text-[11px] text-gray-500 font-mono mb-1">#{item.sku}</p>}
        <p className="text-xs text-gray-500 truncate">{[item.brand, item.category, item.size].filter(Boolean).join(' · ') || '—'}</p>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={`text-[11px] ${isSold ? 'text-green-400' : 'text-neon-500'}`}>
            {isSold ? 'Vendu' : item.status === 'draft' ? 'Brouillon' : 'En stock'}
          </span>
          {aging && (
            <span className="flex items-center gap-1 text-[11px] text-amber-400">
              <Clock className="w-3 h-3" /> +{AGING_STOCK_DAYS}j
            </span>
          )}
          {item.vinted_sync_status === 'sync_failed' && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
              Échec sync
            </span>
          )}
          {showAccount && item.vinted_account_id && (
            <span className="flex items-center gap-1 text-[11px] text-gray-500">
              <AccountAvatar label={accountLabel(item.vinted_account_id)} size="sm" />
              {accountLabel(item.vinted_account_id)}
            </span>
          )}
          {item.views !== null && (
            <span className="flex items-center gap-1 text-[11px] text-gray-500"><Eye className="w-3 h-3" /> {item.views}</span>
          )}
          {item.favourites !== null && (
            <span className="flex items-center gap-1 text-[11px] text-gray-500"><Heart className="w-3 h-3" /> {item.favourites}</span>
          )}
        </div>

        {/* 'attendre' reste volontairement silencieux (aucun badge) -- les 3
            autres etats du Decision Engine (action/donnees_insuffisantes/
            recommandation_differee) restent visuellement distincts, jamais
            confondus (voir LOT1_SPEC.md). */}
        {recommendationState?.status === 'action' && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-bold text-neon-500 bg-neon-500/10 px-1.5 py-0.5 rounded-md mt-2"
            title={recommendationState.reason}
          >
            <Lightbulb className="w-3 h-3" /> {recommendationState.message}
            {recommendationState.confidence === 'standard' && (
              <span className="font-normal text-neon-500/70">· à confirmer</span>
            )}
          </span>
        )}
        {recommendationState?.status === 'donnees_insuffisantes' && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 bg-white/5 px-1.5 py-0.5 rounded-md mt-2"
            title={recommendationState.reason}
          >
            <Info className="w-3 h-3" /> Données insuffisantes
          </span>
        )}
        {recommendationState?.status === 'recommandation_differee' && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded-md mt-2"
            title={recommendationState.reason}
          >
            <History className="w-3 h-3" /> Action déjà tentée récemment
          </span>
        )}

        {score !== null && <OneScoreBar score={score} size="sm" className="mt-2" />}

        <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-white/5">
          <MiniValue label={isSold ? 'Vente' : 'Valeur'} value={formatEUR(isSold ? item.sold_price ?? 0 : item.price ?? 0)} />
          <MiniValue label="Achat" value={hasCost ? formatEUR(item.purchase_price!) : '—'} />
          <MiniValue label={isSold ? 'Bénéfice' : 'Marge'} value={hasCost ? formatEUR(margin) : '—'} highlight={hasCost} />
          <MiniValue label="ROI" value={hasCost ? `${roi} %` : '—'} highlight={hasCost} />
        </div>

        {!isSold && (
          <Button variant="secondary" size="sm" fullWidth className="mt-3" onClick={onMarkSold}>
            Marquer vendu
          </Button>
        )}
      </div>
    </div>
  );
}

function MiniValue({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] uppercase tracking-wider text-gray-500 truncate">{label}</p>
      <p className={`text-xs font-bold truncate ${highlight ? 'text-neon-500' : 'text-gray-200'}`}>{value}</p>
    </div>
  );
}
