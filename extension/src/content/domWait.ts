// Utilitaires d'attente sur le DOM pour la Phase 3.1 (publication) - jamais
// de delai arbitraire (setTimeout fixe), toujours un MutationObserver qui
// resout des que la condition reelle est remplie. Premiere utilisation de
// MutationObserver dans ce projet (le flux 1.2/1.3 existant utilise un
// polling setTimeout plus simple, waitAndDetect() dans vinted-profile.ts,
// laisse tel quel - ce nouveau flux a des conditions plus variees : presence
// d'un element, disparition, comptage de vignettes, etat disabled...).

export interface WaitOptions {
  timeoutMs?: number;
  root?: Element | Document;
}

const DEFAULT_TIMEOUT_MS = 8000;

export class WaitTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaitTimeoutError";
  }
}

export function waitForElement<T extends Element = Element>(
  selector: string,
  options: WaitOptions = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, root = document } = options;

  return new Promise((resolve, reject) => {
    const existing = root.querySelector<T>(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observeTarget = root instanceof Document ? root.body : root;
    const observer = new MutationObserver(() => {
      const found = root.querySelector<T>(selector);
      if (found) {
        cleanup();
        resolve(found);
      }
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(new WaitTimeoutError(`waitForElement: délai dépassé (${timeoutMs}ms) pour "${selector}"`));
    }, timeoutMs);

    function cleanup() {
      observer.disconnect();
      clearTimeout(timer);
    }

    observer.observe(observeTarget, { childList: true, subtree: true, attributes: true });
  });
}

// Attend qu'un predicat arbitraire devienne vrai (ex. "le bouton n'est plus
// disabled", "il y a N vignettes dans la grille") - re-evalue a chaque
// mutation du sous-arbre plutot qu'a intervalle fixe.
export function waitForCondition(predicate: () => boolean, options: WaitOptions = {}): Promise<void> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, root = document } = options;

  return new Promise((resolve, reject) => {
    if (predicate()) {
      resolve();
      return;
    }

    const observeTarget = root instanceof Document ? root.body : root;
    const observer = new MutationObserver(() => {
      if (predicate()) {
        cleanup();
        resolve();
      }
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(new WaitTimeoutError(`waitForCondition: délai dépassé (${timeoutMs}ms)`));
    }, timeoutMs);

    function cleanup() {
      observer.disconnect();
      clearTimeout(timer);
    }

    observer.observe(observeTarget, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  });
}
