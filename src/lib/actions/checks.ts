import type { ActionCheck } from './types';

export const checkAuthenticated: ActionCheck = (ctx) => {
  if (!ctx.userId) {
    return { ok: false, failure: { code: 'not_authenticated', message: 'Vous devez être connecté.' } };
  }
  return { ok: true };
};

export const checkExtensionConnected: ActionCheck = (_ctx, deps) => {
  if (!deps.extensionConnected) {
    return {
      ok: false,
      failure: { code: 'extension_not_connected', message: "L'extension ResellOS n'est pas connectée." },
    };
  }
  return { ok: true };
};

export const checkAccountSelected: ActionCheck = (ctx, deps) => {
  if (!ctx.vintedAccountId || !deps.selectedAccount || deps.selectedAccount.id !== ctx.vintedAccountId) {
    return {
      ok: false,
      failure: { code: 'account_mismatch', message: 'Aucun compte Vinted correspondant sélectionné.' },
    };
  }
  return { ok: true };
};

export const checkListingLoaded: ActionCheck = (_ctx, deps) => {
  if (!deps.targetListing) {
    return { ok: false, failure: { code: 'listing_not_found', message: "L'annonce ciblée est introuvable." } };
  }
  return { ok: true };
};

export const checkListingOwnership: ActionCheck = (ctx, deps) => {
  if (!deps.targetListing || deps.targetListing.vinted_account_id !== ctx.vintedAccountId) {
    return {
      ok: false,
      failure: {
        code: 'listing_account_mismatch',
        message: "Cette annonce n'appartient pas au compte Vinted sélectionné.",
      },
    };
  }
  return { ok: true };
};

export const checkListingHasPhotos: ActionCheck = (_ctx, deps) => {
  if (!deps.targetListing || deps.targetListing.image_urls.length === 0) {
    return { ok: false, failure: { code: 'no_photos', message: "L'annonce n'a aucune photo." } };
  }
  return { ok: true };
};

export const checkListingNotAlreadyPublished: ActionCheck = (_ctx, deps) => {
  if (deps.targetListing?.vinted_item_id) {
    return {
      ok: false,
      failure: { code: 'already_published', message: 'Cette annonce est déjà publiée sur Vinted.' },
    };
  }
  return { ok: true };
};

// Symetrique de checkListingNotAlreadyPublished -- edit_listing ne modifie
// que des annonces DEJA liees a Vinted (rien a "editer" sur une annonce qui
// n'existe pas encore la-bas, c'est le role de publish_listing).
export const checkListingAlreadyPublished: ActionCheck = (_ctx, deps) => {
  if (!deps.targetListing?.vinted_item_id) {
    return {
      ok: false,
      failure: { code: 'not_published_yet', message: "Cette annonce n'est pas encore publiée sur Vinted." },
    };
  }
  return { ok: true };
};

// Republication V2 (audit P1, 2026-08-10) -- BUG LIVE reel confirme : cette
// fonction s'appelait checkListingNeedsRepublish et bloquait avec
// "Cette annonce est deja en ligne sur Vinted." (code already_live) des que
// needsRepublish() (listingStatus.ts) rendait false, c'est-a-dire des qu'une
// annonce etait genuinement online/reserved sur Vinted. Or "republier une
// annonce toujours en ligne pour relancer sa visibilite" est precisement le
// cas d'usage produit principal -- confirme par le Decision Engine lui-meme
// (src/lib/insights/recommendations.ts::matchConsidererRepublication, chemin
// B : annonce dormante MAIS toujours en ligne) qui recommandait deja cette
// action a l'utilisateur avant meme que le bouton "Republier" n'existe.
// needsRepublish()/NEEDS_REPUBLISH_VINTED_STATUSES restent inchanges et
// gardent leur role actuel (filtrer l'onglet "Republication" sur les
// annonces qui ne sont structurellement plus visibles nulle part) -- ce
// n'est PAS le meme critere que "peut-on lancer une republication", d'ou la
// separation. Seule condition reelle desormais : l'annonce existe, n'est
// pas vendue, n'est pas un brouillon inacheve. Etre en ligne, masquee,
// supprimee ou jamais publiee sont tous des etats republiables.
export const checkListingRepublishEligible: ActionCheck = (_ctx, deps) => {
  const listing = deps.targetListing;
  if (!listing) {
    return { ok: false, failure: { code: 'listing_not_found', message: "L'annonce ciblée est introuvable." } };
  }
  if (listing.status === 'vendu') {
    return {
      ok: false,
      failure: { code: 'listing_sold', message: 'Cette annonce est déjà vendue -- impossible de la republier.' },
    };
  }
  if (listing.status !== 'en_stock') {
    return {
      ok: false,
      failure: { code: 'listing_not_in_stock', message: "Cette annonce est en brouillon -- termine-la avant de la republier." },
    };
  }
  return { ok: true };
};

export const checkNoScanInProgress: ActionCheck = (_ctx, deps) => {
  if (deps.scanInProgress) {
    return {
      ok: false,
      failure: { code: 'scan_in_progress', message: 'Un scan est déjà en cours.' },
    };
  }
  return { ok: true };
};
