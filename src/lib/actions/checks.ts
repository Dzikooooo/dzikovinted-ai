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
