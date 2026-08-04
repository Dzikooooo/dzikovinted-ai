import { publishListingDefinition } from './publishListing';
import { editListingDefinition } from './editListing';
import { republishListingDefinition } from './republishListing';
import { scanMarketDefinition } from './scanMarket';
import type { ActionDefinition } from '../types';

// Registre des actions reelles. Un objet ActionDefinition par ActionKind
// (donnees pures : label, checks, buildPreview, execute?), jamais un
// nouveau fichier avec sa propre logique de cycle de vie (qui reste
// entierement dans src/lib/actions/engine.ts).
export const ACTION_DEFINITIONS: ActionDefinition[] = [
  publishListingDefinition as ActionDefinition,
  editListingDefinition as ActionDefinition,
  republishListingDefinition as ActionDefinition,
  scanMarketDefinition as ActionDefinition,
];
