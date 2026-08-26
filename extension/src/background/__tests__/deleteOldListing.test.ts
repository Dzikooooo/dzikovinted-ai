import { afterEach, describe, expect, it, vi } from "vitest";

// logger.ts relaie chaque entree via chrome.runtime.sendMessage -- absent
// sous Vitest sans stub global (meme piege deja documente dans sync.test.ts/
// republishTransaction.test.ts pour ce meme module).
vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { attemptDeleteOldVintedListing } from "../deleteOldListing";
import { logger } from "../logger";

// Mission "CORRIGER LE FAUX TERMINE" (2026-08-17) : couvre l'orchestration
// complete (ouverture d'onglet, envoi de DELETE_LISTING, ecoute de
// DELETE_PROGRESS/DELETE_RESULT, verification independante, idempotence,
// duree de vie de l'onglet) -- voir l'en-tete de deleteOldListing.ts pour le
// bug corrige (l'ancienne detection de clic dans vinted-item.ts causait un
// faux DELETE_RESULT{ok:true}, ferme prematurement par ce module).

type UpdatedListener = (tabId: number, changeInfo: { status?: string }) => void;
type RemovedListener = (tabId: number) => void;
type RuntimeMessageListener = (message: unknown, sender: { tab?: { id: number } }) => boolean;

// Mission "CORRIGER LA REPETITION DELETE_LISTING" (2026-08-17) : sendMessage
// doit desormais pouvoir simuler soit un ACK valide (DeleteCommandResponse),
// soit un chrome.runtime.lastError -- configurable PAR TENTATIVE (index 0,
// 1, 2...) pour reproduire precisement le faux negatif observe en direct
// (1ere tentative rejetee malgre reception reelle, tentatives suivantes ne
// devant jamais renvoyer la commande une fois la reception prouvee).
type SendMessageAttemptBehavior = { lastError: string } | { response: unknown };

// Mission "ROUND DELETE -- implementation du correctif de verification
// post-suppression" (2026-08-17) : chrome.scripting.executeScript() doit
// pouvoir simuler soit un resultat normal, soit un REJET (reproduisant
// "Frame with ID 0 was removed"), configurable PAR APPEL (index 0, 1, 2...)
// -- couvre a la fois le retry initial (jusqu'a 3 tentatives) et le second
// cycle apres renavigation. chrome.tabs.get/update simulent la lecture/
// modification de l'URL courante de l'onglet de verification.
type ExecuteScriptAttemptBehavior = { result: boolean } | { reject: string };

function makeMockChrome() {
  const updatedListeners: UpdatedListener[] = [];
  const removedListeners: RemovedListener[] = [];
  const runtimeMessageListeners: RuntimeMessageListener[] = [];
  let nextTabId = 100;
  const createCalls: Array<{ url: string; active?: boolean }> = [];
  const removeCalls: number[] = [];
  const updateCalls: Array<{ tabId: number; url?: string }> = [];
  const tabUrls = new Map<number, string>();
  let executeScriptResult: boolean = false; // "stillActive" par defaut
  let executeScriptCallCount = 0;
  let executeScriptBehavior: (attemptIndex: number) => ExecuteScriptAttemptBehavior = () => ({ result: executeScriptResult });
  let sendMessageCallCount = 0;
  const defaultAckResponse = { ok: true, accepted: true, duplicate: false, documentInstanceId: "content-doc-1" };
  let sendMessageBehavior: (attemptIndex: number) => SendMessageAttemptBehavior = () => ({ response: defaultAckResponse });

  const chromeMock = {
    tabs: {
      create: vi.fn((opts: { url: string; active?: boolean }) => {
        const id = nextTabId++;
        createCalls.push({ url: opts.url, active: opts.active });
        tabUrls.set(id, opts.url);
        return Promise.resolve({ id });
      }),
      remove: vi.fn((tabId: number) => {
        removeCalls.push(tabId);
        return Promise.resolve(undefined);
      }),
      get: vi.fn((tabId: number) => Promise.resolve({ id: tabId, url: tabUrls.get(tabId) })),
      update: vi.fn((tabId: number, changeInfo: { url?: string }) => {
        updateCalls.push({ tabId, url: changeInfo.url });
        if (changeInfo.url) tabUrls.set(tabId, changeInfo.url);
        return Promise.resolve({ id: tabId, url: tabUrls.get(tabId) });
      }),
      sendMessage: vi.fn((_tabId: number, _command: unknown, callback: (r?: unknown) => void) => {
        const attemptIndex = sendMessageCallCount++;
        const behavior = sendMessageBehavior(attemptIndex);
        if ("lastError" in behavior) {
          chromeMock.runtime.lastError = { message: behavior.lastError };
          callback(undefined);
          // chrome.runtime.lastError n'est valide QUE pendant l'execution
          // synchrone du callback -- reinitialise immediatement apres,
          // comme le vrai navigateur.
          chromeMock.runtime.lastError = undefined;
          return;
        }
        callback(behavior.response);
      }),
      onUpdated: {
        addListener: (fn: UpdatedListener) => updatedListeners.push(fn),
        removeListener: (fn: UpdatedListener) => {
          const i = updatedListeners.indexOf(fn);
          if (i >= 0) updatedListeners.splice(i, 1);
        },
      },
      onRemoved: {
        addListener: (fn: RemovedListener) => removedListeners.push(fn),
        removeListener: (fn: RemovedListener) => {
          const i = removedListeners.indexOf(fn);
          if (i >= 0) removedListeners.splice(i, 1);
        },
      },
    },
    scripting: {
      executeScript: vi.fn(() => {
        const attemptIndex = executeScriptCallCount++;
        const behavior = executeScriptBehavior(attemptIndex);
        if ("reject" in behavior) return Promise.reject(new Error(behavior.reject));
        return Promise.resolve([{ result: behavior.result }]);
      }),
    },
    runtime: {
      lastError: undefined as { message: string } | undefined,
      onMessage: {
        addListener: (fn: RuntimeMessageListener) => runtimeMessageListeners.push(fn),
        removeListener: (fn: RuntimeMessageListener) => {
          const i = runtimeMessageListeners.indexOf(fn);
          if (i >= 0) runtimeMessageListeners.splice(i, 1);
        },
      },
    },
  };

  return {
    chrome: chromeMock,
    createCalls,
    removeCalls,
    updateCalls,
    fireComplete: (tabId: number) => {
      for (const fn of [...updatedListeners]) fn(tabId, { status: "complete" });
    },
    fireRemoved: (tabId: number) => {
      for (const fn of [...removedListeners]) fn(tabId);
    },
    sendReport: (tabId: number, message: unknown) => {
      for (const fn of [...runtimeMessageListeners]) fn(message, { tab: { id: tabId } });
    },
    setStillActive: (value: boolean) => {
      executeScriptResult = value;
    },
    setExecuteScriptBehavior: (fn: (attemptIndex: number) => ExecuteScriptAttemptBehavior) => {
      executeScriptBehavior = fn;
    },
    getExecuteScriptCallCount: () => executeScriptCallCount,
    setTabUrl: (tabId: number, url: string) => {
      tabUrls.set(tabId, url);
    },
    setSendMessageBehavior: (fn: (attemptIndex: number) => SendMessageAttemptBehavior) => {
      sendMessageBehavior = fn;
    },
    getSendMessageCallCount: () => sendMessageCallCount,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("attemptDeleteOldVintedListing", () => {
  it("clic humain confirmé + vérification indépendante négative (A absente) -> succès, onglets nettoyés", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.setStillActive(false); // A n'est plus active -- suppression confirmée

    const resultPromise = attemptDeleteOldVintedListing("old-1");

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireComplete(100); // onglet de suppression charge
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalled());

    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2)); // onglet de vérification
    mock.fireComplete(101);

    const result = await resultPromise;
    expect(result).toEqual({ ok: true });
    expect(mock.removeCalls).toContain(100);
    expect(mock.removeCalls).toContain(101);
  });

  it("clic humain confirmé mais vérification indépendante positive (A encore active) -> cleanup_required, jamais succès", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.setStillActive(true); // A est toujours active malgre le "clic"

    const resultPromise = attemptDeleteOldVintedListing("old-1");

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireComplete(100);
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalled());
    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2));
    mock.fireComplete(101);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("toujours active");
  });

  it("aucun clic humain (DELETE_RESULT ok:false confirm_click_timeout) -> jamais succès, jamais de vérification déclenchée", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);

    const resultPromise = attemptDeleteOldVintedListing("old-1");

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireComplete(100);
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalled());
    mock.sendReport(100, {
      type: "DELETE_RESULT",
      outcome: { ok: false, reason: "confirm_click_timeout", errorMessage: "Aucun clic humain détecté" },
    });

    const result = await resultPromise;
    expect(result).toEqual({ ok: false, error: "Aucun clic humain détecté" });
    // Aucune verification independante -- un seul onglet a jamais ete ouvert.
    expect(mock.createCalls.length).toBe(1);
    expect(mock.chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("onglet de suppression fermé manuellement -> erreur honnête, jamais une résolution silencieuse", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);

    const resultPromise = attemptDeleteOldVintedListing("old-1");

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireRemoved(100);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("fermé");
  });

  it("timeout global sans clic confirme -> jamais un succes, ET l'onglet est ferme (timeout de securite)", async () => {
    vi.useFakeTimers();
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);

    const resultPromise = attemptDeleteOldVintedListing("old-1");

    await vi.advanceTimersByTimeAsync(0);
    mock.fireComplete(100);
    await vi.advanceTimersByTimeAsync(0);
    // Aucun DELETE_RESULT n'arrive jamais -- laisse le delai global expirer.
    await vi.advanceTimersByTimeAsync(180000);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    // HISTORIQUE -- ne pas perdre la raison : le 2026-08-17, un bug live avait
    // impose l'inverse (onglet JAMAIS ferme sans clic confirme) parce que
    // l'onglet se fermait sous les yeux de l'utilisateur pendant qu'il regardait
    // la modale -- le clic final etait alors MANUEL. Depuis le 2026-08-19 ce
    // clic est automatise, et depuis le 2026-08-26 l'onglet s'ouvre en
    // active:true (indispensable au rendu de la modale React). Laisser un
    // onglet FOCALISE ouvert indefiniment apres 180 s est desormais plus
    // nuisible qu'utile : le timeout de securite le ferme. L'echec reste
    // rapporte honnetement (ok:false).
    expect(mock.removeCalls).toContain(100);
  });

  it("timeout apres affichage de la modale -> echec honnete, onglet ferme par le timeout de securite", async () => {
    vi.useFakeTimers();
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);

    const resultPromise = attemptDeleteOldVintedListing("old-1");

    await vi.advanceTimersByTimeAsync(0);
    mock.fireComplete(100);
    await vi.advanceTimersByTimeAsync(0);

    // La modale "Confirmer et supprimer" est desormais visible cote Vinted
    // (le content script vient de le signaler) -- exactement l'etat observe
    // en direct par l'utilisateur juste avant que l'onglet ne se ferme sous
    // ses yeux.
    mock.sendReport(100, { type: "DELETE_PROGRESS", step: "auto_confirm_click_attempted" });

    // Aucun clic humain n'arrive jamais (ni DELETE_RESULT, ni action de
    // l'utilisateur) -- seul le delai global expire, simulant le
    // timeout/erreur observe en direct.
    await vi.advanceTimersByTimeAsync(180000);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    // Meme renversement que le test precedent (voir son commentaire) : le
    // timeout de securite ferme l'onglet, y compris apres affichage de la
    // modale. Ce qui reste INCHANGE : aucun succes n'est jamais invente.
    expect(mock.removeCalls).toContain(100);
    expect(result.error).toContain("Délai");
  });

  it("DELETE_RESULT dupliqué (rejoué) -> aucune double finalisation (une seule vérification, un seul résultat)", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.setStillActive(false);

    const resultPromise = attemptDeleteOldVintedListing("old-1");

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireComplete(100);
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalled());

    // DELETE_RESULT recu deux fois (retry/rejeu reseau) -- ne doit declencher
    // qu'UNE SEULE verification independante (un seul 2e onglet).
    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });
    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2));
    mock.fireComplete(101);

    const result = await resultPromise;
    expect(result).toEqual({ ok: true });
    // Un seul onglet de verification cree, malgre les deux DELETE_RESULT.
    expect(mock.createCalls.length).toBe(2);
    expect(mock.chrome.scripting.executeScript).toHaveBeenCalledTimes(1);
  });

  it("TAB_UPDATED (\"complete\") dupliqué -> aucun double envoi de DELETE_LISTING", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);

    const resultPromise = attemptDeleteOldVintedListing("old-1");

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    // Deux evenements "complete" pour le meme onglet (rechargement/evenement
    // rejoue) -- waitForTabComplete() ne doit resoudre/envoyer qu'une fois.
    mock.fireComplete(100);
    mock.fireComplete(100);
    mock.fireComplete(100);

    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalled());
    mock.sendReport(100, {
      type: "DELETE_RESULT",
      outcome: { ok: false, reason: "confirm_click_timeout", errorMessage: "timeout" },
    });
    await resultPromise;

    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("idempotence : deux appels concurrents pour le MEME ancien item réutilisent la même transaction (jamais deux onglets)", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.setStillActive(false);

    const promise1 = attemptDeleteOldVintedListing("old-1");
    const promise2 = attemptDeleteOldVintedListing("old-1");

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireComplete(100);
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalled());
    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });
    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2));
    mock.fireComplete(101);

    const [result1, result2] = await Promise.all([promise1, promise2]);
    expect(result1).toEqual({ ok: true });
    expect(result2).toEqual({ ok: true });
    // Un seul cycle complet (1 onglet de suppression + 1 onglet de
    // verification), jamais deux transactions paralleles pour le meme id.
    expect(mock.createCalls.length).toBe(2);
  });

  it("relaie onAwaitingConfirmation exactement au moment où le clic humain est attendu", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    const onAwaitingConfirmation = vi.fn();

    const resultPromise = attemptDeleteOldVintedListing("old-1", onAwaitingConfirmation);

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireComplete(100);
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalled());

    expect(onAwaitingConfirmation).not.toHaveBeenCalled();
    mock.sendReport(100, { type: "DELETE_PROGRESS", step: "auto_confirm_click_attempted" });
    expect(onAwaitingConfirmation).toHaveBeenCalledTimes(1);

    mock.sendReport(100, {
      type: "DELETE_RESULT",
      outcome: { ok: false, reason: "confirm_click_timeout", errorMessage: "timeout" },
    });
    await resultPromise;
  });

  // Mission "AUDITER LA RACE CLEANUP_REQUIRED" (2026-08-17), puis "CORRIGER
  // LA REPETITION DELETE_LISTING" (meme jour, correctif de la cause racine) :
  // bug live reproduit exactement -- DELETE_RESULT{ok:true} recu (preuve
  // REELLE de reception), PUIS le canal d'ACK de sendDeleteCommand()
  // (chrome.tabs.sendMessage) continue d'echouer sur toutes ses tentatives
  // (faux negatif de transport, "PORT MESSAGE FERMÉ"). Avant le correctif de
  // la cause racine, ce rejet persistant finissait par imposer
  // cleanup_required (deja neutralise par contentScriptConfirmedAlive, voir
  // ancienne version de ce test) ; DESORMAIS, l'ACK explicite +
  // isAlreadyConfirmed() empechent egalement tout RENVOI de DELETE_LISTING
  // une fois la reception prouvee -- sendDeleteCommand() resout proprement
  // (au lieu de finir par rejeter) des la 2e tentative, sans jamais rappeler
  // chrome.tabs.sendMessage.
  it("RÉGRESSION race cleanup_required : DELETE_RESULT ok:true reçu PUIS échecs de transport persistants -> succès final, aucun renvoi de DELETE_LISTING après preuve de réception", async () => {
    vi.useFakeTimers();
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.setStillActive(false); // A n'est plus active -- verification independante positive

    // Echec PERSISTANT du canal d'ACK (chrome.tabs.sendMessage) sur TOUTES
    // les tentatives -- simule le faux negatif de transport deja documente
    // ailleurs dans ce projet ("PORT MESSAGE FERMÉ") : le content script
    // recoit et traite quand meme la commande reelle (voir sendReport
    // ci-dessous), independamment de cet echec de canal.
    mock.setSendMessageBehavior(() => ({ lastError: "The message port closed before a response was received." }));

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.advanceTimersByTimeAsync(0);
    mock.fireComplete(100);
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.getSendMessageCallCount()).toBe(1); // 1ere tentative deja partie, deja rejetee (lastError)

    // Le VRAI clic humain est detecte cote content script -- independamment
    // du canal d'ACK, qui continue d'echouer en arriere-plan.
    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.createCalls.length).toBe(2); // onglet de verification deja ouvert

    // Laisse la verification independante (2e onglet) charger et aboutir --
    // AVANT d'epuiser le canal d'ACK defaillant, pour ne pas laisser le
    // propre delai de chargement de CET onglet de verification (20s) expirer
    // en meme temps (confusion entre deux delais independants, pas l'objet
    // de ce test).
    mock.fireComplete(101);
    await vi.advanceTimersByTimeAsync(0);

    // Laisse le temps a withRetry() de retenter (backoff exponentiel
    // 250ms->4000ms, jusqu'a 6 tentatives) -- desormais, DES LA 2e tentative,
    // isAlreadyConfirmed() doit court-circuiter tout nouvel appel a
    // chrome.tabs.sendMessage.
    await vi.advanceTimersByTimeAsync(20000);

    expect(logger.info).toHaveBeenCalledWith(
      "REPUBLISH_OLD_DELETE_SEND_SKIPPED_ALREADY_CONFIRMED",
      expect.objectContaining({ vintedItemId: "old-1" })
    );
    expect(mock.getSendMessageCallCount()).toBe(1); // jamais renvoye apres la preuve de reception
    // Meme preuve, cote resultat de la transaction (item 7 de la mission) :
    // sendDeleteCommand() resout desormais proprement au lieu de finir par
    // rejeter -- REPUBLISH_OLD_DELETE_TAB_LOAD_ERROR_IGNORED_CONTENT_SCRIPT_ALIVE
    // (l'ancien filet de securite pour un rejet final) n'a plus besoin
    // d'intervenir ici.
    expect(logger.info).not.toHaveBeenCalledWith(
      "REPUBLISH_OLD_DELETE_TAB_LOAD_ERROR_IGNORED_CONTENT_SCRIPT_ALIVE",
      expect.any(Object)
    );

    const result = await resultPromise;

    expect(result).toEqual({ ok: true });
    expect(mock.removeCalls).toContain(100);
    expect(mock.removeCalls).toContain(101);
  });

  it("échec de transport après un simple DELETE_PROGRESS (avant tout clic) -> ignoré, le flow continue jusqu'à une résolution réelle", async () => {
    vi.useFakeTimers();
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.chrome.runtime.lastError = { message: "The message port closed before a response was received." };

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.advanceTimersByTimeAsync(0);
    mock.fireComplete(100);

    // Content script vivant (modale affichee) mais aucun clic humain pour
    // l'instant.
    mock.sendReport(100, { type: "DELETE_PROGRESS", step: "auto_confirm_click_attempted" });

    // Epuise le canal d'ACK defaillant -- ne doit PAS resoudre la transaction.
    await vi.advanceTimersByTimeAsync(20000);

    // Le clic humain arrive ENSUITE, normalement.
    mock.setStillActive(false);
    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });
    await vi.advanceTimersByTimeAsync(0);
    mock.fireComplete(101);

    const result = await resultPromise;
    expect(result).toEqual({ ok: true });
  });

  it("aucun message du content script jamais reçu -> l'échec de transport reste un échec honnête (rien à suppresser)", async () => {
    vi.useFakeTimers();
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.chrome.runtime.lastError = { message: "The message port closed before a response was received." };

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.advanceTimersByTimeAsync(0);
    mock.fireComplete(100);
    await vi.advanceTimersByTimeAsync(20000);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Chargement de la page de l'ancienne annonce impossible");
  });

  it("onglet fermé PENDANT une vérification indépendante déjà en cours -> ignoré, la vérification conclut normalement", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.setStillActive(false);

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireComplete(100);
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalled());
    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });
    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2)); // onglet de verification ouvert

    // L'onglet de confirmation (deja autorise a se fermer, voir
    // outcomeAllowsTabClose) est ferme "en externe" PENDANT que la
    // verification tourne encore sur le 2e onglet -- ne doit jamais imposer
    // un echec a la place du resultat reel qui va arriver.
    mock.fireRemoved(100);

    mock.fireComplete(101);
    const result = await resultPromise;
    expect(result).toEqual({ ok: true });
  });

  it("le timeout global reste un filet de sécurité même si le content script a donné signe de vie sans jamais conclure", async () => {
    vi.useFakeTimers();
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.advanceTimersByTimeAsync(0);
    mock.fireComplete(100);
    await vi.advanceTimersByTimeAsync(0);

    // Signe de vie reel (contentScriptConfirmedAlive=true) mais AUCUN
    // DELETE_RESULT n'arrive jamais -- le content script est reste bloque.
    // Le timeout global DOIT rester le filet de securite ultime, jamais
    // suppresse indefiniment (regression : ne jamais reintroduire le bug
    // "pending 7 minutes" deja documente ailleurs dans ce projet).
    mock.sendReport(100, { type: "DELETE_PROGRESS", step: "loading" });

    await vi.advanceTimersByTimeAsync(180000);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Délai dépassé");
  });
});


// Mission "CORRIGER LA REPETITION DELETE_LISTING" (2026-08-17) -- CAUSE
// RACINE PROUVEE en test live : le listener DELETE_LISTING ne repondait
// jamais, causant des faux negatifs d'ACK (chrome.tabs.sendMessage rejetant
// malgre une reception reelle) que withRetry() traitait comme des echecs
// d'envoi, renvoyant DELETE_LISTING plusieurs fois au MEME content script.
// Ces tests couvrent exactement les 7 scenarios requis par la mission.
describe("sendDeleteCommand -- ACK explicite (2026-08-17)", () => {
  it("1. sendMessage ACK explicite -> une seule commande envoyee", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.setStillActive(false);

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireComplete(100);
    await vi.waitFor(() => expect(mock.getSendMessageCallCount()).toBe(1));

    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });
    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2));
    mock.fireComplete(101);
    await resultPromise;

    expect(mock.getSendMessageCallCount()).toBe(1); // jamais un second envoi
  });

  it("2. ACK reçu puis traitement long (attente du clic humain) -> aucun retry", async () => {
    vi.useFakeTimers();
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.advanceTimersByTimeAsync(0);
    mock.fireComplete(100);
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.getSendMessageCallCount()).toBe(1);

    // Traitement long simule : DELETE_PROGRESS "auto_confirm_click_attempted"
    // peut arriver plusieurs dizaines de secondes plus tard (jusqu'a 90s cote
    // content script) sans qu'aucun retry ne soit jamais declenche entre-temps.
    mock.sendReport(100, { type: "DELETE_PROGRESS", step: "auto_confirm_click_attempted" });
    await vi.advanceTimersByTimeAsync(60000);
    expect(mock.getSendMessageCallCount()).toBe(1);

    mock.sendReport(100, {
      type: "DELETE_RESULT",
      outcome: { ok: false, reason: "confirm_click_timeout", errorMessage: "timeout" },
    });
    await resultPromise;
    expect(mock.getSendMessageCallCount()).toBe(1);
  });

  it("3. DELETE_PROGRESS reçu alors que la promesse sendMessage rejette tardivement -> aucun retry supplémentaire", async () => {
    vi.useFakeTimers();
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.setStillActive(false);

    // La toute premiere tentative echoue (faux negatif de transport) --
    // aucune preuve de reception encore disponible a cet instant.
    mock.setSendMessageBehavior((attemptIndex) =>
      attemptIndex === 0 ? { lastError: "The message port closed before a response was received." } : { response: { ok: true, accepted: true, duplicate: false, documentInstanceId: "content-doc-1" } }
    );

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.advanceTimersByTimeAsync(0);
    mock.fireComplete(100);
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.getSendMessageCallCount()).toBe(1); // 1ere tentative deja partie et rejetee

    // La preuve de reception arrive AVANT que le backoff (250ms) n'ait
    // relance une 2e tentative.
    mock.sendReport(100, { type: "DELETE_PROGRESS", step: "loading" });

    // Laisse le backoff s'ecouler entierement -- isAlreadyConfirmed() doit
    // desormais court-circuiter toute nouvelle tentative, meme si le mock
    // serait pret a repondre un ACK valide cette fois.
    await vi.advanceTimersByTimeAsync(20000);
    expect(mock.getSendMessageCallCount()).toBe(1); // jamais de 2e appel a sendMessage
    expect(logger.info).toHaveBeenCalledWith(
      "REPUBLISH_OLD_DELETE_SEND_SKIPPED_ALREADY_CONFIRMED",
      expect.objectContaining({ vintedItemId: "old-1" })
    );

    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });
    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2));
    mock.fireComplete(101);
    await resultPromise;
  });

  it("4. vrai échec avant toute preuve de réception -> retry autorisé jusqu'à épuisement", async () => {
    vi.useFakeTimers();
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);

    // Aucune preuve de reception ne survient JAMAIS -- echec persistant et
    // authentique (contenu jamais recu par le content script, ex. tab
    // fermee/navigation echouee), retry legitimement autorise.
    mock.setSendMessageBehavior(() => ({ lastError: "Could not establish connection. Receiving end does not exist." }));

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.advanceTimersByTimeAsync(0);
    mock.fireComplete(100);

    // Epuise les 6 tentatives (backoff exponentiel 250ms->4000ms).
    await vi.advanceTimersByTimeAsync(20000);
    expect(mock.getSendMessageCallCount()).toBe(6); // les 6 tentatives ont bien eu lieu

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Chargement de la page de l'ancienne annonce impossible");
  });

  it("6. le timeout global (DELETE_GLOBAL_TIMEOUT_MS) reste inchangé même avec l'ACK explicite", async () => {
    vi.useFakeTimers();
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.advanceTimersByTimeAsync(0);
    mock.fireComplete(100);
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.getSendMessageCallCount()).toBe(1); // ACK recu normalement, commande acceptee

    // Aucun DELETE_RESULT n'arrive jamais -- seul le delai global (180s,
    // inchange par ce correctif) doit trancher, exactement comme avant.
    await vi.advanceTimersByTimeAsync(180000);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Délai dépassé");
  });

  it("7. résultat de transaction inchangé hors de ce bug : succès complet identique à avant le correctif", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.setStillActive(false);

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireComplete(100);
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalled());
    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2));
    mock.fireComplete(101);

    const result = await resultPromise;
    expect(result).toEqual({ ok: true }); // exactement le meme resultat qu'avant le correctif ACK
    expect(mock.removeCalls).toContain(100);
    expect(mock.removeCalls).toContain(101);
  });
});

// Mission "CORRIGER LA REPETITION DELETE_LISTING" (2026-08-17), CAUSE RACINE
// #2 PROUVEE en test live : contentScriptConfirmedAlive (mise a `true` par
// TOUT rapport, y compris DELETE_LISTENER_BOOT envoye au chargement du
// module, AVANT le premier envoi) etait reutilisee comme garde anti-retry --
// le premier DELETE_LISTING n'etait alors JAMAIS envoye
// (REPUBLISH_OLD_DELETE_SEND_SKIPPED_ALREADY_CONFIRMED des la 1ere tentative).
// deleteCommandAccepted distingue desormais strictement "le content script
// existe" de "CETTE commande DELETE_LISTING a ete acceptee". Ces 6 tests
// couvrent exactement les scenarios requis par la mission.
describe("deleteCommandAccepted -- distinction stricte du simple 'contentScriptAlive' (2026-08-17)", () => {
  it("1. DELETE_LISTENER_BOOT reçu avant le premier send -> le premier DELETE_LISTING est quand même envoyé", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.setStillActive(false);

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    // BOOT arrive AVANT que sendDeleteCommand() n'ait eu la moindre chance
    // de s'executer (aucun await entre fireComplete et sendReport, exactement
    // l'ordre observe en direct : DELETE_LISTENER_REGISTERED avant tout
    // REPUBLISH_OLD_DELETE_PROGRESS/COMMAND_ACKED).
    mock.fireComplete(100);
    mock.sendReport(100, {
      type: "DELETE_LISTENER_BOOT",
      documentInstanceId: "doc-1",
      duplicate: false,
      firstDocumentInstanceId: null,
    });

    // Preuve directe et non ambigue : le premier (et seul) envoi a bien eu
    // lieu malgre le BOOT recu avant. On n'affirme rien via le mock partage
    // `logger` (son historique d'appels s'accumule sur TOUT le fichier de
    // tests, jamais reinitialise entre les `it` -- une assertion `.not.
    // toHaveBeenCalledWith` dessus serait polluee par des tests precedents
    // qui declenchent legitimement ce meme log pour un autre scenario).
    await vi.waitFor(() => expect(mock.getSendMessageCallCount()).toBe(1));

    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });
    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2));
    mock.fireComplete(101);
    const result = await resultPromise;
    expect(result).toEqual({ ok: true });
  });

  it("2. premier ACK accepted:true -> aucun deuxième send", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.setStillActive(false);

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireComplete(100);
    await vi.waitFor(() => expect(mock.getSendMessageCallCount()).toBe(1));

    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });
    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2));
    mock.fireComplete(101);
    await resultPromise;

    expect(mock.getSendMessageCallCount()).toBe(1);
  });

  it("3. premier DELETE_PROGRESS reçu avant résolution/rejet tardif du send -> aucun retry", async () => {
    vi.useFakeTimers();
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.setStillActive(false);
    mock.setSendMessageBehavior((attemptIndex) =>
      attemptIndex === 0
        ? { lastError: "The message port closed before a response was received." }
        : { response: { ok: true, accepted: true, duplicate: false, documentInstanceId: "content-doc-1" } }
    );

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.advanceTimersByTimeAsync(0);
    mock.fireComplete(100);
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.getSendMessageCallCount()).toBe(1);

    mock.sendReport(100, { type: "DELETE_PROGRESS", step: "loading" });

    await vi.advanceTimersByTimeAsync(20000);
    expect(mock.getSendMessageCallCount()).toBe(1); // jamais de 2e envoi

    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });
    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2));
    mock.fireComplete(101);
    await resultPromise;
  });

  it("4. vrai échec sans ACK/progress/result -> retry autorisé jusqu'à épuisement", async () => {
    vi.useFakeTimers();
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.setSendMessageBehavior(() => ({ lastError: "Could not establish connection. Receiving end does not exist." }));

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.advanceTimersByTimeAsync(0);
    mock.fireComplete(100);
    await vi.advanceTimersByTimeAsync(20000);

    expect(mock.getSendMessageCallCount()).toBe(6);
    const result = await resultPromise;
    expect(result.ok).toBe(false);
  });

  it("6. le timeout global (DELETE_GLOBAL_TIMEOUT_MS) reste inchangé", async () => {
    vi.useFakeTimers();
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.advanceTimersByTimeAsync(0);
    mock.fireComplete(100);
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.getSendMessageCallCount()).toBe(1); // ACK normal, commande acceptee

    await vi.advanceTimersByTimeAsync(180000);
    const result = await resultPromise;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Délai dépassé");
  });
});

// Mission "ROUND DELETE -- implementation du correctif de verification
// post-suppression" (2026-08-17) : couvre exactement les 4 scenarios requis
// (A-D) -- executeScript() de verifyReallyDeleted() peut rejeter avec
// "Frame with ID 0 was removed" (course de timing entre waitForTabComplete
// et l'injection reelle, voir audit precedent). Ces tests utilisent les
// timers reels (pas de vi.useFakeTimers) : le retry/backoff (~400ms) et la
// renavigation restent rapides, mais doivent s'ecouler reellement pour que
// runVerificationScriptWithRetry() progresse.
describe("verifyReallyDeleted -- retry + renavigation sur 'Frame with ID 0 was removed' (2026-08-17)", () => {
  it("A. executeScript rejette une fois puis réussit au retry -> ok:true, jamais de cleanup_required", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.setExecuteScriptBehavior((attemptIndex) =>
      attemptIndex === 0 ? { reject: "Frame with ID 0 was removed." } : { result: false }
    );

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireComplete(100);
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalled());
    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2));
    mock.fireComplete(101);

    const result = await resultPromise;
    expect(result).toEqual({ ok: true });
    // Retry interne absorbe -- jamais de renavigation necessaire pour ce cas.
    expect(mock.chrome.tabs.update).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "REPUBLISH_OLD_DELETE_VERIFICATION_RETRY",
      expect.objectContaining({ oldVintedItemId: "old-1", attempt: 1 })
    );
  });

  it("B. tous les retries échouent, URL différente détectée, renavigation puis executeScript réussit -> ok:true", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    // 3 premieres tentatives (retry initial) echouent toutes ; la 4e (apres
    // renavigation) reussit avec stillActive:false (supprimee confirmee).
    mock.setExecuteScriptBehavior((attemptIndex) => (attemptIndex < 3 ? { reject: "Frame with ID 0 was removed." } : { result: false }));

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireComplete(100);
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalled());
    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2));
    // Vinted a navigue ailleurs de son propre chef (ex. redirection apres
    // suppression) -- simule independamment de notre propre renavigation.
    mock.setTabUrl(101, "https://www.vinted.fr/");
    mock.fireComplete(101);

    await vi.waitFor(() => expect(mock.chrome.tabs.update).toHaveBeenCalledWith(101, { url: "https://www.vinted.fr/items/old-1" }), { timeout: 3000 });
    // Simule le chargement complet de la page renaviguee.
    mock.fireComplete(101);

    const result = await resultPromise;
    expect(result).toEqual({ ok: true });
    expect(logger.info).toHaveBeenCalledWith(
      "REPUBLISH_OLD_DELETE_VERIFICATION_NAVIGATION_DETECTED",
      expect.objectContaining({ oldVintedItemId: "old-1", currentUrl: "https://www.vinted.fr/" })
    );
    expect(logger.info).toHaveBeenCalledWith("REPUBLISH_OLD_DELETE_VERIFICATION_RELOAD", expect.objectContaining({ oldVintedItemId: "old-1" }));
  });

  it("C. tous les retries échouent + renavigation + re-vérification échoue encore -> ok:false, jamais un faux succès", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    // Echec systematique, avant ET apres renavigation.
    mock.setExecuteScriptBehavior(() => ({ reject: "Frame with ID 0 was removed." }));

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireComplete(100);
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalled());
    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2));
    mock.fireComplete(101);

    await vi.waitFor(() => expect(mock.chrome.tabs.update).toHaveBeenCalled(), { timeout: 3000 });
    mock.fireComplete(101);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Vérification de la suppression impossible");
    expect(result.error).toContain("Frame with ID 0 was removed");
    expect(logger.warn).toHaveBeenCalledWith(
      "REPUBLISH_OLD_DELETE_VERIFICATION_FINAL_FAILURE",
      expect.objectContaining({
        oldVintedItemId: "old-1",
        firstError: "Frame with ID 0 was removed.",
        secondError: "Frame with ID 0 was removed.",
      })
    );
  });

  it("D. URL différente détectée mais la re-vérification réelle montre l'annonce toujours active -> ok:false, jamais deleted=true sur la seule navigation", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    // Retry initial echoue -- puis apres renavigation, la lecture reussit
    // mais rapporte stillActive:true (l'annonce est reellement encore la).
    mock.setExecuteScriptBehavior((attemptIndex) => (attemptIndex < 3 ? { reject: "Frame with ID 0 was removed." } : { result: true }));

    const resultPromise = attemptDeleteOldVintedListing("old-1");
    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireComplete(100);
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalled());
    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2));
    // Une navigation a bien eu lieu (indice) -- mais ne doit JAMAIS suffire
    // seule a conclure "supprimee".
    mock.setTabUrl(101, "https://www.vinted.fr/some-other-page");
    mock.fireComplete(101);

    await vi.waitFor(() => expect(mock.chrome.tabs.update).toHaveBeenCalled(), { timeout: 3000 });
    mock.fireComplete(101);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("toujours active");
    expect(logger.info).toHaveBeenCalledWith(
      "REPUBLISH_OLD_DELETE_VERIFICATION_NAVIGATION_DETECTED",
      expect.objectContaining({ oldVintedItemId: "old-1" })
    );
    // La lecture reelle post-renavigation reste seule autoritaire.
    expect(logger.info).toHaveBeenCalledWith(
      "REPUBLISH_OLD_DELETE_VERIFICATION_RESULT",
      expect.objectContaining({ oldVintedItemId: "old-1", stillActive: true })
    );
  });
});
// Mission "ONGLET ACTIF POUR LA MODALE REACT" (2026-08-26) : le mode
// background du 2026-08-19 est annule. attemptDeleteOldVintedListing() n'est
// atteignable que pour republish_listing (oldVintedItemId, voir
// republishTransaction.ts) -- son onglet de SUPPRESSION s'ouvre desormais en
// active:true, seul moyen d'obtenir de Chromium le cycle de rendu que la
// modale React de Vinted exige pour se monter. L'onglet de VERIFICATION
// independante reste en active:false (lecture ld+json uniquement). Le
// re-focus sur intervention humaine necessaire (signal existant
// outcomeAllowsTabClose:false) est conserve.
describe("attemptDeleteOldVintedListing -- onglet actif (mission 'ONGLET ACTIF POUR LA MODALE REACT', 2026-08-26)", () => {
  it("4. l'onglet de suppression est cree avec active:true (rendu requis pour la modale React)", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.setStillActive(false);

    const resultPromise = attemptDeleteOldVintedListing("old-1");

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    expect(mock.createCalls[0].active).toBe(true);

    mock.fireComplete(100);
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalled());
    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2));
    // L'onglet de verification independante reste lui aussi active:false,
    // deja le cas avant ce round -- confirme ici pour ne pas regresser.
    expect(mock.createCalls[1].active).toBe(false);
    mock.fireComplete(101);

    await resultPromise;
  });

  // 6. echec necessitant intervention (clic structurellement impossible,
  // aucune verification independante jamais declenchee -- exactement le
  // scenario deja couvert plus haut, DELETE_RESULT ok:false) -> l'onglet est
  // ramene au premier plan.
  it("6. DELETE_RESULT ok:false (ex. confirm_button_not_clickable) -> l'onglet de suppression est ramene au premier plan, jamais fermé", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);

    const resultPromise = attemptDeleteOldVintedListing("old-1");

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireComplete(100);
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalled());
    mock.sendReport(100, {
      type: "DELETE_RESULT",
      outcome: { ok: false, reason: "confirm_button_not_clickable", errorMessage: "Bouton introuvable, invisible ou désactivé" },
    });

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    // Etat recuperable conserve a l'identique -- onglet jamais ferme (deja
    // le cas avant ce round).
    expect(mock.removeCalls).not.toContain(100);
    // SEULE difference introduite par ce round : l'onglet, backgrounded a la
    // creation, est ramene au premier plan puisqu'une intervention humaine
    // est reellement necessaire.
    expect(mock.chrome.tabs.update).toHaveBeenCalledWith(100, { active: true });
  });

  // 7. succes complet : aucun chrome.tabs.update(...,{active:true}) jamais
  // appele (le succes ferme les deux onglets, comme avant ce round).
  it("7. succes complet -> jamais de chrome.tabs.update(...,{active:true}), les deux onglets sont fermes", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.setStillActive(false);

    const resultPromise = attemptDeleteOldVintedListing("old-1");

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireComplete(100);
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalled());
    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2));
    mock.fireComplete(101);

    const result = await resultPromise;
    expect(result).toEqual({ ok: true });
    expect(mock.removeCalls).toContain(100);
    expect(mock.removeCalls).toContain(101);
    expect(mock.chrome.tabs.update).not.toHaveBeenCalledWith(expect.anything(), { active: true });
  });

  // 8. cleanup_required (verification independante montre l'annonce
  // toujours active) : comportement recuperable conserve -- l'onglet de
  // suppression (deja ferme a ce stade, son role etant termine des qu'un
  // clic a ete tente) ne declenche PAS de foreground, puisque
  // outcomeAllowsTabClose etait deja vrai avant la verification (aucune
  // regression de ce round : cette branche existait deja et reste inchangee).
  it("8. cleanup_required (verification montre toujours active) -> comportement recuperable inchange, aucun foreground superflu", async () => {
    const mock = makeMockChrome();
    vi.stubGlobal("chrome", mock.chrome);
    mock.setStillActive(true); // toujours active malgre le clic

    const resultPromise = attemptDeleteOldVintedListing("old-1");

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(1));
    mock.fireComplete(100);
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalled());
    mock.sendReport(100, { type: "DELETE_RESULT", outcome: { ok: true, alreadyGone: false } });

    await vi.waitFor(() => expect(mock.createCalls.length).toBe(2));
    mock.fireComplete(101);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("toujours active");
    // L'onglet de suppression (100) a deja ete ferme (son role etait
    // termine des le clic tente) -- jamais de foreground superflu sur un
    // onglet deja ferme.
    expect(mock.removeCalls).toContain(100);
    expect(mock.chrome.tabs.update).not.toHaveBeenCalledWith(expect.anything(), { active: true });
  });
});
