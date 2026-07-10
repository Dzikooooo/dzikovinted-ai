import type {
  ActionContext,
  ActionHistoryEntry,
  ActionOutcome,
  ActionPreview,
  ActionRequest,
} from './types';

type HistoryInsertRow = Omit<
  ActionHistoryEntry,
  'id' | 'status' | 'completedAt' | 'durationMs' | 'resultPayload' | 'errorMessage'
>;

type HistoryTerminalPatch = Pick<
  ActionHistoryEntry,
  'status' | 'resultPayload' | 'errorMessage' | 'completedAt' | 'durationMs'
>;

export function buildHistoryInsertRow(
  ctx: ActionContext,
  request: ActionRequest,
  preview: ActionPreview,
  startedAt: string
): HistoryInsertRow {
  return {
    userId: ctx.userId,
    vintedAccountId: ctx.vintedAccountId,
    listingId: ctx.listingId ?? null,
    kind: request.kind,
    payload: request.payload,
    preview,
    startedAt,
  };
}

export function buildHistoryTerminalPatch(
  outcome: ActionOutcome,
  completedAt: string,
  durationMs: number
): HistoryTerminalPatch {
  return {
    status: outcome.status,
    resultPayload: outcome.status === 'success' ? outcome.resultPayload ?? null : null,
    errorMessage: outcome.status === 'error' ? outcome.errorMessage : null,
    completedAt,
    durationMs,
  };
}
