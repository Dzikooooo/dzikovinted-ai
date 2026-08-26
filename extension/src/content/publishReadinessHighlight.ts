// Mission "ROUND READY UX" (2026-08-19) : une fois PUBLISH_READY_TO_SUBMIT
// declenche (readiness STABLE, voir publishReadiness.ts), rendre le clic
// humain final sur "Ajouter" quasi immediat -- jamais en le remplacant.
// Cause deja prouvee en direct (voir vinted-edit.ts, meme SAVE_BUTTON_SELECTOR
// "upload-form-save-button" que la creation) : un clic synthetique sur ce
// bouton precis n'a JAMAIS declenche la vraie requete de sauvegarde Vinted
// (route protegee par un service anti-bot, reponse portant
// "x-datadome: protected"). Ce module ne fait donc QUE deux choses,
// strictement DOM/cosmetiques : (1) scroller le bouton reel dans le viewport
// et lui appliquer un highlight visuel temporaire, (2) detecter -- jamais
// provoquer -- un vrai clic humain dessus pour retirer ce highlight. AUCUN
// .click()/dispatchEvent("click")/dispatchFullClick() n'existe nulle part
// dans ce fichier.

import { SAVE_BUTTON_SELECTOR } from "./publishSelectors";

const HIGHLIGHT_CLASS = "resellos-save-button-highlight";
const STYLE_ELEMENT_ID = "resellos-save-button-highlight-style";

// Idempotent -- verifie la presence du <style> avant d'en creer un second si
// applique plusieurs fois dans le meme document (un seul publish run par
// document en pratique, mais jamais suppose).
function ensureHighlightStyleInjected(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = `
    @keyframes resellos-save-button-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.65); }
      50% { box-shadow: 0 0 0 10px rgba(124, 58, 237, 0); }
    }
    .${HIGHLIGHT_CLASS} {
      animation: resellos-save-button-pulse 1.2s ease-in-out infinite !important;
      outline: 3px solid #7c3aed !important;
      outline-offset: 2px !important;
    }
  `;
  document.head.appendChild(style);
}

export interface HighlightSaveButtonOutcome {
  buttonFound: boolean;
}

// Purement DOM/cosmetique -- scrollIntoView + classe CSS, RIEN d'autre.
export function highlightSaveButton(selector: string = SAVE_BUTTON_SELECTOR): HighlightSaveButtonOutcome {
  const btn = document.querySelector<HTMLButtonElement>(selector);
  if (!btn) return { buttonFound: false };
  ensureHighlightStyleInjected();
  btn.scrollIntoView({ behavior: "smooth", block: "center" });
  btn.classList.add(HIGHLIGHT_CLASS);
  return { buttonFound: true };
}

export function clearSaveButtonHighlight(selector: string = SAVE_BUTTON_SELECTOR): void {
  document.querySelector<HTMLButtonElement>(selector)?.classList.remove(HIGHLIGHT_CLASS);
}

// Duree apres laquelle le highlight est retire meme sans clic ni navigation
// -- evite qu'il reste actif indefiniment si l'utilisateur s'est simplement
// absente. Valeur arbitraire mais genereuse (bien plus longue que le temps
// de reaction attendu), jamais dimensionnee sur une preuve live : purement
// pour eviter un etat visuel qui persiste sans fin.
export const SAVE_BUTTON_HIGHLIGHT_TIMEOUT_MS = 5 * 60 * 1000;

// Met en evidence le bouton "Ajouter" puis retire ce highlight des que l'un
// de ces evenements survient en premier :
//  (1) un vrai clic humain (isTrusted:true) sur ce bouton -- listener
//      document-level en phase capture, MEME pattern deja valide pour la
//      confirmation de suppression (voir waitForTrustedClick dans
//      vinted-item.ts) : re-resout l'element FRAICHEMENT a chaque clic
//      plutot qu'une reference figee, pour survivre a un re-render Vinted
//      entre le highlight et le clic ;
//  (2) une navigation reelle qui detruit ce document -- le listener et le
//      timer disparaissent avec le document, aucun nettoyage explicite
//      necessaire ;
//  (3) l'expiration de SAVE_BUTTON_HIGHLIGHT_TIMEOUT_MS.
// Retourne une fonction de nettoyage forcee (utile pour les tests -- jamais
// appelee par le flow reel, qui est fire-and-forget).
export function watchAndHighlightSaveButton(
  selector: string = SAVE_BUTTON_SELECTOR,
  timeoutMs: number = SAVE_BUTTON_HIGHLIGHT_TIMEOUT_MS
): () => void {
  const outcome = highlightSaveButton(selector);
  if (!outcome.buttonFound) {
    return () => {};
  }

  let settled = false;

  function cleanup(): void {
    if (settled) return;
    settled = true;
    document.removeEventListener("click", onClick, true);
    clearTimeout(timer);
    clearSaveButtonHighlight(selector);
  }

  function onClick(e: MouseEvent): void {
    if (!e.isTrusted || settled) return;
    const current = document.querySelector<HTMLButtonElement>(selector);
    const target = e.target as Node | null;
    if (!current || !target || !current.contains(target)) return;
    cleanup();
  }

  const timer = setTimeout(cleanup, timeoutMs);
  document.addEventListener("click", onClick, true);

  return cleanup;
}
