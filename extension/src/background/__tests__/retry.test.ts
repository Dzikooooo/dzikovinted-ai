import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTimeout, TimeoutError } from "../retry";

// Bug live 2026-08-29 : popup bloque indefiniment sur "Verification du
// statut" -- aucun appel Supabase du background n'avait de delai maximum.
// Ce test couvre le mecanisme generique (withTimeout) ; session.test.ts
// couvre le cas precis qui a cause le bug (inFlightRefresh bloque pour
// toujours si refreshSession() pend).

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("resout normalement si la promesse se regle avant le delai", async () => {
    const promise = new Promise<string>((resolve) => setTimeout(() => resolve("ok"), 100));
    const result = withTimeout(promise, 1000, "test");
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toBe("ok");
  });

  it("rejette avec TimeoutError si la promesse ne se regle jamais avant le delai", async () => {
    const neverSettles = new Promise<string>(() => {});
    const result = withTimeout(neverSettles, 1000, "refreshSession");
    const assertion = expect(result).rejects.toThrow(/refreshSession/);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    await expect(result).rejects.toBeInstanceOf(TimeoutError);
  });

  it("propage le rejet d'origine si la promesse echoue avant le delai (pas un faux timeout)", async () => {
    const promise = new Promise<string>((_resolve, reject) => setTimeout(() => reject(new Error("network down")), 50));
    const result = withTimeout(promise, 1000, "test");
    const assertion = expect(result).rejects.toThrow("network down");
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });
});
