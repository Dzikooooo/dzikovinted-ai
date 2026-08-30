import type { Listing } from './types';

// "Casier visuel" Mes annonces (2026-08-30) : detection PUREMENT
// deterministe des defauts structurels/SEO d'une annonce -- jamais devinee
// par une IA (meme discipline que src/lib/insights/, marketEngine.ts...).
// Volontairement DISTINCT du Decision Engine (src/lib/insights/
// recommendations.ts, baisser_prix/considerer_republication/revoir_annonce) :
// cet axe-ci mesure la COMPLETUDE/qualite de l'annonce elle-meme (photos,
// description, categorisation), l'autre mesure sa PERFORMANCE commerciale
// (vues/favoris relatifs au compte) -- deux questions differentes, jamais
// fusionnees dans une seule regle. `needs_republish`/l'age en stock restent
// du seul ressort du Decision Engine (deja couverts par
// considerer_republication) pour ne jamais dupliquer le meme signal a deux
// endroits distincts de l'interface.
//
// Meme logique reprise cote serveur dans supabase/functions/audit-account/
// stats.ts (duplication deliberee, frontiere Vite/Deno -- voir marketEngine.ts
// pour la meme convention) : les compteurs de l'audit de compte et les
// contours colores des cartes mesurent donc TOUJOURS la meme chose, sans
// jamais avoir besoin d'etat partage ou de cache -- la "synchronisation"
// vient de la logique identique, jamais d'une valeur stockee qui pourrait
// perimer.

export type ListingIssueKind =
  | 'no_photo'
  | 'single_photo'
  | 'missing_description'
  | 'missing_category_or_condition'
  | 'sync_failed';

export interface ListingIssue {
  kind: ListingIssueKind;
  message: string;
}

const MIN_DESCRIPTION_LENGTH = 20;

// 'vendu' est hors perimetre (rien a corriger sur une vente deja conclue) --
// toutes les autres statuts (draft/en_attente/en_stock) sont evalues : la
// qualite d'une annonce compte des sa preparation, pas seulement une fois en
// ligne.
export function computeListingIssues(listing: Listing): ListingIssue[] {
  if (listing.status === 'vendu') return [];

  const issues: ListingIssue[] = [];

  const photoCount = listing.image_urls?.length ?? 0;
  if (photoCount === 0) {
    issues.push({
      kind: 'no_photo',
      message: "Ajoute au moins une photo — une annonce sans photo n'attire aucun acheteur.",
    });
  } else if (photoCount === 1) {
    issues.push({
      kind: 'single_photo',
      message: 'Ajoute plus de photos (une seule aujourd\'hui) pour rassurer les acheteurs.',
    });
  }

  const descriptionLength = listing.description?.trim().length ?? 0;
  if (descriptionLength < MIN_DESCRIPTION_LENGTH) {
    issues.push({
      kind: 'missing_description',
      message: 'Complète la description : état, matière et mesures donnent confiance aux acheteurs.',
    });
  }

  if (!listing.category || !listing.condition) {
    issues.push({
      kind: 'missing_category_or_condition',
      message: 'Catégorie ou état manquant sur cette annonce.',
    });
  }

  // Un echec de synchro ne concerne que le stock deja publie (une annonce en
  // brouillon/en attente n'a jamais ete poussee vers Vinted).
  if (listing.status === 'en_stock' && listing.vinted_sync_status === 'sync_failed') {
    issues.push({
      kind: 'sync_failed',
      message: "Une modification précédente a échoué — vérifie l'annonce sur Vinted.",
    });
  }

  return issues;
}

export type QualityTone = 'quality-ok' | 'quality-warning' | 'quality-critical';

// Vert (0 defaut) / violet (1 seul point, reste sur l'accent de marque -- un
// simple point d'attention, pas une alerte) / rouge (plusieurs points a
// corriger) -- seuils explicitement demandes.
export function qualityToneForIssues(issues: ListingIssue[]): QualityTone {
  if (issues.length === 0) return 'quality-ok';
  if (issues.length === 1) return 'quality-warning';
  return 'quality-critical';
}

// Message unique a afficher sous la lampe Copilote : le premier defaut
// detecte, plus un compteur honnete du reste plutot que de les enumerer tous
// (l'espace d'une carte ne le permet pas) -- jamais un texte generique type
// "Annonce à vérifier" qui ne dit rien de precis.
export function describeListingIssues(issues: ListingIssue[]): string | null {
  if (issues.length === 0) return null;
  const [first, ...rest] = issues;
  return rest.length > 0 ? `${first.message} (+${rest.length} autre${rest.length > 1 ? 's' : ''} point${rest.length > 1 ? 's' : ''})` : first.message;
}
