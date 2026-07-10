import { useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVintedAccountFilter } from '../contexts/VintedAccountFilterContext';
import { supabase } from '../lib/supabase';
import { pingExtension, runAction as runActionViaExtension } from '../lib/extensionBridge';
import { createActionEngine } from '../lib/actions/engine';
import type {
  ActionCheckDeps,
  ActionContext,
  ActionKind,
  ActionOutcome,
  ActionRequest,
  ActionResult,
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
// aller-retour de message.
const ACTION_TIMEOUT_MS = 90000;

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
          const onProgress = progressListenersRef.current.get(historyId);
          const result = await runActionViaExtension(historyId, request, {
            timeoutMs: ACTION_TIMEOUT_MS,
            onProgress,
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
      };
      const request: ActionRequest<TPayload> = {
        kind,
        vintedAccountId: ctx.vintedAccountId,
        listingId: options?.listingId,
        payload,
      };

      return engine.prepare(request, ctx, checkDeps);
    },
    [user, accounts, selectedAccountId, engine]
  );

  const confirmAction = useCallback(
    async (prepared: PreparedAction, onProgress?: (step: string) => void) => {
      if (onProgress) {
        progressListenersRef.current.set(prepared.id, onProgress);
      }
      return engine.confirm(prepared);
    },
    [engine]
  );

  return {
    prepareAction,
    confirmAction,
    cancelAction: engine.cancel,
  };
}
