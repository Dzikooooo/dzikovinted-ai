import { buildHistoryInsertRow, buildHistoryTerminalPatch } from './history';
import { findActionDefinition } from './registry';
import type {
  ActionCheckDeps,
  ActionContext,
  ActionEngine,
  ActionEngineDeps,
  ActionRequest,
  ActionResult,
  PreparedAction,
} from './types';

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
    const historyId = await deps.insertHistoryRow(buildHistoryInsertRow(ctx, request, preview, startedAt));

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

    const outcome = definition?.execute
      ? await definition.execute(prepared.request, prepared.ctx, deps, prepared.id)
      : await deps.runViaExtension(prepared.id, prepared.request);

    const durationMs = deps.now().getTime() - startedAtMs;
    const completedAt = deps.now().toISOString();

    await deps.updateHistoryRow(prepared.id, buildHistoryTerminalPatch(outcome, completedAt, durationMs));

    if (outcome.status === 'success') {
      await deps.resyncAffectedData(prepared.request, outcome);
    }

    return { historyId: prepared.id, outcome, durationMs };
  }

  async function cancel(prepared: PreparedAction): Promise<ActionResult> {
    const durationMs = deps.now().getTime() - new Date(prepared.preparedAt).getTime();
    const completedAt = deps.now().toISOString();
    const outcome = { status: 'cancelled' as const };

    await deps.updateHistoryRow(prepared.id, buildHistoryTerminalPatch(outcome, completedAt, durationMs));

    return { historyId: prepared.id, outcome, durationMs };
  }

  return { prepare, confirm, cancel };
}
