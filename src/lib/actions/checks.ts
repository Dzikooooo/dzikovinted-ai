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

// GARDE TEMPORAIRE (demande explicite 2026-07-15, phase de validation du
// pipeline edit_listing) : bloque tout push ResellOS -> Vinted sauf sur
// l'annonce sandbox de test explicitement designee ("Planche en bois",
// compte alexisdzk, vinted_item_id confirme par lecture DB directe).
// Objectif : aucune annonce reelle (polos, jeans...) ne peut etre touchee
// pendant les tests repetes du pipeline. A RETIRER PROPREMENT (supprimer
// cette fonction + son usage dans handlers/index.ts) une fois le pipeline
// edit_listing valide de bout en bout en conditions reelles -- ne doit
// jamais rester en production au-dela de cette phase.
const SANDBOX_TEST_VINTED_ITEM_ID = '9400476768';

export const checkEditSandboxOnly: ActionCheck = (_ctx, deps) => {
  if (deps.targetListing?.vinted_item_id !== SANDBOX_TEST_VINTED_ITEM_ID) {
    return {
      ok: false,
      failure: {
        code: 'sandbox_only',
        message:
          'Protection temporaire active : seule l\'annonce sandbox de test ("Planche en bois") peut être modifiée pendant la phase de validation du pipeline. Cette annonce n\'est pas la sandbox autorisée.',
      },
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
