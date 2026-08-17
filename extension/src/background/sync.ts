import { supabaseWithToken } from "./supabaseClient";
import { logger } from "./logger";
import { withRetry } from "./retry";
import { getValidAccessToken } from "./session";
import { toLocalDateString } from "../lib/date";
import { extractSkuFromTitle, runSkuRepair } from "../lib/sku";
import { deriveResellOsStatus, resolveStaleDraftStatus } from "./listingStatusSync";
import type { ListingPayload, SingleItemPayload } from "../lib/messages";

// reportSkuRepair (2026-07-27, chantier "auto-reparation SKU" -- separe de
// la fondation du registre central, voir la conversation) : wrapper
// best-effort strict autour de runSkuRepair -- ne leve jamais, ne bloque
// jamais et n'annule jamais l'action principale (synchro/import) qui vient
// de reussir juste avant cet appel. Pour l'instant uniquement journalise
// (aucune UI, aucune notification, aucun blocage) -- le contrat normalise
// (runSkuRepair, src/lib/sku.ts) est deja stable pour un futur Centre des
// Actions/badge/metrique sans avoir a le changer.
async function reportSkuRepair(
  client: ReturnType<typeof supabaseWithToken>,
  userId: string,
  context: string = "post-action"
): Promise<void> {
  const result = await runSkuRepair(client, userId).catch(() => null);
  if (!result || !result.success) {
    logger.warn(`Auto-reparation SKU (${context}) : appel RPC echoue, ignore (best-effort)`);
    return;
  }
  logger.info(`Auto-reparation SKU (${context})`, result);
}

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
// listings_synced_at (2026-07-27, bug reel confirme, PUIS mission
// "FIABILISATION SYNCHRO VINTED, lot 1" 2026-08-16) : cette fonction ne
// touche plus JAMAIS listings_synced_at -- historiquement, un flag
// `touchListingsSyncedAt` la faisait ecrire ICI, quasi au tout debut de
// recordListings() (avant meme les inserts/updates/reconciliation reels),
// ce qui rendait le signal "synchro reussie" faux des qu'une erreur
// survenait APRES ce point : le bouton "Synchroniser maintenant" (qui
// attend un changement de listings_synced_at) affichait alors un succes
// alors que la synchro avait reellement echoue en cours de route. Seule
// recordListings() ecrit desormais ce timestamp, explicitement, tout a la
// fin, et UNIQUEMENT si l'integralite du travail (inserts/updates/
// snapshots/reconciliation) a reussi ET que le scan Vinted etait complet
// (voir son commentaire d'en-tete). last_synced_at, lui, continue d'etre
// ecrit ici a chaque appel (par recordAccountDetected ET recordListings) --
// il signifie seulement "ce compte a ete detecte actif", pas "les annonces
// sont a jour", distinction volontairement conservee.
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

  const now = new Date().toISOString();

  if (existing) {
    const { error: updateError } = await client
      .from("vinted_accounts")
      .update({
        connected: true,
        vinted_username: vintedUsername,
        last_synced_at: now,
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
      last_synced_at: now,
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

// Mission "FIABILISATION SYNCHRO VINTED, lot 1" (2026-08-16), point 4 :
// l'ancien "extension non appairee -> logger.warn puis return" etait
// silencieux au sens strict du terme -- aucun appelant (background/index.ts)
// ne recevait la moindre information exploitable, seulement une resolution
// void identique a un succes. Retourne desormais un resultat structure.
export type RecordAccountDetectedReason = "success" | "not_paired";
export interface RecordAccountDetectedResult {
  ok: boolean;
  reason: RecordAccountDetectedReason;
}

export async function recordAccountDetected(vintedUserId: string, vintedUsername: string): Promise<RecordAccountDetectedResult> {
  const valid = await getValidAccessToken();
  if (!valid) {
    logger.warn("Compte Vinted detecte mais extension non appairee, ignore");
    return { ok: false, reason: "not_paired" };
  }

  const client = supabaseWithToken(valid.accessToken);
  await withRetry(() => resolveOrCreateVintedAccount(client, valid.userId, vintedUserId, vintedUsername));

  logger.info("Compte Vinted detecte", { vintedUsername });
  return { ok: true, reason: "success" };
}

interface ExistingLinkedListing {
  id: string;
  vinted_item_id: string;
  status: string;
  vinted_status: string | null;
  sold_price: number | null;
  vinted_sync_status: string | null;
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
//
// Mission "FIABILISATION SYNCHRO VINTED, lot 1" (2026-08-16) -- CAUSE REELLE
// prouvee par audit : un scan dont la pagination Vinted s'est arretee en
// cours de route (wardrobeApi.ts, page >= 2 en echec) etait jusqu'ici traite
// EXACTEMENT comme un scan complet -- toute annonce reelle situee sur une
// page jamais lue se faisait donc marquer a tort `vinted_status='deleted'`.
// `complete` (nouveau parametre, transmis tel quel depuis
// wardrobeApi.ts::WardrobeFetchResult via vinted-profile.ts) doit desormais
// etre EXPLICITEMENT true pour que cette fonction execute la moindre logique
// de suppression. Un scan partiel (complete:false) reste malgre tout utile :
// les annonces reellement lues sont inserees/mises a jour normalement (cette
// donnee est reelle et sure a ecrire) -- seule la conclusion "ce qui est
// absent a ete supprime" est bloquee, et vinted_accounts.listings_synced_at
// n'est JAMAIS avance dans ce cas (voir la fin de cette fonction).
export type RecordListingsReason = "success" | "not_paired" | "partial_scan";
export interface RecordListingsResult {
  ok: boolean;
  complete: boolean;
  created: number;
  updated: number;
  deletedMarked: number;
  reason: RecordListingsReason;
}

export async function recordListings(
  vintedUserId: string,
  vintedUsername: string,
  listings: ListingPayload[],
  complete: boolean
): Promise<RecordListingsResult> {
  const valid = await getValidAccessToken();
  if (!valid) {
    logger.warn("Annonces detectees mais extension non appairee, ignore");
    return { ok: false, complete: false, created: 0, updated: 0, deletedMarked: 0, reason: "not_paired" };
  }

  const client = supabaseWithToken(valid.accessToken);
  const vintedAccountId = await withRetry(() =>
    resolveOrCreateVintedAccount(client, valid.userId, vintedUserId, vintedUsername)
  );

  const currentItemIds = listings.map((l) => l.vintedItemId);
  let created = 0;
  let updated = 0;
  let deletedMarked = 0;

  if (currentItemIds.length > 0) {
    const existingRows = await withRetry(async () => {
      const { data, error } = await client
        .from("listings")
        .select("id, vinted_item_id, status, vinted_status, sold_price, vinted_sync_status")
        .eq("vinted_account_id", vintedAccountId)
        .in("vinted_item_id", currentItemIds);
      if (error) throw error;
      return (data ?? []) as ExistingLinkedListing[];
    });

    const existingByItemId = new Map(existingRows.map((r) => [r.vinted_item_id, r]));
    const now = new Date();
    const syncedAt = now.toISOString();
    const todayLocal = toLocalDateString(now);

    const toInsert: Record<string, unknown>[] = [];
    // guardSyncStatus : true quand ce payload inclut price (donc draftPending
    // etait faux AU MOMENT DE LA LECTURE, quelques lignes plus haut) -- voir
    // la garde ajoutee dans la boucle d'ecriture ci-dessous, qui re-verifie
    // cette meme condition AU MOMENT DE L'ECRITURE pour fermer la fenetre de
    // course.
    const toUpdate: { id: string; payload: Record<string, unknown>; guardSyncStatus: boolean }[] = [];

    for (const l of listings) {
      const existing = existingByItemId.get(l.vintedItemId);

      if (!existing) {
        // extractSkuFromTitle (2026-07-26, bug reel confirme par audit
        // direct de production) : cette branche inserait l.title BRUT,
        // sans jamais retirer un ancien "#N" tape manuellement par
        // l'utilisateur sur Vinted avant l'existence du systeme SKU --
        // contrairement a recordSingleItemImport, qui l'a toujours fait.
        // Resultat observe en audit : des dizaines d'annonces avec un
        // sku correctement alloue par le trigger MAIS un titre encore
        // suffixe d'un ancien numero manuel sans rapport. Seul le titre
        // est nettoye ici -- le nombre extrait n'est PLUS jamais repris
        // comme sku (decision explicite 2026-07-26, "le systeme ne doit
        // plus deviner les SKU a partir des titres") : le sku vient
        // toujours du trigger d'allocation, jamais du texte.
        const { title: cleanTitle } = extractSkuFromTitle(l.title);
        toInsert.push({
          user_id: valid.userId,
          vinted_account_id: vintedAccountId,
          vinted_item_id: l.vintedItemId,
          title: cleanTitle,
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
          sold_date: l.status === "sold_completed" ? todayLocal : null,
          sold_price: l.status === "sold_completed" ? l.price : null,
          fees: 0,
          is_favorite: false,
        });
        continue;
      }

      // "Ne pas ecraser silencieusement le brouillon" (demande explicite
      // 2026-07-15) : price est refraichi depuis Vinted a CHAQUE synchro
      // passive par design d'origine (voir commentaire au-dessus de cette
      // fonction) -- sauf si une modification locale non encore
      // synchronisee est en attente (vinted_sync_status sync_pending/
      // sync_failed), auquel cas le brouillon local est preserve. La
      // prochaine synchro APRES une resolution sync_success rafraichira a
      // nouveau price normalement.
      const draftPending = existing.vinted_sync_status === "sync_pending" || existing.vinted_sync_status === "sync_failed";
      if (draftPending) {
        logger.warn("Synchro passive ignore le prix : brouillon local non synchronise en attente", {
          vintedItemId: l.vintedItemId,
          vintedSyncStatus: existing.vinted_sync_status,
        });
      }

      const payload: Record<string, unknown> = {
        ...(draftPending ? {} : { price: l.price }),
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
          payload.sold_date = todayLocal;
        }
      }

      // Bug reel confirme en test live (2026-08-11, mission "brouillon
      // fantome") : `status` (colonne ResellOS interne, lue par
      // checkListingRepublishEligible) restait bloquee sur "draft" pour
      // toujours des qu'une ligne avait ce statut, meme apres que Vinted
      // confirme l'annonce reellement publiee (vinted_status, lui, est deja
      // correctement rafraichi plus haut) -- voir resolveStaleDraftStatus
      // pour le detail. N'a d'effet que si justSold ne vient pas deja de
      // decider payload.status juste au-dessus. Journalise uniquement le cas
      // pertinent (existing.status "draft") -- pas a chaque synchro passive
      // de chaque annonce, pour ne pas noyer le ring buffer de logger.ts
      // (MAX_ENTRIES=400, deja documente comme point de fragilite reel).
      if (payload.status === undefined && existing.status === "draft") {
        logger.info("REPUBLISH_STATUS_RAW", {
          vintedItemId: l.vintedItemId,
          existingResellOsStatus: existing.status,
          rawVintedStatus: l.status,
          previousVintedStatus: existing.vinted_status,
        });
        const refreshed = resolveStaleDraftStatus(existing.status, l.status);
        if (refreshed) {
          payload.status = refreshed;
        }
        logger.info("REPUBLISH_STATUS_NORMALIZED", {
          vintedItemId: l.vintedItemId,
          previousResellOsStatus: existing.status,
          nextResellOsStatus: refreshed ?? existing.status,
        });
      }

      toUpdate.push({ id: existing.id, payload, guardSyncStatus: !draftPending });
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
      created = inserted.length;
    }

    if (toUpdate.length > 0) {
      await withRetry(async () => {
        const results = await Promise.all(
          toUpdate.map(({ id, payload, guardSyncStatus }) => {
            let query = client.from("listings").update(payload).eq("id", id);
            // Cause racine identifiee le 2026-07-23 (jamais reproduite en
            // direct, confirmee par lecture du code) : draftPending est
            // decide une seule fois, a la lecture de existingRows tout en
            // haut de cette fonction -- si un edit_listing utilisateur passe
            // cette meme ligne en sync_pending/sync_failed PENDANT que cette
            // synchro passive est encore en vol (entre la lecture et cette
            // ecriture, potentiellement apres plusieurs awaits/retries),
            // price serait ecrase par une valeur Vinted obsolete malgre une
            // modification locale non encore synchronisee. Re-verifie ici,
            // au moment reel de l'ecriture, la meme condition plutot que de
            // faire confiance a l'instantane de lecture -- ferme la fenetre
            // de course de facon atomique (l'ecriture entiere de cette ligne
            // est silencieusement ignoree si la condition n'est plus vraie,
            // jamais une ecriture partielle). N'affecte que les lignes ou
            // price est inclus (guardSyncStatus) ; les autres champs
            // (vinted_status/favourites/views/synced_at) restent toujours en
            // lecture seule depuis Vinted, sans rapport avec un brouillon
            // local, donc jamais concernes par cette garde.
            if (guardSyncStatus) {
              query = query.not("vinted_sync_status", "in", "(sync_pending,sync_failed)");
            }
            return query;
          })
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) {
          logger.error("Mise a jour d'articles lies a Vinted a echoue", failed.error.message);
          throw failed.error;
        }
      });
      updated = toUpdate.length;
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

  // Mission "FIABILISATION SYNCHRO VINTED, lot 1" (2026-08-16), point 3 --
  // REGLE DE SECURITE : cette logique ne s'execute desormais QUE si le scan
  // recu est complet. Un scan partiel (pagination Vinted interrompue,
  // wardrobeApi.ts) ne prouve RIEN sur les annonces situees sur les pages
  // jamais lues -- les traiter comme supprimees degraderait des donnees
  // fiables deja en base a partir d'une simple panne reseau transitoire.
  if (complete) {
    deletedMarked = await withRetry(async () => {
      let query = client
        .from("listings")
        .update({ vinted_status: "deleted" })
        .eq("vinted_account_id", vintedAccountId)
        .not("vinted_item_id", "is", null)
        .neq("vinted_status", "deleted");
      if (currentItemIds.length > 0) {
        query = query.not("vinted_item_id", "in", `(${currentItemIds.join(",")})`);
      }
      const { data, error } = await query.select("id");
      if (error) {
        logger.error("Marquage des annonces disparues a echoue", error.message);
        throw error;
      }
      return (data ?? []).length;
    });
  } else {
    logger.warn("Scan Vinted partiel -- aucune annonce absente marquee 'deleted' (protection anti faux-positifs)", {
      vintedUserId,
      itemsRead: listings.length,
    });
  }

  // Auto-reparation SKU (2026-07-27, chantier separe -- voir la conversation) :
  // best-effort strict, jamais bloquant, jamais de rollback de la synchro qui
  // vient de reussir.
  await reportSkuRepair(client, valid.userId, "post-synchro");

  // Mission "FIABILISATION SYNCHRO VINTED, lot 1" (2026-08-16), point 2 --
  // SEUL endroit ou vinted_accounts.listings_synced_at est ecrit, tout a la
  // fin, UNIQUEMENT si tout ce qui precede (lecture, inserts, updates,
  // snapshots, reconciliation) a reussi sans exception ET que le scan etait
  // complet. Si une erreur avait ete levee plus haut, ce point de code n'est
  // jamais atteint -- le timestamp reste intact, jamais avance sur une
  // synchro partielle ou echouee. Ce champ signifie desormais reellement "la
  // synchronisation complete des annonces a termine avec succes", plus
  // jamais "une tentative a commence".
  if (complete) {
    await withRetry(async () => {
      const { error } = await client
        .from("vinted_accounts")
        .update({ listings_synced_at: new Date().toISOString() })
        .eq("id", vintedAccountId);
      if (error) {
        logger.error("Mise a jour de listings_synced_at a echoue", error.message);
        throw error;
      }
    });
  } else {
    logger.warn("listings_synced_at non avance -- scan partiel", { vintedUserId, vintedAccountId });
  }

  logger.info("Annonces synchronisees", { count: listings.length, complete, created, updated, deletedMarked });
  return { ok: true, complete, created, updated, deletedMarked, reason: complete ? "success" : "partial_scan" };
}

// Mission "REPUBLICATION : PUBLICATION REUSSIE MAIS SUCCES NON DETECTE"
// (2026-08-17) : apres un clic humain reussi sur "Ajouter", Vinted peut
// rediriger le tab de publication vers /member/{userId} plutot que vers
// /items/{nouvel_id} (preuve live directe) -- handlePublishListing.ts
// (background) a besoin de savoir QUELS vinted_item_id etaient DEJA connus
// AVANT la publication, pour pouvoir ensuite identifier par difference (apres
// - avant) LA nouvelle annonce reellement creee, une fois une vraie
// relecture wardrobe effectuee (reutilise recordListings ci-dessus, jamais
// une deuxieme logique de synchro). Lecture seule, jamais d'ecriture.
export async function listKnownVintedItemIds(vintedAccountId: string): Promise<Set<string>> {
  const valid = await getValidAccessToken();
  if (!valid) {
    logger.warn("listKnownVintedItemIds : extension non appairee, ensemble vide retourne");
    return new Set();
  }
  const client = supabaseWithToken(valid.accessToken);
  const { data, error } = await client
    .from("listings")
    .select("vinted_item_id")
    .eq("vinted_account_id", vintedAccountId)
    .not("vinted_item_id", "is", null);
  if (error) {
    logger.error("listKnownVintedItemIds a echoue", error.message);
    return new Set();
  }
  const ids = (data ?? [])
    .map((row) => (row as { vinted_item_id: string | null }).vinted_item_id)
    .filter((id): id is string => !!id);
  return new Set(ids);
}

// Details minimaux necessaires pour (a) confirmer resultPayload.vintedUrl et
// (b) desambiguiser par titre/prix si plusieurs nouveaux vinted_item_id sont
// apparus simultanement (voir la mission -- jamais un choix au hasard).
export interface ListingCandidate {
  vintedItemId: string;
  vintedUrl: string;
  title: string;
  price: number | null;
}

export async function findListingsByVintedItemIds(vintedAccountId: string, vintedItemIds: string[]): Promise<ListingCandidate[]> {
  if (vintedItemIds.length === 0) return [];
  const valid = await getValidAccessToken();
  if (!valid) {
    logger.warn("findListingsByVintedItemIds : extension non appairee, liste vide retournee");
    return [];
  }
  const client = supabaseWithToken(valid.accessToken);
  const { data, error } = await client
    .from("listings")
    .select("vinted_item_id, vinted_url, title, price")
    .eq("vinted_account_id", vintedAccountId)
    .in("vinted_item_id", vintedItemIds);
  if (error) {
    logger.error("findListingsByVintedItemIds a echoue", error.message);
    return [];
  }
  return (data ?? []).map((row) => {
    const r = row as { vinted_item_id: string; vinted_url: string | null; title: string | null; price: number | null };
    return {
      vintedItemId: r.vinted_item_id,
      vintedUrl: r.vinted_url ?? `https://www.vinted.fr/items/${r.vinted_item_id}`,
      title: r.title ?? "",
      price: r.price,
    };
  });
}

// Mission "REPUBLICATION : CORRIGER LES DOUBLONS" (2026-08-17) : une
// republication n'est pas une creation independante -- c'est un
// REMPLACEMENT. Cette fonction rattache la ligne ResellOS ORIGINALE
// (identifiee par son id ResellOS, jamais par vinted_item_id -- c'est
// justement ce qui change) au nouvel item Vinted confirme, sur la MEME
// ligne. Jamais d'INSERT ici : republishTransaction.ts (orchestrateur)
// s'appuie sur cette fonction pour eviter qu'une deuxieme ligne logique
// n'apparaisse pour ce qui reste, du point de vue utilisateur, le MEME
// article. Meme regle de garde que applyPublishListingResult/
// applyRepublishListingResult (useActionEngine.ts, cote app) : jamais
// ecraser une ligne deja marquee vendue (sold_price non nul) -- lue
// explicitement ici plutot que de deviner via le nombre de lignes affectees
// par l'UPDATE (Supabase ne remonte pas d'erreur sur 0 ligne affectee, un
// filtre supplementaire sur l'UPDATE laisserait ce cas silencieux).
export interface RebindListingResult {
  ok: boolean;
  found: boolean;
  alreadySold: boolean;
  previousVintedItemId: string | null;
}

export async function rebindListingToVintedItem(
  listingId: string,
  vintedAccountId: string,
  newVintedItemId: string,
  newVintedUrl: string
): Promise<RebindListingResult> {
  const valid = await getValidAccessToken();
  if (!valid) {
    logger.warn("rebindListingToVintedItem : extension non appairee");
    return { ok: false, found: false, alreadySold: false, previousVintedItemId: null };
  }
  const client = supabaseWithToken(valid.accessToken);

  const { data: existing, error: selectError } = await client
    .from("listings")
    .select("id, vinted_item_id, sold_price")
    .eq("id", listingId)
    .maybeSingle();
  if (selectError || !existing) {
    logger.error("rebindListingToVintedItem : ligne ResellOS introuvable", { listingId, error: selectError?.message });
    return { ok: false, found: false, alreadySold: false, previousVintedItemId: null };
  }

  const row = existing as { id: string; vinted_item_id: string | null; sold_price: number | null };
  const previousVintedItemId = row.vinted_item_id;

  if (row.sold_price !== null) {
    logger.warn("rebindListingToVintedItem : ligne deja vendue, rattachement ignore", { listingId });
    return { ok: false, found: true, alreadySold: true, previousVintedItemId };
  }

  const { error: updateError } = await client
    .from("listings")
    .update({
      vinted_account_id: vintedAccountId,
      vinted_item_id: newVintedItemId,
      vinted_url: newVintedUrl,
      vinted_status: "online",
      synced_at: new Date().toISOString(),
      status: "en_stock",
    })
    .eq("id", listingId);
  if (updateError) {
    logger.error("rebindListingToVintedItem : mise a jour echouee", { listingId, error: updateError.message });
    return { ok: false, found: true, alreadySold: false, previousVintedItemId };
  }

  return { ok: true, found: true, alreadySold: false, previousVintedItemId };
}

// Une synchro wardrobe declenchee pendant/juste apres une republication (ex.
// la reconciliation post-submit du CAS B, voir handlePublishListing.ts) peut
// decouvrir le nouvel item Vinted AVANT que rebindListingToVintedItem()
// ci-dessus n'ait rattache la ligne ORIGINALE -- recordListings() ne trouve
// alors aucune ligne existante portant ce vinted_item_id et en INSERE une
// nouvelle. Cette fonction retrouve un tel doublon APRES le rebind (donc
// strictement sur vinted_item_id, jamais sur titre/prix -- deux annonces
// differentes peuvent legitimement partager les deux, voir la mission).
export async function findDuplicateListingId(
  vintedAccountId: string,
  vintedItemId: string,
  excludeListingId: string
): Promise<string | null> {
  const valid = await getValidAccessToken();
  if (!valid) return null;
  const client = supabaseWithToken(valid.accessToken);
  const { data, error } = await client
    .from("listings")
    .select("id")
    .eq("vinted_account_id", vintedAccountId)
    .eq("vinted_item_id", vintedItemId)
    .neq("id", excludeListingId)
    .maybeSingle();
  if (error) {
    // Inclut le cas ou PostgREST rejette .maybeSingle() parce que PLUS d'une
    // ligne correspond -- volontairement PAS de .limit(1) pour masquer ce
    // cas : mieux vaut echouer bruyamment (aucune fusion tentee) que de
    // choisir arbitrairement laquelle fusionner (voir la mission -- jamais
    // un choix au hasard).
    logger.error("findDuplicateListingId a echoue", error.message);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}

// Suppression definitive d'une ligne `listings` -- utilisee UNIQUEMENT pour
// fusionner un doublon fraichement cree par une synchro concurrente (voir
// findDuplicateListingId ci-dessus), jamais pour une annonce reelle
// distincte. listing_metric_snapshots/listing_recommendation_log portent
// `on delete cascade` (verifie dans les migrations), action_log porte
// `on delete set null` (l'historique d'actions n'est jamais perdu) --
// suppression sure du point de vue de l'integrite referentielle.
export async function deleteListingRow(listingId: string): Promise<boolean> {
  const valid = await getValidAccessToken();
  if (!valid) return false;
  const client = supabaseWithToken(valid.accessToken);
  const { error } = await client.from("listings").delete().eq("id", listingId);
  if (error) {
    logger.error("deleteListingRow a echoue", { listingId, error: error.message });
    return false;
  }
  return true;
}

// Import intelligent (Partie 2, sprint extension V1) : contrairement a
// recordListings ci-dessus (synchro de fond, protege title/brand/size/
// image_urls/purchase_price d'un ecrasement silencieux), cette fonction est
// TOUJOURS declenchee par un clic explicite de l'utilisateur sur UNE
// annonce precise (content/vinted-item.ts) -- c'est une action deliberee,
// donc tous les champs issus de Vinted sont rafraichis sans exception.
// purchase_price et sku (une fois attribue) restent des concepts ResellOS
// jamais touches par un import.
//
// Volontairement PAS resolveOrCreateVintedAccount ici : la page item ne
// permet pas de lire le vinted_user_id numerique du compte connecte (seul
// son pseudo est disponible), alors que resolveOrCreateVintedAccount
// resout/cree une ligne par ce numero. Utiliser le pseudo comme id
// fabriquerait une seconde ligne vinted_accounts desynchronisee de celle
// deja creee par vinted-profile.ts (source de verite pour la creation de
// compte, qui lit le vrai id numerique depuis l'URL /member/{id}). L'import
// se contente donc de RETROUVER un compte deja connu par son pseudo --
// jamais d'en creer un nouveau.
// Verification legere en LECTURE SEULE (aucune ecriture), utilisee par
// vinted-item.ts pour choisir le libelle initial du bouton injecte
// ("Importer" vs "Mettre a jour") AVANT tout clic utilisateur -- demande
// explicite du 2026-07-14 ("article deja importe -> bouton dit Mettre a
// jour"). Reutilise exactement la meme logique de resolution de compte
// que recordSingleItemImport (retrouver, jamais creer) : si le compte
// n'est pas encore connu, l'annonce ne peut par definition pas etre liee.
export async function checkItemAlreadyLinked(vintedUsername: string, vintedItemId: string): Promise<boolean> {
  const valid = await getValidAccessToken();
  if (!valid) {
    throw new Error("Extension non appairee");
  }

  const client = supabaseWithToken(valid.accessToken);

  const { data: account, error: accountError } = await client
    .from("vinted_accounts")
    .select("id")
    .eq("user_id", valid.userId)
    .eq("vinted_username", vintedUsername)
    .maybeSingle();

  if (accountError) {
    logger.error("Recherche du compte Vinted a echoue (verification liaison)", accountError.message);
    throw accountError;
  }
  if (!account) return false;

  const { data: existing, error: selectError } = await client
    .from("listings")
    .select("id")
    .eq("vinted_account_id", account.id)
    .eq("vinted_item_id", vintedItemId)
    .maybeSingle();

  if (selectError) {
    logger.error("Recherche d'annonce existante a echoue (verification liaison)", selectError.message);
    throw selectError;
  }

  return !!existing;
}

// BUG REEL trouve en import reel le 2026-07-14 : "duplicate key value
// violates unique constraint listings_user_sku_unique" (23505) des le
// premier import d'un article jamais vu. Cause racine corrigee cote DB
// (migration 20260714090000_fix_listing_sku_unique_active_only.sql --
// l'index unique ne portait pas sur le meme perimetre que
// allocate_next_sku(), qui ignore les annonces vendues/supprimees).
//
// Defense en profondeur cote appli demandee explicitement en plus du
// correctif DB : un 23505 residuel sur CE index precis (vraie collision
// concurrente, en principe deja tres improbable grace au verrou
// pg_advisory_xact_lock dans allocate_next_sku) declenche un nouvel essai
// -- le trigger recalculera un sku frais a chaque tentative -- jamais un
// retry aveugle sur n'importe quelle erreur, et jamais plus de
// MAX_SKU_INSERT_ATTEMPTS. Si `sku` est deja fourni explicitement (reprise
// d'un numero depuis le titre Vinted), un retry ne changerait rien
// puisque la valeur inseree resterait identique -- aucun retry dans ce
// cas, l'erreur (probablement une vraie incoherence de donnees) remonte
// immediatement.
const MAX_SKU_INSERT_ATTEMPTS = 3;
const SKU_UNIQUE_CONSTRAINT = "listings_user_sku_unique";

// Retourne l'id de la ligne creee -- necessaire depuis le 2026-08-06 pour
// que recordSingleItemImport puisse y rattacher un premier point
// d'historique (listing_metric_snapshots), voir plus bas.
async function insertListingWithSkuRetry(
  client: ReturnType<typeof supabaseWithToken>,
  row: Record<string, unknown>
): Promise<string> {
  const allowRetry = row.sku === null || row.sku === undefined;
  const attempts = allowRetry ? MAX_SKU_INSERT_ATTEMPTS : 1;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { data, error } = await client.from("listings").insert(row).select("id").single();
    if (!error) return data.id as string;

    const isSkuCollision = error.code === "23505" && error.message?.includes(SKU_UNIQUE_CONSTRAINT);
    if (isSkuCollision && attempt < attempts) {
      logger.warn(`Collision de SKU a l'insertion (tentative ${attempt}/${attempts}), nouvel essai`, error.message);
      continue;
    }
    if (isSkuCollision) {
      logger.error("Collision de SKU persistante apres plusieurs tentatives", error.message);
      throw new Error(
        "Impossible d'attribuer un numéro d'article (SKU) unique après plusieurs tentatives. Réessaie l'import dans quelques instants."
      );
    }
    throw error;
  }
  // Inatteignable (la boucle retourne ou leve a chaque iteration) -- satisfait le typage.
  throw new Error("insertListingWithSkuRetry: boucle de tentatives epuisee sans resultat");
}

// Best-effort strict, meme principe que reportSkuRepair ci-dessus : un
// import individuel est une action explicite de l'utilisateur, son succes
// ne doit jamais dependre de ce point d'historique secondaire -- contraste
// deliberement avec recordListings ci-dessus (synchro passive de masse),
// qui propage une erreur d'ecriture de snapshot puisqu'elle n'a aucun
// utilisateur en attente d'un retour de succes/echec immediat.
async function recordImportSnapshot(
  client: ReturnType<typeof supabaseWithToken>,
  listingId: string,
  snapshot: { views: number | null; favourites: number | null; price: number | null; vintedStatus: string | null },
  capturedAt: string
): Promise<void> {
  const { error } = await client.from("listing_metric_snapshots").insert({
    listing_id: listingId,
    views: snapshot.views,
    favourites: snapshot.favourites,
    price: snapshot.price,
    vinted_status: snapshot.vintedStatus,
    captured_at: capturedAt,
  });
  if (error) {
    logger.warn("Enregistrement de l'historique a echoue (import individuel, best-effort)", error.message);
  }
}

// Mission "PHOTOS PERDUES APRES REPUBLICATION" (2026-08-17) : regle de
// fusion PURE (testable en isolation) -- invariant produit demande
// explicitement : "les photos historiques locales doivent etre conservees
// tant qu'une nouvelle source complete et explicitement valide ne les
// remplace pas". "Complete" est traduit ici par la comparaison la plus
// simple et la plus sure disponible sans inspecter le CONTENU des URLs
// (ResellOS n'a aucun moyen de savoir si une URL individuelle est valide) :
// un nombre de photos AU MOINS EGAL a l'existant. Une extraction qui en
// remonte MOINS ne remplace jamais -- l'existant est conserve tel quel,
// jamais complete/reconstruit artificiellement (demande explicite : "ne
// reconstruis pas artificiellement 5 photos a partir d'une seule").
export function mergeImageUrls(existingUrls: string[], incomingUrls: string[]): string[] {
  return incomingUrls.length >= existingUrls.length ? incomingUrls : existingUrls;
}

export async function recordSingleItemImport(
  vintedUsername: string,
  item: SingleItemPayload
): Promise<{ created: boolean; draftProtected: boolean }> {
  const valid = await getValidAccessToken();
  if (!valid) {
    throw new Error("Extension non appairee");
  }

  const client = supabaseWithToken(valid.accessToken);

  const { data: account, error: accountError } = await client
    .from("vinted_accounts")
    .select("id")
    .eq("user_id", valid.userId)
    .eq("vinted_username", vintedUsername)
    .maybeSingle();

  if (accountError) {
    logger.error("Recherche du compte Vinted a echoue (import)", accountError.message);
    throw accountError;
  }

  if (!account) {
    throw new Error(
      `Le compte "${vintedUsername}" n'est pas encore connu de ResellOS. Visite d'abord ton profil Vinted (onglet Stock, bouton Synchroniser) pour le connecter, puis reviens importer cette annonce.`
    );
  }

  const vintedAccountId = account.id;

  const { data: existing, error: selectError } = await client
    .from("listings")
    .select("id, vinted_sync_status, views, favourites, vinted_status, image_urls")
    .eq("vinted_account_id", vintedAccountId)
    .eq("vinted_item_id", item.vintedItemId)
    .maybeSingle();

  if (selectError) {
    logger.error("Recherche d'annonce existante a echoue (import)", selectError.message);
    throw selectError;
  }

  const syncedAt = new Date().toISOString();
  // Le nombre extrait ne sert plus qu'a nettoyer le titre (decision
  // explicite 2026-07-26, "le systeme ne doit plus deviner les SKU a
  // partir des titres") -- avant, ce nombre etait repris comme sku
  // explicite au premier import ; desormais le sku vient TOUJOURS du
  // trigger d'allocation (assign_sku_before_insert), jamais du texte du
  // titre, meme au tout premier import d'un article portant encore un
  // ancien numero manuel.
  const { title: cleanTitle } = extractSkuFromTitle(item.title);

  // Mission "PHOTOS PERDUES APRES REPUBLICATION" (2026-08-17) -- CAUSE REELLE
  // confirmee par audit direct : recordSingleItemImport() ecrivait jusqu'ici
  // item.imageUrls SANS CONDITION, y compris quand cette fonction est
  // appelee automatiquement par enrichListingIfNeeded() (enrichListing.ts)
  // pendant une republication -- ce chemin visite la page Vinted de
  // l'ANCIENNE annonce, qui peut etre devenue masquee/supprimee/introuvable
  // (exactement le cas qui declenche le bandeau "n'est plus en ligne sur
  // Vinted" dans PublishConfirmationModal.tsx). Sur une telle page,
  // extractPhotoUrls() (itemSelectors.ts, purement DOM) ne trouve plus les
  // vignettes reelles et ne remonte qu'un extrait degrade (souvent 1 photo
  // residuelle, parfois 0) -- ecrit tel quel, ce degrade EFFACAIT
  // silencieusement un historique de 5 photos reelles capture bien avant.
  // mergeImageUrls() (export pour test) applique desormais l'invariant
  // produit demande explicitement : ne jamais degrader `image_urls` -- une
  // nouvelle extraction ne remplace l'existant que si elle en contient AU
  // MOINS AUTANT (source complete ou genuinement plus riche), jamais moins.
  const image_urls = mergeImageUrls(existing?.image_urls ?? [], item.imageUrls);

  const vintedFields = {
    title: cleanTitle,
    description: item.description ?? "",
    brand: item.brand ?? "",
    category: item.category ?? "",
    color: item.color ?? "",
    size: item.size ?? "",
    material: item.material ?? "",
    condition: item.condition ?? "",
    price: item.price ?? 0,
    image_urls,
    vinted_url: item.vintedUrl,
    synced_at: syncedAt,
    // Reconciliation explicite (bug reel demontre le 2026-07-16) : ce
    // bouton EST le mecanisme de reconciliation en lecture seule -- son
    // seul but est de faire refleter a ResellOS l'etat REEL de Vinted, sur
    // un clic delibere de l'utilisateur. Retirer vinted_sync_status="sync_failed"
    // (banniere d'echec obsolete une fois les valeurs reelles relues et
    // ecrites) fait partie de cette reconciliation.
    vinted_sync_status: "sync_success" as const,
  };

  if (existing) {
    // ANCIEN comportement (introduit 2026-07-15, RETIRE le 2026-07-16) :
    // ce bloc protegeait un "brouillon local en attente" (vinted_sync_status
    // = sync_pending/sync_failed) en n'ecrivant QUE vinted_url/synced_at,
    // preservant titre/prix/description existants. Bug reel demontre en
    // audit direct de l'historique action_log : cette protection s'applique
    // aussi bien a une VRAIE edition en attente qu'a un ECHEC d'edition deja
    // abandonne par l'utilisateur (comme ici : plusieurs tentatives
    // d'edition ont echoue, le prix local est simplement PERIME, pas un
    // brouillon volontaire) -- dans ce second cas, la protection empechait
    // silencieusement le SEUL mecanisme de reconciliation disponible de
    // fonctionner ("Mettre a jour dans ResellOS" rapportait un succes sans
    // jamais ecrire le prix reel). Le import explicite (Partie 2, doc
    // d'origine : "une action deliberee de l'utilisateur sur cet article
    // precis, pas une synchro de fond") est cense TOUJOURS refleter Vinted
    // sur un clic explicite -- seule la synchro PASSIVE en masse
    // (recordListings ci-dessus) doit encore proteger un brouillon non
    // synchronise, car elle n'est jamais un choix delibere de l'utilisateur
    // sur CET article precis.
    const { error: updateError } = await client.from("listings").update(vintedFields).eq("id", existing.id);
    if (updateError) {
      logger.error("Mise a jour de l'article importe a echoue", updateError.message);
      throw updateError;
    }
    logger.info("Article Vinted reimporte (mis a jour, reconciliation complete)", { vintedItemId: item.vintedItemId });
    // vues/favoris/statut ne sont PAS rafraichis par ce chemin (import
    // individuel ne touche que titre/description/prix/photos/... -- voir
    // vintedFields ci-dessus) : le snapshot reflete donc les dernieres
    // valeurs connues (inchangees), pas une lecture fraiche, mais reste un
    // vrai point d'historique daté plutot qu'aucun point du tout.
    await recordImportSnapshot(
      client,
      existing.id,
      { views: existing.views, favourites: existing.favourites, price: item.price ?? 0, vintedStatus: existing.vinted_status },
      syncedAt
    );
    await reportSkuRepair(client, valid.userId, "post-import");
    return { created: false, draftProtected: false };
  }

  const insertedId = await insertListingWithSkuRetry(client, {
    user_id: valid.userId,
    vinted_account_id: vintedAccountId,
    vinted_item_id: item.vintedItemId,
    ...vintedFields,
    purchase_price: null,
    status: "en_stock",
    sold_price: null,
    sold_date: null,
    fees: 0,
    is_favorite: false,
    // Statut Vinted reellement inconnu a l'import (la page item ne fournit
    // pas de signal fiable equivalent a wardrobeApi.ts) -- laisse null
    // plutot que de deviner "online" (aucune donnee inventee). Le prochain
    // passage sur le profil du compte (synchro de fond) le remplira via
    // fetchAllWardrobeItems.
    vinted_status: null,
    favourites: null,
    views: null,
    // sku volontairement absent : laisse toujours le trigger DB
    // (assign_sku_before_insert) allouer automatiquement le prochain
    // numero libre, jamais une valeur devinee depuis le titre.
  });

  logger.info("Article Vinted importe", { vintedItemId: item.vintedItemId });
  // Premier point d'historique de cette annonce -- vues/favoris/statut
  // volontairement null (voir commentaire au-dessus de l'insertion :
  // reellement inconnus a l'import, jamais devines), coherent avec ce qui
  // vient d'etre ecrit sur `listings` elle-meme.
  await recordImportSnapshot(client, insertedId, { views: null, favourites: null, price: item.price ?? 0, vintedStatus: null }, syncedAt);
  await reportSkuRepair(client, valid.userId, "post-import");
  return { created: true, draftProtected: false };
}
