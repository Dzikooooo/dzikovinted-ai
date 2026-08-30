import { useCallback, useEffect, useState } from 'react';
import {
  X, Sparkles, RefreshCw, Pencil, UploadCloud, Trash2, FileEdit, Layers, Clock,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useVintedAccountFilter } from '../../../contexts/VintedAccountFilterContext';
import { useToast } from '../../../contexts/ToastContext';
import { useInsights } from '../../../hooks/useInsights';
import { useActionEngine } from '../../../hooks/useActionEngine';
import { useIsAdmin } from '../../../hooks/useIsAdmin';
import { supabase } from '../../../lib/supabase';
import { fetchAllRows } from '../../../lib/supabaseExhaustiveFetch';
import type { Listing } from '../../../lib/types';
import { PLAN_PHOTO_LIMITS } from '../../../lib/types';
import { StatCard } from '../../../components/ui/StatCard';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { FilterPill } from '../../../components/ui/FilterPill';
import { SearchInput } from '../../../components/ui/SearchInput';
import PublishConfirmationModal, { type PackageSize } from '../../../components/publish/PublishConfirmationModal';
import PublishProgressModal from '../../../components/publish/PublishProgressModal';
import { EditListingModal } from '../../../components/stock/EditListingModal';
import { ListingDetailModal } from '../../../components/listings/ListingDetailModal';
import { AccountAuditModal } from '../../../components/listings/AccountAuditModal';
import { isExtensionConfigured, pingExtension, RUN_ACTION_TIMEOUT_ERROR, syncVintedAccount, type SyncStep } from '../../../lib/extensionBridge';
import { describeSyncResult } from '../../../lib/syncResultMessage';
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
import { buildEditSuccessSyncFields, runSkuRepair } from '../../../lib/sku';
import { formatEUR } from '../../../lib/currency';
import type { ActionKind } from '../../../lib/actions/types';
import { needsRepublish } from '../../../lib/listingStatus';
import { devLog, devWarn, devError } from '../../../lib/devLog';
import { notifySale } from '../../../hooks/useNotifications';
import { isoToLocalDateTime, type RepublishSchedule } from '../../../lib/republishSchedule';
import { acknowledgeSchedule, getAcknowledgedScheduleIds } from '../../../lib/republishAcknowledgements';
import {
  cancelRepublishSchedule,
  createRepublishSchedule,
  listActiveRepublishSchedules,
  updateRepublishSchedule,
  listRecentRepublishOutcomes,
  type RepublishScheduleRow,
  type RepublishOutcomeRow,
} from '../../../services/republishSchedules';
import { buildPublishPayload, buildRepublishPayload, buildEditPayload } from './listingActionPayloads';
import { ListingCard } from './ListingCard';

// Mission "ROUND 2 -- PERSISTANCE APP" (2026-08-20) : convertit une ligne
// Supabase brute (republish_schedules) vers la forme consommee par l'UI
// (ListingCard/PublishConfirmationModal, inchangees depuis le round 1) --
// isoToLocalDateTime() fait la conversion fuseau reelle (jamais de
// concatenation naive), voir son en-tete dans lib/republishSchedule.ts.
// `undefined` si aucune ligne (pas de programmation active pour cette
// annonce) -- jamais un objet {mode:'now'} invente, qui laisserait croire a
// une programmation "vide" plutot qu'a une absence reelle.
function toUiSchedule(row: RepublishScheduleRow | undefined): RepublishSchedule | undefined {
  if (!row) return undefined;
  const { date, time } = isoToLocalDateTime(row.scheduled_for);
  return { mode: 'scheduled', date, time, packageSize: row.package_size };
}

type ManagementTab = 'annonces' | 'republication' | 'en_attente';
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
  const { showToast } = useToast();
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
  // `visibleCount` reste utilise UNIQUEMENT par l'onglet Republication (voir
  // plus bas, pagination client-side inchangee sur ce petit sous-ensemble).
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Phase 2 "Affinage stock & performance" (2026-08-28) : PAGINATION SERVEUR
  // pour l'onglet "Annonces" -- select('*') sans limite (voir `load()`
  // ci-dessous) se heurterait silencieusement au plafond 1000 lignes de
  // PostgREST des qu'un vendeur depasse ce volume. Perimetre VOLONTAIREMENT
  // borne a cet onglet : "Republication" reste sur son mecanisme actuel
  // (derive de `items`, petit sous-ensemble par construction -- traduire
  // needsRepublish() en filtre SQL merite sa propre passe, pas precipitee
  // ici). `items`/`load()` restent eux aussi INCHANGES : ils n'alimentent
  // plus que les 4 StatCards du haut et le badge de l'onglet Republication --
  // leur propre passage a une agregation serveur est un chantier separe et
  // plus delicat (ce sont des chiffres financiers), deliberement pas celui-ci.
  const [pageItems, setPageItems] = useState<Listing[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [hasMorePages, setHasMorePages] = useState(false);

  // Recherche debouncee (300ms) : devient une vraie requete reseau a chaque
  // changement (recherche server-side sur l'onglet Annonces) plutot qu'un
  // simple filtre en memoire -- sans debounce, chaque frappe declencherait
  // sa propre requete.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

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
  // Mission "ROUND 2 -- PERSISTANCE APP" (2026-08-20) : la source de verite
  // est desormais la table `republish_schedules` (deja appliquee et validee
  // en prod, round 1) -- ce state est un simple CACHE local, indexe par
  // listing_id, peuple par listActiveRepublishSchedules() au montage et
  // maintenu a jour a chaque creation/modification/annulation reussie (pas
  // de refetch systematique). N'entre JAMAIS dans runVintedAction()/l'Action
  // Engine. `activeSchedulesLoadError` reste non-bloquant (best-effort,
  // meme discipline que le reste de la page -- une erreur ici ne doit
  // jamais empecher d'utiliser "Mes annonces").
  const [activeSchedulesByListingId, setActiveSchedulesByListingId] = useState<Record<string, RepublishScheduleRow>>({});
  // Mission "ROUND 5" (2026-08-23) : resultats termines recents, indexes par
  // annonce. `acknowledgedIds` vient du localStorage (voir
  // republishAcknowledgements.ts) -- un resultat acquitte disparait sans
  // toucher a la base.
  const [outcomesByListingId, setOutcomesByListingId] = useState<Record<string, RepublishOutcomeRow>>({});
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(() => getAcknowledgedScheduleIds());
  const [activeSchedulesLoadError, setActiveSchedulesLoadError] = useState<string | null>(null);
  // Erreur d'une action Annuler (le seul flux de mutation qui n'a pas sa
  // propre modale pour afficher un message -- Programmer/Modifier affichent
  // l'erreur DANS PublishConfirmationModal, voir handleSchedule).
  const [scheduleCancelError, setScheduleCancelError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Listing | null>(null);
  // Audit du compte Vinted (2026-08-30, remplace Pricer Pro) : action de
  // niveau compte, jamais dependante d'une selection -- distincte de
  // auditingItem (qui n'existe plus).
  const [auditingAccount, setAuditingAccount] = useState(false);
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

  // Chantier #3 "Affinage stock & performance" (2026-08-28), derniere brique :
  // `items`/`load()` alimente les 4 StatCards du haut (dont stockValue et
  // revenue, des chiffres financiers) et le badge de l'onglet Republication
  // -- un select() sans .range() serait silencieusement tronque a 1000
  // lignes par PostgREST des qu'un vendeur depasse ce volume. Meme pattern
  // que useInsights.ts/DashboardHome.tsx/AccountingPage.tsx : fetchAllRows
  // boucle sur .range() jusqu'a epuisement. `loadGridPage` (chantier #1)
  // reste inchange -- deux besoins distincts sur la meme table : lui pagine
  // pour l'affichage (30 lignes/page), celui-ci doit rester exhaustif pour
  // que les totaux soient exacts.
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const rows = await fetchAllRows<Listing>((rangeStart, rangeEnd) => {
        let query = supabase
          .from('listings')
          .select('*')
          .eq('user_id', user.id)
          .or('vinted_status.neq.deleted,vinted_status.is.null')
          .order('created_at', { ascending: false })
          .range(rangeStart, rangeEnd);
        if (selectedAccountId !== 'all') {
          query = query.eq('vinted_account_id', selectedAccountId);
        }
        return query;
      });
      setLoadError(null);
      setItems(rows);
    } catch (err) {
      console.error(err);
      setLoadError('Impossible de charger tes annonces. Réessaie plus tard.');
    }
    setLoading(false);
  }, [user, selectedAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  // Requete server-side reelle pour la grille de l'onglet Annonces --
  // recherche/filtre/pagination traduits en filtres Supabase plutot qu'en
  // `.filter()`/`.slice()` sur un tableau deja entierement rapatrie. `offset`
  // est passe explicitement (jamais lu depuis `pageItems.length` a
  // l'interieur du callback) : sinon `loadGridPage` changerait d'identite a
  // chaque page chargee, et l'inclure dans les dependances de l'effet de
  // reinitialisation plus bas boucleraient indefiniment (fetch -> pageItems
  // change -> loadGridPage change -> effet redeclenche -> fetch...).
  const loadGridPage = useCallback(
    async (offset: number, mode: 'reset' | 'append') => {
      if (!user || (tab !== 'annonces' && tab !== 'en_attente')) return;
      setPageLoading(true);
      let query = supabase
        .from('listings')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (tab === 'en_attente') {
        // Rubrique "En attente" (2026-08-30) : jamais publiees, donc jamais
        // rattachees a un compte Vinted precis -- le filtre de compte du
        // bandeau du haut ne s'applique pas ici (sinon selectionner un
        // compte precis viderait systematiquement cet onglet, puisque
        // vinted_account_id y est toujours NULL). Meme raison pour le pilote
        // de statut Vinted (FILTERS), masque cote UI pour cet onglet.
        query = query.eq('status', 'en_attente');
      } else {
        query = query
          .or('vinted_status.neq.deleted,vinted_status.is.null')
          .neq('status', 'vendu')
          .neq('status', 'en_attente');
        if (selectedAccountId !== 'all') {
          query = query.eq('vinted_account_id', selectedAccountId);
        }
        if (filter !== 'all') {
          query = query.eq('vinted_status', filter);
        }
      }
      const q = debouncedSearch.trim();
      if (q) {
        // Un DEUXIEME .or() ANDe naturellement avec le premier -- chaque
        // appel ajoute son propre parametre `or=`, et PostgREST combine tous
        // les parametres de requete par ET, exactement comme .eq()/.neq()
        // chaines. Pas une supposition : c'est le mecanisme standard de
        // filtrage PostgREST, deja ce que fait CHAQUE filtre de cette meme
        // requete.
        query = query.or(`title.ilike.%${q}%,brand.ilike.%${q}%,category.ilike.%${q}%`);
      }

      const { data, error, count } = await query;
      if (error) {
        console.error(error);
        setPageError('Impossible de charger tes annonces. Réessaie plus tard.');
        setPageLoading(false);
        return;
      }
      setPageError(null);
      const rows = (data ?? []) as Listing[];
      setPageItems((prev) => (mode === 'reset' ? rows : [...prev, ...rows]));
      setHasMorePages(count !== null && offset + rows.length < count);
      setPageLoading(false);
    },
    [user, tab, selectedAccountId, filter, debouncedSearch]
  );

  // Reinitialise la page ET la selection a chaque changement de contexte
  // (recherche/filtre/compte/onglet) -- meme discipline que l'ancien effet
  // (visibleCount+selected), etendue au rechargement server-side reel de la
  // grille Annonces. Sur l'onglet Republication, loadGridPage() est un
  // no-op (garde interne ci-dessus) -- seul visibleCount/selected comptent
  // alors, exactement comme avant.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setSelected(new Set());
    void loadGridPage(0, 'reset');
  }, [debouncedSearch, filter, selectedAccountId, tab, loadGridPage]);

  // Rafraichit a la fois les totaux (StatCards, badge Republication) et la
  // page actuelle de la grille -- remplace tous les anciens `await load()`
  // isoles après une mutation (vente, suppression groupee, brouillon,
  // action Vinted reussie/echouee) : les deux sources doivent rester
  // coherentes entre elles apres une ecriture.
  const refreshAll = useCallback(async () => {
    await load();
    await loadGridPage(0, 'reset');
  }, [load, loadGridPage]);

  // Mission "ROUND 2 -- PERSISTANCE APP" (2026-08-20) : recharge les
  // programmations actives de l'utilisateur au montage (et si `user`
  // change) -- c'est ce qui fait "survivre" une programmation a un refresh
  // de page (state local reconstruit depuis Supabase, jamais suppose). Pas
  // de dependance a selectedAccountId : RLS scope deja a l'utilisateur, une
  // annonce d'un autre compte Vinted que le filtre courant garde son badge
  // correct des qu'on repasse dessus (coherent avec `items`, qui n'est lui
  // non plus jamais filtre client-side par ce state).
  const loadActiveSchedules = useCallback(async () => {
    if (!user) return;
    const result = await listActiveRepublishSchedules();
    if (!result.ok) {
      devWarn('[ResellOS][schedule] echec du chargement des programmations actives (non bloquant)', result.message);
      setActiveSchedulesLoadError(result.message);
      return;
    }
    setActiveSchedulesLoadError(null);
    const byListingId: Record<string, RepublishScheduleRow> = {};
    for (const row of result.data) byListingId[row.listing_id] = row;
    setActiveSchedulesByListingId(byListingId);
  }, [user]);

  // Mission "ROUND 5" (2026-08-23) : les resultats termines recents. Charges
  // separement des programmations actives -- un echec de l'un ne doit jamais
  // empecher l'autre de s'afficher (meme discipline non bloquante).
  const loadOutcomes = useCallback(async () => {
    if (!user) return;
    const result = await listRecentRepublishOutcomes();
    if (!result.ok) {
      devWarn('[ResellOS][schedule] echec du chargement des resultats recents (non bloquant)', result.message);
      return;
    }
    // Resultats deja tries du plus recent au plus ancien par la requete : le
    // premier vu pour une annonce est donc le plus recent, on ne l'ecrase
    // jamais avec un plus ancien.
    const byListingId: Record<string, RepublishOutcomeRow> = {};
    for (const row of result.data) {
      if (!byListingId[row.listing_id]) byListingId[row.listing_id] = row;
    }
    setOutcomesByListingId(byListingId);
  }, [user]);

  useEffect(() => {
    loadActiveSchedules();
    loadOutcomes();
  }, [loadActiveSchedules, loadOutcomes]);

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
      showToast('Vente enregistrée !', 'success');
      setSellingItem(null);
      setSoldPrice('');
      setFees('0');
      setSellSaving(false);
      await refreshAll();
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
      await refreshAll();
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
      await refreshAll();
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

  // Mission "ROUND 2 -- PERSISTANCE APP" (2026-08-20) : jamais d'appel a
  // runVintedAction/prepareAction/confirmAction ici -- ecrit reellement dans
  // `republish_schedules` (via le service dedie), aucune action Vinted
  // declenchee. `onSchedule` (PublishConfirmationModal) n'appelle cette
  // fonction qu'avec une date/heure deja validees cote UI (isScheduleValid) --
  // Postgres reste la source de verite finale (contrainte unique, voir
  // republishSchedules.ts::toActionError pour la traduction du conflit
  // 23505). Retourne un resultat explicite : la modale n'affiche le succes
  // (fermeture) qu'apres cette reponse REELLE, jamais avant -- sur echec,
  // elle reste ouverte et affiche `result.error` tel quel.
  // Si une programmation active existe deja pour cette annonce (ex. reouverte
  // via "Modifier"), met a jour CETTE ligne plutot que d'en creer une
  // seconde -- jamais deux appels differents cote UI pour create/update, un
  // seul point de decision ici.
  const handleSchedule = async (
    date: string,
    time: string,
    packageSize: PackageSize
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!publishingItem || !selectedAccount) {
      return { ok: false, error: 'Aucun compte Vinted sélectionné.' };
    }
    // Mission "ROUND 2 -- BUG RLS user_id manquant" (2026-08-20) : CAUSE
    // CONFIRMEE -- createRepublishSchedule() n'envoyait jamais user_id, donc
    // NULL en base (aucun `default auth.uid()` sur cette colonne) ;
    // `auth.uid() = NULL` n'est jamais vrai, d'ou "new row violates row-level
    // security policy" au clic sur "Programmer la republication" (reproduit
    // et corrige, voir republishSchedules.ts). `user` est deja disponible
    // ici (useAuth(), meme source que partout ailleurs dans ce composant) --
    // jamais une nouvelle source d'identite inventee pour ce correctif.
    if (!user) {
      return { ok: false, error: 'Session expirée -- reconnecte-toi puis réessaie.' };
    }
    const listing = publishingItem;
    const existing = activeSchedulesByListingId[listing.id];

    const result = existing
      ? await updateRepublishSchedule(existing.id, { date, time, packageSize })
      : await createRepublishSchedule({
          userId: user.id,
          listingId: listing.id,
          vintedAccountId: selectedAccount.id,
          date,
          time,
          packageSize,
        });

    if (!result.ok) {
      return { ok: false, error: result.message };
    }
    setActiveSchedulesByListingId((prev) => ({ ...prev, [listing.id]: result.data }));
    setPublishingItem(null);
    return { ok: true };
  };

  // UPDATE status='cancelled' (jamais un DELETE, voir le service) -- le
  // badge ne disparait de l'UI qu'APRES la reponse Supabase confirmee,
  // jamais de facon optimiste : un echec laisse le badge et la ligne
  // active intacts, avec un message explicite plutot qu'un succes silencieux
  // suppose.
  const handleCancelSchedule = async (listingId: string) => {
    const existing = activeSchedulesByListingId[listingId];
    if (!existing) return;
    setScheduleCancelError(null);
    const result = await cancelRepublishSchedule(existing.id);
    if (!result.ok) {
      devWarn('[ResellOS][schedule] echec annulation', result.message);
      setScheduleCancelError(result.message);
      return;
    }
    setActiveSchedulesByListingId((prev) => {
      const next = { ...prev };
      delete next[listingId];
      return next;
    });
  };

  // Mission "ROUND 5" (2026-08-23) : acquitter un resultat. Purement local
  // (localStorage) -- aucune ecriture en base, la ligne republish_schedules
  // garde son statut terminal intact et reste consultable/auditable.
  const handleAcknowledgeOutcome = (listingId: string) => {
    const outcome = outcomesByListingId[listingId];
    if (!outcome) return;
    acknowledgeSchedule(outcome.id);
    setAcknowledgedIds((prev) => new Set(prev).add(outcome.id));
  };

  // Reprogrammer apres un echec : acquitte d'abord le resultat (sinon il
  // resterait affiche sous la nouvelle programmation), puis rouvre la modale
  // de publication -- exactement le meme chemin que "Modifier" sur une
  // programmation active, jamais un second flux parallele.
  const handleRescheduleAfterFailure = (listing: Listing) => {
    handleAcknowledgeOutcome(listing.id);
    handleRequestPublish(listing);
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
      //
      // Phase 2 (2026-08-28) : refreshAccounts()/load() n'avaient aucune
      // gestion d'erreur -- un echec ici (reseau, Supabase) laissait
      // l'utilisateur voir "Synchronisation reussie" (deja affiche juste
      // au-dessus) alors que la grille d'annonces et la fraicheur affichee
      // restaient perimees en silence, sans aucune trace hors console.
      if (result.ok) {
        try {
          await refreshAccounts();
          await refreshAll();
        } catch (err) {
          console.error('[ResellOS][sync] echec du rafraichissement post-synchro', err);
          setSyncTone('warning');
          setSyncHint(
            "Synchronisation effectuée, mais l'affichage n'a pas pu être actualisé. Recharge la page pour voir tes annonces à jour."
          );
        }
      }
    });
  };

  const accountLabel = (vintedAccountId: string | null) => accounts.find((a) => a.id === vintedAccountId)?.label ?? '?';

  // Badge de l'onglet + base de l'onglet Republication : INCHANGE, derive
  // toujours de `items` (petit sous-ensemble, pagination client-side
  // conservee -- voir la note au-dessus de `pageItems`).
  const republicationList = items.filter(needsRepublish);
  const filteredRepublicationList = republicationList.filter((item) => {
    const q = debouncedSearch.toLowerCase();
    const matchesSearch =
      !q ||
      item.title?.toLowerCase().includes(q) ||
      item.brand?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q);
    const matchesFilter = filter === 'all' || item.vinted_status === filter;
    return matchesSearch && matchesFilter;
  });

  // Annonces : `pageItems` vient directement de loadGridPage() (recherche/
  // filtre/pagination deja appliques server-side) -- plus aucun .filter()/
  // .slice() en memoire ici. Republication : mecanisme client-side inchange.
  const pendingCount = items.filter((item) => item.status === 'en_attente').length;
  const isServerPaginated = tab === 'annonces' || tab === 'en_attente';
  const displayedItems = isServerPaginated ? pageItems : filteredRepublicationList.slice(0, visibleCount);
  const hasMore = isServerPaginated ? hasMorePages : filteredRepublicationList.length > visibleCount;
  const isGridLoading = isServerPaginated ? pageLoading : loading;
  const gridError = isServerPaginated ? pageError : null;

  const stockItems = items.filter(isActivelyInStock);
  const soldItems = items.filter((item) => item.status === 'vendu');
  // "En ligne" au sens Vinted (vinted_status), pas "en stock" cote ResellOS :
  // le libelle du KPI dit "en ligne", le chiffre doit compter exactement ca.
  const onlineCount = items.filter((item) => item.vinted_status === 'online').length;
  const stockValue = stockItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const revenue = soldItems.reduce((sum, item) => sum + Number(item.sold_price || 0), 0);

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
    if (!iso) return 'text-red-700';
    const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
    if (hours > 48) return 'text-red-700';
    if (hours > 24) return 'text-amber-700';
    return 'text-gray-500';
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
    extensionState !== 'ready' || syncFreshnessClass(lastSyncedAt) !== 'text-gray-500' || accountNotDetected || !!syncHint;

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = displayedItems.length > 0 && displayedItems.every((i) => selected.has(i.id));
  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        displayedItems.forEach((i) => next.delete(i.id));
        return next;
      }
      const next = new Set(prev);
      displayedItems.forEach((i) => next.add(i.id));
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
    // Capture AVANT setSelected(new Set()) plus bas -- selected.size vaudrait
    // 0 si on le lisait apres, le toast annoncerait "0 annonce supprimee".
    const count = selected.size;
    const { error } = await supabase.from('listings').delete().in('id', Array.from(selected));
    setBulkDeleting(false);
    if (error) {
      console.error(error);
      setBulkError('La suppression a échoué pour certaines annonces. Réessaie.');
      return;
    }
    showToast(`${count} annonce${count > 1 ? 's supprimées' : ' supprimée'}.`, 'success');
    setConfirmBulkDelete(false);
    setSelected(new Set());
    await refreshAll();
  };

  const runBulkDraft = async () => {
    setBulkDrafting(true);
    setBulkError(null);
    const count = selected.size;
    const { error } = await supabase.from('listings').update({ status: 'draft' as const }).in('id', Array.from(selected));
    setBulkDrafting(false);
    if (error) {
      console.error(error);
      setBulkError('Le passage en brouillon a échoué pour certaines annonces. Réessaie.');
      return;
    }
    showToast(`${count} annonce${count > 1 ? 's passées' : ' passée'} en brouillon.`, 'success');
    setSelected(new Set());
    await refreshAll();
  };

  return (
    <div>
      {/* Deux blocs de 4 StatCards ("Stock actif" + "Ventes") occupaient tout
          le haut de page avant la moindre annonce. Fusionnes en UNE rangee de
          4 chiffres essentiels (2026-08-26). Les quatre retires
          (Investissement, Marge potentielle, Benefice, ROI moyen) ne sont pas
          perdus : ils vivent deja sur la page Comptabilite, dont c'est le
          sujet -- ici ils repoussaient le catalogue, qui est ce qu'on vient
          reellement consulter. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Articles en ligne" value={onlineCount.toString()} />
        <StatCard label="Valeur du stock" value={formatEUR(stockValue)} />
        <StatCard label="Ventes réalisées" value={soldItems.length.toString()} />
        <StatCard label="CA total" value={formatEUR(revenue)} highlight tone="positive" />
      </div>

      {accounts.length > 0 && (
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 transition-colors ${
            syncNeedsAttention ? 'bg-surface border border-gray-200 rounded-2xl p-4' : 'border-b border-gray-200 py-2.5'
          }`}
        >
          <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
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
                  syncTone === 'success' ? 'text-green-700' : syncTone === 'error' ? 'text-red-700' : 'text-amber-700'
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
          <FilterPill
            label={`En attente${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
            active={tab === 'en_attente'}
            onClick={() => setTab('en_attente')}
            icon={<Clock className="w-3.5 h-3.5" />}
          />
        </div>
        {/* "Tout selectionner" a rejoint la barre d'outils unifiee plus bas :
            il y est aux cotes de la recherche et du filtre, avec lesquels il
            partage le meme perimetre (ce qui est visible a l'ecran). */}
        <Button
          variant="secondary"
          size="sm"
          icon={<Sparkles className="w-3.5 h-3.5" />}
          onClick={() => setAuditingAccount(true)}
        >
          Auditer mon compte
        </Button>
      </div>

      {loadError && <ErrorBanner message={loadError} className="mb-4" />}
      {gridError && <ErrorBanner message={gridError} className="mb-4" />}
      {bulkError && <ErrorBanner message={bulkError} className="mb-4" />}
      {activeSchedulesLoadError && (
        <ErrorBanner message={`Impossible de charger tes programmations : ${activeSchedulesLoadError}`} className="mb-4" />
      )}
      {scheduleCancelError && <ErrorBanner message={`Impossible d'annuler cette programmation : ${scheduleCancelError}`} className="mb-4" />}

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 bg-surface-alt border border-neon-500/30 rounded-2xl px-4 py-3 mb-4 shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
          <p className="text-sm font-semibold text-gray-800 mr-auto">
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

      {/* Barre d'outils unifiee (2026-08-26) : recherche, filtre de statut et
          actions rapides tenaient sur TROIS rangees distinctes empilees, en
          plus du bandeau de synchro. Regroupees ici sur une seule ligne.
          Le filtre passe de 8 pastilles a un <select> : huit pastilles ne
          tiennent pas sur une ligne partagee, et defilaient horizontalement
          -- les derniers statuts etaient invisibles sans scroller. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un article..."
          className="flex-1 min-w-0"
        />
        {/* Pilote un statut Vinted (vinted_status) -- sans objet pour l'onglet
            "En attente" : ces annonces ne sont jamais encore publiees, donc
            n'ont jamais de vinted_status (voir loadGridPage, qui ignore deja
            ce filtre pour cet onglet cote requete). */}
        {tab !== 'en_attente' && (
          <>
            <label className="sr-only" htmlFor="listing-status-filter">Filtrer par statut</label>
            <select
              id="listing-status-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value as StatusFilter)}
              className="bg-surface border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 sm:w-48 flex-shrink-0"
            >
              {FILTERS.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </>
        )}
        <button
          onClick={toggleSelectAll}
          disabled={displayedItems.length === 0}
          className="flex items-center justify-center gap-1.5 text-xs font-bold text-neon-500 border border-neon-500/30 bg-transparent px-3 py-2.5 rounded-xl hover:border-neon-500/70 hover:bg-neon-500/5 transition-all disabled:opacity-40 disabled:pointer-events-none flex-shrink-0"
        >
          <Layers className="w-3.5 h-3.5" />
          {allVisibleSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
        </button>
      </div>

      {isGridLoading && displayedItems.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} shape="block" className="h-64" />)}
        </div>
      ) : displayedItems.length === 0 ? (
        <EmptyState
          icon={tab === 'republication' ? RefreshCw : tab === 'en_attente' ? Clock : Sparkles}
          title={tab === 'republication' ? 'Rien à republier' : tab === 'en_attente' ? 'Rien en attente' : 'Aucun article'}
          description={
            tab === 'republication'
              ? 'Toutes tes annonces en stock sont déjà en ligne sur Vinted.'
              : tab === 'en_attente'
                ? 'Enregistre une annonce "en attente" depuis le Générateur IA pour la retrouver ici.'
                : 'Ajoute un article depuis le générateur, ou synchronise un compte Vinted.'
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {displayedItems.map((item) => (
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
                onRepublish={() => handleRequestPublish(item)}
                onMarkSold={() => {
                  setSellingItem(item);
                  setSoldPrice(String(item.price ?? ''));
                  setFees('0');
                }}
                onOpenDetail={() => setDetailItem(item)}
                schedule={toUiSchedule(activeSchedulesByListingId[item.id])}
                onEditSchedule={() => handleRequestPublish(item)}
                onCancelSchedule={() => handleCancelSchedule(item.id)}
                outcome={
                  acknowledgedIds.has(outcomesByListingId[item.id]?.id ?? '')
                    ? undefined
                    : outcomesByListingId[item.id]
                }
                onAcknowledgeOutcome={() => handleAcknowledgeOutcome(item.id)}
                onRescheduleAfterFailure={() => handleRescheduleAfterFailure(item)}
              />
            ))}
          </div>
          {hasMore && (
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              className="mt-4"
              loading={isServerPaginated && pageLoading}
              onClick={() => {
                if (isServerPaginated) void loadGridPage(pageItems.length, 'append');
                else setVisibleCount((v) => v + PAGE_SIZE);
              }}
            >
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
            <button onClick={() => { setSellingItem(null); setSellError(null); }} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-gray-100">
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
                className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Frais (commission Vinted, port à ta charge...)</label>
              <input
                type="number"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
              />
              {/* P1-4 (Freeze Audit correctif) : ce montant est deja soustrait
                  de la marge de cette vente (voir AccountingPage.tsx::stats.fees)
                  -- aucun identifiant commun ne relie une depense a une vente
                  precise, donc pas de deduplication automatique fiable
                  possible (choix assume : avertir plutot qu'inventer un
                  rapprochement incertain). */}
              <p className="text-[10px] text-gray-500 mt-1.5">
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
          onSchedule={handleSchedule}
          initialSchedule={toUiSchedule(activeSchedulesByListingId[publishingItem.id])}
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

      {auditingAccount && (
        <AccountAuditModal
          onClose={() => setAuditingAccount(false)}
          vintedAccountId={selectedAccountId}
          accountLabel={selectedAccountId === 'all' ? 'tous mes comptes' : accountLabel(selectedAccountId)}
          onOpenListing={(id) => {
            const listing = items.find((i) => i.id === id);
            if (listing) {
              setAuditingAccount(false);
              setDetailItem(listing);
            }
          }}
        />
      )}

      {pendingUpdate && (
        <Modal onClose={() => setPendingUpdate(null)} size="sm">
          <h2 className="text-lg font-black mb-2">Mettre à jour sur Vinted ?</h2>
          <p className="text-sm text-gray-500 mb-6">
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
          <p className="text-sm text-gray-500 mb-5">
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
