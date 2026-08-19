import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vinted-item.ts enregistre chrome.runtime.onMessage.addListener(...) au
// NIVEAU MODULE (deux listeners, AUTO_ENRICH_REQUESTED + DELETE_LISTING) --
// l'import ci-dessous execute donc ce code immediatement. vi.hoisted() est
// requis pour que ce stub minimal existe AVANT que l'import (hoiste par
// Vitest/ESM au-dessus de tout le reste) ne s'evalue -- un simple
// vi.stubGlobal() place plus bas dans ce fichier arriverait trop tard.
// __resellosRegisteredListeners capture les listeners reellement enregistres
// au moment de l'import (deux : AUTO_ENRICH_REQUESTED puis DELETE_LISTING)
// pour pouvoir les invoquer directement comme le ferait chrome.tabs.sendMessage()
// cote reel, avec un callback capturant l'ACK (voir describe("garde locale
// d'execution") plus bas).
vi.hoisted(() => {
  (globalThis as { __resellosRegisteredListeners?: unknown[] }).__resellosRegisteredListeners = [];
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      sendMessage: () => {},
      onMessage: {
        addListener: (fn: unknown) => {
          (globalThis as { __resellosRegisteredListeners?: unknown[] }).__resellosRegisteredListeners?.push(fn);
        },
      },
    },
  };
});

import { handleDeleteListing, waitForTrustedClick } from "../vinted-item";
import { DELETE_CONFIRM_TEXT, DELETE_MODAL_HEADING_TEXT, DELETE_TRIGGER_TEXT } from "../deleteFlowSelectors";

// Mission "REPUBLICATION : DIAGNOSTIC LIVE SUPPRESSION ANCIENNE ANNONCE
// VINTED" (2026-08-17) : couvre le flow reel confirme en direct -- page
// /items/{id} -> bouton "Supprimer" (clic automatise, purement client) ->
// modale "Supprimer l'article" -> bouton "Confirmer et supprimer" (clic
// MANUEL requis, jamais simule ici -- seule sa DISPARITION du DOM, apres un
// vrai clic humain, est simulee). Aucun mock de domWait/deleteFlowSelectors
// -- meme discipline que domWait.test.ts, DOM reel jsdom + vrais evenements.

function sendMessageCalls(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls.map((c) => c[0]);
}

// window.history.pushState() ne peut pas changer l'ORIGINE (jsdom sert par
// defaut http://localhost:3000, or extractVintedItemId()/handleDeleteListing
// lisent location.href sur www.vinted.fr) -- SecurityError confirme en
// test. vi.stubGlobal("location", ...) remplace directement l'objet global
// lu par le code de production, sans passer par une vraie navigation jsdom.
function setLocation(url: string): void {
  const parsed = new URL(url);
  vi.stubGlobal("location", { href: url, pathname: parsed.pathname });
}

function ldJsonScript(price: number | null): string {
  const data = price === null ? {} : { offers: { price } };
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

// Mission "AUDITER LE FAUX modal_confirmed" (2026-08-17) : isDeleteConfirmationModalVisible/
// findDeleteConfirmButton exigent desormais une visibilite reelle (isVisible(),
// offsetParent/getClientRects) -- jsdom ne fait aucun layout, donc tout
// element reste "invisible" par defaut sans ce stub. Utilise pour simuler
// une VRAIE modale rendue (par opposition au texte simplement present mais
// cache, le bug corrige ici).
function stubVisible(el: Element): void {
  Object.defineProperty(el, "offsetParent", { get: () => document.body, configurable: true });
}

beforeEach(() => {
  document.body.innerHTML = "";
  setLocation("https://www.vinted.fr/items/12345");
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("handleDeleteListing", () => {
  it("refuse d'agir si la page chargee ne correspond pas a l'ancien item cible (mauvais item interdit)", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    setLocation("https://www.vinted.fr/items/99999");

    await handleDeleteListing({ vintedItemId: "12345" });

    const calls = sendMessageCalls(sendMessage);
    expect(calls).toEqual([
      {
        type: "DELETE_RESULT",
        outcome: { ok: false, reason: "wrong_item", errorMessage: expect.stringContaining("99999") },
        documentInstanceId: expect.any(String),
      },
    ]);
  });

  it("annonce déjà absente : aucune donnée produit (ld+json) après le rendu -- succès sans chercher le bouton Supprimer", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    document.body.innerHTML = "<div>Rien ici</div>"; // aucun ld+json
    vi.useFakeTimers();

    const promise = handleDeleteListing({ vintedItemId: "12345" });
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    const calls = sendMessageCalls(sendMessage);
    expect(calls).toContainEqual({
      type: "DELETE_RESULT",
      outcome: { ok: true, alreadyGone: true },
      documentInstanceId: expect.any(String),
    });
    // Jamais de recherche du bouton -- alreadyGone court-circuite le reste.
    expect(calls.some((m) => (m as { step?: string }).step === "trigger_found")).toBe(false);
  });

  it("bouton \"Supprimer\" introuvable -- échoue explicitement, jamais un faux succès", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    document.body.innerHTML = ldJsonScript(24); // annonce active, mais pas de bouton
    vi.useFakeTimers();

    const promise = handleDeleteListing({ vintedItemId: "12345" });
    await vi.advanceTimersByTimeAsync(15000);
    await promise;

    const calls = sendMessageCalls(sendMessage);
    expect(calls).toContainEqual({
      type: "DELETE_RESULT",
      outcome: { ok: false, reason: "trigger_not_found", errorMessage: expect.any(String) },
      documentInstanceId: expect.any(String),
    });
  });

  it("modale de confirmation introuvable après le clic sur \"Supprimer\"", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    document.body.innerHTML = ldJsonScript(24) + `<button>${DELETE_TRIGGER_TEXT}</button>`;
    // Le clic ne fait rien ici -- aucune modale n'apparaît jamais.
    vi.useFakeTimers();

    const promise = handleDeleteListing({ vintedItemId: "12345" });
    await vi.advanceTimersByTimeAsync(8000);
    await promise;

    const calls = sendMessageCalls(sendMessage);
    expect(calls).toContainEqual({
      type: "DELETE_RESULT",
      outcome: { ok: false, reason: "modal_not_found", errorMessage: expect.any(String) },
      documentInstanceId: expect.any(String),
    });
  });

  // Mission "AUDITER LE FAUX modal_confirmed" (2026-08-17) -- REGRESSION
  // directe du bug live : le heading "Supprimer l'article" est present dans
  // le DOM des le clic (comme observe en direct -- Vinted le conserve
  // vraisemblablement cache avant l'ouverture reelle) mais JAMAIS rendu
  // visible. Avant ce correctif, isDeleteConfirmationModalVisible() aurait
  // matche sur la seule presence du texte -- desormais, aucun "modal_confirmed"
  // ne doit jamais etre emis, et le flow doit se terminer honnêtement en
  // timeout modal_not_found, exactement comme si la modale n'existait pas.
  it("trigger_clicked + heading present mais caché -> jamais modal_confirmed, timeout honnête en modal_not_found", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    document.body.innerHTML = ldJsonScript(24) + `<button id="trigger">${DELETE_TRIGGER_TEXT}</button>`;
    const trigger = document.getElementById("trigger")!;
    trigger.addEventListener("click", () => {
      // Le texte apparaît (comme observé en direct) mais SANS aucun stub de
      // visibilité -- reproduit le heading caché/prémonté par Vinted.
      document.body.innerHTML += `<div>${DELETE_MODAL_HEADING_TEXT}</div>`;
    });
    vi.useFakeTimers();

    const promise = handleDeleteListing({ vintedItemId: "12345" });
    await vi.advanceTimersByTimeAsync(8000);
    await promise;

    const calls = sendMessageCalls(sendMessage) as Array<{ type: string; step?: string }>;
    expect(calls.some((m) => m.type === "DELETE_PROGRESS" && m.step === "modal_confirmed")).toBe(false);
    expect(calls).toContainEqual({
      type: "DELETE_RESULT",
      outcome: { ok: false, reason: "modal_not_found", errorMessage: expect.any(String) },
      documentInstanceId: expect.any(String),
    });
  });

  // Contre-preuve du test precedent : le meme scenario, mais avec une VRAIE
  // modale visible (stubVisible) + un bouton de confirmation lui aussi
  // visible -- le flow doit atteindre modal_confirmed PUIS
  // waiting_for_manual_confirm_click, dans cet ordre exact.
  it("vraie modale visible + confirm visible -> modal_confirmed puis waiting_for_manual_confirm_click", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    document.body.innerHTML = ldJsonScript(24) + `<button id="trigger">${DELETE_TRIGGER_TEXT}</button>`;
    const trigger = document.getElementById("trigger")!;
    trigger.addEventListener("click", () => {
      document.body.innerHTML += `<div id="modal-heading">${DELETE_MODAL_HEADING_TEXT}</div><button id="confirm">${DELETE_CONFIRM_TEXT}</button>`;
      stubVisible(document.getElementById("modal-heading")!);
      stubVisible(document.getElementById("confirm")!);
    });
    vi.useFakeTimers();

    const promise = handleDeleteListing({ vintedItemId: "12345" });
    await vi.advanceTimersByTimeAsync(1);

    const calls = sendMessageCalls(sendMessage) as Array<{ type: string; step?: string }>;
    const progressSteps = calls.filter((m) => m.type === "DELETE_PROGRESS").map((m) => m.step);
    const confirmedIndex = progressSteps.indexOf("modal_confirmed");
    const waitingIndex = progressSteps.indexOf("waiting_for_manual_confirm_click");
    expect(confirmedIndex).toBeGreaterThanOrEqual(0);
    expect(waitingIndex).toBeGreaterThan(confirmedIndex);

    // Nettoyage : laisse le timeout de clic expirer pour ne pas laisser de
    // timer en vol entre les tests.
    await vi.advanceTimersByTimeAsync(90000);
    await promise;
  });

  it("bouton \"Confirmer et supprimer\" introuvable une fois la modale affichée", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    document.body.innerHTML = ldJsonScript(24) + `<button id="trigger">${DELETE_TRIGGER_TEXT}</button>`;
    const trigger = document.getElementById("trigger")!;
    trigger.addEventListener("click", () => {
      // La modale apparaît VISIBLEMENT (texte présent + stubVisible, simule
      // un vrai rendu -- voir mission "AUDITER LE FAUX modal_confirmed")
      // mais SANS bouton de confirmation.
      document.body.innerHTML += `<div id="modal-heading">${DELETE_MODAL_HEADING_TEXT}</div>`;
      stubVisible(document.getElementById("modal-heading")!);
    });
    vi.useFakeTimers();

    const promise = handleDeleteListing({ vintedItemId: "12345" });
    await vi.advanceTimersByTimeAsync(8000);
    await promise;

    const calls = sendMessageCalls(sendMessage);
    expect(calls).toContainEqual({
      type: "DELETE_RESULT",
      outcome: { ok: false, reason: "confirm_button_not_found", errorMessage: expect.any(String) },
      documentInstanceId: expect.any(String),
    });
  });

  it("timeout après confirmation : le bouton \"Confirmer et supprimer\" existe mais aucun clic humain n'est jamais détecté", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    document.body.innerHTML = ldJsonScript(24) + `<button id="trigger">${DELETE_TRIGGER_TEXT}</button>`;
    const trigger = document.getElementById("trigger")!;
    trigger.addEventListener("click", () => {
      document.body.innerHTML += `<div id="modal-heading">${DELETE_MODAL_HEADING_TEXT}</div><button id="confirm">${DELETE_CONFIRM_TEXT}</button>`;
      stubVisible(document.getElementById("modal-heading")!);
      stubVisible(document.getElementById("confirm")!);
    });
    vi.useFakeTimers();

    const promise = handleDeleteListing({ vintedItemId: "12345" });
    await vi.advanceTimersByTimeAsync(90000);
    await promise;

    const calls = sendMessageCalls(sendMessage);
    expect(calls).toContainEqual({
      type: "DELETE_RESULT",
      outcome: { ok: false, reason: "confirm_click_timeout", errorMessage: expect.any(String) },
      documentInstanceId: expect.any(String),
    });
    // Le bouton n'a jamais ete retire -- jamais de succes tant qu'aucun clic
    // n'est detecte.
    expect(document.body.textContent).toContain(DELETE_CONFIRM_TEXT);
  });

  // Mission "CORRIGER LE FAUX TERMINE" (2026-08-17) : REGRESSION directe du
  // bug live -- l'ancienne condition de detection du clic
  // (`!document.body.contains(confirmButton) || !location.pathname.includes(...)`)
  // traitait TOUT retrait du bouton du DOM (ou toute navigation) comme une
  // preuve de clic, meme sans qu'aucun clic reel n'ait eu lieu (observe en
  // direct : navigation vers /member/{userId} sans confirmation). Ce test
  // reproduit exactement ce scenario -- le bouton disparait, AUCUN clic
  // n'est jamais dispatche -- et prouve que cela ne produit plus JAMAIS de
  // faux succes : seul un vrai evenement "click" isTrusted:true (impossible
  // a simuler depuis jsdom, voir describe("waitForTrustedClick") ci-dessous)
  // peut desormais faire progresser handleDeleteListing au-dela de cette
  // etape.
  it("le retrait du bouton de confirmation SANS aucun clic (navigation, re-render...) ne produit jamais un faux succès", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    document.body.innerHTML = ldJsonScript(24) + `<button id="trigger">${DELETE_TRIGGER_TEXT}</button>`;
    const trigger = document.getElementById("trigger")!;
    trigger.addEventListener("click", () => {
      document.body.innerHTML += `<div id="modal-heading">${DELETE_MODAL_HEADING_TEXT}</div><button id="confirm">${DELETE_CONFIRM_TEXT}</button>`;
      stubVisible(document.getElementById("modal-heading")!);
      stubVisible(document.getElementById("confirm")!);
    });
    vi.useFakeTimers();

    const promise = handleDeleteListing({ vintedItemId: "12345" });
    await vi.advanceTimersByTimeAsync(0);

    // Retire le bouton SANS jamais dispatcher le moindre evenement "click"
    // dessus -- exactement le symptome observe en direct (navigation vers
    // /member/{userId} sans confirmation reelle).
    document.getElementById("confirm")?.remove();
    setLocation("https://www.vinted.fr/member/999");

    await vi.advanceTimersByTimeAsync(90000);
    await promise;

    const calls = sendMessageCalls(sendMessage);
    // Jamais de succes -- uniquement le timeout honnete, malgre le retrait
    // du bouton et la navigation.
    expect(calls).toContainEqual({
      type: "DELETE_RESULT",
      outcome: { ok: false, reason: "confirm_click_timeout", errorMessage: expect.any(String) },
      documentInstanceId: expect.any(String),
    });
    expect(calls.some((m) => (m as { outcome?: { ok?: boolean } }).outcome?.ok === true)).toBe(false);
  });
});

// Mission "DIAGNOSTIC LIVE MINIMAL -- SUPPRESSION DE A" (2026-08-17) :
// instrumentation purement diagnostique -- ces tests prouvent qu'elle est
// bien presente et correcte, jamais qu'elle influence le comportement
// (deja verifie ci-dessus : tous les DELETE_RESULT/raisons d'echec restent
// inchanges avec ou sans cette instrumentation).
describe("documentInstanceId -- stable dans un meme document", () => {
  it("le meme documentInstanceId apparait sur DELETE_PROGRESS et DELETE_RESULT d'un meme handleDeleteListing()", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    document.body.innerHTML = ldJsonScript(24); // aucun bouton -- echoue vite (trigger_not_found)
    vi.useFakeTimers();

    const promise = handleDeleteListing({ vintedItemId: "12345" });
    await vi.advanceTimersByTimeAsync(15000);
    await promise;

    const calls = sendMessageCalls(sendMessage) as Array<{ type: string; documentInstanceId?: string }>;
    const ids = calls.map((m) => m.documentInstanceId).filter((id): id is string => typeof id === "string");
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(1); // une seule valeur distincte sur tous les messages de ce run
  });
});

// Mission "CORRIGER LA REPETITION DELETE_LISTING" (2026-08-17), item 5 de la
// mission -- garde LOCALE (defense en profondeur) : meme si deux commandes
// DELETE_LISTING identiques atteignent malgre tout ce document (quelle
// qu'en soit la cause), un seul handleDeleteListing() doit rester actif.
// Invoque directement les listeners CAPTURES a l'import (voir
// __resellosRegisteredListeners, stub hoisted en tete de fichier) avec un
// callback sendResponse synthetique -- reproduit exactement ce que
// chrome.tabs.sendMessage() ferait cote reel, sans dependre du reste du
// mock chrome (remplace ici par un stub minimal, propre a ce test).
describe("garde locale d'execution -- DELETE_LISTING reçu plusieurs fois dans le même document", () => {
  it("5. deux DELETE_LISTING identiques reçus -> un seul ACK duplicate:false, le second duplicate:true, un seul handleDeleteListing() actif", async () => {
    document.body.innerHTML = ldJsonScript(24) + `<button>${DELETE_TRIGGER_TEXT}</button>`;
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    vi.useFakeTimers();

    const listeners =
      (globalThis as { __resellosRegisteredListeners?: Array<(m: unknown, s: unknown, r: (x: unknown) => void) => boolean> })
        .__resellosRegisteredListeners ?? [];
    expect(listeners.length).toBeGreaterThan(0);

    const responses: unknown[] = [];
    const message = { type: "DELETE_LISTING", payload: { vintedItemId: "12345" } };
    // Dispatch SYNCHRONE, sans await entre les deux -- reproduit le pire cas
    // (deux commandes recues quasi simultanement, avant que le premier
    // handleDeleteListing() n'ait pu progresser d'un seul tick).
    for (const fn of listeners) fn(message, { tab: { id: 100 } }, (r: unknown) => responses.push(r));
    for (const fn of listeners) fn(message, { tab: { id: 100 } }, (r: unknown) => responses.push(r));

    expect(responses).toHaveLength(2); // seul le listener DELETE_LISTING repond a ce message
    expect((responses[0] as { duplicate: boolean }).duplicate).toBe(false);
    expect((responses[1] as { duplicate: boolean }).duplicate).toBe(true);

    // Laisse le (seul) handleDeleteListing() en cours atteindre une
    // resolution naturelle (aucune modale n'apparait jamais dans ce DOM ->
    // "modal_not_found" apres 8000ms).
    await vi.advanceTimersByTimeAsync(15000);

    // Preuve indirecte definitive : un seul DELETE_RESULT final rapporte --
    // si un second handleDeleteListing() avait reellement demarre, deux
    // DELETE_RESULT (ou plus) auraient ete envoyes.
    const calls = sendMessageCalls(sendMessage);
    const resultCalls = calls.filter((m) => (m as { type?: string }).type === "DELETE_RESULT");
    expect(resultCalls).toHaveLength(1);
  });
});

describe("waitForTrustedClick", () => {
  // Mission "ROUND DELETE CONFIRM -- reference figee" (2026-08-19) :
  // waitForTrustedClick() ecoute desormais `document` en phase capture et
  // re-resout l'element cible A CHAQUE clic (voir commentaire d'en-tete dans
  // vinted-item.ts). jsdom (comme tout navigateur reel) ne peut jamais
  // produire isTrusted:true sur un evenement disptache par du script, ET
  // (confirme en test) n'autorise meme pas Object.defineProperty() a
  // reecrire isTrusted sur une VRAIE instance de MouseEvent ("Cannot
  // redefine property"). Meme discipline que l'ancien makeClickTarget() :
  // on espionne document.addEventListener("click", ...) pour recuperer
  // directement le callback reellement enregistre par waitForTrustedClick,
  // puis on l'invoque nous-memes avec un objet minimal {isTrusted, target}
  // -- jamais un vrai dispatchEvent(). Un vrai DOM jsdom (document.body +
  // vrais elements) reste utilise pour resolveElement()/`.contains()`, seul
  // l'evenement lui-meme est simule.
  function spyOnClickRegistration() {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    return { addSpy, removeSpy };
  }

  type EventListenerSpy = ReturnType<typeof spyOnClickRegistration>["addSpy"];

  function registeredClickListener(addSpy: EventListenerSpy): (e: MouseEvent) => void {
    const call = addSpy.mock.calls.find((c) => c[0] === "click");
    if (!call) throw new Error("aucun listener 'click' enregistre sur document");
    return call[1] as (e: MouseEvent) => void;
  }

  function fireClick(addSpy: EventListenerSpy, isTrusted: boolean, target: Node | null): void {
    const listener = registeredClickListener(addSpy);
    listener({ isTrusted, target } as unknown as MouseEvent);
  }

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("résout true dès qu'un clic isTrusted:true atteint le bouton résolu", async () => {
    document.body.innerHTML = '<button id="confirm">Confirmer et supprimer</button>';
    const { addSpy } = spyOnClickRegistration();
    const resolveButton = () => document.getElementById("confirm") as HTMLButtonElement | null;
    const promise = waitForTrustedClick(resolveButton, 90000);
    fireClick(addSpy, true, resolveButton());
    await expect(promise).resolves.toBe(true);
  });

  it("détecte le clic humain sur un NOUVEAU bouton qui a remplacé l'ancien (re-render Vinted) -- coeur du correctif", async () => {
    document.body.innerHTML = '<button id="confirm">Confirmer et supprimer</button>';
    const { addSpy } = spyOnClickRegistration();
    const resolveButton = () => document.getElementById("confirm") as HTMLButtonElement | null;
    const promise = waitForTrustedClick(resolveButton, 90000);

    // Simule un re-render React qui remplace le noeud (l'ancienne reference
    // capturee devient stale) : le bouton initial est retire du DOM, un
    // NOUVEAU bouton identique (meme id, meme texte) le remplace.
    const oldButton = document.getElementById("confirm") as HTMLButtonElement;
    oldButton.remove();
    document.body.innerHTML = '<button id="confirm">Confirmer et supprimer</button>';
    const newButton = document.getElementById("confirm") as HTMLButtonElement;
    expect(newButton).not.toBe(oldButton);

    // Le clic humain "cible" le nouveau noeud -- resolveElement() (rappele
    // A CHAQUE clic par waitForTrustedClick) retourne bien newButton.
    fireClick(addSpy, true, newButton);
    await expect(promise).resolves.toBe(true);
  });

  it("ignore un clic isTrusted:true sur un AUTRE élément que celui résolu et continue d'attendre", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button id="confirm">Confirmer et supprimer</button><button id="other">Annuler</button>';
    const { addSpy } = spyOnClickRegistration();
    const resolveButton = () => document.getElementById("confirm") as HTMLButtonElement | null;
    const promise = waitForTrustedClick(resolveButton, 5000);
    fireClick(addSpy, true, document.getElementById("other"));
    await vi.advanceTimersByTimeAsync(5000);
    await expect(promise).resolves.toBe(false);
  });

  it("ignore un clic isTrusted:false (synthétique) sur le bouton résolu et continue d'attendre", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button id="confirm">Confirmer et supprimer</button>';
    const { addSpy } = spyOnClickRegistration();
    const resolveButton = () => document.getElementById("confirm") as HTMLButtonElement | null;
    const promise = waitForTrustedClick(resolveButton, 5000);
    fireClick(addSpy, false, resolveButton());
    await vi.advanceTimersByTimeAsync(5000);
    await expect(promise).resolves.toBe(false);
  });

  it("résout false après le délai si aucun clic n'est jamais reçu", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button id="confirm">Confirmer et supprimer</button>';
    const resolveButton = () => document.getElementById("confirm") as HTMLButtonElement | null;
    const promise = waitForTrustedClick(resolveButton, 5000);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(promise).resolves.toBe(false);
  });

  it("retire proprement le listener 'click' de document après un succès (pas de fuite)", async () => {
    document.body.innerHTML = '<button id="confirm">Confirmer et supprimer</button>';
    const { addSpy, removeSpy } = spyOnClickRegistration();
    const resolveButton = () => document.getElementById("confirm") as HTMLButtonElement | null;
    const promise = waitForTrustedClick(resolveButton, 90000);
    fireClick(addSpy, true, resolveButton());
    await promise;

    const clickAdds = addSpy.mock.calls.filter((c) => c[0] === "click");
    const clickRemoves = removeSpy.mock.calls.filter((c) => c[0] === "click");
    expect(clickAdds).toHaveLength(1);
    expect(clickRemoves).toHaveLength(1);
    expect(clickRemoves[0][1]).toBe(clickAdds[0][1]);
  });

  it("retire proprement le listener 'click' de document après un timeout (pas de fuite)", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button id="confirm">Confirmer et supprimer</button>';
    const { addSpy, removeSpy } = spyOnClickRegistration();
    const resolveButton = () => document.getElementById("confirm") as HTMLButtonElement | null;
    const promise = waitForTrustedClick(resolveButton, 5000);
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    const clickAdds = addSpy.mock.calls.filter((c) => c[0] === "click");
    const clickRemoves = removeSpy.mock.calls.filter((c) => c[0] === "click");
    expect(clickAdds).toHaveLength(1);
    expect(clickRemoves).toHaveLength(1);
    expect(clickRemoves[0][1]).toBe(clickAdds[0][1]);
  });
});
