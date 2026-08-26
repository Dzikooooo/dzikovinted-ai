// Mission "ROUND DIAGNOSTIC MARQUE/COULEUR -- COMMIT REEL" (2026-08-19).
// Instrumentation TEMPORAIRE, purement OBSERVATIONNELLE -- aucun dispatch,
// aucun clic, aucun focus/blur ajoute, aucune falsification d'isTrusted.
// Contexte : preuve live autoritaire (corps exact du POST /api/v2/item_upload/
// items) -- brand_id/brand/color_ids restent null/[] malgre un DOM visuel
// correct (trigger affichant "Polo Ralph Lauren", aria-checked="true" sur la
// case Couleur). Hypothese en tete (voir l'audit) : la selection reste
// "provisoire" dans un widget local (recherche Marque encore focus, panneau
// Couleur ferme sans etape de confirmation explicite) jamais propagee a
// l'etat reel du formulaire -- contrairement a Etat/Taille, ou le MEME clic
// simple ferme le picker ET committe la valeur. Ce module capture, sur
// document et en phase CAPTURE, la sequence exacte d'evenements
// (pointerdown/mousedown/focusin/pointerup/mouseup/click/input/change/
// focusout) autour d'une selection Marque/Couleur -- pour comparer objective-
// ment une selection automatisee (A) a un clic humain reel (B) et identifier
// quel evenement, present dans l'un et absent de l'autre, correspond
// vraisemblablement au vrai commit manquant.
//
// ISOLATION (meme discipline que publishSyntheticClickPoc.ts/publishAutoSubmit.ts) :
//  - Point d'entree expose UNIQUEMENT sur `window`, derriere le meme gate
//    MODE !== "beta" (npm run build/dev l'exposent, npm run build:beta jamais).
//  - Rien n'est jamais declenche automatiquement -- appel manuel explicite
//    depuis la console DevTools (contexte content-script ISOLATED), jamais
//    depuis auto-submit/DELETE/package size/CAS/scheduler (aucun import
//    croise avec ces modules).
//  - Une seule capture active a la fois (recordingActive) -- un second appel
//    pendant une capture en cours est refuse et journalise, jamais empile.
//  - Fenetre bornee (windowMs, defaut 8000ms) : listeners retires et poll de
//    fermeture arrete automatiquement a l'expiration, jamais une capture qui
//    tourne indefiniment.

import { BRAND_DROPDOWN_CONTENT_SELECTOR, BRAND_DROPDOWN_TRIGGER_SELECTOR, BRAND_SEARCH_INPUT_FALLBACK_SELECTOR, BRAND_SEARCH_INPUT_SELECTOR, COLOR_DROPDOWN_TRIGGER_SELECTOR } from "./publishSelectors";
import { isVisible } from "./attributeDropdownDiagnostics";
import { describeActiveElement } from "./formFill";
import { readColorOptionCandidates } from "./colorOptionReader";

export type AttributeCommitFieldKind = "brand" | "color";

export interface AttributeCommitRecorderDeps {
  log: {
    info: (message: string, detail?: Record<string, unknown>) => void;
    warn: (message: string, detail?: Record<string, unknown>) => void;
  };
}

const EVENT_TYPES = ["pointerdown", "mousedown", "focusin", "pointerup", "mouseup", "click", "input", "change", "focusout"] as const;

// "Cell interactive" resultat de recherche Marque (BRAND_RESULT_CELL_SELECTOR,
// publishSelectors.ts) porte un `id` NON stable, jamais un data-testid --
// englobee via BRAND_DROPDOWN_CONTENT_SELECTOR (son conteneur) plutot que
// listee individuellement.
const BRAND_RELEVANT_SELECTORS = [BRAND_DROPDOWN_TRIGGER_SELECTOR, BRAND_SEARCH_INPUT_SELECTOR, BRAND_SEARCH_INPUT_FALLBACK_SELECTOR, BRAND_DROPDOWN_CONTENT_SELECTOR];
const COLOR_RELEVANT_SELECTORS = [COLOR_DROPDOWN_TRIGGER_SELECTOR, '[data-testid^="filter-grid-option-"]'];

function readInputValue(selector: string): string | null {
  const el = document.querySelector<HTMLInputElement>(selector);
  return el ? el.value : null;
}

function isBrandPickerVisible(): boolean {
  const content = document.querySelector<HTMLElement>(BRAND_DROPDOWN_CONTENT_SELECTOR);
  return !!content && isVisible(content);
}

function isPickerVisible(fieldKind: AttributeCommitFieldKind): boolean {
  return fieldKind === "brand" ? isBrandPickerVisible() : readColorOptionCandidates().length > 0;
}

function describeElementCompact(el: Element): string {
  const testId = el.getAttribute("data-testid");
  const role = el.getAttribute("role");
  let out = el.tagName.toLowerCase();
  if (el.id) out += `#${el.id}`;
  if (testId) out += `[data-testid="${testId}"]`;
  if (role) out += `[role="${role}"]`;
  return out;
}

// "composedPath utile" (demande explicite) -- uniquement les noeuds Element
// (jamais document/window/shadow-root), plafonne a 12 entrees, description
// compacte plutot qu'un dump complet.
function describeComposedPath(event: Event): string[] {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  return path
    .filter((node): node is Element => node instanceof Element)
    .slice(0, 12)
    .map(describeElementCompact);
}

function describeTarget(target: EventTarget | null): { tagName: string; dataTestId: string | null; role: string | null } | null {
  if (!(target instanceof Element)) return null;
  return { tagName: target.tagName, dataTestId: target.getAttribute("data-testid"), role: target.getAttribute("role") };
}

// Un evenement n'est journalise QUE s'il touche reellement le champ observe
// (trigger/recherche/panneau Marque, ou trigger/case Couleur) -- jamais tout
// evenement document-wide, qui noierait la sequence utile dans du bruit
// (scroll, autres champs, etc.). Re-interroge les selecteurs a CHAQUE
// evenement (composedPath() re-evalue), jamais une reference DOM figee.
function isRelevantEvent(event: Event, selectors: string[]): boolean {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
  return path.some((node) => {
    if (!(node instanceof Element)) return false;
    return selectors.some((selector) => {
      try {
        return node.matches(selector) || !!node.closest(selector);
      } catch {
        return false;
      }
    });
  });
}

interface AttributeCommitSnapshot {
  phase: "before_interaction" | "after_interaction" | "plus_200ms" | "after_picker_close";
  atMs: number;
  activeElement: string;
  pickerVisible: boolean;
  brandTriggerValue: string | null;
  brandSearchInputValue: string | null;
  colorTriggerValue: string | null;
  colorCandidates: Array<{ containerTestId: string; ariaChecked: string | null }> | null;
}

function takeSnapshot(fieldKind: AttributeCommitFieldKind, phase: AttributeCommitSnapshot["phase"], startedAt: number): AttributeCommitSnapshot {
  return {
    phase,
    atMs: Date.now() - startedAt,
    activeElement: describeActiveElement(),
    pickerVisible: isPickerVisible(fieldKind),
    brandTriggerValue: fieldKind === "brand" ? readInputValue(BRAND_DROPDOWN_TRIGGER_SELECTOR) : null,
    brandSearchInputValue: fieldKind === "brand" ? (readInputValue(BRAND_SEARCH_INPUT_SELECTOR) ?? readInputValue(BRAND_SEARCH_INPUT_FALLBACK_SELECTOR)) : null,
    colorTriggerValue: fieldKind === "color" ? readInputValue(COLOR_DROPDOWN_TRIGGER_SELECTOR) : null,
    colorCandidates:
      fieldKind === "color"
        ? readColorOptionCandidates().map((c) => ({ containerTestId: c.containerTestId, ariaChecked: c.container.getAttribute("aria-checked") }))
        : null,
  };
}

let recordingActive = false;

// Jamais appelee par un vrai flow -- reinitialisation entre tests uniquement.
export function resetAttributeCommitEventRecorderForTests(): void {
  recordingActive = false;
}

const DEFAULT_RECORDING_WINDOW_MS = 8000;
// Detection de fermeture du picker : poll LECTURE SEULE (jamais un nouvel
// effet de bord), largement plus fin que les fenetres d'observation visees.
const CLOSURE_POLL_INTERVAL_MS = 100;

export function recordAttributeCommitEvents(fieldKind: AttributeCommitFieldKind, deps: AttributeCommitRecorderDeps, windowMs: number = DEFAULT_RECORDING_WINDOW_MS): void {
  if (recordingActive) {
    deps.log.warn("ATTRIBUTE_COMMIT_RECORDING_ALREADY_ACTIVE", {
      reason: "une capture est deja en cours -- attends sa fin (ou son timeout) avant d'en lancer une nouvelle",
    });
    return;
  }
  recordingActive = true;

  const startedAt = Date.now();
  let seq = 0;
  let interactionSnapshotTaken = false;

  deps.log.info("ATTRIBUTE_COMMIT_RECORDING_STARTED", { fieldKind, windowMs });
  deps.log.info("ATTRIBUTE_COMMIT_SNAPSHOT", { ...takeSnapshot(fieldKind, "before_interaction", startedAt) });

  const relevantSelectors = fieldKind === "brand" ? BRAND_RELEVANT_SELECTORS : COLOR_RELEVANT_SELECTORS;
  const listeners: Array<{ type: string; fn: (e: Event) => void }> = [];

  function makeHandler(type: string): (e: Event) => void {
    return (event: Event) => {
      if (!isRelevantEvent(event, relevantSelectors)) return;
      seq += 1;
      const target = event.target;
      deps.log.info("ATTRIBUTE_COMMIT_EVENT_SEQUENCE", {
        fieldKind,
        seq,
        type,
        isTrusted: event.isTrusted,
        tMs: Date.now() - startedAt,
        target: describeTarget(target),
        composedPath: describeComposedPath(event),
        triggerValue: fieldKind === "brand" ? readInputValue(BRAND_DROPDOWN_TRIGGER_SELECTOR) : readInputValue(COLOR_DROPDOWN_TRIGGER_SELECTOR),
        ariaChecked: target instanceof Element ? target.getAttribute("aria-checked") : null,
        activeElement: describeActiveElement(),
      });

      // "juste apres interaction" -- ancre sur le PREMIER clic capture (la
      // selection elle-meme), qu'il soit synthetique (A) ou humain (B).
      if (type === "click" && !interactionSnapshotTaken) {
        interactionSnapshotTaken = true;
        deps.log.info("ATTRIBUTE_COMMIT_SNAPSHOT", { ...takeSnapshot(fieldKind, "after_interaction", startedAt) });
        setTimeout(() => {
          deps.log.info("ATTRIBUTE_COMMIT_SNAPSHOT", { ...takeSnapshot(fieldKind, "plus_200ms", startedAt) });
        }, 200);
      }
    };
  }

  for (const type of EVENT_TYPES) {
    const fn = makeHandler(type);
    document.addEventListener(type, fn, true);
    listeners.push({ type, fn });
  }

  let wasPickerVisible = isPickerVisible(fieldKind);
  let closureSnapshotTaken = false;
  const pollIntervalId = setInterval(() => {
    const nowVisible = isPickerVisible(fieldKind);
    if (wasPickerVisible && !nowVisible && !closureSnapshotTaken) {
      closureSnapshotTaken = true;
      deps.log.info("ATTRIBUTE_COMMIT_SNAPSHOT", { ...takeSnapshot(fieldKind, "after_picker_close", startedAt) });
    }
    wasPickerVisible = nowVisible;
  }, CLOSURE_POLL_INTERVAL_MS);

  setTimeout(() => {
    for (const { type, fn } of listeners) document.removeEventListener(type, fn, true);
    clearInterval(pollIntervalId);
    recordingActive = false;
    deps.log.info("ATTRIBUTE_COMMIT_RECORDING_STOPPED", { fieldKind, totalEvents: seq, durationMs: Date.now() - startedAt });
  }, windowMs);
}

// Point d'entree unique. `isEnabled` par defaut lit le mode Vite reel (meme
// discipline exacte que publishSyntheticClickPoc.ts) -- jamais expose dans
// npm run build:beta, expose dans npm run build/dev.
export function initAttributeCommitEventRecorder(deps: AttributeCommitRecorderDeps, isEnabled: boolean = import.meta.env.MODE !== "beta"): void {
  if (!isEnabled) return;
  (window as unknown as { __resellosRecordAttributeCommitEvents?: (fieldKind: AttributeCommitFieldKind, windowMs?: number) => void }).__resellosRecordAttributeCommitEvents =
    (fieldKind: AttributeCommitFieldKind, windowMs?: number) => recordAttributeCommitEvents(fieldKind, deps, windowMs);
}
