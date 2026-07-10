import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom (Phase 3.1) : les tests de content/domWait.ts et content/
    // vinted-publish.ts manipulent le DOM (MutationObserver, document).
    // Superset de 'node' - les tests background/ existants (aucun besoin
    // de DOM) continuent de passer sans changement.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
