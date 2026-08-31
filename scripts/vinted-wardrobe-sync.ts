import { chromium, type Page } from "playwright";
import { supabase } from "./supabase";
import { parseWardrobeItem, stripSkuSuffix, type ItemDetail, type WardrobeItem } from "./wardrobeItemParsing";

// Sync automatique en arriere-plan (2026-08-31, demande produit) : detecte
// les nouveaux articles EN LIGNE sur des comptes Vinted precis et les
// importe dans ResellOS sans aucune intervention manuelle -- meme principe
// que "Synchroniser maintenant" (extension/src/background/sync.ts,
// recordListings) mais declenche par un cron plutot que par la visite du
// profil Vinted dans un navigateur avec l'extension installee.
//
// POURQUOI un cron GitHub Actions + Playwright et pas une Edge Function
// Supabase qui appelle l'API Vinted directement : la seule voie deja
// EPROUVEE en production pour parler a Vinted sans session utilisateur
// authentifiee est scripts/vinted-scan.ts (cron toutes les 4h, meme
// fichier de workflow inspire ici) -- elle utilise un vrai navigateur
// headless (Chromium/Playwright), jamais un fetch() brut. Cette prudence
// n'est pas gratuite : Vinted protege plusieurs de ses routes avec DataDome
// (voir docs/EXTENSION.md et les commentaires de publishListing.ts cote
// extension), et un fetch() serveur-a-serveur sans empreinte navigateur
// reelle est exactement le profil de trafic qu'un anti-bot bloque. Reprend
// donc scrupuleusement la meme methode (page.goto, jamais page.request ni
// fetch), par prudence pour de VRAIS comptes Vinted (voir plus bas).
//
// COMPTES CIBLES : deux comptes Vinted reels de l'utilisateur fondateur
// (alexisdzk, matleshop), rattaches a UN SEUL compte ResellOS -- decision
// actee explicitement le 2026-08-31 (vinted_accounts.user_id ci-dessous),
// necessaire car "alexisdzk" existait en base sous DEUX comptes ResellOS
// differents (un ancien test jamais synchronise completement). Resolus par
// nom d'utilisateur Vinted + user_id ResellOS a l'execution (jamais un id
// vinted_accounts fige en dur) : robuste si ces lignes sont un jour
// recreees, et desambiguise le doublon sans avoir a deviner.
const TARGET_USER_ID = "e44e1be5-5646-4ca3-b840-9dc4b093c830";
const TARGET_VINTED_USERNAMES = ["alexisdzk", "matleshop"];

// Meme endpoint que extension/src/content/wardrobeApi.ts (decouvert en
// inspectant le reseau d'un vrai profil Vinted, voir
// [[project_vinted_wardrobe_api]]) -- teste anonymement (sans session) : ne
// renvoie que les articles actifs/publics, exactement ce dont ce script a
// besoin ("les items EN LIGNE sur Vinted"). Jamais utilise pour lire des
// annonces vendues/reservees/brouillons -- ce cron ignore volontairement ce
// qu'une synchro authentifiee (extension) sait faire en plus.
const WARDROBE_API_BASE = "https://www.vinted.fr/api/v2/wardrobe";
const MAX_WARDROBE_PAGES = 20; // 20 x 50 = 1000 articles, tres large marge au-dessus des comptes reels vises.
const NAVIGATION_TIMEOUT_MS = 30000;

interface TargetAccount {
  id: string; // vinted_accounts.id
  userId: string; // listings.user_id (= TARGET_USER_ID, mais lu depuis la ligne reelle plutot que suppose)
  vintedUserId: string;
  vintedUsername: string;
}

async function resolveTargetAccounts(): Promise<TargetAccount[]> {
  const { data, error } = await supabase
    .from("vinted_accounts")
    .select("id, user_id, vinted_user_id, vinted_username")
    .eq("user_id", TARGET_USER_ID)
    .in("vinted_username", TARGET_VINTED_USERNAMES);

  if (error) {
    throw new Error(`Lecture de vinted_accounts échouée : ${error.message}`);
  }

  const rows = (data ?? []) as { id: string; user_id: string; vinted_user_id: string | null; vinted_username: string | null }[];
  const accounts: TargetAccount[] = rows
    .filter((r): r is typeof r & { vinted_user_id: string } => !!r.vinted_user_id)
    .map((r) => ({ id: r.id, userId: r.user_id, vintedUserId: r.vinted_user_id, vintedUsername: r.vinted_username ?? "" }));

  for (const username of TARGET_VINTED_USERNAMES) {
    if (!accounts.some((a) => a.vintedUsername === username)) {
      console.error(`[wardrobe] Compte "${username}" introuvable pour l'utilisateur ${TARGET_USER_ID} -- ignoré ce run.`);
    }
  }
  return accounts;
}

// parseWardrobeItem / stripSkuSuffix : voir wardrobeItemParsing.ts (module
// pur, testable sans Playwright ni Supabase).

// Meme technique que gotoWithRetry (vinted-scan.ts) mais sans attente de
// selecteur DOM : la reponse EST le contenu (JSON brut), rien a laisser
// "se poser". page.goto (jamais page.request/fetch) pour la raison
// documentee en tete de fichier.
async function fetchWardrobePage(page: Page, vintedUserId: string, pageNum: number): Promise<{ items: WardrobeItem[]; currentPage: number; totalPages: number } | null> {
  const url = `${WARDROBE_API_BASE}/${vintedUserId}/items?page=${pageNum}&per_page=50&order=relevance`;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[wardrobe] Navigation échouée pour ${url} : ${message}`);
    return null;
  }

  const raw = await page.evaluate(() => document.body.innerText);
  let parsed: { items?: unknown[]; pagination?: { current_page?: number; total_pages?: number } };
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(`[wardrobe] Réponse non-JSON pour ${url} (probablement bloqué/redirigé) -- arrêt de la pagination pour ce compte.`);
    return null;
  }

  const items: WardrobeItem[] = (parsed.items ?? [])
    .map(parseWardrobeItem)
    .filter((it): it is WardrobeItem => it !== null);

  return {
    items,
    currentPage: parsed.pagination?.current_page ?? pageNum,
    totalPages: parsed.pagination?.total_pages ?? pageNum,
  };
}

async function fetchAllWardrobeItems(page: Page, vintedUserId: string): Promise<WardrobeItem[]> {
  const all: WardrobeItem[] = [];
  for (let pageNum = 1; pageNum <= MAX_WARDROBE_PAGES; pageNum++) {
    const result = await fetchWardrobePage(page, vintedUserId, pageNum);
    if (!result) break;
    all.push(...result.items);
    if (result.currentPage >= result.totalPages) break;
  }
  return all;
}

// Extraction de la page de detail d'un article -- reprend EXACTEMENT les
// selecteurs verifies en direct de extension/src/content/itemSelectors.ts
// (jamais devines ici) : le bloc ld+json (titre/description/prix/marque/
// categorie/couleur) complete par les 3 attributs qu'il ne couvre pas
// (taille/etat/matiere) et la galerie photo complete. Dupliquee plutot
// qu'importee (meme raison que stripSkuSuffix ci-dessus : ce fichier tourne
// dans page.evaluate(), pas dans le contexte extension).
async function fetchItemDetail(page: Page, url: string): Promise<ItemDetail> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  await page.waitForSelector('script[type="application/ld+json"]', { timeout: 10000 }).catch(() => {});

  return page.evaluate(() => {
    function firstTextNodeContent(container: Element | null): string | null {
      if (!container) return null;
      const span = container.querySelector("span");
      const node = span?.childNodes[0];
      if (!node || node.nodeType !== Node.TEXT_NODE) return null;
      const text = node.textContent?.trim();
      return text ? text : null;
    }

    const script = document.querySelector('script[type="application/ld+json"]');
    let ld: { name?: string; description?: string; brand?: { name?: string }; offers?: { price?: number }; category?: string; color?: string } = {};
    if (script?.textContent) {
      try {
        ld = JSON.parse(script.textContent);
      } catch {
        // ld reste {} -- une page sans ld+json exploitable ne doit jamais faire planter l'import.
      }
    }

    const size = firstTextNodeContent(document.querySelector('[data-testid="item-attributes-size"] [itemprop="size"]'));
    const condition = firstTextNodeContent(document.querySelector('[data-testid="item-attributes-status"] [itemprop="status"]'));
    const material = firstTextNodeContent(document.querySelector('[data-testid="item-attributes-material"] [itemprop="material"]'));

    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img[data-testid^="item-photo-"][data-testid$="--img"]'));
    const photoUrls = [...new Set(imgs.map((img) => img.getAttribute("src")).filter((src): src is string => !!src))];

    return {
      title: ld.name ?? null,
      description: ld.description ?? null,
      price: typeof ld.offers?.price === "number" ? ld.offers.price : null,
      brand: ld.brand?.name ?? null,
      category: ld.category ?? null,
      color: ld.color ?? null,
      size,
      condition,
      material,
      photoUrls,
    };
  });
}

// Meme defense qu'insertListingWithSkuRetry (extension/src/background/sync.ts)
// et la meme raison : une collision residuelle sur listings_user_sku_unique
// (23505) declenche un nouvel essai, le trigger recalculant un SKU frais a
// chaque tentative -- jamais plus de MAX_SKU_INSERT_ATTEMPTS, jamais de
// retry aveugle sur une autre erreur.
const MAX_SKU_INSERT_ATTEMPTS = 3;
const SKU_UNIQUE_CONSTRAINT = "listings_user_sku_unique";

async function insertListingWithSkuRetry(row: Record<string, unknown>): Promise<string> {
  for (let attempt = 1; attempt <= MAX_SKU_INSERT_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.from("listings").insert(row).select("id").single();
    if (!error) return (data as { id: string }).id;

    const isSkuCollision = error.code === "23505" && error.message?.includes(SKU_UNIQUE_CONSTRAINT);
    if (isSkuCollision && attempt < MAX_SKU_INSERT_ATTEMPTS) {
      console.warn(`[wardrobe] Collision de SKU à l'insertion (tentative ${attempt}/${MAX_SKU_INSERT_ATTEMPTS}), nouvel essai`);
      continue;
    }
    throw error;
  }
  throw new Error("insertListingWithSkuRetry: tentatives épuisées sans résultat");
}

async function importNewItem(page: Page, account: TargetAccount, item: WardrobeItem): Promise<void> {
  const detail = await fetchItemDetail(page, item.url);
  const now = new Date().toISOString();
  const title = stripSkuSuffix((detail.title ?? item.title).trim());
  const price = detail.price ?? item.price ?? 0;
  const imageUrls = detail.photoUrls.length > 0 ? detail.photoUrls : item.photoUrl ? [item.photoUrl] : [];

  const listingId = await insertListingWithSkuRetry({
    user_id: account.userId,
    vinted_account_id: account.id,
    vinted_item_id: item.id,
    title,
    description: detail.description ?? "",
    brand: detail.brand ?? "",
    category: detail.category ?? "",
    color: detail.color ?? "",
    size: detail.size ?? "",
    material: detail.material ?? "",
    condition: detail.condition ?? "",
    price,
    image_urls: imageUrls,
    vinted_url: item.url,
    // 'online' et non null (contrairement a recordSingleItemImport) : cet
    // article vient d'etre lu depuis la liste des annonces EN LIGNE, le
    // statut est donc reellement connu ici, jamais devine.
    vinted_status: "online",
    favourites: item.favourites,
    views: item.views,
    synced_at: now,
    purchase_price: null,
    status: "en_stock",
    sold_date: null,
    sold_price: null,
    fees: 0,
    is_favorite: false,
  });

  // Meme discipline "best-effort" que reportSkuRepair/recordImportSnapshot
  // (extension/src/background/sync.ts) : l'import de l'article a deja
  // reussi au-dessus, ni l'historique ni la notification ne doivent
  // l'annuler s'ils echouent.
  const { error: snapshotError } = await supabase.from("listing_metric_snapshots").insert({
    listing_id: listingId,
    views: item.views,
    favourites: item.favourites,
    price,
    vinted_status: "online",
    captured_at: now,
  });
  if (snapshotError) console.warn(`[wardrobe] Historique (snapshot) non enregistré (best-effort) : ${snapshotError.message}`);

  const { error: notifError } = await supabase.from("notifications").insert({
    user_id: account.userId,
    type: "auto_sync_new_listing",
    title: "Nouvel article synchronisé",
    body: `${title || "Une annonce"} a été détectée sur ${account.vintedUsername} et ajoutée automatiquement à ton stock.`,
    target_page: "watchlist",
  });
  if (notifError) console.warn(`[wardrobe] Notification non créée (best-effort) : ${notifError.message}`);

  console.log(`[wardrobe] Nouvel article importé : ${item.id} — "${title}" (${account.vintedUsername})`);
}

async function syncAccount(page: Page, account: TargetAccount): Promise<void> {
  console.log(`[wardrobe] Scan de ${account.vintedUsername} (id Vinted ${account.vintedUserId})…`);

  const { data: knownRows, error: knownError } = await supabase
    .from("listings")
    .select("vinted_item_id")
    .eq("vinted_account_id", account.id)
    .not("vinted_item_id", "is", null);
  if (knownError) {
    console.error(`[wardrobe] Lecture des annonces connues échouée pour ${account.vintedUsername} : ${knownError.message}`);
    return;
  }
  const knownIds = new Set((knownRows ?? []).map((r) => (r as { vinted_item_id: string }).vinted_item_id));

  const wardrobeItems = await fetchAllWardrobeItems(page, account.vintedUserId);
  console.log(`[wardrobe] ${account.vintedUsername} : ${wardrobeItems.length} annonce(s) en ligne sur Vinted, ${knownIds.size} déjà connue(s) de ResellOS`);

  const newItems = wardrobeItems.filter((it) => !knownIds.has(it.id));
  if (newItems.length === 0) {
    console.log(`[wardrobe] ${account.vintedUsername} : aucune nouveauté`);
    return;
  }
  console.log(`[wardrobe] ${account.vintedUsername} : ${newItems.length} nouvel(le/aux) article(s) détecté(s)`);

  for (const item of newItems) {
    try {
      await importNewItem(page, account, item);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Un article qui echoue ne doit jamais bloquer les suivants -- meme
      // discipline que scanSearch/vinted-scan.ts.
      console.error(`[wardrobe] Import de l'article ${item.id} (${account.vintedUsername}) échoué : ${message}`);
    }
  }
}

async function main(): Promise<void> {
  const accounts = await resolveTargetAccounts();
  if (accounts.length === 0) {
    console.error("[wardrobe] Aucun compte cible résolu -- rien à faire.");
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const account of accounts) {
      try {
        await syncAccount(page, account);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Un compte qui echoue completement (ex. wardrobe injoignable) ne
        // doit jamais empecher le scan de l'autre compte cible.
        console.error(`[wardrobe] Scan du compte ${account.vintedUsername} échoué : ${message}`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
