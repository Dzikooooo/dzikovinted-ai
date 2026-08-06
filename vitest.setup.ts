import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// @testing-library/react ne s'auto-enregistre pas aupres d'`afterEach` sans
// `test.globals: true` (non active ici, voir vitest.config.ts) -- sans ce
// cleanup explicite, chaque rendu de composant reste monte entre les tests
// d'un meme fichier .test.tsx, causant des matches DOM dupliques.
afterEach(() => {
  cleanup();
});
