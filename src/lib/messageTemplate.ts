import { formatEUR } from './currency';
import type { Listing } from './types';

// N'a besoin que d'un sous-ensemble de Listing -- permet aux appelants de
// passer n'importe quelle forme compatible (ex. une projection Supabase
// partielle comme ListingOption dans CommunicationPage.tsx) sans cast.
export type TemplateListingSource = Pick<Listing, 'title' | 'price' | 'brand' | 'size' | 'category'>;

// Resolution de variables dans un modele de message (chantier
// Communication, reprise 2026-08-08) -- fonction PURE, aucun acces
// reseau/base ici. N'invente jamais une donnee absente : une variable dont
// la valeur reelle est null/vide reste affichee telle quelle (ex.
// "{marque}") plutot que d'etre remplacee par une chaine vide qui
// masquerait silencieusement l'absence de donnee a l'utilisateur avant
// qu'il n'envoie le message.

export const MESSAGE_TEMPLATE_VARIABLES = [
  { token: '{titre}', description: 'Titre de l\'annonce' },
  { token: '{prix}', description: 'Prix affiche (ex. "25 €")' },
  { token: '{marque}', description: 'Marque' },
  { token: '{taille}', description: 'Taille' },
  { token: '{categorie}', description: 'Categorie' },
] as const;

function resolveValue(token: string, listing: TemplateListingSource): string | null {
  switch (token) {
    case 'titre':
      return listing.title;
    case 'prix':
      return formatEUR(listing.price);
    case 'marque':
      return listing.brand;
    case 'taille':
      return listing.size;
    case 'categorie':
      return listing.category;
    default:
      return null;
  }
}

export function resolveMessageTemplate(body: string, listing: TemplateListingSource): string {
  return body.replace(/\{(\w+)\}/g, (match, token: string) => {
    const value = resolveValue(token, listing);
    return value !== null && value !== '' ? value : match;
  });
}
