import { buildHistoryInsertRow, buildHistoryTerminalPatch } from './history';
import { findActionDefinition } from './registry';
import type {
  ActionCheckDeps,
  ActionContext,
  ActionEngine,
  ActionEngineDeps,
  ActionOutcome,
  ActionRequest,
  ActionResult,
  PreparedAction,
} from './types';

// Phase 2 "Automatisations infaillibles" (2026-08-28) : audit statique --
// AUCUNE fonction de ce fichier n'avait de try/catch avant ce lot. Consequence
// reelle, retracee dans le code (pas une supposition) : si definition.execute()
// ou deps.runViaExtension() rejette (ex. "Could not establish connection",
// panne reseau vers une Edge Function), confirm() rejette a son tour. Son
// appelant (useActionEngine.ts::confirmAction) n'a lui non plus aucun
// try/catch, ni son propre appelant (ListingsManagementSection.tsx::
// runVintedAction). Le rejet remonte donc jusqu'a un event handler React
// asynchrone -- ou aucun ErrorBoundary ne peut jamais l'attraper (limite
// connue de React, pas specifique a ce projet). Resultat concret : publishState
// reste fige sur son dernier step ('preparing'/'publishing'), PublishProgressModal
// affiche "en cours..." indefiniment, sans erreur, sans bouton Reessayer -- et
// la ligne action_log correspondante ne recoit jamais son statut terminal
// (updateHistoryRow n'est jamais atteint), restant 'pending_confirmation' en
// base pour toujours. Exactement le "Vinted bloque -> l'app doit prevenir
// l'utilisateur, pas rester bloquee" du brief, prouve par lecture de code,
// pas par un nouveau bug reproduit en direct.
//
// Le correctif vit ICI, au niveau du moteur -- un seul chokepoint qui protege
// tous les appelants presents ET futurs, plutot que de dupliquer un try/catch
// dans chaque composant qui appelle prepareAction/confirmAction.
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Une erreur inattendue est survenue. Réessaie, et contacte le support si le problème persiste.';
}

export function createActionEngine(deps: ActionEngineDeps): ActionEngine {
  async function prepare<TPayload>(
    request: ActionRequest<TPayload>,
    ctx: ActionContext,
    checkDeps: ActionCheckDeps
  ) {
    const definition = findActionDefinition(request.kind);
    if (!definition) {
      return {
        ok: false as const,
        failure: { code: 'unknown_action', message: `Action inconnue : ${request.kind}` },
      };
    }

    for (const check of definition.checks) {
      const result = check(ctx, checkDeps);
      if (!result.ok) {
        return { ok: false as const, failure: result.failure };
      }
    }

    const preview = definition.buildPreview(request, ctx);
    const startedAt = deps.now().toISOString();

    let historyId: string;
    try {
      historyId = await deps.insertHistoryRow(buildHistoryInsertRow(ctx, request, preview, startedAt));
    } catch (err) {
      // Jamais de jeton produit sur un echec d'ecriture -- coherent avec la
      // garantie deja documentee sur PreparedAction (aucune ecriture Vinted
      // ne peut sauter la validation utilisateur).
      return {
        ok: false as const,
        failure: { code: 'prepare_failed', message: describeError(err) },
      };
    }

    const prepared: PreparedAction<TPayload> = {
      __brand: 'PreparedAction',
      id: historyId,
      request,
      ctx,
      preview,
      preparedAt: startedAt,
    };
    return { ok: true as const, prepared };
  }

  async function confirm(prepared: PreparedAction): Promise<ActionResult> {
    const startedAtMs = new Date(prepared.preparedAt).getTime();
    const definition = findActionDefinition(prepared.request.kind);

    let outcome: ActionOutcome;
    try {
      outcome = definition?.execute
        ? await definition.execute(prepared.request, prepared.ctx, deps, prepared.id)
        : await deps.runViaExtension(prepared.id, prepared.request);
    } catch (err) {
      outcome = { status: 'error', errorMessage: describeError(err) };
    }

    const durationMs = deps.now().getTime() - startedAtMs;
    const completedAt = deps.now().toISOString();

    // Best-effort : un echec d'ECRITURE DU JOURNAL ne doit jamais empecher de
    // renvoyer un resultat exploitable a l'UI -- l'utilisateur a besoin de
    // savoir que son action a echoue (ou reussi) meme si, en plus de ca,
    // Supabase est injoignable pour l'historiser.
    try {
      await deps.updateHistoryRow(prepared.id, buildHistoryTerminalPatch(outcome, completedAt, durationMs));
    } catch (err) {
      console.error(`[ActionEngine][${prepared.id}] echec updateHistoryRow (non bloquant)`, err);
    }

    if (outcome.status === 'success') {
      try {
        await deps.resyncAffectedData(prepared.request, outcome);
      } catch (err) {
        console.error(`[ActionEngine][${prepared.id}] echec resyncAffectedData (non bloquant)`, err);
      }
    }

    return { historyId: prepared.id, outcome, durationMs };
  }

  async function cancel(prepared: PreparedAction): Promise<ActionResult> {
    const durationMs = deps.now().getTime() - new Date(prepared.preparedAt).getTime();
    const completedAt = deps.now().toISOString();
    const outcome = { status: 'cancelled' as const };

    try {
      await deps.updateHistoryRow(prepared.id, buildHistoryTerminalPatch(outcome, completedAt, durationMs));
    } catch (err) {
      console.error(`[ActionEngine][${prepared.id}] echec updateHistoryRow sur annulation (non bloquant)`, err);
    }

    return { historyId: prepared.id, outcome, durationMs };
  }

  return { prepare, confirm, cancel };
}
