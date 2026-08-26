import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Config separee de vite.config.ts plutot que fusionnee : le moteur
// d'intelligence metier est teste en fonctions pures (pas de JSX/DOM),
// aucun besoin du plugin React ni d'un environnement navigateur pour ces
// tests - evite aussi tout risque de regression sur la config dev/build
// existante. Environnement par defaut reste 'node' (rapide, majorite des
// 300+ tests existants) -- les rares tests de composant (*.test.tsx, ex.
// ListingCard.test.tsx) passent en jsdom via la pragma
// `// @vitest-environment jsdom` en tete de fichier, sans impacter les
// autres tests.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],

    // ================= FLAKINESS SOUS CHARGE (2026-08-26) =================
    // Symptome observe a repetition : des tests `userEvent` echouaient en
    // "Test timed out in 5000ms" sur le run complet, et passaient TOUS
    // isolement ou avec --no-file-parallelism. Ce ne sont donc pas des
    // regressions -- mais chaque occurrence imposait de rejouer les fichiers
    // un par un pour le prouver, et surtout habituait a classer un echec en
    // "bruit". C'est la vraie nuisance : un jour un echec reel serait passe
    // par pertes et profits.
    //
    // Deux causes cumulees, corrigees ensemble :
    //
    //   1. userEvent est intrinsequement LENT -- chaque interaction avance
    //      des timers et attend des mises a jour React. Un scenario de 4 ou
    //      5 clics depasse 5 s des que le CPU est partage, sans qu'aucun
    //      code applicatif ne soit en cause. 10 s laissent la marge
    //      necessaire sans masquer une vraie boucle infinie (qui, elle,
    //      n'aboutit jamais).
    testTimeout: 10000,
    hookTimeout: 10000,

    //   2. Vitest lance par defaut autant de workers que de coeurs (8 ici),
    //      chacun montant son propre environnement jsdom. Les fichiers de
    //      composants sont les plus lourds et se retrouvaient a se disputer
    //      le CPU entre eux. Plafonner a la moitie des coeurs supprime la
    //      contention tout en gardant le parallelisme -- le run sequentiel
    //      complet prenait ~119 s, contre ~40 s ici.
    poolOptions: {
      threads: { maxThreads: 4, minThreads: 1 },
      forks: { maxForks: 4, minForks: 1 },
    },
  },
});
