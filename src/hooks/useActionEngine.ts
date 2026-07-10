import { useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVintedAccountFilter } from '../contexts/VintedAccountFilterContext';
import { supabase } from '../lib/supabase';
import { pingExtension, runAction as runActionViaExtension } from '../lib/extensionBridge';
import { createActionEngine } from '../lib/actions/engine';
import type {
  ActionCheckDeps,
  ActionContext,
  ActionKind,
  ActionRequest,
  ActionResult,
  PreparedAction,
} from '../lib/actions/types';
import type { Listing } from '../lib/types';

export interface PrepareActionOptions {
  listingId?: string;
  targetListing?: Listing | null;
}

export interface UseActionEngineResult {
  prepareAction: <TPayload>(
    kind: ActionKind,
    payload: TPayload,
    options?: PrepareActionOptions
  ) => Promise<
    { ok: true; prepared: PreparedAction<TPayload> } | { ok: false; failure: { code: string; message: string } }
  >;
  confirmAction: (prepared: PreparedAction) => Promise<ActionResult>;
  cancelAction: (prepared: PreparedAction) => Promise<ActionResult>;
}

// Pont Supabase + extension pour le Action Engine (src/lib/actions/), meme
// role que useInsights.ts pour src/lib/insights/ : aucune logique de cycle
// de vie ici, uniquement le cablage des dependances reelles. Aucune page
// n'appelle ce hook en production cette phase (Phase 3 - preparation) : pas
// d'action reelle avant la Phase 3.1, voir ROADMAP.md.
export function useActionEngine(): UseActionEngineResult {
  const { user } = useAuth();
  const { accounts, selectedAccountId } = useVintedAccountFilter();

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
          const result = await runActionViaExtension(historyId, request);
          if (!result.ok) {
            return { status: 'error', errorMessage: result.error ?? "Échec de communication avec l'extension" };
          }
          return result.outcome ?? { status: 'not_implemented' };
        },
        resyncAffectedData: async () => {
          // Phase 3 : aucune ecriture reelle ne peut jamais reussir (registre
          // extension vide), ce point d'appel ne se declenche donc jamais
          // aujourd'hui - contrat pose pour la Phase 3.1+ (re-fetch
          // listings/comptes pour rafraichir Dashboard/Stock/Comptabilite/
          // Statistiques/Insights apres une action reussie).
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

  return {
    prepareAction,
    confirmAction: engine.confirm,
    cancelAction: engine.cancel,
  };
}
