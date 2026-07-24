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

// Categorie et etat sont les deux SEULS champs texte que Vinted refuse
// structurellement de laisser vides -- confirme des deux cotes du pipeline
// deja teste en direct : extension/src/content/vinted-edit.ts appelle
// selectMatchingOption(..., { required: true }) uniquement pour l'etat
// (brand/size/color/material utilisent { required: false }), et
// resolveCategory() n'a pas d'equivalent optionnel. Volontairement limite a
// ces deux champs (demande explicite 2026-07-23, "n'ajoute pas de regles
// produit arbitraires") -- ne bloque QUE publish_listing (une nouvelle
// annonce envoie toujours ces deux champs) et jamais edit_listing (qui
// n'envoie que les champs reellement modifies, changedFields, invisible a
// ce niveau de verification -- voir StockPage.tsx::buildEditPayload).
export const checkListingHasRequiredVintedFields: ActionCheck = (_ctx, deps) => {
  if (!deps.targetListing?.category) {
    return { ok: false, failure: { code: 'missing_category', message: "L'annonce n'a pas de catégorie renseignée." } };
  }
  if (!deps.targetListing?.condition) {
    return { ok: false, failure: { code: 'missing_condition', message: "L'annonce n'a pas d'état renseigné." } };
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

export const checkNoScanInProgress: ActionCheck = (_ctx, deps) => {
  if (deps.scanInProgress) {
    return {
      ok: false,
      failure: { code: 'scan_in_progress', message: 'Un scan est déjà en cours.' },
    };
  }
  return { ok: true };
};
