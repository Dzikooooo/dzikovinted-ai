// Logique d'OUVERTURE du dropdown Marque, extraite de vinted-publish.ts pour
// rester testable en isolation -- meme discipline que categoryMatch.ts/
// categoryOptionReader.ts/conditionOptionReader.ts (vinted-publish.ts porte
// des effets de bord au niveau du module qui empechent de l'importer tel
// quel dans un test unitaire sans mock global de `chrome`). Le logger est
// INJECTE (jamais importe directement depuis background/logger.ts, qui
// depend de chrome.storage.local) pour permettre un test avec un simple
// stub, sans mock chrome.
//
// Mission "ROBUSTESSE OUVERTURE MARQUE" (2026-08-16) : diagnostic live isole
// (script jetable, jamais integre au code produit) a prouve deux choses --
// 1) BRAND_DROPDOWN_TRIGGER_SELECTOR EST une cible d'ouverture valide,
//    dispatchFullClick() dessus ouvre reellement le panneau (content +
//    #brand-search-input apparus) quand teste en isolation quelques instants
//    apres l'echec du flow automatise ; 2) le chevron n'est PAS la bonne
//    cible (un premier test l'avait laisse penser a tort -- il fermait en
//    realite un panneau deja ouvert par le trigger, jamais rouvert depuis :
//    contentPresentBefore etait deja true).
// L'echec observe dans le flow automatise (0 contenu pendant 20s) sur un
// clic pourtant identique, sur le meme trigger, qui reussit juste apres en
// isolation, ne peut donc s'expliquer que par un etat TRANSITOIRE cote
// Vinted au moment precis du clic (re-render en cours juste apres la
// selection Categorie/Etat/Taille) -- jamais un mauvais selecteur ni un
// mauvais element cible.
//
// Plutot que d'attendre un unique clic jusqu'a 20s (le comportement en
// echec observe), retente un nombre BORNE de fois : chaque tentative
// re-interroge le trigger FRAIS depuis document (jamais une reference
// conservee entre tentatives), verifie qu'il est reellement connecte/
// visible, clique, puis attend BRIEVEMENT (condition DOM reelle via
// waitForCondition, jamais un setTimeout utilise comme preuve) une preuve
// positive -- content OU #brand-search-input, les deux etant valables selon
// la structure DOM deja confirmee (le search input est monte A L'INTERIEUR
// du content une fois ouvert, donc l'un implique normalement l'autre).

import { isVisible } from "./attributeDropdownDiagnostics";
import { dispatchFullClick } from "./formFill";
import { waitForCondition } from "./domWait";

export const BRAND_OPEN_MAX_ATTEMPTS = 3;
export const BRAND_OPEN_ATTEMPT_TIMEOUT_MS = 4000;

export interface BrandDropdownOpenLogger {
  info: (message: string, detail?: Record<string, unknown>) => void;
  warn: (message: string, detail?: Record<string, unknown>) => void;
}

export interface OpenBrandDropdownOptions {
  triggerSelector: string;
  contentSelector: string;
  searchInputSelector: string;
  log: BrandDropdownOpenLogger;
  // Overrides reserves aux tests (bornes courtes) -- le code produit utilise
  // toujours les constantes par defaut ci-dessus.
  maxAttempts?: number;
  attemptTimeoutMs?: number;
}

// Retourne le conteneur content reellement ouvert (preuve positive), ou
// null si TOUTES les tentatives ont echoue -- jamais un element invente,
// jamais une boucle non bornee.
export async function openBrandDropdownWithRetry(options: OpenBrandDropdownOptions): Promise<HTMLElement | null> {
  const {
    triggerSelector,
    contentSelector,
    searchInputSelector,
    log,
    maxAttempts = BRAND_OPEN_MAX_ATTEMPTS,
    attemptTimeoutMs = BRAND_OPEN_ATTEMPT_TIMEOUT_MS,
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Re-interroge TOUJOURS depuis document, jamais une reference figee
    // d'une tentative precedente -- Vinted peut avoir remplace ce noeud
    // lors d'un re-render entre deux tentatives.
    const trigger = document.querySelector<HTMLElement>(triggerSelector);
    const triggerConnected = !!trigger && trigger.isConnected && isVisible(trigger);
    const triggerValue = trigger && "value" in trigger ? String((trigger as HTMLInputElement).value ?? "") : null;
    const contentBefore = !!document.querySelector(contentSelector);
    const searchBefore = !!document.querySelector(searchInputSelector);
    log.info("BRAND_OPEN_ATTEMPT", { attempt, triggerConnected, triggerValue, contentBefore, searchBefore });

    if (!trigger || !triggerConnected) {
      log.warn("BRAND_OPEN_RESULT", {
        attempt,
        contentAfter: false,
        searchAfter: false,
        success: false,
        reason: "trigger_absent_or_not_visible",
      });
      continue;
    }

    dispatchFullClick(trigger);

    try {
      await waitForCondition(
        () => !!document.querySelector(contentSelector) || !!document.querySelector(searchInputSelector),
        {
          timeoutMs: attemptTimeoutMs,
          description: `brand dropdown content or search input appears (attempt ${attempt}/${maxAttempts})`,
        }
      );
    } catch {
      log.warn("BRAND_OPEN_RESULT", {
        attempt,
        contentAfter: !!document.querySelector(contentSelector),
        searchAfter: !!document.querySelector(searchInputSelector),
        success: false,
      });
      continue;
    }

    const content = document.querySelector<HTMLElement>(contentSelector);
    const searchAfter = !!document.querySelector(searchInputSelector);
    log.info("BRAND_OPEN_RESULT", { attempt, contentAfter: !!content, searchAfter, success: !!content });
    if (content) return content;
    // Cas limite jamais observe en direct (searchInput apparu sans content,
    // alors que le search input est structurellement A L'INTERIEUR de
    // content) -- n'invente pas un contenu absent, retente plutot que
    // d'echouer aveuglement sur cette seule tentative.
  }
  return null;
}
