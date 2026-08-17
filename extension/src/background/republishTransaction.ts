// Mission "REPUBLICATION : CORRIGER LES DOUBLONS" (2026-08-17) : une
// republication n'est PAS une creation independante -- c'est une operation
// de REMPLACEMENT. Invariant vise :
//   ancienne annonce A -> publier B -> confirmer B en ligne -> supprimer A
//   sur Vinted -> rattacher/remplacer A par B dans ResellOS
// Apres succes complet, une seule ligne ResellOS et une seule annonce
// Vinted active doivent subsister pour ce meme article logique.
//
// CAUSE REELLE DES DOUBLONS (audit) : handlePublishListing.ts confirmait
// deja B (vintedItemId/vintedUrl), mais ne faisait QUE resoudre
// RunActionOutcome -- aucun code ne rattachait la ligne ResellOS ORIGINALE
// au nouvel id avant que la reponse ne reparte vers l'app. Cote app,
// useActionEngine.ts::applyRepublishListingResult() fait bien ce
// rattachement, MAIS seulement APRES que l'extension ait deja resolu --
// et la reconciliation post-submit du CAS B (mission precedente, meme
// fichier) declenche elle-meme une VRAIE resynchro wardrobe (syncCoordinator
// -> recordListings()) pour identifier B, laquelle resynchro peut decouvrir
// B AVANT que la ligne ORIGINALE ne soit rattachee -- recordListings() ne
// trouve alors aucune ligne existante portant ce vinted_item_id et en cree
// une NOUVELLE (ligne "orpheline" B'). Le rattachement tardif cote app
// rattache ensuite la ligne A a B egalement -- DEUX lignes ResellOS
// (l'originale rattachee + l'orpheline creee par la synchro) portent alors
// le meme vinted_item_id. Cote Vinted, aucune suppression de l'ancienne
// annonce A n'a jamais ete implementee -- chaque republication laisse
// l'ancienne annonce en ligne, d'ou l'accumulation observee en direct.
//
// Ce module deplace le rattachement (rebind) DANS l'extension, IMMEDIATEMENT
// apres confirmation de B et AVANT que la reponse ne reparte vers l'app --
// fermant la course qui cause le doublon Supabase. useActionEngine.ts::
// applyRepublishListingResult() n'a pas besoin d'etre modifie : son propre
// UPDATE (memes valeurs) est naturellement idempotent et reste un filet de
// securite best-effort si jamais ce module echouait silencieusement.

import { logger } from "./logger";
import { attemptDeleteOldVintedListing } from "./deleteOldListing";
import { deleteListingRow, findDuplicateListingId, rebindListingToVintedItem } from "./sync";

export interface ReplaceTransactionInput {
  // null si l'action n'est rattachee a aucune ligne ResellOS (ne devrait pas
  // arriver en pratique pour publish_listing/republish_listing, tous deux
  // exigent checkListingLoaded cote app -- traite malgre tout comme un no-op
  // sur -- jamais une exception).
  listingId: string | null;
  vintedAccountId: string | null;
  // null pour publish_listing (premiere publication, aucune ancienne
  // annonce) -- present uniquement pour republish_listing, voir
  // RepublishListingPayload.previousVintedItemId.
  oldVintedItemId: string | null;
  newVintedItemId: string;
  newVintedUrl: string;
}

export type ReplaceTransactionReason =
  | "no_listing_id" // rien a rattacher -- action non liee a une ligne ResellOS
  | "same_item_id" // republication vers le meme vinted_item_id -- rien a supprimer
  | "completed" // succes complet (rattachement fait, doublon eventuel fusionne, ancienne annonce supprimee si necessaire)
  | "cleanup_required"; // B confirmee et rattachee, mais l'ancienne annonce Vinted n'a pas pu etre supprimee

export interface ReplaceTransactionResult {
  ok: boolean;
  reason: ReplaceTransactionReason;
  mergedDuplicateListingId: string | null;
  cleanupError: string | null;
}

// Mecanisme REEL de suppression d'une annonce Vinted : implemente dans
// deleteOldListing.ts (importe ci-dessus), remplace l'ancien stub
// "pas encore implémenté" (mission "DIAGNOSTIC LIVE SUPPRESSION ANCIENNE
// ANNONCE VINTED", 2026-08-17 -- flow DOM confirme en direct par
// l'utilisateur). performRepublishReplaceTransaction() ci-dessous ne sait
// toujours rien de COMMENT la suppression se fait, seulement QUAND
// l'appeler et comment traiter son resultat -- isolation volontairement
// conservee pour qu'une evolution future du mecanisme de suppression
// n'ait jamais besoin de toucher a l'orchestration/aux regles metier ici.

// Point d'entree unique -- appelee par handlePublishListing.ts une seule
// fois par publication reellement confirmee (jamais rejouee sur un succes
// deja traite, voir son propre garde synchrone successFinalizationStarted).
//
// `deleteOldListing` (injecte, defaut attemptDeleteOldVintedListing
// ci-dessus) : purement pour la testabilite -- un lien ES module direct vers
// une fonction du MEME fichier ne peut pas etre intercepte par vi.spyOn/
// vi.mock de facon fiable ; l'appelant reel (handlePublishListing.ts)
// n'a jamais besoin de fournir ce parametre.
export async function performRepublishReplaceTransaction(
  input: ReplaceTransactionInput,
  deleteOldListing: (
    oldVintedItemId: string,
    onAwaitingConfirmation?: () => void
  ) => Promise<{ ok: boolean; error?: string }> = attemptDeleteOldVintedListing,
  // Mission "CORRIGER LE FAUX TERMINE" (2026-08-17) : relaie vers l'app,
  // AVANT toute preuve de suppression, que l'extension attend desormais un
  // clic humain reel sur "Confirmer et supprimer" dans un onglet reste
  // ouvert -- pour que ResellOS affiche un etat explicite plutot que de
  // laisser deviner l'utilisateur ("Terminé" ne doit jamais apparaitre
  // avant REPUBLISH_COMPLETED).
  onAwaitingOldListingDeletion?: () => void
): Promise<ReplaceTransactionResult> {
  const { listingId, vintedAccountId, oldVintedItemId, newVintedItemId, newVintedUrl } = input;

  logger.info("REPUBLISH_OLD_LISTING_CAPTURED", { listingId, oldVintedItemId });
  logger.info("REPUBLISH_NEW_LISTING_CONFIRMED", { listingId, newVintedItemId, newVintedUrl });

  if (!listingId || !vintedAccountId) {
    logger.warn("REPUBLISH_TRANSACTION_NO_LISTING_ID", { listingId, vintedAccountId });
    return { ok: true, reason: "no_listing_id", mergedDuplicateListingId: null, cleanupError: null };
  }

  const rebind = await rebindListingToVintedItem(listingId, vintedAccountId, newVintedItemId, newVintedUrl);
  logger.info("REPUBLISH_LOCAL_REBOUND", {
    listingId,
    ok: rebind.ok,
    found: rebind.found,
    alreadySold: rebind.alreadySold,
    previousVintedItemId: rebind.previousVintedItemId,
    newVintedItemId,
  });

  // Fusion d'un doublon eventuellement cree par une synchro concurrente --
  // recherchee APRES le rebind (donc strictement sur vinted_item_id, jamais
  // un rapprochement titre/prix -- deux annonces differentes peuvent
  // legitimement partager les deux, voir la mission).
  let mergedDuplicateListingId: string | null = null;
  const duplicateId = await findDuplicateListingId(vintedAccountId, newVintedItemId, listingId);
  if (duplicateId) {
    const deleted = await deleteListingRow(duplicateId);
    if (deleted) {
      mergedDuplicateListingId = duplicateId;
      logger.info("REPUBLISH_DUPLICATE_MERGED", { listingId, duplicateId, newVintedItemId });
    } else {
      logger.error("REPUBLISH_DUPLICATE_MERGE_FAILED", { listingId, duplicateId, newVintedItemId });
    }
  }

  // "si newVintedItemId === oldVintedItemId, ne rien supprimer" (demande
  // explicite) -- couvre aussi publish_listing (oldVintedItemId null,
  // premiere publication, rien a remplacer).
  if (!oldVintedItemId || oldVintedItemId === newVintedItemId) {
    logger.info("REPUBLISH_COMPLETED", {
      listingId,
      newVintedItemId,
      oldVintedItemId,
      deletedOld: false,
      reason: !oldVintedItemId ? "no_old_item" : "same_item_id",
    });
    return { ok: true, reason: !oldVintedItemId ? "completed" : "same_item_id", mergedDuplicateListingId, cleanupError: null };
  }

  logger.info("REPUBLISH_OLD_DELETE_STARTED", { listingId, oldVintedItemId });
  const deleteResult = await deleteOldListing(oldVintedItemId, onAwaitingOldListingDeletion);
  if (deleteResult.ok) {
    logger.info("REPUBLISH_OLD_DELETE_CONFIRMED", { listingId, oldVintedItemId });
    logger.info("REPUBLISH_COMPLETED", { listingId, newVintedItemId, oldVintedItemId, deletedOld: true });
    return { ok: true, reason: "completed", mergedDuplicateListingId, cleanupError: null };
  }

  logger.warn("REPUBLISH_CLEANUP_REQUIRED", { listingId, oldVintedItemId, newVintedItemId, error: deleteResult.error });
  return { ok: true, reason: "cleanup_required", mergedDuplicateListingId, cleanupError: deleteResult.error ?? null };
}
