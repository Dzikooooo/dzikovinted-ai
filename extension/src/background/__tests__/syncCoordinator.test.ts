import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetPendingSyncsForTests,
  notifyAccountDetected,
  notifyListingsProcessing,
  resolveAccountSyncWithError,
  resolveAccountSyncWithListingsResult,
  startAccountSync,
  SYNC_TIMEOUT_MS,
  type OpenSyncTabResult,
} from "../syncCoordinator";
import type { RecordListingsResult } from "../sync";
import type { SyncStep } from "../../lib/messages";

// Mission "SYNC_VINTED_ACCOUNT" (2026-08-16, lot 2 fiabilisation synchro) :
// prouve que syncCoordinator.ts correle correctement une commande explicite
// aux evenements naturels ACCOUNT_DETECTED/LISTINGS_DETECTED (simules ici
// via les fonctions notify*/resolve* directement, sans passer par
// background/index.ts) -- ainsi que la deduplication de concurrence, le
// timeout et le comportement no-op quand aucune synchro n'est en attente.

function okOpenTab(tabId = 42): () => Promise<OpenSyncTabResult> {
  return () => Promise.resolve({ tabId });
}

function recordListingsResult(overrides: Partial<RecordListingsResult> = {}): RecordListingsResult {
  return { ok: true, complete: true, created: 0, updated: 0, deletedMarked: 0, reason: "success", ...overrides };
}

describe("syncCoordinator", () => {
  afterEach(() => {
    __resetPendingSyncsForTests();
    vi.useRealTimers();
  });

  it("reports 'connecting' immediately, then resolves success from a complete recordListings() result", async () => {
    const steps: SyncStep[] = [];
    const promise = startAccountSync("user-1", (step) => steps.push(step), okOpenTab());

    expect(steps).toEqual(["connecting"]);

    notifyAccountDetected("user-1", true);
    expect(steps).toEqual(["connecting", "fetching"]);

    notifyListingsProcessing("user-1");
    expect(steps).toEqual(["connecting", "fetching", "writing"]);

    resolveAccountSyncWithListingsResult("user-1", recordListingsResult({ created: 3, updated: 1 }), 2, 2);

    const result = await promise;
    expect(result).toEqual({
      ok: true,
      complete: true,
      created: 3,
      updated: 1,
      deletedMarked: 0,
      pagesRead: 2,
      pagesExpected: 2,
      reason: "success",
    });
  });

  it("resolves partial_scan with the exact recordListings() numbers when complete:false", async () => {
    const promise = startAccountSync("user-2", () => {}, okOpenTab());
    notifyAccountDetected("user-2", true);
    resolveAccountSyncWithListingsResult(
      "user-2",
      recordListingsResult({ complete: false, created: 1, updated: 0, deletedMarked: 0, reason: "partial_scan" }),
      1,
      3
    );

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.reason).toBe("partial_scan");
    expect(result.pagesRead).toBe(1);
    expect(result.pagesExpected).toBe(3);
  });

  it("fast-fails with not_paired as soon as ACCOUNT_DETECTED reports ok:false, without waiting for LISTINGS_DETECTED", async () => {
    const steps: SyncStep[] = [];
    const promise = startAccountSync("user-3", (step) => steps.push(step), okOpenTab());

    notifyAccountDetected("user-3", false);

    const result = await promise;
    expect(result.reason).toBe("not_paired");
    expect(result.ok).toBe(false);
    // Jamais passe a "fetching" -- le fast-fail court-circuite la suite.
    expect(steps).toEqual(["connecting"]);
  });

  it("resolves tab_open_failed when the injected openTab reports no tabId", async () => {
    const promise = startAccountSync("user-4", () => {}, () => Promise.resolve({ tabId: null, error: "boom" }));

    const result = await promise;
    expect(result.reason).toBe("tab_open_failed");
    expect(result.error).toBe("boom");
  });

  it("resolves error immediately via resolveAccountSyncWithError instead of waiting for the timeout", async () => {
    const promise = startAccountSync("user-5", () => {}, okOpenTab());
    resolveAccountSyncWithError("user-5", "recordListings a leve une exception");

    const result = await promise;
    expect(result.reason).toBe("error");
    expect(result.error).toBe("recordListings a leve une exception");
  });

  it("reuses the SAME in-flight promise for a second concurrent call on the same vintedUserId, never opening a second tab", async () => {
    const openTab = vi.fn(okOpenTab());
    const first = startAccountSync("user-6", () => {}, openTab);
    const second = startAccountSync("user-6", () => {}, openTab);

    expect(first).toBe(second);
    expect(openTab).toHaveBeenCalledTimes(1);

    resolveAccountSyncWithListingsResult("user-6", recordListingsResult(), 1, 1);
    await first;
  });

  it("allows a new sync for the same vintedUserId once the previous one has resolved", async () => {
    const openTab = vi.fn(okOpenTab());
    const first = startAccountSync("user-7", () => {}, openTab);
    resolveAccountSyncWithListingsResult("user-7", recordListingsResult(), 1, 1);
    await first;

    const second = startAccountSync("user-7", () => {}, openTab);
    expect(second).not.toBe(first);
    expect(openTab).toHaveBeenCalledTimes(2);

    resolveAccountSyncWithError("user-7", "cleanup");
    await second;
  });

  it("resolves with reason:timeout if nothing settles the promise within the given delay", async () => {
    vi.useFakeTimers();
    const promise = startAccountSync("user-8", () => {}, okOpenTab(), 5000);

    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result.reason).toBe("timeout");
    expect(result.ok).toBe(false);
  });

  it("exports a generous default timeout suited to multi-page pagination + retries", () => {
    expect(SYNC_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("is a silent no-op for notify*/resolve* calls when no sync is pending for that vintedUserId", () => {
    // Aucun startAccountSync() prealable pour "user-unknown" -- aucune de
    // ces fonctions ne doit lever, ni creer d'entree fantome.
    expect(() => {
      notifyAccountDetected("user-unknown", true);
      notifyListingsProcessing("user-unknown");
      resolveAccountSyncWithListingsResult("user-unknown", recordListingsResult(), 1, 1);
      resolveAccountSyncWithError("user-unknown", "n/a");
    }).not.toThrow();
  });
});
