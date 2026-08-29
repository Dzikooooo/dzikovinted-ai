import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Bug live 2026-08-29 : popup bloque indefiniment sur "Verification du
// statut", meme apres deconnexion/reconnexion sur l'app web et rechargement
// de l'extension (voir retry.ts::withTimeout pour le detail de la cause).
// Ce fichier prouve directement le coeur du bug : `inFlightRefresh`
// (verrou en memoire, session.ts) ne doit plus jamais rester bloque pour
// toujours quand refreshSession() pend indefiniment -- ni pour l'appel qui
// pend, ni pour un appel ULTERIEUR (c'est precisement ce qui rendait un
// simple re-appairage inoperant en conditions reelles : ecrire une
// nouvelle session en storage n'annulait jamais un fetch deja en vol).

vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const refreshSessionMock = vi.fn();
vi.mock("../supabaseClient", () => ({
  supabase: { auth: { refreshSession: (...args: unknown[]) => refreshSessionMock(...args) } },
}));

import { getValidAccessToken } from "../session";

const SESSION_KEY = "resellos_extension_session";
// Epoch ancien et absolu : evite toute ambiguite avec l'horloge fictive de
// vi.useFakeTimers(), qui demarre a l'heure REELLE au moment de son appel.
const EXPIRED_SESSION = { access_token: "old-token", refresh_token: "refresh-abc", expires_at: 1000, user_id: "u1" };

function stubChromeStorage(initial: Record<string, unknown>) {
  const store: Record<string, unknown> = { ...initial };
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn((key: string) => Promise.resolve(key in store ? { [key]: store[key] } : {})),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(store, items);
          return Promise.resolve();
        }),
        remove: vi.fn((key: string) => {
          delete store[key];
          return Promise.resolve();
        }),
      },
    },
    runtime: { sendMessage: vi.fn().mockRejectedValue(new Error("no popup open")) },
  });
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getValidAccessToken -- ne reste plus jamais bloque quand refreshSession() pend", () => {
  it("un refreshSession() qui pend indefiniment se resout en echec TRANSITOIRE (null) apres le timeout, jamais un blocage eternel", async () => {
    stubChromeStorage({ [SESSION_KEY]: EXPIRED_SESSION });
    refreshSessionMock.mockReturnValue(new Promise(() => {})); // ne se regle jamais

    const promise = getValidAccessToken();
    const assertion = expect(promise).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
  });

  it("un appel ULTERIEUR (ex. apres re-appairage) repart a zero -- ne retombe jamais sur la promesse morte du premier appel", async () => {
    stubChromeStorage({ [SESSION_KEY]: EXPIRED_SESSION });
    refreshSessionMock.mockReturnValueOnce(new Promise(() => {})); // 1er appel : pend

    const first = getValidAccessToken();
    const firstAssertion = expect(first).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(10000);
    await firstAssertion;

    // 2e appel, une fois le premier retombe : doit reellement retenter,
    // pas juste re-attendre la meme promesse jamais reglee.
    refreshSessionMock.mockResolvedValueOnce({
      data: {
        session: { access_token: "new-token", refresh_token: "new-refresh", expires_at: 9999999999, user: { id: "u1" } },
      },
      error: null,
    });
    const second = await getValidAccessToken();
    expect(second).toEqual({ accessToken: "new-token", userId: "u1" });
    expect(refreshSessionMock).toHaveBeenCalledTimes(2);
  });
});
