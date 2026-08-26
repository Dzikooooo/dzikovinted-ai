import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSaveButtonHighlight, highlightSaveButton, watchAndHighlightSaveButton } from "../publishReadinessHighlight";

// Mission "ROUND READY UX" (2026-08-19) : jsdom n'implemente pas
// scrollIntoView() nativement -- stub minimal requis, meme discipline que
// les autres tests de ce projet qui comblent les lacunes de jsdom (voir
// makeClickTarget()/dispatchClick() ailleurs). isTrusted:true reste
// impossible a produire via un vrai dispatchEvent() (deja etabli, voir
// vinted-item-delete.test.ts) -- meme pattern reutilise ici : on espionne
// document.addEventListener("click", ...) pour recuperer le callback
// reellement enregistre par watchAndHighlightSaveButton(), puis on
// l'invoque nous-memes avec un objet minimal {isTrusted, target}.
const SELECTOR = '[data-testid="upload-form-save-button"]';

function makeButton(): HTMLButtonElement {
  document.body.innerHTML = `<button data-testid="upload-form-save-button">Ajouter</button>`;
  return document.querySelector<HTMLButtonElement>(SELECTOR)!;
}

function spyOnClickRegistration() {
  const addSpy = vi.spyOn(document, "addEventListener");
  const removeSpy = vi.spyOn(document, "removeEventListener");
  return { addSpy, removeSpy };
}

function registeredClickListener(addSpy: ReturnType<typeof spyOnClickRegistration>["addSpy"]): (e: MouseEvent) => void {
  const call = addSpy.mock.calls.find((c) => c[0] === "click");
  if (!call) throw new Error("aucun listener 'click' enregistre sur document");
  return call[1] as (e: MouseEvent) => void;
}

function fireClick(addSpy: ReturnType<typeof spyOnClickRegistration>["addSpy"], isTrusted: boolean, target: Node | null): void {
  registeredClickListener(addSpy)({ isTrusted, target } as unknown as MouseEvent);
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.querySelectorAll("style").forEach((el) => el.remove());
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = "";
  document.head.querySelectorAll("style").forEach((el) => el.remove());
});

describe("highlightSaveButton", () => {
  it("applique scrollIntoView({behavior:'smooth', block:'center'}) et une classe de highlight quand le bouton existe", () => {
    const btn = makeButton();
    const outcome = highlightSaveButton(SELECTOR);

    expect(outcome.buttonFound).toBe(true);
    expect(btn.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(btn.classList.contains("resellos-save-button-highlight")).toBe(true);
  });

  it("injecte le CSS d'animation une seule fois, meme apres deux appels", () => {
    makeButton();
    highlightSaveButton(SELECTOR);
    highlightSaveButton(SELECTOR);
    expect(document.querySelectorAll("style#resellos-save-button-highlight-style")).toHaveLength(1);
  });

  it("ne fait rien et ne plante pas si le bouton est introuvable", () => {
    document.body.innerHTML = "";
    const outcome = highlightSaveButton(SELECTOR);
    expect(outcome.buttonFound).toBe(false);
    expect(document.querySelector("style#resellos-save-button-highlight-style")).toBeNull();
  });
});

describe("clearSaveButtonHighlight", () => {
  it("retire la classe de highlight", () => {
    const btn = makeButton();
    highlightSaveButton(SELECTOR);
    expect(btn.classList.contains("resellos-save-button-highlight")).toBe(true);
    clearSaveButtonHighlight(SELECTOR);
    expect(btn.classList.contains("resellos-save-button-highlight")).toBe(false);
  });
});

describe("watchAndHighlightSaveButton", () => {
  it("applique le highlight immediatement (scroll + classe) des l'appel", () => {
    const btn = makeButton();
    watchAndHighlightSaveButton(SELECTOR, 90000);
    expect(btn.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(btn.classList.contains("resellos-save-button-highlight")).toBe(true);
  });

  it("retire le highlight des qu'un clic isTrusted:true atteint le bouton", () => {
    const btn = makeButton();
    const { addSpy } = spyOnClickRegistration();
    watchAndHighlightSaveButton(SELECTOR, 90000);

    fireClick(addSpy, true, btn);
    expect(btn.classList.contains("resellos-save-button-highlight")).toBe(false);
  });

  it("detecte le clic sur un NOUVEAU bouton qui a remplace l'ancien (re-render Vinted) -- re-resout fraichement, jamais une reference figee", () => {
    makeButton();
    const { addSpy } = spyOnClickRegistration();
    watchAndHighlightSaveButton(SELECTOR, 90000);

    document.body.innerHTML = `<button data-testid="upload-form-save-button">Ajouter</button>`;
    const newBtn = document.querySelector<HTMLButtonElement>(SELECTOR)!;

    fireClick(addSpy, true, newBtn);
    expect(newBtn.classList.contains("resellos-save-button-highlight")).toBe(false);
  });

  it("ignore un clic isTrusted:false (synthetique) sur le bouton -- le highlight reste actif", () => {
    const btn = makeButton();
    const { addSpy } = spyOnClickRegistration();
    watchAndHighlightSaveButton(SELECTOR, 90000);

    fireClick(addSpy, false, btn);
    expect(btn.classList.contains("resellos-save-button-highlight")).toBe(true);
  });

  it("ignore un clic isTrusted:true sur un AUTRE element -- le highlight reste actif", () => {
    document.body.innerHTML = `<button data-testid="upload-form-save-button">Ajouter</button><button id="other">Autre</button>`;
    const btn = document.querySelector<HTMLButtonElement>(SELECTOR)!;
    const other = document.getElementById("other")!;
    const { addSpy } = spyOnClickRegistration();
    watchAndHighlightSaveButton(SELECTOR, 90000);

    fireClick(addSpy, true, other);
    expect(btn.classList.contains("resellos-save-button-highlight")).toBe(true);
  });

  it("retire le highlight apres expiration du timeout, meme sans aucun clic", () => {
    vi.useFakeTimers();
    const btn = makeButton();
    watchAndHighlightSaveButton(SELECTOR, 5000);

    vi.advanceTimersByTime(5000);
    expect(btn.classList.contains("resellos-save-button-highlight")).toBe(false);
  });

  it("retire proprement le listener 'click' de document apres un clic reel (pas de fuite)", () => {
    const btn = makeButton();
    const { addSpy, removeSpy } = spyOnClickRegistration();
    watchAndHighlightSaveButton(SELECTOR, 90000);

    fireClick(addSpy, true, btn);

    const clickAdds = addSpy.mock.calls.filter((c) => c[0] === "click");
    const clickRemoves = removeSpy.mock.calls.filter((c) => c[0] === "click");
    expect(clickAdds).toHaveLength(1);
    expect(clickRemoves).toHaveLength(1);
    expect(clickRemoves[0][1]).toBe(clickAdds[0][1]);
  });

  it("retire proprement le listener 'click' de document apres le timeout (pas de fuite)", () => {
    vi.useFakeTimers();
    makeButton();
    const { addSpy, removeSpy } = spyOnClickRegistration();
    watchAndHighlightSaveButton(SELECTOR, 5000);

    vi.advanceTimersByTime(5000);

    const clickAdds = addSpy.mock.calls.filter((c) => c[0] === "click");
    const clickRemoves = removeSpy.mock.calls.filter((c) => c[0] === "click");
    expect(clickAdds).toHaveLength(1);
    expect(clickRemoves).toHaveLength(1);
    expect(clickRemoves[0][1]).toBe(clickAdds[0][1]);
  });

  it("ne fait rien si le bouton est introuvable des le depart -- aucun listener enregistre", () => {
    document.body.innerHTML = "";
    const { addSpy } = spyOnClickRegistration();
    watchAndHighlightSaveButton(SELECTOR, 90000);
    expect(addSpy.mock.calls.filter((c) => c[0] === "click")).toHaveLength(0);
  });

  // Contrainte explicite de la mission : AUCUN .click()/dispatchEvent("click")
  // ne doit jamais etre emis sur le bouton "Ajouter" -- le clic doit rester
  // un vrai clic humain, jamais simule. Espionne HTMLButtonElement.prototype.click
  // (jamais appele, meme indirectement via cleanup/highlight/timeout) sur
  // l'ensemble du cycle de vie : highlight -> clic humain detecte -> cleanup.
  it("n'appelle jamais .click() sur le bouton, du highlight jusqu'au nettoyage", () => {
    const btn = makeButton();
    const clickSpy = vi.spyOn(btn, "click");
    const { addSpy } = spyOnClickRegistration();

    watchAndHighlightSaveButton(SELECTOR, 90000);
    fireClick(addSpy, true, btn);

    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("la fonction de nettoyage retournee est idempotente -- un second appel (ex. timeout apres un clic deja traite) ne fait rien de plus", () => {
    vi.useFakeTimers();
    const btn = makeButton();
    const cleanup = watchAndHighlightSaveButton(SELECTOR, 5000);

    cleanup();
    expect(btn.classList.contains("resellos-save-button-highlight")).toBe(false);

    // N'explose pas et ne re-declenche rien d'observable.
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    cleanup();
  });
});
