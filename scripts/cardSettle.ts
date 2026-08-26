// Attente adaptative du remplissage d'une page catalogue Vinted (2026-08-26).
//
// REMPLACE un `page.waitForTimeout(4000)` fixe. gotoWithRetry() n'attend que
// la PREMIERE carte d'annonce ; les suivantes arrivent en plusieurs vagues,
// d'ou le sommeil qui suivait. Mais 4 s etaient payees meme quand la page
// avait fini de se remplir en 800 ms -- 48 pages par scan (24 recherches x 2
// pages), soit 3 min 12 s d'attente pure.
//
// GARANTIE A NE PAS CASSER : ce module ne doit jamais rendre la main plus
// tard que l'ancien sommeil, ni sur une page encore en train de se remplir.
// D'ou le plafond identique (4 s) et l'exigence de deux mesures consecutives
// identiques avant de repartir -- une seule suffirait a repartir pendant une
// accalmie entre deux vagues.
//
// Extrait de vinted-scan.ts pour etre testable sans Playwright : le module ne
// connait qu'un compteur et une fonction d'attente, pas un navigateur.

export const CARD_SETTLE_POLL_MS = 400;
export const CARD_SETTLE_STABLE_POLLS = 2;
export const CARD_SETTLE_MAX_MS = 4000;

export interface CardSettleDeps {
  /** Nombre de cartes d'annonces actuellement dans le DOM. */
  countCards: () => Promise<number>;
  wait: (ms: number) => Promise<void>;
  now: () => number;
}

export interface CardSettleResult {
  /** Nombre de cartes a la derniere mesure. */
  count: number;
  /** true si on est reparti sur stabilisation, false si on a atteint le plafond. */
  settled: boolean;
  polls: number;
}

export async function waitForCardsToSettle(deps: CardSettleDeps): Promise<CardSettleResult> {
  const started = deps.now();
  let previous = -1;
  let stable = 0;
  let polls = 0;

  while (deps.now() - started < CARD_SETTLE_MAX_MS) {
    const count = await deps.countCards();
    polls++;

    // `count > 0` : une page a 0 resultat REEL n'est pas "stabilisee a 0",
    // elle attend jusqu'au plafond. Repartir tout de suite ferait conclure a
    // zero resultat alors que rien n'a encore eu le temps de s'afficher --
    // meme prudence que le catch() du waitForSelector de gotoWithRetry.
    if (count > 0 && count === previous) {
      stable++;
      if (stable >= CARD_SETTLE_STABLE_POLLS) return { count, settled: true, polls };
    } else {
      stable = 0;
    }

    previous = count;
    await deps.wait(CARD_SETTLE_POLL_MS);
  }

  return { count: Math.max(previous, 0), settled: false, polls };
}
