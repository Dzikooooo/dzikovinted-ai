import { publishListingDefinition } from './publishListing';
import type { ActionDefinition } from '../types';

// Registre des actions reelles. Un objet ActionDefinition par ActionKind
// (donnees pures : label, checks, buildPreview, execute?), jamais un
// nouveau fichier avec sa propre logique de cycle de vie (qui reste
// entierement dans src/lib/actions/engine.ts). publish_listing (Phase 3.1)
// est la premiere entree reelle - les actions futures (republication,
// offres...) s'ajoutent ici de la meme façon.
export const ACTION_DEFINITIONS: ActionDefinition[] = [publishListingDefinition as ActionDefinition];
