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
import { isExtensionConfigured, pingExtension, RUN_ACTION_TIMEOUT_ERROR, syncVintedAccount, type SyncStep, type SyncVintedAccountResult } from '../../../lib/extensionBridge';
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
import { parseMaterials } from '../../../lib/materials';
import { formatEUR } from '../../../lib/currency';
import type { ActionKind } from '../../../lib/actions/types';
import type { ListingRecommendationResult } from '../../../lib/insights/types';
import { needsRepublish } from '../../../lib/listingStatus';
import { devLog, devWarn, devError } from '../../../lib/devLog';
import { notifySale } from '../../../hooks/useNotifications';

// category/condition peuvent reellement etre vides ici (aucun check ne
// bloque plus dessus depuis le 2026-08-11, republication assistee -- voir
// publishListing.ts) : "?? ''" satisfait uniquement le type
// (PublishListingPayload les declare `string`), Vinted les affiche comme
// champs manuels a completer quoi qu'il arrive (voir
// publishFieldSummary.ts::computeManualFields cote extension).
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
    // Mission "MATIERE : MULTI-SELECT" (2026-08-16) : parseMaterials()
    // interprete le champ texte libre EXISTANT (aucun nouveau champ de
    // formulaire) -- une valeur simple ("Coton") produit un tableau a un
    // seul element, comportement identique a avant pour la grande majorite
    // des annonces.
    materials: parseMaterials(listing.material),
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

// SYNC_WINDOW_NAME reste utilise par la branche "tous les comptes"
// ci-dessous (aucun compte precis a cibler, window.open() reste le seul
// mecanisme possible). Mission "SYNC_VINTED_ACCOUNT" (2026-08-16, lot 2) :
// SYNC_POLL_INTERVAL_MS/SYNC_POLL_MAX_ATTEMPTS supprimes -- le poll Supabase
// sur listings_synced_at (jamais une preuve fiable, voir syncVintedAccount())
// est remplace par le resultat structure direct de la commande explicite.
const SYNC_WINDOW_NAME = 'resellos_vinted_sync';
const PAGE_SIZE = 30;

// Libelles honnetes des etapes de synchro (voir SyncStep, extensionBridge.ts) --
// affiches en direct sur le bouton pendant la synchro, jamais un simple
// "Synchronisation..." generique qui ne dit rien du deroulement reel.
const SYNC_STEP_LABELS: Record<SyncStep, string> = {
  connecting: 'Connexion à Vinted...',
  fetching: 'Récupération des annonces...',
  writing: 'Écriture des annonces...',
};

// Construit un message final honnete a partir du resultat structure de
// syncVintedAccount() -- AUCUNE synchro partielle ou echouee n'est jamais
// presentee comme un succes (voir la mission : "ne doit jamais afficher
// 'synchronisé' quand complete=false"). tone pilote la couleur du message
// (voir son usage dans le JSX ci-dessous).
function describeSyncResult(result: SyncVintedAccountResult): { tone: 'success' | 'warning' | 'error'; message: string } {
  if (!result.ok) {
    switch (result.reason) {
      case 'not_paired':
        return { tone: 'error', message: "Extension non appairée à ce compte ResellOS. Reconnecte-la dans Compte Vinted." };
      case 'tab_open_failed':
        return { tone: 'error', message: `Impossible d'ouvrir Vinted${result.error ? ` : ${result.error}` : '.'}` };
      case 'timeout':
        return { tone: 'error', message: 'Échec — aucune réponse de Vinted dans le délai imparti (session expirée ou profil injoignable).' };
      default:
        return { tone: 'error', message: result.error ? `Échec de la synchronisation : ${result.error}` : 'Échec de la synchronisation.' };
    }
  }
  const total = result.created + result.updated;
  if (!result.complete) {
    return {
      tone: 'warning',
      message: `Synchronisation partielle — ${result.pagesRead}/${result.pagesExpected} pages lues (${total} annonce(s) traitée(s), rien supprimé par prudence).`,
    };
  }
  const parts = [`${total} annonce(s) synchronisée(s)`];
  if (result.deletedMarked > 0) parts.push(`${result.deletedMarked} retirée(s)`);
  return { tone: 'success', message: parts.join(' · ') };
}

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
  const { report: insights, refetch: refetchInsights } = useInsights();

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
  const [syncPhase, setSyncPhase] = useState<SyncStep | null>(null);
  const [syncHint, setSyncHint] = useState<string | null>(null);
  const [syncTone, setSyncTone] = useState<'success' | 'warning' | 'error' | null>(null);

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
    // 'cleanup_required' (mission "CORRIGER LE FAUX TERMINE", 2026-08-17) :
    // B est confirmee et rattachee, mais l'ancienne annonce Vinted n'a pas
    // pu etre supprimee/confirmee supprimee -- distinct de 'done', jamais
    // affiche comme "Terminé." (voir PublishProgressModal.tsx).
    step: PublishStep | 'done' | 'cleanup_required' | null;
    error: string | null;
    // Detail de l'echec de suppression (resultPayload.cleanupError, voir
    // republishTransaction.ts/deleteOldListing.ts) -- non null uniquement
    // avec step==='cleanup_required'.
    cleanupError: string | null;
    historyId: string | null;
    kind: ActionKind | null;
    changedFields: EditableFieldName[] | null;
    // Conserve pour "Réessayer" sur un timeout edit_listing (audit RC,
    // 2026-08-05) -- seule la relance complete de l'action est possible
    // sans toucher aux fichiers P-04 (pas de reprise ciblee de la seule
    // phase de verification, voir le plan valide).
    listing: Listing | null;
    // Republication assistee (2026-08-11) : etat des lieux honnete rapporte
    // une seule fois par vinted-publish.ts (PUBLISH_PREFILL_SUMMARY) --
    // null tant qu'il n'est pas encore arrivé, jamais pour edit_listing.
    prefillSummary: { confirmed: string[]; pending: string[] } | null;
    // Mission "CLIC FINAL + CONFIRMATION POST-PUBLICATION" (2026-08-16) :
    // true des que PUBLISH_READY_TO_SUBMIT est recu (bouton Vinted lui-meme
    // devenu cliquable) -- jamais pour edit_listing (deja son propre hint
    // statique MANUAL_CLICK_HINT). Ne declenche jamais de clic automatique,
    // voir vinted-publish.ts::watchForPublishReadiness.
    readyToSubmit: boolean;
    // Mission "CORRIGER LE FAUX TERMINE" (2026-08-17) : true des que
    // l'extension attend un clic humain reel sur "Confirmer et supprimer"
    // (ancienne annonce, republish_listing uniquement) -- pilote le hint
    // "Confirmation de suppression requise sur Vinted", jamais une preuve
    // de suppression a lui seul.
    awaitingOldListingDeletion: boolean;
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
    if (publishState && publishState.step !== 'done' && publishState.step !== 'cleanup_required' && !publishState.error) {
      devWarn('[ResellOS][action] runVintedAction ignore : une action est deja en cours', {
        kind,
        listingId: listing.id,
        etapeEnCours: publishState.step,
      });
      return;
    }

    const changedFields = kind === 'edit_listing' ? (payload as EditListingPayload).changedFields : null;
    // Republication assistee (2026-08-11) : capturee via une variable locale
    // plutot qu'un etat React separe -- runVintedAction() reste sequentiel
    // (await), donc chaque setPublishState() suivant peut simplement lire sa
    // valeur la plus recente sans risque de course.
    let prefillSummary: { confirmed: string[]; pending: string[] } | null = null;
    // Mission "CLIC FINAL + CONFIRMATION POST-PUBLICATION" (2026-08-16) :
    // meme capture par variable locale que prefillSummary ci-dessus.
    let readyToSubmit = false;
    // Mission "CORRIGER LE FAUX TERMINE" (2026-08-17) : meme capture que
    // readyToSubmit ci-dessus, pour "awaiting_old_listing_deletion".
    let awaitingOldListingDeletion = false;
    setPublishState({
      step: 'preparing',
      error: null,
      cleanupError: null,
      historyId: null,
      kind,
      changedFields,
      listing,
      prefillSummary,
      readyToSubmit,
      awaitingOldListingDeletion,
    });
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
      setPublishState({
        step: null,
        error: prepared.failure.message,
        cleanupError: null,
        historyId: null,
        kind,
        changedFields,
        listing,
        prefillSummary,
        readyToSubmit,
        awaitingOldListingDeletion,
      });
      return;
    }
    const historyId = prepared.prepared.id;
    devLog(`[ResellOS][action][${historyId}] prepare() ok, confirmAction() lance`);

    const result = await confirmAction(
      prepared.prepared,
      (step) => {
        devLog(`[ResellOS][action][${historyId}] progression :`, step);
        if (!isPublishStep(step)) return;
        const displayStep = kind === 'edit_listing' ? normalizeEditStepForDisplay(step) : step;
        setPublishState({
          step: displayStep,
          error: null,
          cleanupError: null,
          historyId,
          kind,
          changedFields,
          listing,
          prefillSummary,
          readyToSubmit,
          awaitingOldListingDeletion,
        });
      },
      (confirmed, pending) => {
        devLog(`[ResellOS][action][${historyId}] etat des lieux du prereplissage :`, { confirmed, pending });
        prefillSummary = { confirmed, pending };
        setPublishState({
          step: 'publishing',
          error: null,
          cleanupError: null,
          historyId,
          kind,
          changedFields,
          listing,
          prefillSummary,
          readyToSubmit,
          awaitingOldListingDeletion,
        });
      },
      () => {
        devLog(`[ResellOS][action][${historyId}] formulaire Vinted pret a etre soumis (bouton non-disabled)`);
        readyToSubmit = true;
        setPublishState({
          step: 'publishing',
          error: null,
          cleanupError: null,
          historyId,
          kind,
          changedFields,
          listing,
          prefillSummary,
          readyToSubmit,
          awaitingOldListingDeletion,
        });
      },
      () => {
        // Mission "CORRIGER LE FAUX TERMINE" (2026-08-17) : l'extension
        // attend desormais un clic humain reel sur "Confirmer et supprimer"
        // (ancienne annonce, onglet reste ouvert) -- affiche un etat
        // explicite plutot que de laisser deviner l'utilisateur. Ne
        // remplace jamais 'step' (reste 'publishing') : seul ce booleen
        // pilote le hint, exactement comme readyToSubmit ci-dessus.
        devLog(`[ResellOS][action][${historyId}] confirmation de suppression requise sur Vinted (ancienne annonce)`);
        awaitingOldListingDeletion = true;
        setPublishState({
          step: 'publishing',
          error: null,
          cleanupError: null,
          historyId,
          kind,
          changedFields,
          listing,
          prefillSummary,
          readyToSubmit,
          awaitingOldListingDeletion,
        });
      }
    );
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
      setPublishState({
        step: 'syncing',
        error: null,
        cleanupError: null,
        historyId,
        kind,
        changedFields,
        listing,
        prefillSummary,
        readyToSubmit,
        awaitingOldListingDeletion,
      });
      await load();
      // Sans ce refetch, la recommandation affichee restait celle calculee
      // avant l'action (perimee jusqu'a la prochaine synchro passive) --
      // useInsights() n'a aucun moyen de savoir qu'une action vient de
      // reussir sans qu'on le lui dise explicitement (audit beta
      // 2026-08-08, P1-C). Uniquement sur un succes CONFIRME (on est deja
      // dans la branche status === 'success' ci-dessus) ; le cooldown est
      // deja respecte de facto, puisque action_log.completed_at est ecrit
      // avant ce point et que useInsights relit action_log a chaque appel.
      void refetchInsights();
      // BUG REEL confirme en test live (mission "CORRIGER LE FAUX TERMINE",
      // 2026-08-17) : ResellOS affichait "Terminé." des que
      // result.outcome.status valait 'success', SANS JAMAIS verifier
      // resultPayload.cleanupRequired -- alors que finalizeSuccess()
      // (extension, publishListing.ts) retourne TOUJOURS status:'success'
      // pour une republication, meme quand l'ancienne annonce Vinted n'a
      // pas ete supprimee/confirmee supprimee (reason:"cleanup_required",
      // voir republishTransaction.ts). Consequence : "Terminé" pouvait
      // s'afficher alors que l'ancienne annonce restait bel et bien en
      // ligne sur Vinted -- exactement le faux succes rapporte. La
      // republication n'est reellement terminee que si B est confirmee ET
      // rattachee ET (aucune ancienne annonce a supprimer OU suppression
      // reellement confirmee) -- seul resultPayload.cleanupRequired le dit.
      const resultPayload = result.outcome.resultPayload as { cleanupRequired?: boolean; cleanupError?: string } | undefined;
      const cleanupRequired = !!resultPayload?.cleanupRequired;
      setPublishState({
        step: cleanupRequired ? 'cleanup_required' : 'done',
        error: null,
        cleanupError: cleanupRequired ? (resultPayload?.cleanupError ?? null) : null,
        historyId,
        kind,
        changedFields,
        listing,
        prefillSummary,
        readyToSubmit,
        awaitingOldListingDeletion,
      });
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
      setPublishState({
        step: null,
        error: displayError,
        cleanupError: null,
        historyId,
        kind,
        changedFields,
        listing,
        prefillSummary,
        readyToSubmit,
        awaitingOldListingDeletion,
      });
    } else {
      setPublishState({
        step: null,
        error: "Cette action n'est pas encore disponible.",
        cleanupError: null,
        historyId,
        kind,
        changedFields,
        listing,
        prefillSummary,
        readyToSubmit,
        awaitingOldListingDeletion,
      });
    }
  };

  // BUG REEL confirme en test live (2026-08-11) : le bouton "Republier"
  // appelait setPublishingItem(listing) inconditionnellement, mais
  // PublishConfirmationModal n'est monte que si {publishingItem &&
  // selectedAccount} -- si le filtre de compte est sur "Tous les comptes"
  // (selectedAccountId==='all', l'etat par defaut tant que l'utilisateur n'a
  // jamais touche l'AccountSwitcher, voir VintedAccountFilterContext.tsx),
  // selectedAccount vaut null et la modale ne s'affichait jamais -- clic
  // silencieux, aucune erreur, aucun log, le flow extension n'etait meme pas
  // atteint. handleConfirmUpdate() (edit_listing, juste en dessous) gerait
  // deja ce meme cas correctement en affichant une erreur explicite via
  // publishState -- ce garde-fou manquait uniquement pour publish/republish.
  // Meme message, meme mecanisme, pour que l'utilisateur comprenne toujours
  // pourquoi rien ne se passe plutot que de deviner.
  const handleRequestPublish = (listing: Listing) => {
    if (!selectedAccount) {
      setPublishState({
        step: null,
        error: "Aucun compte Vinted sélectionné dans le filtre en haut de page. Sélectionne le compte de cette annonce avant de republier.",
        cleanupError: null,
        historyId: null,
        kind: listing.vinted_item_id ? 'republish_listing' : 'publish_listing',
        changedFields: null,
        listing,
        prefillSummary: null,
        readyToSubmit: false,
        awaitingOldListingDeletion: false,
      });
      return;
    }
    setPublishingItem(listing);
  };

  const handleConfirmPublish = async (packageSize: PackageSize) => {
    if (!publishingItem || !selectedAccount) return;
    const listing = publishingItem;
    setPublishingItem(null);
    // vinted_item_id present = annonce deja publiee, en ligne ou non (voir
    // checks.ts::checkListingRepublishEligible) -> republish_listing.
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
        cleanupError: null,
        historyId: null,
        kind: 'edit_listing',
        changedFields,
        listing,
        prefillSummary: null,
        readyToSubmit: false,
        awaitingOldListingDeletion: false,
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

  // Mission "SYNC_VINTED_ACCOUNT" (2026-08-16, lot 2 fiabilisation synchro) :
  // remplace window.open()+poll Supabase par une commande explicite et
  // tracable (syncVintedAccount(), voir extensionBridge.ts) -- le succes
  // n'est plus jamais infere du seul listings_synced_at, mais lu directement
  // dans le resultat structure retourne par l'extension (reutilise tel quel
  // le resultat de recordListings(), lot 1). La branche "tous les comptes"
  // (aucun compte precis a cibler) reste inchangee : window.open() est le
  // seul mecanisme possible dans ce cas.
  const handleSync = () => {
    if (syncing) return; // protection anti double-clic (en plus du bouton disabled)
    if (selectedAccountId === 'all' || !selectedAccount) {
      window.open('https://www.vinted.fr', SYNC_WINDOW_NAME);
      setSyncHint(
        "Ouvre le profil du compte à synchroniser dans l'onglet qui vient de s'ouvrir — la synchronisation se lance automatiquement, aucune action supplémentaire n'est nécessaire côté ResellOS."
      );
      setSyncTone(null);
      return;
    }
    const target = selectedAccount;
    setSyncing(true);
    setSyncPhase('connecting');
    setSyncHint(null);
    setSyncTone(null);

    void syncVintedAccount(target.vinted_user_id, target.vinted_username, {
      onProgress: (step) => setSyncPhase(step),
    }).then(async (result) => {
      setSyncing(false);
      setSyncPhase(null);
      const { tone, message } = describeSyncResult(result);
      setSyncTone(tone);
      setSyncHint(message);
      // Une synchro partielle a quand meme pu ecrire des annonces sures
      // (voir recordListings(), lot 1) -- rafraichir dans tous les cas ou
      // un traitement reel a eu lieu (ok:true), jamais sur un echec pur.
      if (result.ok) {
        await refreshAccounts();
        await load();
      }
    });
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
  // Republication assistee (2026-08-11) : le bouton "Republier" (comme
  // "Publier" depuis PublishConfirmationModal) reste actif -- resolveCategory()
  // (extension/src/content/formFill.ts) ne bloque plus la preparation entiere,
  // voir vinted-publish.ts. La categorie et les autres champs qui exigent un
  // clic isTrusted restent 100% manuels, mais le flux n'echoue plus a 100%.

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
            {syncHint && (
              <p
                className={`text-xs max-w-sm ${
                  syncTone === 'success' ? 'text-green-400' : syncTone === 'error' ? 'text-red-400' : 'text-amber-400'
                }`}
              >
                {syncHint}
              </p>
            )}
            <Button
              onClick={handleSync}
              disabled={syncing || extensionState !== 'ready'}
              size="sm"
              variant={syncNeedsAttention ? 'primary' : 'ghost'}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />}
            >
              {syncing
                ? (syncPhase ? SYNC_STEP_LABELS[syncPhase] : 'Synchronisation en cours...')
                : selectedAccountId === 'all'
                  ? 'Ouvrir Vinted'
                  : 'Synchroniser maintenant'}
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
            disabled={!singleSelected}
            title={!singleSelected ? 'Sélectionne une seule annonce pour la republier' : undefined}
            onClick={() => singleSelected && handleRequestPublish(singleSelected)}
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
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Frais (commission Vinted, port à ta charge...)</label>
              <input
                type="number"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
              />
              {/* P1-4 (Freeze Audit correctif) : ce montant est deja soustrait
                  de la marge de cette vente (voir AccountingPage.tsx::stats.fees)
                  -- aucun identifiant commun ne relie une depense a une vente
                  precise, donc pas de deduplication automatique fiable
                  possible (choix assume : avertir plutot qu'inventer un
                  rapprochement incertain). */}
              <p className="text-[10px] text-gray-600 mt-1.5">
                Déjà déduit automatiquement de la marge de cette vente — ne le rajoute pas aussi comme dépense « Frais Vinted » en Comptabilité, ça compterait le même coût deux fois.
              </p>
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
          cleanupError={publishState.cleanupError}
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
                  // 'cleanup_required' n'est jamais produit pour edit_listing
                  // (aucune ancienne annonce a nettoyer, voir runVintedAction) --
                  // exclu ici uniquement pour que normalizeEditStepForDisplay()
                  // (qui n'accepte que PublishStep) reste type-safe.
                  publishState.step && publishState.step !== 'done' && publishState.step !== 'cleanup_required' && !publishState.error
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
            : publishState.kind === 'republish_listing' || publishState.kind === 'publish_listing'
              ? {
                  title: publishState.kind === 'republish_listing' ? 'Republication en cours' : 'Publication en cours',
                  errorTitle: publishState.kind === 'republish_listing' ? 'Échec de la republication' : 'Échec de la publication',
                  // Republication assistee (2026-08-11) : des que le
                  // remplissage automatise est termine (PUBLISH_PREFILL_SUMMARY
                  // recu, voir runVintedAction), l'etape "publishing" ne
                  // decrit plus une automatisation en cours mais l'attente du
                  // clic reel de l'utilisateur sur Vinted -- meme principe que
                  // MANUAL_CLICK_HINT pour edit_listing. Mission "CLIC FINAL +
                  // CONFIRMATION POST-PUBLICATION" (2026-08-16) : une fois
                  // PUBLISH_READY_TO_SUBMIT recu (bouton Vinted lui-meme
                  // devenu cliquable, voir runVintedAction), le hint devient
                  // affirmatif plutot que d'inviter a "terminer" des champs
                  // deja termines -- jamais un declencheur de clic
                  // automatique (ecarte, voir vinted-publish.ts::
                  // watchForPublishReadiness).
                  hint:
                    // Mission "CORRIGER LE FAUX TERMINE" (2026-08-17) : priorite
                    // la plus haute -- survient APRES le clic sur "Ajouter"
                    // (B deja publiee), pendant que l'extension attend le clic
                    // humain sur "Confirmer et supprimer" (ancienne annonce,
                    // onglet reste ouvert par ResellOS). Etat explicite demande :
                    // ne jamais laisser deviner l'utilisateur pendant cette attente.
                    publishState.step === 'publishing' && !publishState.error && publishState.awaitingOldListingDeletion
                      ? "Confirmation de suppression requise sur Vinted : ouvre l'onglet de l'ancienne annonce (déjà ouvert par ResellOS) et clique sur « Confirmer et supprimer »."
                      : publishState.step === 'publishing' && !publishState.error && publishState.readyToSubmit
                        ? 'Tout est prêt : clique sur le bouton « Ajouter » dans l\'onglet Vinted pour publier ton annonce.'
                        : publishState.step === 'publishing' && !publishState.error && publishState.prefillSummary
                          ? "ResellOS a prérempli ce qu'il pouvait sur l'onglet Vinted ouvert. Termine la catégorie et les champs signalés « À confirmer », puis clique toi-même sur le bouton de publication Vinted."
                          : undefined,
                  prefillSummary: publishState.prefillSummary,
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
          onEditListing={() => {
            setEditingItem(detailItem);
            setDetailItem(null);
          }}
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

export interface ListingCardProps {
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

export function ListingCard({ item, selected, onToggleSelect, showAccount, accountLabel, score, recommendationState, aging, onMarkSold, onOpenDetail }: ListingCardProps) {
  const isSold = item.status === 'vendu';
  const hasCost = item.purchase_price !== null;
  const margin = isSold
    ? Number(item.sold_price || 0) - Number(item.purchase_price || 0) - Number(item.fees || 0)
    : Number(item.price || 0) - Number(item.purchase_price || 0);
  const roi = hasCost && Number(item.purchase_price) > 0 ? Math.round((margin / Number(item.purchase_price)) * 100) : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDetail();
        }
      }}
      aria-label={`Voir le détail de ${item.title}`}
      className={`group bg-surface-alt rounded-2xl border overflow-hidden transition-all duration-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-500 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-500 ${
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
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
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
          <p className="font-semibold text-sm text-gray-100 truncate">{item.title}</p>
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
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            className="mt-3"
            onClick={(e) => {
              e.stopPropagation();
              onMarkSold();
            }}
          >
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
