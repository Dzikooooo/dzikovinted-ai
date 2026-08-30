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

// Conseil photo granulaire (2026-08-30, retour utilisateur : "ajoute plus de
// photos" ne dit rien de concret). Suggere des ANGLES-TYPES adaptes a la
// categorie plutot qu'un texte generique -- volontairement jamais une
// pretention d'avoir analyse le contenu reel des photos deja presentes (on
// ne sait pas ce qu'elles montrent, seulement combien il y en a) : ce sont
// des suggestions de ce qui manque probablement, pas un diagnostic visuel
// invente (Human feel #7 du playbook design -- jamais un jugement de qualite
// invente sur un contenu jamais reellement analyse, meme discipline que
// l'ancien audit-listing/Pricer Pro).
function photoArchetypesForCategory(category: string | null): string[] {
  const c = (category ?? '').toLowerCase();
  if (/chauss|basket|sneaker|botte|sandale|talon/.test(c)) {
    return ['la paire vue de dessus', 'la semelle', 'les côtés (usure éventuelle)', "l'étiquette de pointure"];
  }
  if (/sac|pochette|sacoche|cabas/.test(c)) {
    return ["l'extérieur du sac", "l'intérieur (doublure, poches)", 'le fermoir et les finitions', "l'étiquette de marque"];
  }
  if (/bijou|montre|bague|collier|bracelet/.test(c)) {
    return ['une vue générale', 'un gros plan sur les détails/gravures', "l'étiquette ou le fermoir", 'un défaut éventuel'];
  }
  // Vetements : cas par defaut, le plus frequent du catalogue.
  return ['le devant', 'le dos', "l'étiquette de taille et composition", 'le logo ou un détail caractéristique'];
}

function noPhotoMessage(category: string | null): string {
  const archetypes = photoArchetypesForCategory(category);
  return `Ajoute au moins ${archetypes.length} photos — une annonce sans photo n'attire aucun acheteur : ${archetypes.join(', ')}.`;
}

function singlePhotoMessage(category: string | null): string {
  const archetypes = photoArchetypesForCategory(category);
  return `Une seule photo ne suffit pas — complète par exemple avec ${archetypes.join(', ')}.`;
}

// 'vendu' est hors perimetre (rien a corriger sur une vente deja conclue) --
// toutes les autres statuts (draft/en_attente/en_stock) sont evalues : la
// qualite d'une annonce compte des sa preparation, pas seulement une fois en
// ligne.
export function computeListingIssues(listing: Listing): ListingIssue[] {
  if (listing.status === 'vendu') return [];

  const issues: ListingIssue[] = [];

  const photoCount = listing.image_urls?.length ?? 0;
  if (photoCount === 0) {
    issues.push({ kind: 'no_photo', message: noPhotoMessage(listing.category) });
  } else if (photoCount === 1) {
    issues.push({ kind: 'single_photo', message: singlePhotoMessage(listing.category) });
  }

  const descriptionLength = listing.description?.trim().length ?? 0;
  if (descriptionLength < MIN_DESCRIPTION_LENGTH) {
    issues.push({
      kind: 'missing_description',
      message: 'Complète la description : état, matière et mesures donnent confiance aux acheteurs.',
    });
  }

  // Corrige un faux positif reel confirme en base (2026-08-30) : la synchro
  // en masse ("Synchroniser maintenant", extension/src/background/sync.ts)
  // ne scrape QUE la grille de resultats Vinted, qui n'expose jamais la
  // categorie/l'etat -- seule la fiche produit individuelle les montre. Pour
  // toute annonce DEJA PUBLIEE (vinted_item_id present), ces deux champs sont
  // donc structurellement absents de la base ResellOS meme quand l'annonce a
  // bel et bien une categorie/un etat sur Vinted -- ce n'est pas un defaut
  // corrigible par l'utilisateur (aucune action "ajouter la categorie" sur
  // une annonce deja en ligne), donc jamais signale ici. Uniquement verifie
  // pour une annonce JAMAIS publiee (brouillon/en attente sans
  // vinted_item_id), ou l'utilisateur peut reellement completer le champ
  // avant de publier.
  if (!listing.vinted_item_id && (!listing.category || !listing.condition)) {
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
