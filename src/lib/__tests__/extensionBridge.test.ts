// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pingExtension, syncVintedAccount, translateResponseError, type SyncVintedAccountResult } from '../extensionBridge';

// P1-3 (Freeze Audit correctif) : translateResponseError() est le point
// commun qui doit traduire tout {ok:false, error:"..."} technique venant du
// background AVANT qu'il n'atteigne l'utilisateur (deja applique a
// pairExtension/unpairExtension, desormais aussi a runAction()). Ces tests
// couvrent exactement la classe de bug confirmee : un texte technique brut
// qui passait inchange jusqu'ici sur le chemin RUN_ACTION.

describe('translateResponseError', () => {
  it('returns the fallback error when the response is undefined', () => {
    const result = translateResponseError(undefined, 'Réponse vide de l\'extension');
    expect(result).toEqual({ ok: false, error: "Réponse vide de l'extension" });
  });

  it('leaves a successful response untouched', () => {
    const response = { ok: true as const, outcome: { status: 'success' as const } };
    expect(translateResponseError(response, 'fallback')).toBe(response);
  });

  it('leaves a failed response without an error message untouched', () => {
    const response = { ok: false as const };
    expect(translateResponseError(response, 'fallback')).toBe(response);
  });

  it('translates a known raw technical error into a clean French message', () => {
    const response = { ok: false as const, error: 'Message externe inconnu' };
    const result = translateResponseError(response, 'fallback');
    expect(result.error).toContain("ne reconnaît pas encore cette action");
    expect(result.error).not.toBe('Message externe inconnu');
  });

  it('translates an unrecognized raw error while keeping the technical cause visible', () => {
    const response = { ok: false as const, error: 'TypeError: cannot read property of undefined' };
    const result = translateResponseError(response, 'fallback');
    expect(result.error).toContain('extension ResellOS');
    expect(result.error).toContain('TypeError: cannot read property of undefined');
  });

  it('preserves extra fields (outcome, timedOut) untouched while translating error', () => {
    const response = { ok: false as const, error: 'Message externe inconnu', timedOut: false };
    const result = translateResponseError(response, 'fallback');
    expect(result.timedOut).toBe(false);
    expect(result.ok).toBe(false);
  });
});

// BUG LIVE N°2 (republication assistee, confirme 2026-08-11) : le clic sur
// "Republier" echouait avec "L'extension ResellOS n'est pas connectee." alors
// que l'extension etait reellement appairee et synchronisait (popup +
// GET_STATUS le prouvaient au meme instant). Cause reelle : useActionEngine
// appelle pingExtension() SANS argument (son propre defaut), et l'ancien
// defaut de 400ms etait trop court pour laisser Chrome reveiller le service
// worker MV3 suspendu avant qu'il ne reponde a onMessageExternal -- un delai
// d'attente cote client, pas une preuve d'echec reel du pont
// externally_connectable (qui, lui, fonctionnait deja : c'est le meme canal
// que celui utilise par le pairing, deja valide). Ce test simule exactement
// ce scenario : une reponse reelle {ok:true} qui arrive apres l'ancien delai
// de 400ms mais dans la fenetre du nouveau defaut.
describe('pingExtension', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('resolves true when the extension responds after a slow MV3 service-worker wake-up (past the old 400ms default, within the current default)', async () => {
    vi.useFakeTimers();
    let deliverResponse: ((response: unknown) => void) | undefined;
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: (_id: string, _message: unknown, callback: (response: unknown) => void) => {
          deliverResponse = callback;
        },
        lastError: undefined,
      },
    });

    const resultPromise = pingExtension();
    await vi.advanceTimersByTimeAsync(800);
    expect(deliverResponse).toBeDefined();
    deliverResponse?.({ ok: true });

    expect(await resultPromise).toBe(true);
  });

  it('still resolves false once the (longer) timeout genuinely elapses with no response', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: () => {
          // n'appelle jamais le callback : extension reellement absente/non installee.
        },
        lastError: undefined,
      },
    });

    const resultPromise = pingExtension();
    await vi.advanceTimersByTimeAsync(5000);

    expect(await resultPromise).toBe(false);
  });
});

// Mission "SYNC_VINTED_ACCOUNT" (2026-08-16, lot 2 fiabilisation synchro) :
// syncVintedAccount() relaie tel quel le resultat structure produit par
// syncCoordinator.ts (extension) -- ces tests prouvent qu'aucune deuxieme
// decision complete/partiel/echec n'est inventee cote app, et que le canal
// "heartbeat" (voir SyncProgressPortMessage) ne declenche jamais onProgress.

function fakePort() {
  const listeners: Array<(message: unknown) => void> = [];
  return {
    onMessage: { addListener: (cb: (message: unknown) => void) => listeners.push(cb) },
    onDisconnect: { addListener: () => {} },
    disconnect: () => {},
    emit: (message: unknown) => listeners.forEach((cb) => cb(message)),
  };
}

describe('syncVintedAccount', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('resolves the exact structured result reported by the extension on a full successful sync', async () => {
    const result: SyncVintedAccountResult = {
      ok: true,
      complete: true,
      created: 3,
      updated: 1,
      deletedMarked: 0,
      pagesRead: 2,
      pagesExpected: 2,
      reason: 'success',
    };
    vi.stubGlobal('chrome', {
      runtime: {
        connect: () => fakePort(),
        sendMessage: (_id: string, _message: unknown, callback: (response: unknown) => void) => callback(result),
        lastError: undefined,
      },
    });

    expect(await syncVintedAccount('user-1', 'alexisdzk')).toEqual(result);
  });

  it('never upgrades a partial scan to success -- relays complete:false / reason:partial_scan verbatim', async () => {
    const result: SyncVintedAccountResult = {
      ok: true,
      complete: false,
      created: 1,
      updated: 0,
      deletedMarked: 0,
      pagesRead: 1,
      pagesExpected: 3,
      reason: 'partial_scan',
    };
    vi.stubGlobal('chrome', {
      runtime: {
        connect: () => fakePort(),
        sendMessage: (_id: string, _message: unknown, callback: (response: unknown) => void) => callback(result),
        lastError: undefined,
      },
    });

    const resolved = await syncVintedAccount('user-2', 'alexisdzk');
    expect(resolved.complete).toBe(false);
    expect(resolved.reason).toBe('partial_scan');
    expect(resolved.ok).toBe(true); // ok=true seulement au sens "traite sans exception", jamais confondu avec "complet"
  });

  it('relays "progress" port messages in order to onProgress and silently ignores "heartbeat"', async () => {
    const port = fakePort();
    vi.stubGlobal('chrome', {
      runtime: {
        connect: () => port,
        sendMessage: (_id: string, _message: unknown, callback: (response: unknown) => void) => {
          port.emit({ type: 'progress', step: 'connecting' });
          port.emit({ type: 'heartbeat' });
          port.emit({ type: 'progress', step: 'fetching' });
          port.emit({ type: 'progress', step: 'writing' });
          callback({ ok: true, complete: true, created: 0, updated: 0, deletedMarked: 0, pagesRead: 1, pagesExpected: 1, reason: 'success' });
        },
        lastError: undefined,
      },
    });

    const steps: string[] = [];
    await syncVintedAccount('user-3', 'alexisdzk', { onProgress: (step) => steps.push(step) });

    expect(steps).toEqual(['connecting', 'fetching', 'writing']);
  });

  it('translates a raw technical error surfaced via chrome.runtime.lastError', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        connect: () => fakePort(),
        sendMessage: (_id: string, _message: unknown, callback: (response: unknown) => void) => callback(undefined),
        lastError: { message: 'Message externe inconnu' },
      },
    });

    const resolved = await syncVintedAccount('user-4', 'alexisdzk');
    expect(resolved.ok).toBe(false);
    expect(resolved.reason).toBe('error');
    expect(resolved.error).toContain('ne reconnaît pas encore cette action');
  });

  it('resolves a clean "Extension non détectée" error when chrome.runtime is absent', async () => {
    vi.stubGlobal('chrome', undefined);

    const resolved = await syncVintedAccount('user-5', 'alexisdzk');
    expect(resolved).toEqual({
      ok: false,
      complete: false,
      created: 0,
      updated: 0,
      deletedMarked: 0,
      pagesRead: 0,
      pagesExpected: 0,
      reason: 'error',
      error: 'Extension non détectée',
    });
  });

  it('falls back to reason:"timeout" if the local timeout genuinely elapses with no response at all', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('chrome', {
      runtime: {
        connect: () => fakePort(),
        sendMessage: () => {
          // n'appelle jamais le callback : service worker mort, aucune reponse.
        },
        lastError: undefined,
      },
    });

    const resultPromise = syncVintedAccount('user-6', 'alexisdzk', { timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);

    const resolved = await resultPromise;
    expect(resolved.ok).toBe(false);
    expect(resolved.reason).toBe('timeout');
  });
});
