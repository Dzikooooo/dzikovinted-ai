import { describe, expect, it, vi } from "vitest";
import { evaluatePhotoImportOutcome, importPhotosWithVerification, type PhotoImportDeps } from "../photoImportVerification";

// Mission "FIABILISER L'IMPORT PHOTOS AVANT DE CONTINUER LES TESTS
// PUBLICATION/SUPPRESSION" (2026-08-17) : bug live reproductible -- 5/5
// photos un jour, 1/5 le lendemain sur la MEME annonce source, sans jamais
// empecher la suite du flow (readiness) de continuer. Ces tests couvrent le
// minimum explicitement demande : 5/5 directement, 1/5 puis 5/5 apres
// attente, import partiel persistant, zero photo, absence de doublons lors
// d'un retry, et l'invariant central (confirmedCount === expectedCount
// strictement).
//
// `countDomThumbnails` est scripte via une file de valeurs (une par appel) --
// modelise fidelement l'implementation reelle (vinted-publish.ts), qui relit
// le DOM a chaque appel plutot que de garder un etat en memoire.

type FakeFile = { name: string };

function makeFiles(count: number): FakeFile[] {
  return Array.from({ length: count }, (_, i) => ({ name: `photo-${i}.jpg` }));
}

function makeDeps(domCountSequence: number[]): PhotoImportDeps<FakeFile> & {
  injectFilesCalls: FakeFile[][];
  events: Record<string, unknown[]>;
} {
  const queue = [...domCountSequence];
  const injectFilesCalls: FakeFile[][] = [];
  const events: Record<string, unknown[]> = {
    expected: [],
    attempt: [],
    domCount: [],
    retry: [],
    confirmed: [],
    failed: [],
  };

  return {
    injectFilesCalls,
    events,
    // Une fois la file epuisee, repete la DERNIERE valeur (etat DOM stable).
    countDomThumbnails: () => (queue.length > 1 ? queue.shift()! : queue[0]),
    injectFiles: vi.fn((files: FakeFile[]) => {
      injectFilesCalls.push(files);
      return Promise.resolve();
    }),
    waitForDomCountOrTimeout: () => Promise.resolve(),
    wait: () => Promise.resolve(),
    onExpected: (detail) => events.expected.push(detail),
    onAttempt: (detail) => events.attempt.push(detail),
    onDomCount: (detail) => events.domCount.push(detail),
    onRetry: (detail) => events.retry.push(detail),
    onConfirmed: (outcome) => events.confirmed.push(outcome),
    onFailed: (outcome) => events.failed.push(outcome),
  };
}

describe("evaluatePhotoImportOutcome", () => {
  it("exige une egalite stricte -- ni moins, ni plus que prevu", () => {
    expect(evaluatePhotoImportOutcome(5, 5)).toEqual({ status: "confirmed", confirmedCount: 5, expectedCount: 5 });
    expect(evaluatePhotoImportOutcome(1, 5)).toMatchObject({ status: "failed", confirmedCount: 1, expectedCount: 5 });
    // Plus de vignettes que prevu (contamination/doublon) est TOUT AUSSI
    // invalide -- jamais un succes accidentel.
    expect(evaluatePhotoImportOutcome(7, 5)).toMatchObject({ status: "failed", confirmedCount: 7, expectedCount: 5 });
  });
});

describe("importPhotosWithVerification", () => {
  it("5/5 directement -- confirme des la premiere tentative, une seule injection", async () => {
    const files = makeFiles(5);
    const deps = makeDeps([0, 5]); // baseline avant injection, puis apres
    const outcome = await importPhotosWithVerification(files, 5, deps);

    expect(outcome).toEqual({ status: "confirmed", confirmedCount: 5, expectedCount: 5 });
    expect(deps.injectFilesCalls).toEqual([files]);
    expect(deps.events.attempt).toHaveLength(1);
    expect(deps.events.retry).toHaveLength(0);
    expect(deps.events.confirmed).toEqual([{ status: "confirmed", confirmedCount: 5, expectedCount: 5 }]);
  });

  it("1/5 puis 5/5 apres attente -- confirme au 2e essai, TOUJOURS une seule injection (aucune reinjection)", async () => {
    const files = makeFiles(5);
    // baseline(0) -> attempt1(1, encore en cours de traitement Vinted) -> attempt2(5, termine)
    const deps = makeDeps([0, 1, 5]);
    const outcome = await importPhotosWithVerification(files, 5, deps);

    expect(outcome).toEqual({ status: "confirmed", confirmedCount: 5, expectedCount: 5 });
    // Assertion centrale "absence de doublons lors d'un retry" : un SEUL
    // appel d'injection sur toute la sequence, quel que soit le nombre de
    // re-verifications -- la seconde tentative ne fait que RE-LIRE le DOM,
    // jamais reassigner les fichiers une seconde fois.
    expect(deps.injectFilesCalls).toHaveLength(1);
    expect(deps.events.attempt).toHaveLength(2);
    expect(deps.events.retry).toEqual([{ attempt: 1, expectedCount: 5, confirmedCount: 1, nextAttempt: 2 }]);
    expect(deps.events.confirmed).toHaveLength(1);
  });

  it("import partiel persistant -- echoue proprement apres epuisement des tentatives, toujours une seule injection", async () => {
    const files = makeFiles(5);
    // Plateau a 2 sur toute la sequence (baseline + 3 tentatives).
    const deps = makeDeps([0, 2, 2, 2]);
    const outcome = await importPhotosWithVerification(files, 5, deps, { maxAttempts: 3 });

    expect(outcome).toEqual({ status: "failed", confirmedCount: 2, expectedCount: 5 });
    expect(deps.injectFilesCalls).toHaveLength(1);
    expect(deps.events.attempt).toHaveLength(3);
    expect(deps.events.retry).toHaveLength(2); // entre 1->2 et 2->3, jamais apres la derniere
    expect(deps.events.failed).toEqual([{ status: "failed", confirmedCount: 2, expectedCount: 5 }]);
    expect(deps.events.confirmed).toHaveLength(0);
  });

  it("zero photo -- confirme trivialement (0 attendu === 0 present), aucune injection tentee", async () => {
    const deps = makeDeps([0]);
    const outcome = await importPhotosWithVerification([], 0, deps);

    expect(outcome).toEqual({ status: "confirmed", confirmedCount: 0, expectedCount: 0 });
    expect(deps.injectFilesCalls).toHaveLength(0);
  });

  it("interdiction absolue : confirmedCount < expectedCount ne doit JAMAIS produire status:'confirmed'", async () => {
    const files = makeFiles(5);
    const deps = makeDeps([0, 4, 4, 4]);
    const outcome = await importPhotosWithVerification(files, 5, deps, { maxAttempts: 3 });

    expect(outcome.status).not.toBe("confirmed");
    expect(outcome.confirmedCount).toBeLessThan(outcome.expectedCount);
  });

  it("refuse d'injecter si la grille n'est pas vide avant meme la premiere tentative (etat inattendu, jamais devine)", async () => {
    const files = makeFiles(5);
    const deps = makeDeps([3]); // deja 3 vignettes presentes avant tout envoi
    const outcome = await importPhotosWithVerification(files, 5, deps);

    expect(outcome).toEqual({ status: "failed", confirmedCount: 3, expectedCount: 5, reason: "grid_not_empty_before_injection" });
    expect(deps.injectFilesCalls).toHaveLength(0);
    expect(deps.events.failed).toHaveLength(1);
  });

  it("une injection qui echoue avant meme d'assigner un fichier (input introuvable) ne casse jamais le flow -- se resout en echec propre", async () => {
    const files = makeFiles(5);
    const deps = makeDeps([0, 0, 0]);
    deps.injectFiles = vi.fn(() => Promise.reject(new Error("input introuvable")));

    const outcome = await importPhotosWithVerification(files, 5, deps, { maxAttempts: 2 });

    expect(outcome).toEqual({ status: "failed", confirmedCount: 0, expectedCount: 5 });
  });
});
