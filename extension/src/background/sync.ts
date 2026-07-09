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

interface ExistingLinkedListing {
  id: string;
  vinted_item_id: string;
  status: string;
  vinted_status: string | null;
  sold_price: number | null;
}

function deriveResellOsStatus(vintedStatus: string): "draft" | "en_stock" | "vendu" {
  if (vintedStatus === "sold_completed") return "vendu";
  if (vintedStatus === "draft") return "draft";
  return "en_stock";
}

// `listings` est desormais l'unique source de verite (fusion avec l'ancienne
// vinted_listings, 2026-07-09) : une annonce Vinted EST la meme ligne que
// l'article ResellOS correspondant. Deux categories de champs sur une meme
// ligne, avec des regles d'ecriture differentes :
// - toujours rafraichis a chaque synchro : price/vinted_status/favourites/
//   views/synced_at/vinted_url ;
// - fixes uniquement a la creation, jamais reecrits ensuite : title/brand/
//   size/image_urls/purchase_price - protege les retouches faites cote
//   ResellOS (Generateur, edition manuelle) d'un ecrasement silencieux par
//   la synchro.
// Le content script recupere la totalite des annonces d'un compte a chaque
// visite du profil (pagination Vinted epuisee, voir wardrobeApi.ts) :
// l'ensemble recu ici EST l'etat complet et actuel du compte Vinted, tous
// statuts confondus - toute ligne liee absente du scan est marquee
// vinted_status='deleted' (jamais de DELETE physique, garde l'historique).
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

  const currentItemIds = listings.map((l) => l.vintedItemId);

  if (currentItemIds.length > 0) {
    const existingRows = await withRetry(async () => {
      const { data, error } = await client
        .from("listings")
        .select("id, vinted_item_id, status, vinted_status, sold_price")
        .eq("vinted_account_id", vintedAccountId)
        .in("vinted_item_id", currentItemIds);
      if (error) throw error;
      return (data ?? []) as ExistingLinkedListing[];
    });

    const existingByItemId = new Map(existingRows.map((r) => [r.vinted_item_id, r]));
    const syncedAt = new Date().toISOString();

    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: { id: string; payload: Record<string, unknown> }[] = [];

    for (const l of listings) {
      const existing = existingByItemId.get(l.vintedItemId);

      if (!existing) {
        toInsert.push({
          user_id: valid.userId,
          vinted_account_id: vintedAccountId,
          vinted_item_id: l.vintedItemId,
          title: l.title,
          brand: l.brand,
          size: l.size,
          price: l.price,
          image_urls: l.imageUrl ? [l.imageUrl] : [],
          vinted_url: l.vintedUrl,
          vinted_status: l.status,
          favourites: l.favourites,
          views: l.views,
          synced_at: syncedAt,
          purchase_price: null,
          status: deriveResellOsStatus(l.status),
          sold_date: l.status === "sold_completed" ? syncedAt.slice(0, 10) : null,
          sold_price: l.status === "sold_completed" ? l.price : null,
          fees: 0,
          is_favorite: false,
        });
        continue;
      }

      const payload: Record<string, unknown> = {
        price: l.price,
        vinted_status: l.status,
        favourites: l.favourites,
        views: l.views,
        synced_at: syncedAt,
        vinted_url: l.vintedUrl,
      };

      // Auto-comptabilite : une annonce qui vient de passer a sold_completed
      // met a jour le statut ResellOS, sans jamais ecraser un prix de vente
      // deja saisi manuellement par l'utilisateur.
      const justSold = l.status === "sold_completed" && existing.vinted_status !== "sold_completed";
      if (justSold) {
        payload.status = "vendu";
        if (existing.sold_price === null) {
          payload.sold_price = l.price;
          payload.sold_date = syncedAt.slice(0, 10);
        }
      }

      toUpdate.push({ id: existing.id, payload });
    }

    // Utilise pour l'historique (listing_metric_snapshots) ci-dessous : il
    // faut l'id `listings` de chaque annonce synchronisee, connu d'avance
    // pour les mises a jour, renvoye par Supabase pour les creations.
    const listingIdByItemId = new Map(existingRows.map((r) => [r.vinted_item_id, r.id]));

    if (toInsert.length > 0) {
      const inserted = await withRetry(async () => {
        const { data, error } = await client.from("listings").insert(toInsert).select("id, vinted_item_id");
        if (error) {
          logger.error("Creation d'articles lies a Vinted a echoue", error.message);
          throw error;
        }
        return (data ?? []) as { id: string; vinted_item_id: string | null }[];
      });
      for (const row of inserted) {
        if (row.vinted_item_id) listingIdByItemId.set(row.vinted_item_id, row.id);
      }
    }

    if (toUpdate.length > 0) {
      await withRetry(async () => {
        const results = await Promise.all(
          toUpdate.map(({ id, payload }) => client.from("listings").update(payload).eq("id", id))
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) {
          logger.error("Mise a jour d'articles lies a Vinted a echoue", failed.error.message);
          throw failed.error;
        }
      });
    }

    // Historique (Phase 2, moteur d'intelligence metier) : un instantane par
    // annonce synchronisee, y compris la toute premiere fois (sert de point
    // de depart aux futures comparaisons de tendance). Journal append-only,
    // aucun impact sur les colonnes "vivantes" de `listings`.
    const snapshotRows = listings
      .map((l) => {
        const listingId = listingIdByItemId.get(l.vintedItemId);
        if (!listingId) return null;
        return {
          listing_id: listingId,
          views: l.views,
          favourites: l.favourites,
          price: l.price,
          vinted_status: l.status,
          captured_at: syncedAt,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (snapshotRows.length > 0) {
      await withRetry(async () => {
        const { error } = await client.from("listing_metric_snapshots").insert(snapshotRows);
        if (error) {
          logger.error("Enregistrement de l'historique a echoue", error.message);
          throw error;
        }
      });
    }
  }

  await withRetry(async () => {
    let query = client
      .from("listings")
      .update({ vinted_status: "deleted" })
      .eq("vinted_account_id", vintedAccountId)
      .not("vinted_item_id", "is", null)
      .neq("vinted_status", "deleted");
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
