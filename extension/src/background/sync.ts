import { supabaseWithToken } from "./supabaseClient";
import { logger } from "./logger";
import { withRetry } from "./retry";
import { getValidAccessToken } from "./session";
import type { ListingPayload } from "../lib/messages";

// Ecritures declenchees par les content scripts (lecture automatique du
// compte/des annonces Vinted - voir EXTENSION.md §8 : lecture automatique
// autorisee, seules les actions d'ecriture sur Vinted lui-meme necessitent
// un declenchement explicite de l'utilisateur, ce qui n'est pas le cas ici).

export async function recordAccountDetected(vintedUserId: string, vintedUsername: string): Promise<void> {
  const valid = await getValidAccessToken();
  if (!valid) {
    logger.warn("Compte Vinted detecte mais extension non appairee, ignore");
    return;
  }

  const client = supabaseWithToken(valid.accessToken);
  await withRetry(async () => {
    const { error } = await client
      .from("vinted_connection")
      .update({
        connected: true,
        vinted_user_id: vintedUserId,
        vinted_username: vintedUsername,
        last_synced_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("user_id", valid.userId);
    if (error) {
      logger.error("Mise a jour vinted_connection (compte detecte) a echoue", error.message);
      throw error;
    }
  });

  logger.info("Compte Vinted detecte", { vintedUsername });
}

export async function recordListings(listings: ListingPayload[]): Promise<void> {
  if (listings.length === 0) return;

  const valid = await getValidAccessToken();
  if (!valid) {
    logger.warn("Annonces detectees mais extension non appairee, ignore");
    return;
  }

  const rows = listings.map((l) => ({
    user_id: valid.userId,
    vinted_item_id: l.vintedItemId,
    title: l.title,
    price: l.price,
    image_url: l.imageUrl,
    vinted_url: l.vintedUrl,
    favourites: l.favourites,
    views: l.views,
    synced_at: new Date().toISOString(),
  }));

  const client = supabaseWithToken(valid.accessToken);
  await withRetry(async () => {
    const { error } = await client.from("vinted_listings").upsert(rows, { onConflict: "user_id,vinted_item_id" });
    if (error) {
      logger.error("upsert vinted_listings a echoue", error.message);
      throw error;
    }
  });

  logger.info("Annonces synchronisees", { count: rows.length });
}
