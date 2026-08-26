import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initAttributeCommitEventRecorder,
  recordAttributeCommitEvents,
  resetAttributeCommitEventRecorderForTests,
  type AttributeCommitFieldKind,
  type AttributeCommitRecorderDeps,
} from "../attributeCommitEventRecorder";

// Mission "ROUND DIAGNOSTIC MARQUE/COULEUR -- COMMIT REEL" (2026-08-19) :
// instrumentation temporaire, purement observationnelle -- ces tests couvrent
// exactement les garanties demandees : jamais auto-declenche, une seule
// capture active a la fois, filtrage aux evenements pertinents uniquement,
// snapshots aux 4 phases demandees, jamais de dispatch/isTrusted falsifie
// (ce module n'appelle jamais dispatchEvent/.click() nulle part).

function markVisible(el: HTMLElement): void {
  Object.defineProperty(el, "offsetParent", { get: () => document.body, configurable: true });
}

function makeDeps(): {
  deps: AttributeCommitRecorderDeps;
  infoLogs: Array<{ message: string; detail?: Record<string, unknown> }>;
  warnLogs: Array<{ message: string; detail?: Record<string, unknown> }>;
} {
  const infoLogs: Array<{ message: string; detail?: Record<string, unknown> }> = [];
  const warnLogs: Array<{ message: string; detail?: Record<string, unknown> }> = [];
  const deps: AttributeCommitRecorderDeps = {
    log: {
      info: (message, detail) => infoLogs.push({ message, detail }),
      warn: (message, detail) => warnLogs.push({ message, detail }),
    },
  };
  return { deps, infoLogs, warnLogs };
}

function getTrigger(): ((fieldKind: AttributeCommitFieldKind, windowMs?: number) => void) | undefined {
  return (window as unknown as { __resellosRecordAttributeCommitEvents?: (fieldKind: AttributeCommitFieldKind, windowMs?: number) => void })
    .__resellosRecordAttributeCommitEvents;
}

function clearTrigger(): void {
  delete (window as unknown as { __resellosRecordAttributeCommitEvents?: unknown }).__resellosRecordAttributeCommitEvents;
}

beforeEach(() => {
  document.body.innerHTML = "";
  resetAttributeCommitEventRecorderForTests();
});

afterEach(() => {
  document.body.innerHTML = "";
  clearTrigger();
  resetAttributeCommitEventRecorderForTests();
  vi.useRealTimers();
});

describe("initAttributeCommitEventRecorder -- exposition window (meme discipline que le POC)", () => {
  it("n'expose rien quand isEnabled est faux (build beta)", () => {
    initAttributeCommitEventRecorder(makeDeps().deps, false);
    expect(getTrigger()).toBeUndefined();
  });

  it("expose window.__resellosRecordAttributeCommitEvents quand isEnabled est vrai", () => {
    initAttributeCommitEventRecorder(makeDeps().deps, true);
    expect(typeof getTrigger()).toBe("function");
  });
});

describe("recordAttributeCommitEvents -- snapshot before_interaction", () => {
  it("logue RECORDING_STARTED puis un snapshot before_interaction immediatement, pour Marque", () => {
    document.body.innerHTML = `<input data-testid="brand-select-dropdown-input" value="" /><input id="brand-search-input" value="" />`;
    const { deps, infoLogs } = makeDeps();
    vi.useFakeTimers();
    recordAttributeCommitEvents("brand", deps, 1000);

    expect(infoLogs[0].message).toBe("ATTRIBUTE_COMMIT_RECORDING_STARTED");
    const snapshot = infoLogs.find((l) => l.message === "ATTRIBUTE_COMMIT_SNAPSHOT");
    expect(snapshot?.detail).toMatchObject({ phase: "before_interaction", brandTriggerValue: "", brandSearchInputValue: "" });

    vi.advanceTimersByTime(1000);
  });

  it("capture aria-checked/candidats pour Couleur dans le snapshot", () => {
    const option = document.createElement("div");
    option.setAttribute("data-testid", "filter-grid-option-9");
    option.setAttribute("role", "checkbox");
    option.setAttribute("aria-checked", "true");
    option.textContent = "Bleu";
    markVisible(option);
    document.body.appendChild(option);
    const trigger = document.createElement("input");
    trigger.setAttribute("data-testid", "color-select-dropdown-input");
    trigger.value = "Bleu";
    document.body.appendChild(trigger);

    const { deps, infoLogs } = makeDeps();
    vi.useFakeTimers();
    recordAttributeCommitEvents("color", deps, 1000);

    const snapshot = infoLogs.find((l) => l.message === "ATTRIBUTE_COMMIT_SNAPSHOT");
    expect(snapshot?.detail).toMatchObject({
      phase: "before_interaction",
      colorTriggerValue: "Bleu",
      colorCandidates: [{ containerTestId: "filter-grid-option-9", ariaChecked: "true" }],
    });

    vi.advanceTimersByTime(1000);
  });
});

describe("recordAttributeCommitEvents -- capture d'evenements pertinents uniquement", () => {
  it("capture un click isTrusted:false sur le trigger Marque avec target/composedPath corrects", () => {
    const trigger = document.createElement("input");
    trigger.setAttribute("data-testid", "brand-select-dropdown-input");
    document.body.appendChild(trigger);
    const { deps, infoLogs } = makeDeps();
    vi.useFakeTimers();
    recordAttributeCommitEvents("brand", deps, 1000);

    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const eventLog = infoLogs.find((l) => l.message === "ATTRIBUTE_COMMIT_EVENT_SEQUENCE");
    expect(eventLog).toBeDefined();
    expect(eventLog?.detail).toMatchObject({
      fieldKind: "brand",
      seq: 1,
      type: "click",
      isTrusted: false,
      target: { tagName: "INPUT", dataTestId: "brand-select-dropdown-input", role: null },
    });
    expect((eventLog?.detail?.composedPath as string[]).length).toBeGreaterThan(0);

    vi.advanceTimersByTime(1000);
  });

  it("ignore un evenement sur un element sans rapport avec le champ observe", () => {
    document.body.innerHTML = `<button id="unrelated">x</button>`;
    const { deps, infoLogs } = makeDeps();
    vi.useFakeTimers();
    recordAttributeCommitEvents("brand", deps, 1000);

    document.getElementById("unrelated")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(infoLogs.find((l) => l.message === "ATTRIBUTE_COMMIT_EVENT_SEQUENCE")).toBeUndefined();

    vi.advanceTimersByTime(1000);
  });

  it("capture un evenement a l'interieur du panneau resultat Marque (contenu, pas seulement le trigger)", () => {
    document.body.innerHTML = `<div data-testid="brand-select-dropdown-content"><button role="button" aria-label="Polo Ralph Lauren">Polo Ralph Lauren</button></div>`;
    const { deps, infoLogs } = makeDeps();
    vi.useFakeTimers();
    recordAttributeCommitEvents("brand", deps, 1000);

    document.querySelector('[role="button"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const eventLog = infoLogs.find((l) => l.message === "ATTRIBUTE_COMMIT_EVENT_SEQUENCE");
    expect(eventLog?.detail).toMatchObject({ type: "click", target: { tagName: "BUTTON", dataTestId: null, role: "button" } });

    vi.advanceTimersByTime(1000);
  });

  it("capture un click sur une case filter-grid-option-9 avec aria-checked observe", () => {
    const el = document.createElement("div");
    el.setAttribute("data-testid", "filter-grid-option-9");
    el.setAttribute("role", "checkbox");
    el.setAttribute("aria-checked", "false");
    document.body.appendChild(el);
    const { deps, infoLogs } = makeDeps();
    vi.useFakeTimers();
    recordAttributeCommitEvents("color", deps, 1000);

    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const eventLog = infoLogs.find((l) => l.message === "ATTRIBUTE_COMMIT_EVENT_SEQUENCE");
    expect(eventLog?.detail).toMatchObject({
      ariaChecked: "false",
      target: { tagName: "DIV", dataTestId: "filter-grid-option-9", role: "checkbox" },
    });

    vi.advanceTimersByTime(1000);
  });

  it("numerote seq en ordre chronologique croissant sur plusieurs evenements pertinents", () => {
    const trigger = document.createElement("input");
    trigger.setAttribute("data-testid", "color-select-dropdown-input");
    document.body.appendChild(trigger);
    const { deps, infoLogs } = makeDeps();
    vi.useFakeTimers();
    recordAttributeCommitEvents("color", deps, 1000);

    trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const events = infoLogs.filter((l) => l.message === "ATTRIBUTE_COMMIT_EVENT_SEQUENCE");
    expect(events.map((l) => l.detail?.type)).toEqual(["pointerdown", "mousedown", "click"]);
    expect(events.map((l) => l.detail?.seq)).toEqual([1, 2, 3]);

    vi.advanceTimersByTime(1000);
  });
});

describe("recordAttributeCommitEvents -- snapshots ancres sur le premier clic", () => {
  it("prend un snapshot after_interaction juste apres le PREMIER click, puis plus_200ms 200ms plus tard -- jamais un second after_interaction", () => {
    const trigger = document.createElement("input");
    trigger.setAttribute("data-testid", "brand-select-dropdown-input");
    document.body.appendChild(trigger);
    const { deps, infoLogs } = makeDeps();
    vi.useFakeTimers();
    recordAttributeCommitEvents("brand", deps, 2000);

    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(infoLogs.filter((l) => l.message === "ATTRIBUTE_COMMIT_SNAPSHOT" && l.detail?.phase === "after_interaction")).toHaveLength(1);

    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(infoLogs.filter((l) => l.message === "ATTRIBUTE_COMMIT_SNAPSHOT" && l.detail?.phase === "after_interaction")).toHaveLength(1);

    expect(infoLogs.filter((l) => l.message === "ATTRIBUTE_COMMIT_SNAPSHOT" && l.detail?.phase === "plus_200ms")).toHaveLength(0);
    vi.advanceTimersByTime(200);
    expect(infoLogs.filter((l) => l.message === "ATTRIBUTE_COMMIT_SNAPSHOT" && l.detail?.phase === "plus_200ms")).toHaveLength(1);

    vi.advanceTimersByTime(2000);
  });
});

describe("recordAttributeCommitEvents -- detection de fermeture du picker", () => {
  it("logue un snapshot after_picker_close des que le panneau Marque disparait du DOM, une seule fois", () => {
    const content = document.createElement("div");
    content.setAttribute("data-testid", "brand-select-dropdown-content");
    markVisible(content);
    document.body.appendChild(content);
    const { deps, infoLogs } = makeDeps();
    vi.useFakeTimers();
    recordAttributeCommitEvents("brand", deps, 2000);

    expect(infoLogs.some((l) => l.message === "ATTRIBUTE_COMMIT_SNAPSHOT" && l.detail?.phase === "after_picker_close")).toBe(false);

    content.remove();
    vi.advanceTimersByTime(100);

    expect(infoLogs.filter((l) => l.message === "ATTRIBUTE_COMMIT_SNAPSHOT" && l.detail?.phase === "after_picker_close")).toHaveLength(1);

    vi.advanceTimersByTime(1900);
    expect(infoLogs.filter((l) => l.message === "ATTRIBUTE_COMMIT_SNAPSHOT" && l.detail?.phase === "after_picker_close")).toHaveLength(1);
  });

  it("ne logue jamais after_picker_close si le picker Couleur reste ouvert toute la fenetre", () => {
    const option = document.createElement("div");
    option.setAttribute("data-testid", "filter-grid-option-9");
    option.setAttribute("role", "checkbox");
    option.setAttribute("aria-checked", "false");
    option.textContent = "Bleu";
    markVisible(option);
    document.body.appendChild(option);
    const { deps, infoLogs } = makeDeps();
    vi.useFakeTimers();
    recordAttributeCommitEvents("color", deps, 1000);

    vi.advanceTimersByTime(1000);
    expect(infoLogs.some((l) => l.message === "ATTRIBUTE_COMMIT_SNAPSHOT" && l.detail?.phase === "after_picker_close")).toBe(false);
  });
});

describe("recordAttributeCommitEvents -- fin de fenetre et non-chevauchement", () => {
  it("retire les listeners et logue RECORDING_STOPPED a l'expiration de windowMs", () => {
    const trigger = document.createElement("input");
    trigger.setAttribute("data-testid", "brand-select-dropdown-input");
    document.body.appendChild(trigger);
    const { deps, infoLogs } = makeDeps();
    vi.useFakeTimers();
    recordAttributeCommitEvents("brand", deps, 500);

    vi.advanceTimersByTime(500);
    expect(infoLogs.some((l) => l.message === "ATTRIBUTE_COMMIT_RECORDING_STOPPED")).toBe(true);

    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(infoLogs.filter((l) => l.message === "ATTRIBUTE_COMMIT_EVENT_SEQUENCE")).toHaveLength(0);
  });

  it("refuse une seconde capture pendant qu'une premiere est active, jamais empilee", () => {
    const { deps, warnLogs } = makeDeps();
    vi.useFakeTimers();
    recordAttributeCommitEvents("brand", deps, 5000);
    recordAttributeCommitEvents("color", deps, 5000);

    expect(warnLogs.some((l) => l.message === "ATTRIBUTE_COMMIT_RECORDING_ALREADY_ACTIVE")).toBe(true);

    vi.advanceTimersByTime(5000);
  });

  it("autorise une nouvelle capture une fois la precedente terminee", () => {
    const { deps, infoLogs } = makeDeps();
    vi.useFakeTimers();
    recordAttributeCommitEvents("brand", deps, 500);
    vi.advanceTimersByTime(500);

    recordAttributeCommitEvents("color", deps, 500);
    expect(infoLogs.filter((l) => l.message === "ATTRIBUTE_COMMIT_RECORDING_STARTED")).toHaveLength(2);

    vi.advanceTimersByTime(500);
  });
});
