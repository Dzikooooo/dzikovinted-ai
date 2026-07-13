import { describe, expect, it, vi } from "vitest";

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runAction } from "../runAction";
import { logger } from "../logger";
import type { ActionKind, RunActionRequest } from "../../lib/messages";

// publish_listing (Phase 3.1) et edit_listing (Partie 4) ont un handler réel
// - couverts par le test live obligatoire (orchestration chrome.tabs/
// chrome.runtime réelle, difficile à simuler fidèlement en unitaire), pas
// par ce test qui ne couvre que le comportement du registre pour les kinds
// SANS handler.
const UNIMPLEMENTED_KINDS: ActionKind[] = [
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
  it("resolves not_implemented for every ActionKind without a registered handler", async () => {
    for (const kind of UNIMPLEMENTED_KINDS) {
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
