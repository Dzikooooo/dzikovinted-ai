import { defineConfig } from 'vitest/config';

// Config separee de vite.config.ts plutot que fusionnee : le moteur
// d'intelligence metier est teste en fonctions pures (pas de JSX/DOM),
// aucun besoin du plugin React ni d'un environnement navigateur pour ces
// tests - evite aussi tout risque de regression sur la config dev/build
// existante.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
