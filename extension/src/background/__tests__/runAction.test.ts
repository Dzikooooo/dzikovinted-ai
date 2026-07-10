import { describe, expect, it, vi } from "vitest";

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runAction } from "../runAction";
import { logger } from "../logger";
import type { ActionKind, RunActionRequest } from "../../lib/messages";

const KINDS: ActionKind[] = [
  "publish_listing",
  "edit_listing",
  "edit_price",
  "edit_photos",
  "republish_listing",
  "pause_listing",
  "reactivate_listing",
  "delete_listing",
  "reply_message",
  "accept_offer",
  "counter_offer",
];

function makeRequest(kind: ActionKind): RunActionRequest {
  return { historyId: "history-1", kind, vintedAccountId: "account-1", payload: {} };
}

describe("runAction", () => {
  it("resolves not_implemented for every known ActionKind (registre vide en Phase 3)", async () => {
    for (const kind of KINDS) {
      const outcome = await runAction(makeRequest(kind));
      expect(outcome).toEqual({ status: "not_implemented" });
    }
  });

  it("logs the outcome without throwing", async () => {
    await runAction(makeRequest("republish_listing"));
    expect(logger.info).toHaveBeenCalledWith(
      "RUN_ACTION traité",
      expect.objectContaining({ kind: "republish_listing", status: "not_implemented" })
    );
  });
});
