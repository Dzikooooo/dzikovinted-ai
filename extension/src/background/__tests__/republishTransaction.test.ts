import { afterEach, describe, expect, it, vi } from "vitest";

// republishTransaction.ts importe sync.ts -> supabaseClient.ts (createClient()
// top-level, tente chrome.storage.local.get des l'import) -- meme mock que
// partout ailleurs dans ce paquet pour ce probleme precis (voir
// enrichListing.test.ts). Seules les 3 fonctions reellement appelees par
// republishTransaction.ts sont mockees ici.
vi.mock("../sync", () => ({
  rebindListingToVintedItem: vi.fn(),
  findDuplicateListingId: vi.fn(),
  deleteListingRow: vi.fn(),
}));

// logger.ts relaie chaque entree via chrome.runtime.sendMessage -- absent
// sous Vitest sans stub global (meme piege deja documente dans sync.test.ts/
// enrichListing.test.ts pour ce meme module).
vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { performRepublishReplaceTransaction } from "../republishTransaction";
import { deleteListingRow, findDuplicateListingId, rebindListingToVintedItem } from "../sync";

// Mission "REPUBLICATION : CORRIGER LES DOUBLONS" (2026-08-17) : preuve live
// -- une republication laissait l'ancienne annonce Vinted en ligne ET pouvait
// produire deux lignes ResellOS pour le meme article logique (course entre le
// rattachement local et une synchro wardrobe concurrente qui decouvre le
// nouvel item avant lui, voir l'en-tete de republishTransaction.ts pour la
// cause exacte). Ces tests couvrent performRepublishReplaceTransaction() en
// isolation, avec ses 3 dependances Supabase mockees et son mecanisme de
// suppression Vinted injecte (voir la signature de la fonction -- un lien ES
// module direct vers une fonction du meme fichier ne peut pas etre intercepte
// de facon fiable par vi.spyOn/vi.mock).

function okRebind(overrides: Partial<Awaited<ReturnType<typeof rebindListingToVintedItem>>> = {}) {
  return { ok: true, found: true, alreadySold: false, previousVintedItemId: "old-1", ...overrides };
}

describe("performRepublishReplaceTransaction", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Scenario A (mission) : succes normal A -> B.
  it("succès normal A→B : rattache la ligne, aucun doublon, supprime l'ancienne annonce -- reason completed", async () => {
    vi.mocked(rebindListingToVintedItem).mockResolvedValue(okRebind());
    vi.mocked(findDuplicateListingId).mockResolvedValue(null);
    const deleteOldListing = vi.fn().mockResolvedValue({ ok: true });

    const result = await performRepublishReplaceTransaction(
      { listingId: "listing-1", vintedAccountId: "acc-1", oldVintedItemId: "old-1", newVintedItemId: "new-1", newVintedUrl: "https://www.vinted.fr/items/new-1" },
      deleteOldListing
    );

    expect(rebindListingToVintedItem).toHaveBeenCalledWith("listing-1", "acc-1", "new-1", "https://www.vinted.fr/items/new-1");
    expect(findDuplicateListingId).toHaveBeenCalledWith("acc-1", "new-1", "listing-1");
    // Mission "CORRIGER LE FAUX TERMINE" (2026-08-17) : deleteOldListing()
    // recoit desormais toujours un 2e argument (onAwaitingOldListingDeletion,
    // undefined ici puisque cet appel de test ne le fournit pas a
    // performRepublishReplaceTransaction) -- voir son 3e parametre.
    expect(deleteOldListing).toHaveBeenCalledWith("old-1", undefined);
    expect(result).toEqual({ ok: true, reason: "completed", mergedDuplicateListingId: null, cleanupError: null });
  });

  // Mission "CORRIGER LE FAUX TERMINE" (2026-08-17) : onAwaitingOldListingDeletion
  // doit atteindre deleteOldListing() TEL QUEL (jamais transforme/ignore) --
  // c'est le seul fil qui permet a ResellOS d'afficher "Confirmation de
  // suppression requise sur Vinted" pendant l'attente du clic humain.
  it("relaie onAwaitingOldListingDeletion jusqu'a deleteOldListing()", async () => {
    vi.mocked(rebindListingToVintedItem).mockResolvedValue(okRebind());
    vi.mocked(findDuplicateListingId).mockResolvedValue(null);
    const deleteOldListing = vi.fn().mockResolvedValue({ ok: true });
    const onAwaitingOldListingDeletion = vi.fn();

    await performRepublishReplaceTransaction(
      { listingId: "listing-1", vintedAccountId: "acc-1", oldVintedItemId: "old-1", newVintedItemId: "new-1", newVintedUrl: "https://www.vinted.fr/items/new-1" },
      deleteOldListing,
      onAwaitingOldListingDeletion
    );

    expect(deleteOldListing).toHaveBeenCalledWith("old-1", onAwaitingOldListingDeletion);
  });

  // Scenario C (mission) : suppression de A echoue -- B reste publiee, jamais
  // pretendre que la republication est entierement terminee.
  it("suppression de l'ancienne annonce Vinted échoue -- reason cleanup_required, jamais une fausse réussite complète", async () => {
    vi.mocked(rebindListingToVintedItem).mockResolvedValue(okRebind());
    vi.mocked(findDuplicateListingId).mockResolvedValue(null);
    const deleteOldListing = vi.fn().mockResolvedValue({ ok: false, error: "Suppression pas encore implémentée" });

    const result = await performRepublishReplaceTransaction(
      { listingId: "listing-1", vintedAccountId: "acc-1", oldVintedItemId: "old-1", newVintedItemId: "new-1", newVintedUrl: "https://www.vinted.fr/items/new-1" },
      deleteOldListing
    );

    expect(result.ok).toBe(true);
    expect(result.reason).toBe("cleanup_required");
    expect(result.cleanupError).toBe("Suppression pas encore implémentée");
  });

  // Scenario E/F (mission) : "synchro crée B avant le rebond" / "B existe
  // déjà en base" -- un doublon est trouve APRES le rebind (peu importe quand
  // il a ete cree, seul son existence AU MOMENT de la recherche compte) --
  // fusionne (supprime la ligne orpheline), jamais conserve les deux.
  it("un doublon créé par une synchro concurrente est fusionné (supprimé), jamais conservé en double", async () => {
    vi.mocked(rebindListingToVintedItem).mockResolvedValue(okRebind());
    vi.mocked(findDuplicateListingId).mockResolvedValue("orphan-listing-2");
    vi.mocked(deleteListingRow).mockResolvedValue(true);
    const deleteOldListing = vi.fn().mockResolvedValue({ ok: true });

    const result = await performRepublishReplaceTransaction(
      { listingId: "listing-1", vintedAccountId: "acc-1", oldVintedItemId: "old-1", newVintedItemId: "new-1", newVintedUrl: "https://www.vinted.fr/items/new-1" },
      deleteOldListing
    );

    expect(deleteListingRow).toHaveBeenCalledWith("orphan-listing-2");
    expect(result.mergedDuplicateListingId).toBe("orphan-listing-2");
    expect(result.reason).toBe("completed");
  });

  it("aucun doublon trouvé -- deleteListingRow n'est jamais appelée, mergedDuplicateListingId reste null", async () => {
    vi.mocked(rebindListingToVintedItem).mockResolvedValue(okRebind());
    vi.mocked(findDuplicateListingId).mockResolvedValue(null);
    const deleteOldListing = vi.fn().mockResolvedValue({ ok: true });

    const result = await performRepublishReplaceTransaction(
      { listingId: "listing-1", vintedAccountId: "acc-1", oldVintedItemId: "old-1", newVintedItemId: "new-1", newVintedUrl: "https://www.vinted.fr/items/new-1" },
      deleteOldListing
    );

    expect(deleteListingRow).not.toHaveBeenCalled();
    expect(result.mergedDuplicateListingId).toBeNull();
  });

  // Scenario G (mission) : old/new ID identiques -- "si newVintedItemId ===
  // oldVintedItemId, ne rien supprimer" (demande explicite).
  it("old/new vinted_item_id identiques -- ne tente AUCUNE suppression, reason same_item_id", async () => {
    vi.mocked(rebindListingToVintedItem).mockResolvedValue(okRebind({ previousVintedItemId: "same-1" }));
    vi.mocked(findDuplicateListingId).mockResolvedValue(null);
    const deleteOldListing = vi.fn();

    const result = await performRepublishReplaceTransaction(
      { listingId: "listing-1", vintedAccountId: "acc-1", oldVintedItemId: "same-1", newVintedItemId: "same-1", newVintedUrl: "https://www.vinted.fr/items/same-1" },
      deleteOldListing
    );

    expect(deleteOldListing).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, reason: "same_item_id", mergedDuplicateListingId: null, cleanupError: null });
  });

  // publish_listing (premiere publication, jamais d'ancienne annonce) :
  // meme comportement -- rien a supprimer, jamais une tentative inutile.
  it("aucun oldVintedItemId (premiere publication) -- ne tente aucune suppression, reason completed", async () => {
    vi.mocked(rebindListingToVintedItem).mockResolvedValue(okRebind({ previousVintedItemId: null }));
    vi.mocked(findDuplicateListingId).mockResolvedValue(null);
    const deleteOldListing = vi.fn();

    const result = await performRepublishReplaceTransaction(
      { listingId: "listing-1", vintedAccountId: "acc-1", oldVintedItemId: null, newVintedItemId: "new-1", newVintedUrl: "https://www.vinted.fr/items/new-1" },
      deleteOldListing
    );

    expect(deleteOldListing).not.toHaveBeenCalled();
    expect(result.reason).toBe("completed");
  });

  it("aucun listingId ResellOS -- no-op sûr, ne tente ni rebind ni suppression", async () => {
    const deleteOldListing = vi.fn();

    const result = await performRepublishReplaceTransaction(
      { listingId: null, vintedAccountId: "acc-1", oldVintedItemId: "old-1", newVintedItemId: "new-1", newVintedUrl: "https://www.vinted.fr/items/new-1" },
      deleteOldListing
    );

    expect(rebindListingToVintedItem).not.toHaveBeenCalled();
    expect(deleteOldListing).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, reason: "no_listing_id", mergedDuplicateListingId: null, cleanupError: null });
  });

  // Scenario I (mission) : retry d'un cleanup incomplet -- rejouer la
  // transaction (ex. future action "reessayer le nettoyage") apres un premier
  // cleanup_required doit rester sans effet de bord supplementaire : le
  // rebind est deja idempotent (memes valeurs), aucun nouveau doublon a
  // fusionner (deja fait au premier passage), et la suppression peut etre
  // retentee sans jamais planter ni inventer un succes.
  it("un retry après un cleanup_required précédent reste sûr et rejouable (idempotent)", async () => {
    vi.mocked(rebindListingToVintedItem).mockResolvedValue(okRebind());
    vi.mocked(findDuplicateListingId).mockResolvedValue(null);
    const deleteOldListing = vi.fn().mockResolvedValue({ ok: false, error: "toujours pas implémenté" });

    const input = {
      listingId: "listing-1",
      vintedAccountId: "acc-1",
      oldVintedItemId: "old-1",
      newVintedItemId: "new-1",
      newVintedUrl: "https://www.vinted.fr/items/new-1",
    };

    const first = await performRepublishReplaceTransaction(input, deleteOldListing);
    const second = await performRepublishReplaceTransaction(input, deleteOldListing);

    expect(first.reason).toBe("cleanup_required");
    expect(second.reason).toBe("cleanup_required");
    // Le rebind (idempotent par nature -- memes valeurs) et la recherche de
    // doublon sont retentes a chaque appel, jamais un etat cache qui
    // empecherait un vrai retry de fonctionner une fois la suppression
    // reellement implementee.
    expect(rebindListingToVintedItem).toHaveBeenCalledTimes(2);
    expect(deleteOldListing).toHaveBeenCalledTimes(2);
  });

  it("le rattachement échoue (ligne déjà vendue) -- n'empêche pas la recherche de doublon ni la tentative de nettoyage", async () => {
    vi.mocked(rebindListingToVintedItem).mockResolvedValue({ ok: false, found: true, alreadySold: true, previousVintedItemId: "old-1" });
    vi.mocked(findDuplicateListingId).mockResolvedValue(null);
    const deleteOldListing = vi.fn().mockResolvedValue({ ok: true });

    const result = await performRepublishReplaceTransaction(
      { listingId: "listing-1", vintedAccountId: "acc-1", oldVintedItemId: "old-1", newVintedItemId: "new-1", newVintedUrl: "https://www.vinted.fr/items/new-1" },
      deleteOldListing
    );

    // Le rebind a echoue (ligne vendue) mais le reste de la transaction
    // continue honnetement -- jamais bloquant, jamais une exception non geree.
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("completed");
  });
});
