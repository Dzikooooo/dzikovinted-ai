import { describe, expect, it } from 'vitest';
import {
  CARD_SETTLE_MAX_MS,
  CARD_SETTLE_POLL_MS,
  waitForCardsToSettle,
  type CardSettleDeps,
} from '../cardSettle';

// Ce module remplace un sommeil fixe de 4 s par une attente adaptative. Le
// risque n'est pas qu'il soit lent, c'est qu'il reparte TROP TOT et fasse
// scraper une page a moitie remplie -- une perte de donnees silencieuse, qui
// ne ressemblerait a rien d'autre qu'a "moins d'opportunites ce jour-la".
// Les tests verrouillent donc surtout les conditions de sortie.

/** Horloge simulee : chaque `wait(ms)` avance le temps de ms, rien ne dort. */
function makeDeps(counts: number[]): CardSettleDeps & { elapsed: () => number } {
  let clock = 0;
  let i = 0;
  return {
    countCards: async () => counts[Math.min(i++, counts.length - 1)],
    wait: async (ms: number) => {
      clock += ms;
    },
    now: () => clock,
    elapsed: () => clock,
  };
}

describe('waitForCardsToSettle -- sortie sur stabilisation', () => {
  it('repart des que le compte cesse d\'augmenter', async () => {
    const deps = makeDeps([40, 96, 96, 96]);
    const result = await waitForCardsToSettle(deps);

    expect(result.settled).toBe(true);
    expect(result.count).toBe(96);
  });

  it('exige DEUX mesures identiques : une accalmie entre deux vagues ne suffit pas', async () => {
    // 96, 96 ressemble a une stabilisation, mais la vague suivante monte a
    // 120. Avec un seul palier requis, on serait reparti avec 96 cartes.
    const deps = makeDeps([96, 96, 120, 144, 144, 144]);
    const result = await waitForCardsToSettle(deps);

    expect(result.settled).toBe(true);
    expect(result.count).toBe(144);
  });

  it('ne repart jamais plus tard que l\'ancien sommeil fixe de 4 s', async () => {
    const deps = makeDeps([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
    await waitForCardsToSettle(deps);

    expect(deps.elapsed()).toBeLessThanOrEqual(CARD_SETTLE_MAX_MS);
  });

  it('est nettement plus rapide que 4 s sur une page deja remplie', async () => {
    const deps = makeDeps([96, 96, 96]);
    await waitForCardsToSettle(deps);

    // ~800 ms au lieu de 4000 : c'est tout le gain du remplacement.
    expect(deps.elapsed()).toBeLessThan(CARD_SETTLE_MAX_MS / 2);
    expect(deps.elapsed()).toBe(CARD_SETTLE_POLL_MS * 2);
  });
});

describe('waitForCardsToSettle -- zero resultat', () => {
  it('ne conclut PAS a une page stabilisee tant que rien ne s\'affiche', async () => {
    // Zero repete n'est pas une stabilisation : c'est peut-etre une page qui
    // n'a simplement pas encore rendu. On attend le plafond, comme avant.
    const deps = makeDeps([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const result = await waitForCardsToSettle(deps);

    expect(result.settled).toBe(false);
    expect(result.count).toBe(0);
    expect(deps.elapsed()).toBeGreaterThanOrEqual(CARD_SETTLE_MAX_MS);
  });

  it('repart normalement si les cartes finissent par arriver', async () => {
    const deps = makeDeps([0, 0, 24, 48, 48, 48]);
    const result = await waitForCardsToSettle(deps);

    expect(result.settled).toBe(true);
    expect(result.count).toBe(48);
  });
});

describe('waitForCardsToSettle -- plafond', () => {
  it('rend le dernier compte connu quand la page grossit encore au plafond', async () => {
    const counts = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
    const deps = makeDeps(counts);
    const result = await waitForCardsToSettle(deps);

    expect(result.settled).toBe(false);
    expect(result.count).toBeGreaterThan(0);
  });

  it('interroge la page un nombre borne de fois', async () => {
    const deps = makeDeps(Array.from({ length: 50 }, (_, i) => i + 1));
    const result = await waitForCardsToSettle(deps);

    expect(result.polls).toBeLessThanOrEqual(CARD_SETTLE_MAX_MS / CARD_SETTLE_POLL_MS + 1);
  });
});
