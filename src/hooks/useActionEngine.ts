import { useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVintedAccountFilter } from '../contexts/VintedAccountFilterContext';
import { supabase } from '../lib/supabase';
import { pingExtension, runAction as runActionViaExtension } from '../lib/extensionBridge';
import { createActionEngine } from '../lib/actions/engine';
import { ACTION_STEP_LOG_MESSAGES } from '../lib/actions/labels';
import { SCAN_TIMEOUT_ERROR_MESSAGE } from '../lib/actions/handlers/scanMarket';
import type {
  ActionCheckDeps,
  ActionContext,
  ActionKind,
  ActionOutcome,
  ActionRequest,
  ActionResult,
  ActionStep,
  PreparedAction,
} from '../lib/actions/types';
import type { Listing } from '../lib/types';

export interface PrepareActionOptions {
  listingId?: string;
  targetListing?: Listing | null;
}

// Delai plus genereux que le defaut de extensionBridge.runAction() (8s) :
// une action reelle (Phase 3.1+) peut ouvrir un onglet, remplir un
// formulaire et importer des photos, largement plus long qu'un simple
// aller-retour de message. Porte a 120000ms (2026-07-18), cense avec
// GLOBAL_TIMEOUT_MS cote extension (editListing.ts) -- le pire cas cumule
// des attentes de chargement de formulaire (chacune plafonnee a 30s sur
// la base d'une mesure reelle) approchait deja l'ancien plafond de 90s.
const ACTION_TIMEOUT_MS = 120000;

export interface UseActionEngineResult {
  prepareAction: <TPayload>(
    kind: ActionKind,
    payload: TPayload,
    options?: PrepareActionOptions
  ) => Promise<
    { ok: true; prepared: PreparedAction<TPayload> } | { ok: false; failure: { code: string; message: string } }
  >;
  // onProgress est optionnel : les actions sans progression (Phase 3, avant
  // le premier handler reel) l'ignorent simplement.
  confirmAction: (prepared: PreparedAction, onProgress?: (step: string) => void) => Promise<ActionResult>;
  cancelAction: (prepared: PreparedAction) => Promise<ActionResult>;
}

// Sur succes d'une publication (Phase 3.1), lie l'annonce ResellOS a
// l'annonce Vinted reellement creee - reutilise exactement les regles de
// propriete des champs deja etablies dans extension/src/background/sync.ts
// (vinted_status/vinted_url/synced_at toujours rafraichis) plutot que d'en
// inventer de nouvelles. Le garde sold_price is null evite d'ecraser une
// ligne deja vendue par un autre chemin (meme garde que l'auto-comptabilite
// de sync.ts).
async function applyPublishListingResult(request: ActionRequest, outcome: Extract<ActionOutcome, { status: 'success' }>) {
  if (request.kind !== 'publish_listing' || !request.listingId) return;
  const resultPayload = outcome.resultPayload as { vintedItemId?: string; vintedUrl?: string } | undefined;
  if (!resultPayload?.vintedItemId || !resultPayload.vintedUrl) return;

  await supabase
    .from('listings')
    .update({
      vinted_account_id: request.vintedAccountId,
      vinted_item_id: resultPayload.vintedItemId,
      vinted_url: resultPayload.vintedUrl,
      vinted_status: 'online',
      synced_at: new Date().toISOString(),
      status: 'en_stock',
    })
    .eq('id', request.listingId)
    .is('sold_price', null);
}

// Centre des Actions : journalise une ligne d'historique consultable et,
// si l'etape correspond a une ActionStep connue, met a jour le champ
// denormalise action_log.current_step (evite de re-derive la derniere
// etape depuis le journal a chaque lecture de liste). Echec silencieux
// volontaire (le journal est un plus, pas une condition de succes de
// l'action elle-meme - une erreur reseau sur ce log ne doit jamais faire
// echouer une publication par ailleurs reussie).
async function logActionEntry(actionId: string, step: ActionStep | null, message: string): Promise<void> {
  try {
    await supabase.from('action_log_entries').insert({ action_id: actionId, step, message });
    if (step) {
      await supabase.from('action_log').update({ current_step: step }).eq('id', actionId);
    }
  } catch {
    // voir commentaire ci-dessus
  }
}

// Pont Supabase + extension pour le Action Engine (src/lib/actions/), meme
// role que useInsights.ts pour src/lib/insights/ : aucune logique de cycle
// de vie ici, uniquement le cablage des dependances reelles.
export function useActionEngine(): UseActionEngineResult {
  const { user } = useAuth();
  const { accounts, selectedAccountId } = useVintedAccountFilter();

  // La progression (Phase 3.1) est rapportee par historyId - engine.ts ne
  // connait pas ce concept (reste generique), donc le cablage se fait ici,
  // au niveau du hook, via un abonnement enregistre juste avant confirm().
  const progressListenersRef = useRef(new Map<string, (step: string) => void>());

  const engine = useMemo(
    () =>
      createActionEngine({
        insertHistoryRow: async (row) => {
          const { data, error } = await supabase
            .from('action_log')
            .insert({
              user_id: row.userId,
              vinted_account_id: row.vintedAccountId,
              listing_id: row.listingId,
              kind: row.kind,
              payload: row.payload,
              preview: row.preview,
              started_at: row.startedAt,
            })
            .select('id')
            .single();
          if (error || !data) throw error ?? new Error("Échec de l'enregistrement de l'action");
          return data.id as string;
        },
        updateHistoryRow: async (id, patch) => {
          const { error } = await supabase
            .from('action_log')
            .update({
              status: patch.status,
              result_payload: patch.resultPayload ?? null,
              error_message: patch.errorMessage ?? null,
              completed_at: patch.completedAt,
              duration_ms: patch.durationMs,
            })
            .eq('id', id);
          if (error) throw error;
        },
        runViaExtension: async (historyId, request) => {
          const callerProgress = progressListenersRef.current.get(historyId);
          // Enveloppe la progression fournie par l'appelant (mise a jour
          // d'UI locale, ex. StockPage) : chaque etape est aussi journalisee
          // ici, automatiquement, pour TOUTE action future sans changement
          // page par page - voir Centre des Actions.
          const wrappedProgress = (step: string) => {
            callerProgress?.(step);
            const message = ACTION_STEP_LOG_MESSAGES[step as ActionStep] ?? step;
            void logActionEntry(historyId, step as ActionStep, message);
          };
          const result = await runActionViaExtension(historyId, request, {
            timeoutMs: ACTION_TIMEOUT_MS,
            onProgress: wrappedProgress,
          });
          progressListenersRef.current.delete(historyId);
          if (!result.ok) {
            return { status: 'error', errorMessage: result.error ?? "Échec de communication avec l'extension" };
          }
          return result.outcome ?? { status: 'not_implemented' };
        },
        resyncAffectedData: async (request, outcome) => {
          await applyPublishListingResult(request, outcome);
          // Pas de cache global a invalider : les pages (Stock, Dashboard,
          // Comptabilite, Statistiques, Insights) lisent toutes `listings`
          // en direct a chaque chargement/changement de filtre - elles
          // refletent la mise a jour ci-dessus au prochain refetch, que
          // l'appelant declenche lui-meme apres confirmAction() (voir
          // StockPage.tsx).
        },
        now: () => new Date(),
      }),
    []
  );

  const prepareAction = useCallback(
    async <TPayload,>(kind: ActionKind, payload: TPayload, options?: PrepareActionOptions) => {
      if (!user) {
        return { ok: false as const, failure: { code: 'not_authenticated', message: 'Vous devez être connecté.' } };
      }

      const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null;
      const extensionConnected = await pingExtension();

      // Prefetch pour checkNoScanInProgress (scan_market) - meme raison
      // d'etre que extensionConnected ci-dessus : les checks restent des
      // fonctions pures, donc tout acces reseau/BDD est fait ici, avant
      // engine.prepare(). count:'exact', head:true evite de rapatrier des
      // lignes pour ne compter que leur nombre.
      //
      // Deux requetes plutot qu'une : un scan est "en cours" soit tant que
      // sa ligne action_log n'a pas encore de statut terminal
      // (pending_confirmation), soit quand le CLIENT a abandonne d'attendre
      // apres 6 minutes (scanMarket.ts::TERMINAL_WAIT_TIMEOUT_MS) alors que
      // le job GitHub Actions peut tres bien tourner encore - sans ce
      // second cas, ce timeout ecrivait un statut 'error' qui levait le
      // garde-fou anti-double-scan a tort, permettant un 2e scan concurrent
      // (race confirmee, audit du parcours Scanner, 2026-07-24).
      // SCAN_TIMEOUT_ERROR_MESSAGE n'est ecrit que par ce timeout precis ;
      // des que le vrai statut terminal arrive (service_role, bypasse RLS),
      // ce message est ecrase et cette requete ne le compte plus.
      const [{ count: pendingScanCount }, { count: timedOutScanCount }] = await Promise.all([
        supabase
          .from('action_log')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('kind', 'scan_market')
          .eq('status', 'pending_confirmation'),
        supabase
          .from('action_log')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('kind', 'scan_market')
          .eq('status', 'error')
          .eq('error_message', SCAN_TIMEOUT_ERROR_MESSAGE),
      ]);
      const activeScanCount = (pendingScanCount ?? 0) + (timedOutScanCount ?? 0);

      const ctx: ActionContext = {
        userId: user.id,
        vintedAccountId: selectedAccountId === 'all' ? null : selectedAccountId,
        listingId: options?.listingId,
        now: new Date(),
      };
      const checkDeps: ActionCheckDeps = {
        extensionConnected,
        selectedAccount,
        targetListing: options?.targetListing ?? null,
        scanInProgress: (activeScanCount ?? 0) > 0,
      };
      const request: ActionRequest<TPayload> = {
        kind,
        vintedAccountId: ctx.vintedAccountId,
        listingId: options?.listingId,
        payload,
      };

      const result = await engine.prepare(request, ctx, checkDeps);
      if (result.ok) {
        void logActionEntry(result.prepared.id, null, 'En attente de validation utilisateur');
      }
      return result;
    },
    [user, accounts, selectedAccountId, engine]
  );

  const confirmAction = useCallback(
    async (prepared: PreparedAction, onProgress?: (step: string) => void) => {
      if (onProgress) {
        progressListenersRef.current.set(prepared.id, onProgress);
      }
      await logActionEntry(prepared.id, 'awaiting_confirmation', ACTION_STEP_LOG_MESSAGES.awaiting_confirmation);

      const result = await engine.confirm(prepared);

      const terminalMessage =
        result.outcome.status === 'success'
          ? 'Action terminée avec succès'
          : result.outcome.status === 'error'
            ? `Erreur : ${result.outcome.errorMessage}`
            : result.outcome.status === 'cancelled'
              ? 'Action annulée'
              : "Action non implémentée";
      void logActionEntry(prepared.id, null, terminalMessage);

      return result;
    },
    [engine]
  );

  const cancelAction = useCallback(
    async (prepared: PreparedAction) => {
      const result = await engine.cancel(prepared);
      void logActionEntry(prepared.id, null, 'Action annulée par l’utilisateur');
      return result;
    },
    [engine]
  );

  return {
    prepareAction,
    confirmAction,
    cancelAction,
  };
}
