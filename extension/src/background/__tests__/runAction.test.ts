import { describe, expect, it, vi } from "vitest";

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Republication V2 (2026-08-11, audit "prefill partiel") : publishListing.ts
// importe desormais enrichListing.ts -> sync.ts -> supabaseClient.ts, dont le
// module top-level appelle createClient() (GoTrueClient._emitInitialSession
// tente aussitot chrome.storage.local.get -- objet chrome pas encore stubbe a
// l'evaluation des imports, ES modules s'evaluent avant tout code de test).
// Ce test ne verifie que le dispatch/routage (voir plus bas) -- jamais le
// comportement reel de recordSingleItemImport -- mocker tout le module
// evite d'evaluer sync.ts (et donc supabaseClient.ts) du tout, meme
// discipline que le mock logger ci-dessus.
vi.mock("../sync", () => ({
  recordSingleItemImport: vi.fn(),
}));

import { runAction } from "../runAction";
import { logger } from "../logger";
import type { ActionKind, RunActionRequest } from "../../lib/messages";

// publish_listing (Phase 3.1), edit_listing (Partie 4) et republish_listing
// (2026-08-01, reutilise handlePublishListing tel quel) ont un handler réel
// - couverts par le test live obligatoire (orchestration chrome.tabs/
// chrome.runtime réelle, difficile à simuler fidèlement en unitaire), pas
// par ce test qui ne couvre que le comportement du registre pour les kinds
// SANS handler.
const UNIMPLEMENTED_KINDS: ActionKind[] = [
  "edit_price",
  "edit_photos",
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
    await runAction(makeRequest("pause_listing"));
    expect(logger.info).toHaveBeenCalledWith(
      "[history-1] RUN_ACTION traité",
      expect.objectContaining({ kind: "pause_listing", status: "not_implemented" })
    );
  });

  it("dispatches republish_listing to a real handler (reuses handlePublishListing verbatim -- mechanically identical to publish_listing, see runAction.ts)", async () => {
    const originalChrome = (globalThis as { chrome?: unknown }).chrome;
    (globalThis as { chrome?: unknown }).chrome = {
      tabs: {
        create: vi.fn().mockRejectedValue(new Error("no chrome.tabs API in this unit test")),
      },
    };
    try {
      // Republication V2 (2026-08-11, audit "prefill partiel") : handlePublishListing
      // fetch desormais les photos EN ARRIERE-PLAN avant meme d'ouvrir l'onglet
      // Vinted (voir fetchAllPhotos, publishListing.ts) -- payload:{} (comme les
      // autres kinds de ce fichier) ferait planter Promise.all(undefined.map(...))
      // avant meme d'atteindre chrome.tabs.create, invalidant la preuve de
      // dispatch recherchee ici. imageUrls:[] suffit (0 photo a fetcher, resout
      // immediatement) sans reintroduire un payload pleinement realiste.
      const request: RunActionRequest = {
        historyId: "history-1",
        kind: "republish_listing",
        vintedAccountId: "account-1",
        payload: { imageUrls: [], description: "" },
      };
      const outcome = await runAction(request);
      // Preuve du dispatch : si republish_listing n'avait aucun handler, le
      // fallback runAction.ts renverrait { status: "not_implemented" } sans
      // jamais toucher chrome.tabs.create -- un statut "error" prouve que
      // handlePublishListing a bien été invoqué et a échoué proprement.
      expect(outcome.status).toBe("error");
      if (outcome.status === "error") {
        expect(outcome.errorMessage).toContain("Impossible d'ouvrir un onglet Vinted");
      }
    } finally {
      (globalThis as { chrome?: unknown }).chrome = originalChrome;
    }
  });
});
