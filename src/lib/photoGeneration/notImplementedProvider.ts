import type { PhotoGenerationProvider } from './types';

// Seul provider enregistre pour l'instant. Leve une erreur claire et
// honnete plutot qu'un faux succes ou un silence -- si un jour un appelant
// invoque generate() avant qu'un vrai provider soit branche, l'echec doit
// etre comprehensible, pas mysterieux.
export const notImplementedProvider: PhotoGenerationProvider = {
  async generate() {
    throw new Error("La génération photo IA n'est pas encore disponible.");
  },
};
