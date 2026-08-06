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
  },
});
