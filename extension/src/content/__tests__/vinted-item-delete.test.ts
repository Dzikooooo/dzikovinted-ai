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

import { handleDeleteListing } from "../vinted-item";
import { DELETE_CONFIRM_TEXT, DELETE_MODAL_HEADING_TEXT, DELETE_TRIGGER_TEXT } from "../deleteFlowSelectors";

// Mission "REPUBLICATION : DIAGNOSTIC LIVE SUPPRESSION ANCIENNE ANNONCE
// VINTED" (2026-08-17), etendue par la mission "AUTOMATISER LA SUPPRESSION
// -- DERNIER CLIC" (2026-08-19) : couvre le flow reel confirme en direct --
// page /items/{id} -> bouton "Supprimer" (clic automatise, purement client)
// -> modale "Supprimer l'article" -> bouton "Confirmer et supprimer"
// (desormais AUSSI automatise, une seule tentative, dispatchFullClick reel
// -- plus de clic humain simule/attendu ici). Aucun mock de domWait/
// deleteFlowSelectors -- meme discipline que domWait.test.ts, DOM reel
// jsdom + vrais evenements.

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

// Mission "ONGLET MASQUE -- GEOMETRIE NULLE" (2026-08-25) : reproduit un
// onglet d'arriere-plan (chrome.tabs.create({active:false})). Le getter natif
// du prototype est simplement masque par une propriete propre, retiree dans
// l'afterEach -- aucun mock global.
function stubDocumentHidden(): void {
  Object.defineProperty(document, "hidden", { get: () => true, configurable: true });
  Object.defineProperty(document, "visibilityState", { get: () => "hidden", configurable: true });
}

beforeEach(() => {
  document.body.innerHTML = "";
  setLocation("https://www.vinted.fr/items/12345");
});

afterEach(() => {
  document.body.innerHTML = "";
  // Mission "ONGLET MASQUE" (2026-08-25) : retire la surcharge eventuelle de
  // document.hidden/visibilityState posee par un test (voir stubDocumentHidden)
  // -- supprimer la propriete propre restaure le getter natif du prototype.
  delete (document as unknown as Record<string, unknown>).hidden;
  delete (document as unknown as Record<string, unknown>).visibilityState;
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
    await vi.advanceTimersByTimeAsync(11000);
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
    await vi.advanceTimersByTimeAsync(11000);
    await promise;

    const calls = sendMessageCalls(sendMessage) as Array<{ type: string; step?: string }>;
    expect(calls.some((m) => m.type === "DELETE_PROGRESS" && m.step === "modal_confirmed")).toBe(false);
    expect(calls).toContainEqual({
      type: "DELETE_RESULT",
      outcome: { ok: false, reason: "modal_not_found", errorMessage: expect.any(String) },
      documentInstanceId: expect.any(String),
    });
  });

  // Mission "DIAGNOSTIC SUPPRESSION" (2026-08-25) -- REGRESSION du bug live :
  // le snapshot du run en echec a remonte data-testid="item-delete-button"
  // avec visible:false. Le libelle "Supprimer" est trop generique pour etre
  // fiable seul : ce test place DELIBEREMENT un premier bouton "Supprimer"
  // invisible AVANT le vrai declencheur dans le DOM -- findButtonByExactText()
  // aurait retourne ce premier candidat cache. La priorite testid + visibilite
  // doit selectionner le second.
  it("cible le bouton data-testid=item-delete-button visible plutot que le premier \"Supprimer\" cache du DOM", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    document.body.innerHTML =
      ldJsonScript(24) +
      `<button id="leurre">${DELETE_TRIGGER_TEXT}</button>` +
      `<button id="vrai" data-testid="item-delete-button">${DELETE_TRIGGER_TEXT}</button>`;
    const leurre = document.getElementById("leurre")!;
    const vrai = document.getElementById("vrai")!;
    stubVisible(vrai);

    const leurreClicked = vi.fn();
    leurre.addEventListener("click", leurreClicked);
    vrai.addEventListener("click", () => {
      const modal = document.createElement("div");
      modal.textContent = DELETE_MODAL_HEADING_TEXT;
      document.body.appendChild(modal);
      stubVisible(modal);
    });
    vi.useFakeTimers();

    const promise = handleDeleteListing({ vintedItemId: "12345" });
    await vi.advanceTimersByTimeAsync(20000);
    await promise;

    expect(leurreClicked).not.toHaveBeenCalled();
    const calls = sendMessageCalls(sendMessage) as Array<{ type: string; step?: string }>;
    expect(calls.some((m) => m.type === "DELETE_PROGRESS" && m.step === "modal_confirmed")).toBe(true);
  });

  // Mission "DIAGNOSTIC SUPPRESSION" (2026-08-25) : seconde tentative de clic
  // apres une premiere fenetre d'attente sans modale. Le declencheur n'ouvre
  // la modale qu'au DEUXIEME clic -- sans le retry, ce scenario finissait en
  // modal_not_found.
  it("ouvre la modale via la seconde tentative de clic quand le premier clic reste sans effet", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    document.body.innerHTML =
      ldJsonScript(24) + `<button id="trigger" data-testid="item-delete-button">${DELETE_TRIGGER_TEXT}</button>`;
    const trigger = document.getElementById("trigger")!;
    stubVisible(trigger);

    let clicks = 0;
    trigger.addEventListener("click", () => {
      clicks += 1;
      if (clicks < 2) return; // premier clic volontairement sans effet
      const modal = document.createElement("div");
      modal.textContent = DELETE_MODAL_HEADING_TEXT;
      document.body.appendChild(modal);
      stubVisible(modal);
    });
    vi.useFakeTimers();

    const promise = handleDeleteListing({ vintedItemId: "12345" });
    await vi.advanceTimersByTimeAsync(20000);
    await promise;

    expect(clicks).toBeGreaterThanOrEqual(2);
    const calls = sendMessageCalls(sendMessage) as Array<{ type: string; step?: string }>;
    expect(calls.some((m) => m.type === "DELETE_PROGRESS" && m.step === "modal_confirmed")).toBe(true);
  });

  // Mission "ONGLET MASQUE -- GEOMETRIE NULLE" (2026-08-25) -- REGRESSION de
  // la cause racine live : l'onglet de suppression est ouvert avec
  // chrome.tabs.create({active:false}) (deleteOldListing.ts). Un onglet
  // d'arriere-plan n'est jamais rendu : offsetParent est null ET
  // getClientRects() est vide pour TOUT le document (rect 0x0 observe en
  // direct sur item-delete-button, alors que tous ses ancetres etaient
  // display:block/grid + visibility:visible). Le controle strict de
  // visibilite y echouait donc structurellement, quel que soit l'element.
  // AUCUN stubVisible() ici, volontairement : c'est exactement la situation
  // reelle, et le flow doit desormais aboutir malgre tout.
  it("onglet masque (document.hidden) : le flow aboutit malgre une geometrie nulle sur tout le document", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    stubDocumentHidden();
    document.body.innerHTML =
      ldJsonScript(24) + `<button id="trigger" data-testid="item-delete-button">${DELETE_TRIGGER_TEXT}</button>`;
    document.getElementById("trigger")!.addEventListener("click", () => {
      const heading = document.createElement("div");
      heading.textContent = DELETE_MODAL_HEADING_TEXT;
      const confirm = document.createElement("button");
      confirm.textContent = DELETE_CONFIRM_TEXT;
      document.body.append(heading, confirm);
    });
    vi.useFakeTimers();

    const promise = handleDeleteListing({ vintedItemId: "12345" });
    await vi.advanceTimersByTimeAsync(20000);
    await promise;

    const calls = sendMessageCalls(sendMessage) as Array<{ type: string; step?: string; outcome?: unknown }>;
    expect(calls.some((m) => m.type === "DELETE_PROGRESS" && m.step === "modal_confirmed")).toBe(true);
    expect(calls.some((m) => m.type === "DELETE_PROGRESS" && m.step === "confirm_clicked")).toBe(true);
  });

  // Contre-epreuve indispensable : le relachement ci-dessus ne doit PAS
  // rouvrir le faux "modal_confirmed" corrige en aout. Meme onglet masque,
  // mais le titre de modale est dans un conteneur display:none -- les styles
  // calcules restent corrects dans un onglet d'arriere-plan, donc il doit
  // toujours etre rejete.
  it("onglet masque : un titre de modale sous display:none reste rejete (pas de faux modal_confirmed)", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    stubDocumentHidden();
    document.body.innerHTML =
      ldJsonScript(24) + `<button id="trigger" data-testid="item-delete-button">${DELETE_TRIGGER_TEXT}</button>`;
    document.getElementById("trigger")!.addEventListener("click", () => {
      const wrapper = document.createElement("div");
      wrapper.style.display = "none";
      const heading = document.createElement("div");
      heading.textContent = DELETE_MODAL_HEADING_TEXT;
      wrapper.appendChild(heading);
      document.body.appendChild(wrapper);
    });
    vi.useFakeTimers();

    const promise = handleDeleteListing({ vintedItemId: "12345" });
    await vi.advanceTimersByTimeAsync(20000);
    await promise;

    const calls = sendMessageCalls(sendMessage) as Array<{ type: string; step?: string }>;
    expect(calls.some((m) => m.type === "DELETE_PROGRESS" && m.step === "modal_confirmed")).toBe(false);
    expect(calls).toContainEqual({
      type: "DELETE_RESULT",
      outcome: { ok: false, reason: "modal_not_found", errorMessage: expect.any(String) },
      documentInstanceId: expect.any(String),
    });
  });

  // Mission "AUTOMATISER LA SUPPRESSION -- DERNIER CLIC" (2026-08-19) :
  // scenario nominal -- modale + bouton de confirmation reellement visibles
  // et actifs -> clic AUTOMATIQUE (dispatchFullClick, isTrusted:false, jamais
  // falsifie), ordre exact modal_confirmed -> auto_confirm_click_attempted
  // -> confirm_clicked -> DELETE_RESULT{ok:true, alreadyGone:false}. Ce
  // dernier signifie UNIQUEMENT "le clic a ete tente" -- la preuve de
  // suppression reelle reste verifyReallyDeleted() (deleteOldListing.ts,
  // background, INCHANGEE), hors de portee de ce test content-script.
  it("modale + bouton confirm visibles et actifs -> clic automatique declenche, ordre modal_confirmed -> auto_confirm_click_attempted -> confirm_clicked -> DELETE_RESULT ok:true", async () => {
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

    let clickOnConfirm: MouseEvent | null = null;
    document.addEventListener("click", (e) => {
      if ((e.target as HTMLElement | null)?.id === "confirm") clickOnConfirm = e as MouseEvent;
    });

    const promise = handleDeleteListing({ vintedItemId: "12345" });
    await vi.advanceTimersByTimeAsync(1);
    await promise;

    const calls = sendMessageCalls(sendMessage) as Array<{ type: string; step?: string; outcome?: { ok?: boolean } }>;
    const progressSteps = calls.filter((m) => m.type === "DELETE_PROGRESS").map((m) => m.step);
    const confirmedIndex = progressSteps.indexOf("modal_confirmed");
    const clickAttemptedIndex = progressSteps.indexOf("auto_confirm_click_attempted");
    const clickedIndex = progressSteps.indexOf("confirm_clicked");
    expect(confirmedIndex).toBeGreaterThanOrEqual(0);
    expect(clickAttemptedIndex).toBeGreaterThan(confirmedIndex);
    expect(clickedIndex).toBeGreaterThan(clickAttemptedIndex);

    expect(calls).toContainEqual({
      type: "DELETE_RESULT",
      outcome: { ok: true, alreadyGone: false },
      documentInstanceId: expect.any(String),
    });

    expect(clickOnConfirm).not.toBeNull();
    expect(clickOnConfirm!.isTrusted).toBe(false); // synthetique, jamais falsifie en isTrusted:true
  });

  // Mission "AUTOMATISER LA SUPPRESSION -- DERNIER CLIC" (2026-08-19) :
  // re-resolution + verification fraiche juste avant le clic -- un bouton
  // trouve par waitForElementMatching() mais desactive au moment de cette
  // re-verification ne doit JAMAIS etre clique.
  it("bouton \"Confirmer et supprimer\" désactivé au moment du clic -> confirm_button_not_clickable, aucun clic tenté", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    document.body.innerHTML = ldJsonScript(24) + `<button id="trigger">${DELETE_TRIGGER_TEXT}</button>`;
    const trigger = document.getElementById("trigger")!;
    trigger.addEventListener("click", () => {
      document.body.innerHTML += `<div id="modal-heading">${DELETE_MODAL_HEADING_TEXT}</div><button id="confirm" disabled>${DELETE_CONFIRM_TEXT}</button>`;
      stubVisible(document.getElementById("modal-heading")!);
      stubVisible(document.getElementById("confirm")!);
    });
    vi.useFakeTimers();

    let clicked = false;
    document.addEventListener("click", (e) => {
      if ((e.target as HTMLElement | null)?.id === "confirm") clicked = true;
    });

    const promise = handleDeleteListing({ vintedItemId: "12345" });
    await vi.advanceTimersByTimeAsync(8000);
    await promise;

    const calls = sendMessageCalls(sendMessage);
    expect(calls).toContainEqual({
      type: "DELETE_RESULT",
      outcome: { ok: false, reason: "confirm_button_not_clickable", errorMessage: expect.any(String) },
      documentInstanceId: expect.any(String),
    });
    expect(clicked).toBe(false);
    expect((document.getElementById("confirm") as HTMLButtonElement).disabled).toBe(true);
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

  // Mission "AUTOMATISER LA SUPPRESSION -- DERNIER CLIC" (2026-08-19) :
  // regression directe -- un bouton trouve par waitForElementMatching() puis
  // retire du DOM AVANT la re-resolution qui precede le clic ne doit jamais
  // produire un faux succes (aucune inference a partir d'effets de bord type
  // navigation/disparition -- seule la re-resolution explicite decide).
  it("le bouton de confirmation retiré du DOM juste après l'ouverture de la modale -> jamais de faux succès", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    document.body.innerHTML = ldJsonScript(24) + `<button id="trigger">${DELETE_TRIGGER_TEXT}</button>`;
    const trigger = document.getElementById("trigger")!;
    trigger.addEventListener("click", () => {
      document.body.innerHTML += `<div id="modal-heading">${DELETE_MODAL_HEADING_TEXT}</div><button id="confirm">${DELETE_CONFIRM_TEXT}</button>`;
      stubVisible(document.getElementById("modal-heading")!);
      stubVisible(document.getElementById("confirm")!);
      // Retire le bouton IMMEDIATEMENT -- simule un re-render qui le retire
      // juste après l'ouverture de la modale, avant que handleDeleteListing()
      // n'ait pu le re-résoudre pour le clic.
      document.getElementById("confirm")!.remove();
    });
    vi.useFakeTimers();

    const promise = handleDeleteListing({ vintedItemId: "12345" });
    await vi.advanceTimersByTimeAsync(8000);
    await promise;

    const calls = sendMessageCalls(sendMessage);
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

