import { supabaseWithToken } from "./supabaseClient";
import { logger } from "./logger";
import { withRetry } from "./retry";
import { getValidAccessToken } from "./session";
import type { ListingPayload } from "../lib/messages";

// Ecritures declenchees par les content scripts (lecture automatique du
// compte/des annonces Vinted - voir EXTENSION.md §8 : lecture automatique
// autorisee, seules les actions d'ecriture sur Vinted lui-meme necessitent
// un declenchement explicite de l'utilisateur, ce qui n'est pas le cas ici).

// Trouve ou cree la ligne vinted_accounts correspondant a ce compte Vinted
// reel. Ne touche jamais `label` sur une ligne existante : c'est le seul
// champ que l'utilisateur peut personnaliser (renommage), une detection ne
// doit jamais l'ecraser. Utilisee independamment par recordAccountDetected
// et recordListings pour que les deux fonctionnent quel que soit l'ordre
// d'arrivee des deux messages envoyes par le content script.
async function resolveOrCreateVintedAccount(
  client: ReturnType<typeof supabaseWithToken>,
  userId: string,
  vintedUserId: string,
  vintedUsername: string
): Promise<string> {
  const { data: existing, error: selectError } = await client
    .from("vinted_accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("vinted_user_id", vintedUserId)
    .maybeSingle();

  if (selectError) {
    logger.error("Recherche de vinted_accounts a echoue", selectError.message);
    throw selectError;
  }

  if (existing) {
    const { error: updateError } = await client
      .from("vinted_accounts")
      .update({
        connected: true,
        vinted_username: vintedUsername,
        last_synced_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", existing.id);
    if (updateError) {
      logger.error("Mise a jour vinted_accounts a echoue", updateError.message);
      throw updateError;
    }
    return existing.id;
  }

  const { count } = await client
    .from("vinted_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const { data: created, error: insertError } = await client
    .from("vinted_accounts")
    .insert({
      user_id: userId,
      label: vintedUsername,
      vinted_user_id: vintedUserId,
      vinted_username: vintedUsername,
      connected: true,
      last_synced_at: new Date().toISOString(),
      is_default: (count ?? 0) === 0,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    logger.error("Creation de vinted_accounts a echoue", insertError?.message);
    throw insertError ?? new Error("Creation du compte Vinted a echoue");
  }

  logger.info("Nouveau compte Vinted cree", { vintedUsername });
  return created.id;
}

export async function recordAccountDetected(vintedUserId: string, vintedUsername: string): Promise<void> {
  const valid = await getValidAccessToken();
  if (!valid) {
    logger.warn("Compte Vinted detecte mais extension non appairee, ignore");
    return;
  }

  const client = supabaseWithToken(valid.accessToken);
  await withRetry(() => resolveOrCreateVintedAccount(client, valid.userId, vintedUserId, vintedUsername));

  logger.info("Compte Vinted detecte", { vintedUsername });
}

// Le content script recupere desormais la totalite des annonces d'un
// compte a chaque visite du profil (pagination Vinted epuisee cote
// wardrobeApi.ts) : l'ensemble recu ici EST l'etat complet et actuel du
// compte Vinted, tous statuts confondus. Miroir complet donc : toute
// annonce connue en base mais absente de ce scan a ete supprimee ou
// deplacee sur Vinted - marquee status='deleted' plutot que supprimee
// physiquement, pour garder l'historique (ventes passees, statistiques).
export async function recordListings(
  vintedUserId: string,
  vintedUsername: string,
  listings: ListingPayload[]
): Promise<void> {
  const valid = await getValidAccessToken();
  if (!valid) {
    logger.warn("Annonces detectees mais extension non appairee, ignore");
    return;
  }

  const client = supabaseWithToken(valid.accessToken);
  const vintedAccountId = await withRetry(() =>
    resolveOrCreateVintedAccount(client, valid.userId, vintedUserId, vintedUsername)
  );

  if (listings.length > 0) {
    const rows = listings.map((l) => ({
      vinted_account_id: vintedAccountId,
      vinted_item_id: l.vintedItemId,
      title: l.title,
      price: l.price,
      image_url: l.imageUrl,
      vinted_url: l.vintedUrl,
      favourites: l.favourites,
      views: l.views,
      status: l.status,
      brand: l.brand,
      size: l.size,
      synced_at: new Date().toISOString(),
    }));

    await withRetry(async () => {
      const { error } = await client
        .from("vinted_listings")
        .upsert(rows, { onConflict: "vinted_account_id,vinted_item_id" });
      if (error) {
        logger.error("upsert vinted_listings a echoue", error.message);
        throw error;
      }
    });
  }

  const currentItemIds = listings.map((l) => l.vintedItemId);
  await withRetry(async () => {
    let query = client
      .from("vinted_listings")
      .update({ status: "deleted" })
      .eq("vinted_account_id", vintedAccountId)
      .neq("status", "deleted");
    if (currentItemIds.length > 0) {
      query = query.not("vinted_item_id", "in", `(${currentItemIds.join(",")})`);
    }
    const { error } = await query;
    if (error) {
      logger.error("Marquage des annonces disparues a echoue", error.message);
      throw error;
    }
  });

  logger.info("Annonces synchronisees", { count: listings.length });
}
