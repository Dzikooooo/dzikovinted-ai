import { beforeEach, describe, expect, it, vi } from "vitest";

// Mission "ROUND 4 -- EXECUTION REELLE D'UNE REPUBLICATION PROGRAMMEE"
// (2026-08-20) : teste executeClaimedSchedule() en isolation -- runAction()
// est MOCKE (le moteur reel, deja teste/valide en live, n'est jamais
// reexecute ici -- meme discipline etablie dans ce projet pour
// handlePublishListing/vinted-publish.ts, jamais unit-testes directement).
// parseMaterials/formatTitleWithSku restent REELS (fonctions pures triviales,
// aucune raison de les mocker).
vi.mock("../session", () => ({ getValidAccessToken: vi.fn() }));
vi.mock("../supabaseClient", () => ({ supabaseWithToken: vi.fn() }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../runAction", () => ({ runAction: vi.fn() }));

import { getValidAccessToken } from "../session";
import { supabaseWithToken } from "../supabaseClient";
import { logger } from "../logger";
import { runAction } from "../runAction";
import { executeClaimedSchedule } from "../scheduledRepublishExecutor";
import type { RunActionOutcome, RunActionRequest } from "../../lib/messages";

interface ChainResult {
  data: unknown;
  error: unknown;
}

function makeChain(result: ChainResult) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_t, prop: string) {
      if (prop === "then") return (resolve: (v: ChainResult) => void) => resolve(result);
      if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve(result);
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return self;
      };
    },
  });
  return { chain: self, calls };
}

const LISTING_ROW = {
  title: "Polo Ralph Lauren",
  sku: 42,
  description: "Très bon état",
  price: 25,
  category: "Polo",
  brand: "Ralph Lauren",
  size: "M",
  condition: "Très bon état",
  color: "Bleu",
  material: "Coton, Polyester",
  image_urls: ["https://example.com/1.jpg"],
  vinted_item_id: "old-item-777",
};

const ACCOUNT_ROW = { vinted_username: "testuser" };

let rpcResult: ChainResult = { data: [{ claimed: true, listing_id: "listing-1", vinted_account_id: "acc-1", package_size: "medium" }], error: null };
let fromResults: Record<string, ChainResult> = {
  listings: { data: LISTING_ROW, error: null },
  vinted_accounts: { data: ACCOUNT_ROW, error: null },
  republish_schedules: { data: null, error: null },
};
let fromCalls: Array<{ table: string; calls: Array<{ method: string; args: unknown[] }> }> = [];
let rpcMock = vi.fn();

function mockClient(): void {
  fromCalls = [];
  rpcMock = vi.fn(() => Promise.resolve(rpcResult));
  const client = {
    rpc: rpcMock,
    from: (table: string) => {
      const { chain, calls } = makeChain(fromResults[table] ?? { data: null, error: null });
      fromCalls.push({ table, calls });
      return chain;
    },
  };
  vi.mocked(supabaseWithToken).mockReturnValue(client as unknown as ReturnType<typeof supabaseWithToken>);
}

function updateCallsFor(table: string): Array<{ method: string; args: unknown[] }> {
  return fromCalls.filter((c) => c.table === table).flatMap((c) => c.calls);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("chrome", { storage: { local: { get: vi.fn().mockResolvedValue({}) } } });
  vi.mocked(getValidAccessToken).mockResolvedValue({ accessToken: "token-abc", userId: "u1" });
  rpcResult = { data: [{ claimed: true, listing_id: "listing-1", vinted_account_id: "acc-1", package_size: "medium" }], error: null };
  fromResults = {
    listings: { data: LISTING_ROW, error: null },
    vinted_accounts: { data: ACCOUNT_ROW, error: null },
    republish_schedules: { data: null, error: null },
  };
  mockClient();
});

describe("claim", () => {
  it("claim gagné : lit listing+compte et appelle runAction", async () => {
    vi.mocked(runAction).mockResolvedValue({ status: "success", resultPayload: { vintedItemId: "999", vintedUrl: "https://www.vinted.fr/items/999" } });

    await executeClaimedSchedule("sched-1");

    expect(rpcMock).toHaveBeenCalledWith("claim_republish_schedule", expect.objectContaining({ p_schedule_id: "sched-1" }));
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it("claim perdu (deja pris par un autre declencheur) : n'appelle jamais runAction ni ne lit listing/compte", async () => {
    rpcResult = { data: [{ claimed: false, listing_id: null, vinted_account_id: null, package_size: null }], error: null };

    await executeClaimedSchedule("sched-1");

    expect(runAction).not.toHaveBeenCalled();
    expect(updateCallsFor("listings")).toHaveLength(0);
    expect(logger.info).toHaveBeenCalledWith("REPUBLISH_SCHEDULER_CLAIM_LOST", expect.objectContaining({ scheduleId: "sched-1" }));
  });

  it("erreur RPC : traite comme claim perdu, jamais un crash", async () => {
    rpcResult = { data: null, error: { message: "network down" } };

    await expect(executeClaimedSchedule("sched-1")).resolves.toBeUndefined();
    expect(runAction).not.toHaveBeenCalled();
  });
});

describe("deux declencheurs concurrents (defense en memoire)", () => {
  it("un seul claim RPC tente pour deux appels concurrents du meme scheduleId", async () => {
    vi.mocked(runAction).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ status: "success", resultPayload: { vintedItemId: "1", vintedUrl: "u" } }), 5))
    );

    // Simule alarme precise + sweep detectant le meme job dans le meme
    // reveil du service worker, avant que le premier claim n'ait eu le
    // temps de committer -- exactement le scenario que le Set en memoire
    // (scheduledRepublishExecutor.ts) doit absorber.
    await Promise.all([executeClaimedSchedule("sched-1"), executeClaimedSchedule("sched-1")]);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it("deux scheduleId differents s'executent tous les deux normalement", async () => {
    vi.mocked(runAction).mockResolvedValue({ status: "success", resultPayload: { vintedItemId: "1", vintedUrl: "u" } });

    await Promise.all([executeClaimedSchedule("sched-1"), executeClaimedSchedule("sched-2")]);

    expect(rpcMock).toHaveBeenCalledTimes(2);
  });
});

describe("reconstruction du payload", () => {
  it("reconstruit exactement le meme payload que buildRepublishPayload() (app) -- titre+sku, materials parses, packageSize, compte, previousVintedItemId", async () => {
    vi.mocked(runAction).mockResolvedValue({ status: "success", resultPayload: { vintedItemId: "999", vintedUrl: "u" } });

    await executeClaimedSchedule("sched-1");

    const request = vi.mocked(runAction).mock.calls[0][0] as RunActionRequest;
    expect(request.kind).toBe("republish_listing");
    expect(request.historyId).toBe("schedule:sched-1");
    expect(request.listingId).toBe("listing-1");
    expect(request.vintedAccountId).toBe("acc-1");
    expect(request.payload).toMatchObject({
      title: "Polo Ralph Lauren #42",
      description: "Très bon état",
      price: 25,
      category: "Polo",
      brand: "Ralph Lauren",
      size: "M",
      condition: "Très bon état",
      color: "Bleu",
      material: "Coton, Polyester",
      materials: ["Coton", "Polyester"],
      imageUrls: ["https://example.com/1.jpg"],
      packageSize: "medium",
      expectedVintedUsername: "testuser",
      previousVintedItemId: "old-item-777",
    });
  });

  it("annonce sans vinted_item_id -> echec explicite, jamais de republication tentee", async () => {
    fromResults.listings = { data: { ...LISTING_ROW, vinted_item_id: null }, error: null };
    mockClient();

    await executeClaimedSchedule("sched-1");

    expect(runAction).not.toHaveBeenCalled();
    const scheduleUpdateCall = updateCallsFor("republish_schedules").find((c) => c.method === "update");
    expect((scheduleUpdateCall!.args[0] as Record<string, unknown>).status).toBe("failed");
  });
});

describe("listing/compte manquant ou invalide", () => {
  it("listing introuvable -> failed, runAction jamais appele", async () => {
    fromResults.listings = { data: null, error: null };
    mockClient();

    await executeClaimedSchedule("sched-1");

    expect(runAction).not.toHaveBeenCalled();
    const call = updateCallsFor("republish_schedules").find((c) => c.method === "update");
    expect((call!.args[0] as Record<string, unknown>).status).toBe("failed");
    expect((call!.args[0] as Record<string, unknown>).error_message).toContain("introuvable");
  });

  it("compte Vinted introuvable -> failed, runAction jamais appele", async () => {
    fromResults.vinted_accounts = { data: null, error: null };
    mockClient();

    await executeClaimedSchedule("sched-1");

    expect(runAction).not.toHaveBeenCalled();
    const call = updateCallsFor("republish_schedules").find((c) => c.method === "update");
    expect((call!.args[0] as Record<string, unknown>).status).toBe("failed");
  });
});

describe("finalisation du resultat", () => {
  it('succes complet (pas de cleanupRequired) -> status="succeeded", IDs resultat renseignes', async () => {
    vi.mocked(runAction).mockResolvedValue({
      status: "success",
      resultPayload: { vintedItemId: "999", vintedUrl: "https://www.vinted.fr/items/999" },
    });

    await executeClaimedSchedule("sched-1");

    const call = updateCallsFor("republish_schedules").find((c) => c.method === "update");
    expect(call!.args[0]).toMatchObject({
      status: "succeeded",
      result_vinted_item_id: "999",
      result_vinted_url: "https://www.vinted.fr/items/999",
      error_message: null,
    });
  });

  it("cleanupRequired:true -> status=\"failed\" MAIS conserve result_vinted_item_id/result_vinted_url (nouvelle annonce reellement creee)", async () => {
    vi.mocked(runAction).mockResolvedValue({
      status: "success",
      resultPayload: {
        vintedItemId: "999",
        vintedUrl: "https://www.vinted.fr/items/999",
        cleanupRequired: true,
        cleanupError: "Confirmation de suppression requise sur Vinted",
      },
    });

    await executeClaimedSchedule("sched-1");

    const call = updateCallsFor("republish_schedules").find((c) => c.method === "update");
    expect(call!.args[0]).toMatchObject({
      status: "failed",
      result_vinted_item_id: "999",
      result_vinted_url: "https://www.vinted.fr/items/999",
      error_message: "Confirmation de suppression requise sur Vinted",
    });
  });

  it('erreur moteur (outcome.status:"error") -> status="failed", pas d\'IDs resultat', async () => {
    vi.mocked(runAction).mockResolvedValue({ status: "error", errorMessage: "Session Vinted expirée" } as RunActionOutcome);

    await executeClaimedSchedule("sched-1");

    const call = updateCallsFor("republish_schedules").find((c) => c.method === "update");
    expect(call!.args[0]).toMatchObject({
      status: "failed",
      result_vinted_item_id: null,
      result_vinted_url: null,
      error_message: "Session Vinted expirée",
    });
  });
});

describe("keepalive autonome", () => {
  it("passe a runAction() un onKeepalive base sur un vrai appel chrome.* (jamais activeProgressPort)", async () => {
    vi.mocked(runAction).mockResolvedValue({ status: "success", resultPayload: { vintedItemId: "1", vintedUrl: "u" } });

    await executeClaimedSchedule("sched-1");

    const [, , onKeepalive] = vi.mocked(runAction).mock.calls[0];
    expect(typeof onKeepalive).toBe("function");

    const storageGet = (chrome as unknown as { storage: { local: { get: ReturnType<typeof vi.fn> } } }).storage.local.get;
    storageGet.mockClear();

    onKeepalive!();
    // chrome.storage.local.get() est asynchrone -- laisse la microtask
    // s'ecouler avant de verifier l'appel.
    await Promise.resolve();
    await Promise.resolve();

    expect(storageGet).toHaveBeenCalledTimes(1);
  });

  it("l'arret du keepalive reste entierement gere par runAction.ts (INCHANGE) -- ce module ne demarre aucun setInterval lui-meme", async () => {
    // Preuve indirecte : executeClaimedSchedule() n'appelle jamais
    // setInterval/clearInterval lui-meme (aucun mock/espion necessaire sur
    // ces globals -- si ce module en introduisait un, ce test resterait vert
    // par hasard ; la garantie reelle "toujours nettoye" vient du
    // try/finally deja existant dans runAction.ts, non retest ici).
    vi.mocked(runAction).mockResolvedValue({ status: "success", resultPayload: { vintedItemId: "1", vintedUrl: "u" } });
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    await executeClaimedSchedule("sched-1");

    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });
});
