import type { ActionDefinition } from '../types';

// Registre des actions reelles. VIDE en Phase 3 (aucune action n'ecrit
// encore sur Vinted) - Phase 3.1+ ajoutera un objet ActionDefinition par
// ActionKind ici (donnees pures : label, checks, buildPreview, execute?),
// jamais un nouveau fichier avec sa propre logique de cycle de vie (qui
// reste entierement dans src/lib/actions/engine.ts).
export const ACTION_DEFINITIONS: ActionDefinition[] = [];
