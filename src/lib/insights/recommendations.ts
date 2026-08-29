import type { Listing } from '../types';
import type { EngineContext, ListingRecommendationResult, Recommendation } from './types';
import {
  DORMANT_LISTING_DAYS,
  PRICE_ENGAGEMENT_RATIO_THRESHOLD,
  REVIEW_VIEWS_RATIO_THRESHOLD,
  REVIEW_MAX_FAVOURITES,
  REPUBLISH_AFTER_DAYS,
} from './constants';
import { daysSince } from './math';
import { getSyncFreshnessTier, hasSufficientSample } from './dataSufficiency';
import { hasRecentRepublishAttempt, hasRecentPriceChange } from './actionCooldown';

// Decision Engine Lot 1 (2026-08-05) -- 4 recommandations "actives" + 1 etat
// neutre (attendre) + 2 etats explicites de non-recommandation
// (donnees_insuffisantes/recommandation_differee), arbitres par une chaine
// deterministe unique (computeListingRecommendation). Voir LOT1_SPEC.md pour
// la justification complete de chaque regle et de l'ordre d'evaluation.

// -----------------------------------------------------------------------
// Regle 1 : verifier_annonce -- verification structurelle (photos/catégorie/
// etat/echec de synchro), independante de la fraicheur de synchro (un champ
// vide reste vide quel que soit l'age de la derniere synchro). Toujours
// evaluee en premier dans la chaine d'arbitrage.
// -----------------------------------------------------------------------
function evaluateVerifierAnnonce(listing: Listing): ListingRecommendationResult | null {
  if (!listing.vinted_item_id || !listing.vinted_url) return null; // jamais publiee -- rien a "ouvrir" sur Vinted
  if (listing.status !== 'en_stock') return null;

  // Priorite : echec de synchro (le plus actionnable) > photo manquante >
  // categorie/etat manquant -- une seule cause affichee a la fois.
  let reason: string | null = null;
  if (listing.vinted_sync_status === 'sync_failed') {
    reason = "Une modification précédente a échoué — vérifie l'annonce sur Vinted.";
  } else if (listing.image_urls.length === 0) {
    reason = "Cette annonce n'a aucune photo sur Vinted.";
  } else if (!listing.category || !listing.condition) {
    reason = 'Catégorie ou état manquant sur cette annonce.';
  }
  if (!reason) return null;

  return {
    status: 'action',
    kind: 'verifier_annonce',
    confidence: 'haute',
    message: 'Annonce à vérifier',
    reason,
    cta: { type: 'open_vinted' },
    listingId: listing.id,
  };
}

// -----------------------------------------------------------------------
// Regle 2 : considerer_republication -- DEUX chemins distincts, jamais sur
// l'age seul (contrainte explicite) :
//   A. statut Vinted reel indique que l'annonce n'est plus/mal visible
//      (hidden/deleted = signal net, confiance haute ; unknown = signal
//      ambigu, confiance standard, degrade en donnees_insuffisantes si la
//      synchro n'est pas totalement fraiche -- voir l'orchestrateur).
//   B. dormance totale : en ligne depuis longtemps (DORMANT_LISTING_DAYS)
//      ET zero vue ET zero favori -- jamais "juste vieille" sans ca.
// -----------------------------------------------------------------------
interface RepublicationMatch {
  path: 'A' | 'B';
  confidence: 'haute' | 'standard';
  reasonText: string;
}

function matchConsidererRepublication(listing: Listing, ctx: EngineContext): RepublicationMatch | null {
  if (!listing.vinted_item_id) return null; // jamais publiee -- hors perimetre (ce n'est pas une republication)
  if (listing.status !== 'en_stock') return null;

  if (listing.vinted_status === 'hidden' || listing.vinted_status === 'deleted') {
    return {
      path: 'A',
      confidence: 'haute',
      reasonText: `Cette annonce n'est plus visible sur Vinted (statut : ${listing.vinted_status}) — la republier redonnerait de la visibilité.`,
    };
  }

  if (listing.vinted_status === 'unknown') {
    return {
      path: 'A',
      confidence: 'standard',
      reasonText:
        "Le statut réel de cette annonce sur Vinted n'a pas pu être déterminé lors de la dernière synchronisation — vérifie-la avant d'envisager une republication.",
    };
  }

  if (listing.vinted_status === 'online') {
    if (listing.views === null || listing.favourites === null) return null;
    const age = daysSince(listing.created_at, ctx.now);
    const noEngagement = listing.views === 0 && listing.favourites === 0;
    if (age >= DORMANT_LISTING_DAYS && noEngagement) {
      return {
        path: 'B',
        confidence: 'standard',
        reasonText: `Cette annonce est en ligne depuis ${Math.round(age)} jours sans aucune vue — une republication pourrait relancer sa visibilité.`,
      };
    }
  }

  return null;
}

// Corrige le 2026-08-29 (positionnement "bouclier anti-bannissement") :
// l'ancien texte presentait la republication en un clic comme une
// fonctionnalite manquante ("pas encore disponible") -- alors qu'elle
// existe reellement (cta: {type: 'open_vinted'} ci-dessous declenche le
// vrai flux assiste, voir PublishConfirmationModal.tsx). Reformule en
// instruction positive, coherente avec le reste du produit.
const REPUBLICATION_DISCLAIMER =
  ' Republie-la en un clic depuis ResellOS — c\'est toujours toi qui valides sur Vinted, jamais un robot.';

// -----------------------------------------------------------------------
// Regle 3 : baisser_prix -- jamais sur l'age seul, jamais si vues/favoris
// sont a zero absolu (domaine exclusif de considerer_republication), jamais
// sans un prix affiche valide (defense en profondeur -- ce Lot 1 ne compare
// jamais a un prix de marche externe, la couverture Watchlist etant trop
// faible pour la beta, voir DECISION_ENGINE_MVP.md §2 -- "prix marche" n'est
// donc pas une donnee de ce lot).
// -----------------------------------------------------------------------
function matchBaisserPrix(listing: Listing, ctx: EngineContext): { reasonText: string } | null {
  if (listing.vinted_status !== 'online') return null;
  if (!listing.price || listing.price <= 0) return null;
  if (listing.views === null || listing.favourites === null) return null;
  if (listing.views === 0 && listing.favourites === 0) return null; // -> considerer_republication, pas ici
  if (ctx.activeMedianViews === null || ctx.activeMedianFavourites === null) return null;
  if (ctx.activeMedianViews === 0 || ctx.activeMedianFavourites === 0) return null;

  const age = daysSince(listing.created_at, ctx.now);
  if (age < REPUBLISH_AFTER_DAYS) return null;

  if (listing.views > ctx.activeMedianViews * PRICE_ENGAGEMENT_RATIO_THRESHOLD) return null;
  if (listing.favourites > ctx.activeMedianFavourites * PRICE_ENGAGEMENT_RATIO_THRESHOLD) return null;

  return {
    // P0 (audit du 2026-08-05) : ce texte ne doit jamais pretendre connaitre
    // le marche -- la seule donnee reelle ici est la comparaison a la
    // mediane du COMPTE de l'utilisateur (voir commentaire de regle
    // ci-dessus). Toute formulation type "au-dessus du marche" serait une
    // donnee inventee, jamais mesuree par ce Lot 1.
    reasonText: `Peu de vues et de favoris après ${Math.round(age)} jours en ligne (${listing.views} vues, ${listing.favourites} favoris, pour une moyenne de ${Math.round(ctx.activeMedianViews)} sur ton compte) — nettement en retrait par rapport à tes autres annonces actives, une baisse de prix pourrait relancer l'intérêt.`,
  };
}

// -----------------------------------------------------------------------
// Regle 4 : revoir_annonce -- signal ambigu (vues hautes, favoris bas),
// jamais presente avec une confiance haute puisque la cause reste inconnue.
// -----------------------------------------------------------------------
function matchRevoirAnnonce(listing: Listing, ctx: EngineContext): { reasonText: string } | null {
  if (listing.vinted_status !== 'online') return null;
  if (listing.views === null || listing.favourites === null) return null;
  if (ctx.activeMedianViews === null || ctx.activeMedianViews === 0) return null;
  if (listing.views < ctx.activeMedianViews * REVIEW_VIEWS_RATIO_THRESHOLD) return null;
  if (listing.favourites > REVIEW_MAX_FAVOURITES) return null;

  return {
    reasonText: `Beaucoup de vues (${listing.views}) mais peu de favoris (${listing.favourites}) — quelque chose freine peut-être la conversion (prix, photos, description). Le moteur ne peut pas identifier la cause précise.`,
  };
}

// Construit le resultat 'action'/'recommandation_differee' pour un match de
// considerer_republication -- factorise pour etre appele depuis les deux
// points de la chaine d'arbitrage qui peuvent produire cette recommandation
// (etape 0.5 hidden/deleted prioritaire, et etape 3 pour le reste), sans
// dupliquer la construction du texte/CTA.
function buildRepublicationResult(
  listing: Listing,
  ctx: EngineContext,
  match: RepublicationMatch
): ListingRecommendationResult {
  if (hasRecentRepublishAttempt(listing.id, ctx)) {
    return {
      status: 'recommandation_differee',
      kind: 'considerer_republication',
      reason: 'Une republication a déjà été tentée récemment sur cette annonce.',
      listingId: listing.id,
    };
  }
  return {
    status: 'action',
    kind: 'considerer_republication',
    confidence: match.confidence,
    message: 'Republication à envisager',
    reason: match.reasonText + REPUBLICATION_DISCLAIMER,
    cta: { type: 'open_vinted' },
    listingId: listing.id,
  };
}

// -----------------------------------------------------------------------
// Chaine d'arbitrage -- codee explicitement comme une suite d'etapes
// ordonnees et commentees (demande explicite : l'ordre de priorite doit
// etre lisible et teste en tant que tel, jamais deduit implicitement d'un
// enchainement de if disperses). Une seule sortie par annonce, jamais
// d'empilement de plusieurs recommandations.
// -----------------------------------------------------------------------
export function computeListingRecommendation(listing: Listing, ctx: EngineContext): ListingRecommendationResult | null {
  // Etape 0 : hors champ (brouillon jamais publie, annonce deja vendue) --
  // aucun resultat produit du tout, pas meme "attendre".
  if (listing.status !== 'en_stock') return null;

  const freshness = getSyncFreshnessTier(listing, ctx.now);
  const republicationMatch = matchConsidererRepublication(listing, ctx);

  // Etape 0.5 (P0, audit du 2026-08-05) : un statut hidden/deleted est un
  // signal fort et immediat (invisibilite totale sur le marketplace) --
  // prioritaire sur la verification structurelle (etape 1). Sans cette
  // priorite, une annonce cachee/supprimee mais avec aussi un defaut
  // structurel (photo/categorie manquante) restait bloquee indefiniment sur
  // "verifie cette annonce", qui ne se corrige jamais tout seul : ces
  // champs structurels ne sont PAS rafraichis par la synchro passive une
  // fois l'annonce deja liee (voir sync.ts, seul price/vinted_status/
  // favourites/views/synced_at/vinted_url sont reecrits). Uniquement si la
  // synchro n'est pas perimee -- au-dela, comportement inchange (etape 2 :
  // "donnees insuffisantes" generique, y compris pour hidden/deleted).
  if (
    freshness !== 'perimee' &&
    republicationMatch?.path === 'A' &&
    (listing.vinted_status === 'hidden' || listing.vinted_status === 'deleted')
  ) {
    return buildRepublicationResult(listing, ctx, republicationMatch);
  }

  // Etape 1 : verification structurelle, independante de la fraicheur de
  // synchro (mais desormais dominee par l'etape 0.5 ci-dessus pour
  // hidden/deleted).
  const structural = evaluateVerifierAnnonce(listing);
  if (structural) return structural;

  // Etape 2 : fraicheur globale des donnees d'engagement (vinted_status/
  // vues/favoris). Perimee (> 48h) = aucune recommandation d'engagement
  // possible, quelle que soit la severite apparente du signal brut.
  if (freshness === 'perimee') {
    return {
      status: 'donnees_insuffisantes',
      reason: 'Dernière synchronisation trop ancienne (plus de 48h) pour évaluer cette annonce de façon fiable.',
      listingId: listing.id,
    };
  }

  // Etape 3 : republication restante (chemin A "unknown", chemin B
  // dormance totale) -- le chemin A hidden/deleted a deja ete traite a
  // l'etape 0.5 ci-dessus et ne peut plus atteindre ce bloc.
  if (republicationMatch) {
    // Statut 'unknown' + synchro pas totalement fraiche (>=24h) : signal deja
    // ambigu en soi, aggrave par une donnee pas toute recente -- basculer sur
    // "donnees insuffisantes" plutot qu'une recommandation a confiance
    // standard (garde-fou explicite de la validation utilisateur).
    if (listing.vinted_status === 'unknown' && freshness !== 'fraiche') {
      return {
        status: 'donnees_insuffisantes',
        reason: "Le statut Vinted de cette annonce est incertain et la dernière synchronisation n'est plus toute récente.",
        listingId: listing.id,
      };
    }

    return buildRepublicationResult(listing, ctx, republicationMatch);
  }

  // Etape 4 : echantillon suffisant pour les comparaisons relatives --
  // baisser_prix/revoir_annonce en dependent, considerer_republication non
  // (deja evaluee et ecartee a l'etape 3).
  if (!hasSufficientSample(ctx)) {
    return {
      status: 'donnees_insuffisantes',
      reason: "Pas assez d'annonces actives sur ce compte pour comparer de façon fiable (minimum 3).",
      listingId: listing.id,
    };
  }

  // Etape 5 : baisse de prix.
  const priceMatch = matchBaisserPrix(listing, ctx);
  if (priceMatch) {
    if (hasRecentPriceChange(listing.id, ctx)) {
      return {
        status: 'recommandation_differee',
        kind: 'baisser_prix',
        reason: 'Le prix de cette annonce a déjà été modifié récemment.',
        listingId: listing.id,
      };
    }
    return {
      status: 'action',
      kind: 'baisser_prix',
      confidence: freshness === 'fraiche' ? 'haute' : 'standard',
      message: 'Baisse de prix conseillée',
      reason: priceMatch.reasonText,
      cta: { type: 'edit_listing', field: 'price' },
      listingId: listing.id,
    };
  }

  // Etape 6 : signal ambigu (vues hautes, favoris bas).
  const reviewMatch = matchRevoirAnnonce(listing, ctx);
  if (reviewMatch) {
    return {
      status: 'action',
      kind: 'revoir_annonce',
      confidence: 'standard',
      message: 'Annonce à revoir',
      reason: reviewMatch.reasonText,
      cta: { type: 'edit_listing', field: null },
      listingId: listing.id,
    };
  }

  // Etape 7 : rien a signaler -- on a verifie avec des donnees suffisantes
  // et fraiches, aucune regle ne matche.
  return {
    status: 'attendre',
    message: "Cette annonce n'a besoin de rien pour l'instant.",
    listingId: listing.id,
  };
}

// Etat complet par annonce (les 4 statuts possibles), pour l'affichage
// explicite de "attendre"/"donnees_insuffisantes"/"recommandation_differee"
// dans l'interface (voir ListingsManagementSection.tsx). N'inclut que les
// annonces status='en_stock' (les autres ne produisent aucun etat, cf.
// etape 0 ci-dessus).
export function computeListingStates(ctx: EngineContext): Map<string, ListingRecommendationResult> {
  const states = new Map<string, ListingRecommendationResult>();
  for (const listing of ctx.listings) {
    const result = computeListingRecommendation(listing, ctx);
    if (result) states.set(listing.id, result);
  }
  return states;
}

// Sous-ensemble filtre (status='action' uniquement) sous la forme historique
// `Recommendation[]`, pour compatibilite descendante avec dominantSignal.ts
// et tout consommateur existant qui attend un tableau plat de
// recommandations actives.
export function computeRecommendations(ctx: EngineContext): Recommendation[] {
  const results: Recommendation[] = [];
  for (const listing of ctx.listings) {
    const result = computeListingRecommendation(listing, ctx);
    if (result && result.status === 'action') {
      results.push({
        listingId: result.listingId,
        kind: result.kind,
        message: result.message,
        reason: result.reason,
        confidence: result.confidence,
      });
    }
  }
  return results;
}

// -----------------------------------------------------------------------
// HORS PERIMETRE MVP (Lot 1, 2026-08-05) -- decision explicite de
// l'utilisateur : desactivee du moteur et de l'interface, code CONSERVE
// (pas supprime brutalement) le temps d'une reevaluation apres la beta.
// Plus jamais appelee par computeListingRecommendation/computeRecommendations
// ci-dessus -- aucune valeur 'raise_price' ne peut donc plus etre produite.
// Verifie par grep avant ce lot : aucun appelant en dehors de ce fichier et
// de ses propres tests. Type de retour volontairement DISJOINT de
// `Recommendation` (RecommendationKind ne contient plus 'raise_price') pour
// que le systeme de types lui-meme empeche toute reconnexion accidentelle.
// Candidate a suppression definitive ou a reintegration reflechie apres la
// beta -- jamais reintroduite dans la chaine d'arbitrage sans decision
// explicite.
// -----------------------------------------------------------------------
export interface DisabledRaisePriceRecommendation {
  listingId: string;
  kind: 'raise_price';
  message: string;
  reason: string;
}

export function ruleRaisePriceUndervalued(listing: Listing, ctx: EngineContext): DisabledRaisePriceRecommendation | null {
  if (listing.vinted_status !== 'online') return null;
  if (listing.views === null || listing.favourites === null) return null;
  if (ctx.activeMedianViews === null || ctx.activeMedianFavourites === null) return null;
  if (ctx.activeMedianViews === 0 || ctx.activeMedianFavourites === 0) return null;
  const strongDemand =
    listing.views >= ctx.activeMedianViews * 2 && listing.favourites >= ctx.activeMedianFavourites * 2;
  if (!strongDemand) return null;
  return {
    listingId: listing.id,
    kind: 'raise_price',
    message: 'Prix augmentable sans risque',
    reason: `${listing.views} vues et ${listing.favourites} favoris, nettement au-dessus de la moyenne — cette annonce est probablement sous-évaluée.`,
  };
}
