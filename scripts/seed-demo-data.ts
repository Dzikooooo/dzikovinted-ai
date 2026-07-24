import { supabase } from "./supabase";

// Peuple un compte de demonstration dedie avec des donnees fictives mais
// realistes (annonces, ventes, statistiques) pour la Screenshot Library
// marketing. Ne touche jamais que les lignes appartenant au user_id
// resolu depuis l'email passe en argument - jamais un autre compte.
//
// Usage :
//   tsx scripts/seed-demo-data.ts <email>          -> dry-run, n'ecrit rien
//   tsx scripts/seed-demo-data.ts <email> --yes     -> execute reellement
//
// Idempotent : si des annonces/comptes Vinted existent deja pour ce
// user_id, ils sont supprimes avant reinsertion (les snapshots suivent
// via ON DELETE CASCADE sur listing_metric_snapshots.listing_id).

interface DemoListing {
  title: string;
  brand: string;
  category: string;
  color: string;
  size: string;
  material: string;
  condition: string;
  price: number;
  purchasePrice: number;
  createdDaysAgo: number;
  status: "vendu" | "en_stock";
  vintedStatus: "online" | "reserved" | "sold_completed";
  soldDaysAgo?: number;
  views: number;
  favourites: number;
  snapshots?: { daysAgo: number; views: number; favourites: number }[];
}

const DEMO_ACCOUNT = {
  label: "Dressing Demo",
  vintedUserId: "demo-000000",
  vintedUsername: "resellos.demo",
};

// 13 vendues (etalees sur ~11 semaines, densite croissante recemment) +
// 7 en vente (listees sur les 3 dernieres semaines). Marques/categories
// generiques de seconde main, aucune ne reprend les exemples deja
// codes en dur dans ProductPreview.tsx (Sweat Nike / Polo Ralph Lauren)
// pour ne jamais confondre "exemple marketing" et "donnee de demo reelle".
const DEMO_LISTINGS: DemoListing[] = [
  { title: "Hoodie Adidas Originals trefoil noir taille M", brand: "Adidas", category: "Sweats", color: "Noir", size: "M", material: "Coton", condition: "Bon etat", price: 32, purchasePrice: 12, createdDaysAgo: 78, status: "vendu", vintedStatus: "sold_completed", soldDaysAgo: 63, views: 94, favourites: 6 },
  { title: "Jean Levi's 501 bleu brut taille 34", brand: "Levi's", category: "Jeans", color: "Bleu", size: "34", material: "Denim", condition: "Tres bon etat", price: 40, purchasePrice: 16, createdDaysAgo: 75, status: "vendu", vintedStatus: "sold_completed", soldDaysAgo: 60, views: 121, favourites: 9 },
  { title: "Robe midi Zara imprime leopard taille S", brand: "Zara", category: "Robes", color: "Marron", size: "S", material: "Viscose", condition: "Bon etat", price: 22, purchasePrice: 8, createdDaysAgo: 72, status: "vendu", vintedStatus: "sold_completed", soldDaysAgo: 58, views: 76, favourites: 4 },
  { title: "Baskets New Balance 574 grises pointure 41", brand: "New Balance", category: "Chaussures", color: "Gris", size: "41", material: "Mesh/suede", condition: "Bon etat", price: 48, purchasePrice: 20, createdDaysAgo: 68, status: "vendu", vintedStatus: "sold_completed", soldDaysAgo: 55, views: 138, favourites: 11 },
  { title: "Parka Uniqlo kaki taille L", brand: "Uniqlo", category: "Manteaux", color: "Kaki", size: "L", material: "Nylon", condition: "Tres bon etat", price: 55, purchasePrice: 22, createdDaysAgo: 64, status: "vendu", vintedStatus: "sold_completed", soldDaysAgo: 50, views: 102, favourites: 7 },
  { title: "Chemise Ralph Lauren rayee blanc et bleu taille M", brand: "Ralph Lauren", category: "Chemises", color: "Blanc", size: "M", material: "Coton", condition: "Tres bon etat", price: 29, purchasePrice: 10, createdDaysAgo: 60, status: "vendu", vintedStatus: "sold_completed", soldDaysAgo: 46, views: 88, favourites: 5 },
  { title: "Sac a dos Carhartt WIP kaki", brand: "Carhartt", category: "Sacs", color: "Kaki", size: "Unique", material: "Toile", condition: "Bon etat", price: 35, purchasePrice: 14, createdDaysAgo: 55, status: "vendu", vintedStatus: "sold_completed", soldDaysAgo: 42, views: 67, favourites: 3 },
  { title: "Pull Zara col rond beige taille M", brand: "Zara", category: "Pulls", color: "Beige", size: "M", material: "Laine", condition: "Bon etat", price: 15, purchasePrice: 5, createdDaysAgo: 48, status: "vendu", vintedStatus: "sold_completed", soldDaysAgo: 36, views: 54, favourites: 2 },
  { title: "Baskets Nike Air Force 1 blanches pointure 43", brand: "Nike", category: "Chaussures", color: "Blanc", size: "43", material: "Cuir", condition: "Bon etat", price: 62, purchasePrice: 28, createdDaysAgo: 42, status: "vendu", vintedStatus: "sold_completed", soldDaysAgo: 30, views: 156, favourites: 14 },
  { title: "Veste en jean Levi's trucker bleue taille M", brand: "Levi's", category: "Vestes", color: "Bleu", size: "M", material: "Denim", condition: "Tres bon etat", price: 45, purchasePrice: 18, createdDaysAgo: 35, status: "vendu", vintedStatus: "sold_completed", soldDaysAgo: 24, views: 99, favourites: 8 },
  { title: "Robe longue H&M noire taille M", brand: "H&M", category: "Robes", color: "Noir", size: "M", material: "Polyester", condition: "Bon etat", price: 14, purchasePrice: 4, createdDaysAgo: 28, status: "vendu", vintedStatus: "sold_completed", soldDaysAgo: 18, views: 41, favourites: 1 },
  { title: "Sweat Champion gris chine taille L", brand: "Champion", category: "Sweats", color: "Gris", size: "L", material: "Coton", condition: "Bon etat", price: 24, purchasePrice: 9, createdDaysAgo: 20, status: "vendu", vintedStatus: "sold_completed", soldDaysAgo: 10, views: 73, favourites: 6 },
  { title: "Manteau Zara laine camel taille S", brand: "Zara", category: "Manteaux", color: "Camel", size: "S", material: "Laine", condition: "Tres bon etat", price: 58, purchasePrice: 24, createdDaysAgo: 14, status: "vendu", vintedStatus: "sold_completed", soldDaysAgo: 4, views: 112, favourites: 10 },

  { title: "Baskets Adidas Samba noires pointure 42", brand: "Adidas", category: "Chaussures", color: "Noir", size: "42", material: "Cuir", condition: "Bon etat", price: 52, purchasePrice: 21, createdDaysAgo: 18, status: "en_stock", vintedStatus: "online", views: 61, favourites: 4,
    snapshots: [{ daysAgo: 14, views: 8, favourites: 0 }, { daysAgo: 7, views: 34, favourites: 2 }, { daysAgo: 2, views: 61, favourites: 4 }] },
  { title: "T-shirt Ralph Lauren blanc logo brode taille M", brand: "Ralph Lauren", category: "T-shirts", color: "Blanc", size: "M", material: "Coton", condition: "Tres bon etat", price: 18, purchasePrice: 6, createdDaysAgo: 14, status: "en_stock", vintedStatus: "online", views: 22, favourites: 1,
    snapshots: [{ daysAgo: 10, views: 5, favourites: 0 }, { daysAgo: 4, views: 22, favourites: 1 }] },
  { title: "Jean mom Levi's taille 36", brand: "Levi's", category: "Jeans", color: "Bleu", size: "36", material: "Denim", condition: "Bon etat", price: 34, purchasePrice: 13, createdDaysAgo: 10, status: "en_stock", vintedStatus: "online", views: 28, favourites: 3,
    snapshots: [{ daysAgo: 6, views: 10, favourites: 1 }, { daysAgo: 1, views: 28, favourites: 3 }] },
  { title: "Doudoune sans manches The North Face bleu marine taille M", brand: "The North Face", category: "Manteaux", color: "Bleu marine", size: "M", material: "Polyester", condition: "Tres bon etat", price: 46, purchasePrice: 19, createdDaysAgo: 7, status: "en_stock", vintedStatus: "online", views: 19, favourites: 2,
    snapshots: [{ daysAgo: 6, views: 3, favourites: 0 }, { daysAgo: 2, views: 19, favourites: 2 }] },
  { title: "Robe pull Zara cotelee taille S", brand: "Zara", category: "Robes", color: "Vert", size: "S", material: "Viscose", condition: "Bon etat", price: 17, purchasePrice: 6, createdDaysAgo: 5, status: "en_stock", vintedStatus: "reserved", views: 15, favourites: 2 },
  { title: "Baskets Puma Suede rouges pointure 40", brand: "Puma", category: "Chaussures", color: "Rouge", size: "40", material: "Daim", condition: "Bon etat", price: 39, purchasePrice: 15, createdDaysAgo: 3, status: "en_stock", vintedStatus: "online", views: 7, favourites: 0 },
  { title: "Chemise en jean Uniqlo bleue taille L", brand: "Uniqlo", category: "Chemises", color: "Bleu", size: "L", material: "Denim", condition: "Bon etat", price: 21, purchasePrice: 8, createdDaysAgo: 1, status: "en_stock", vintedStatus: "online", views: 2, favourites: 0 },
];

// Depenses realistes de revendeur, etalees sur la meme fenetre que les
// annonces. AccountingPage/ExpensesPage lisent cette table par user_id --
// Opportunites/Watchlist ne sont PAS seedees ici : market_opportunities
// est une table globale partagee (aucune colonne user_id, RLS "using (true)"),
// deja alimentee par le pipeline de scan reel pour tous les comptes, et
// watchlist expose deja 7 recherches "plateforme" (user_id null, visibles
// de tous) en plus des recherches personnelles ci-dessous.
const DEMO_EXPENSES: { category: string; amount: number; note: string; daysAgo: number }[] = [
  { category: "Emballage", amount: 18.5, note: "Enveloppes et etiquettes", daysAgo: 70 },
  { category: "Frais de port", amount: 24.9, note: "Envois groupes", daysAgo: 58 },
  { category: "Materiel", amount: 12.0, note: "Housses de protection", daysAgo: 45 },
  { category: "Emballage", amount: 15.2, note: "Cartons et papier bulle", daysAgo: 33 },
  { category: "Deplacement", amount: 9.8, note: "Depot La Poste", daysAgo: 26 },
  { category: "Frais de port", amount: 21.4, note: "Envois groupes", daysAgo: 17 },
  { category: "Materiel", amount: 7.5, note: "Etiquettes thermiques", daysAgo: 9 },
  { category: "Emballage", amount: 13.9, note: "Sacs postaux", daysAgo: 3 },
];

// Recherches personnelles (en plus des 7 recherches "plateforme" deja
// visibles de tout compte, user_id null, voir 20260707130000). Categories
// distinctes de celles-ci pour que la personnalisation soit visible.
const DEMO_WATCHLIST: { brand: string; model: string; category: string; priority: number; minProfit: number; minRoi: number }[] = [
  { brand: "Nike", model: "Air Max 90", category: "Sneakers", priority: 2, minProfit: 25, minRoi: 55 },
  { brand: "Ralph Lauren", model: "Pull col V", category: "Pulls", priority: 1, minProfit: 15, minRoi: 45 },
  { brand: "Levi's", model: "Veste Sherpa", category: "Vestes", priority: 2, minProfit: 20, minRoi: 50 },
];

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function daysAgoDateOnly(n: number): string {
  return daysAgoIso(n).slice(0, 10);
}

async function resolveUserId(email: string): Promise<string> {
  const perPage = 200;
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers a echoue : ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < perPage) break;
    page += 1;
  }
  throw new Error(
    `Aucun utilisateur trouve pour "${email}". Cree et confirme d'abord ce compte dans l'app avant de lancer le seed.`
  );
}

async function main() {
  const email = process.argv[2];
  const confirmed = process.argv.includes("--yes");

  if (!email) {
    console.error("Usage : tsx scripts/seed-demo-data.ts <email> [--yes]");
    process.exit(1);
  }

  const userId = await resolveUserId(email);
  console.log(`Compte cible : ${email} (user_id ${userId})`);

  const { data: existingListings, error: listReadErr } = await supabase
    .from("listings")
    .select("id")
    .eq("user_id", userId);
  if (listReadErr) throw listReadErr;

  const { data: existingAccounts, error: accReadErr } = await supabase
    .from("vinted_accounts")
    .select("id, label")
    .eq("user_id", userId);
  if (accReadErr) throw accReadErr;

  const { data: existingExpenses, error: expReadErr } = await supabase
    .from("expenses")
    .select("id")
    .eq("user_id", userId);
  if (expReadErr) throw expReadErr;

  const { data: existingWatchlist, error: wlReadErr } = await supabase
    .from("watchlist")
    .select("id")
    .eq("user_id", userId);
  if (wlReadErr) throw wlReadErr;

  const snapshotCount = DEMO_LISTINGS.reduce((n, l) => n + (l.snapshots?.length ?? 0), 0);
  const soldCount = DEMO_LISTINGS.filter((l) => l.status === "vendu").length;

  console.log(`\nSera supprime (scope user_id = ${userId} uniquement) :`);
  console.log(`  - ${existingListings?.length ?? 0} annonce(s) existante(s)`);
  console.log(`  - ${existingAccounts?.length ?? 0} compte(s) Vinted existant(s) : ${(existingAccounts ?? []).map((a) => a.label).join(", ") || "aucun"}`);
  console.log(`  - leurs snapshots associes (cascade automatique)`);
  console.log(`  - ${existingExpenses?.length ?? 0} depense(s) existante(s)`);
  console.log(`  - ${existingWatchlist?.length ?? 0} recherche(s) personnelle(s) existante(s) (les 7 recherches "plateforme" partagees ne sont jamais touchees)`);

  console.log(`\nSera insere :`);
  console.log(`  - 1 compte Vinted demo ("${DEMO_ACCOUNT.label}", connecte, synchronise)`);
  console.log(`  - ${DEMO_LISTINGS.length} annonces (${soldCount} vendues / ${DEMO_LISTINGS.length - soldCount} en vente)`);
  console.log(`  - ${snapshotCount} snapshots de statistiques`);
  console.log(`  - ${DEMO_EXPENSES.length} depenses`);
  console.log(`  - ${DEMO_WATCHLIST.length} recherches personnelles (Opportunites/Watchlist restent alimentees par les donnees globales reelles, jamais fictives)`);

  if (!confirmed) {
    console.log("\nDRY-RUN — aucune ecriture effectuee. Relancer avec --yes pour executer reellement.");
    return;
  }

  if (existingListings?.length) {
    const { error } = await supabase.from("listings").delete().eq("user_id", userId);
    if (error) throw error;
  }
  if (existingAccounts?.length) {
    const { error } = await supabase.from("vinted_accounts").delete().eq("user_id", userId);
    if (error) throw error;
  }
  if (existingExpenses?.length) {
    const { error } = await supabase.from("expenses").delete().eq("user_id", userId);
    if (error) throw error;
  }
  if (existingWatchlist?.length) {
    const { error } = await supabase.from("watchlist").delete().eq("user_id", userId);
    if (error) throw error;
  }

  const { data: account, error: accInsertErr } = await supabase
    .from("vinted_accounts")
    .insert({
      user_id: userId,
      label: DEMO_ACCOUNT.label,
      vinted_user_id: DEMO_ACCOUNT.vintedUserId,
      vinted_username: DEMO_ACCOUNT.vintedUsername,
      connected: true,
      last_synced_at: new Date().toISOString(),
      is_default: true,
    })
    .select()
    .single();
  if (accInsertErr) throw accInsertErr;

  const rows = DEMO_LISTINGS.map((item, i) => ({
    user_id: userId,
    vinted_account_id: account.id,
    sku: i + 1,
    title: item.title,
    brand: item.brand,
    category: item.category,
    color: item.color,
    size: item.size,
    material: item.material,
    condition: item.condition,
    price: item.price,
    purchase_price: item.purchasePrice,
    purchase_date: daysAgoDateOnly(item.createdDaysAgo),
    created_at: daysAgoIso(item.createdDaysAgo),
    status: item.status,
    sold_price: item.status === "vendu" ? item.price : null,
    sold_date: item.soldDaysAgo != null ? daysAgoDateOnly(item.soldDaysAgo) : null,
    fees: 0,
    vinted_status: item.vintedStatus,
    vinted_sync_status: "sync_success",
    favourites: item.favourites,
    views: item.views,
    synced_at: new Date().toISOString(),
    image_urls: [],
  }));

  const { data: insertedListings, error: listInsertErr } = await supabase
    .from("listings")
    .insert(rows)
    .select("id, title");
  if (listInsertErr) throw listInsertErr;

  const snapshotRows: {
    listing_id: string;
    views: number;
    favourites: number;
    price: number;
    vinted_status: string;
    captured_at: string;
  }[] = [];

  for (const item of DEMO_LISTINGS) {
    if (!item.snapshots) continue;
    const listingId = insertedListings.find((l) => l.title === item.title)?.id;
    if (!listingId) continue;
    for (const snap of item.snapshots) {
      snapshotRows.push({
        listing_id: listingId,
        views: snap.views,
        favourites: snap.favourites,
        price: item.price,
        vinted_status: item.vintedStatus,
        captured_at: daysAgoIso(snap.daysAgo),
      });
    }
  }

  if (snapshotRows.length) {
    const { error: snapErr } = await supabase.from("listing_metric_snapshots").insert(snapshotRows);
    if (snapErr) throw snapErr;
  }

  const expenseRows = DEMO_EXPENSES.map((e) => ({
    user_id: userId,
    category: e.category,
    amount: e.amount,
    note: e.note,
    expense_date: daysAgoDateOnly(e.daysAgo),
  }));
  const { error: expInsertErr } = await supabase.from("expenses").insert(expenseRows);
  if (expInsertErr) throw expInsertErr;

  const watchlistRows = DEMO_WATCHLIST.map((w) => ({
    user_id: userId,
    brand: w.brand,
    model: w.model,
    category: w.category,
    priority: w.priority,
    min_profit: w.minProfit,
    min_roi: w.minRoi,
  }));
  const { error: wlInsertErr } = await supabase.from("watchlist").insert(watchlistRows);
  if (wlInsertErr) throw wlInsertErr;

  console.log(
    `\nTermine. ${insertedListings.length} annonces, ${snapshotRows.length} snapshots, ${expenseRows.length} depenses et ${watchlistRows.length} recherches personnelles inseres sur le compte demo.`
  );
  console.log(
    `Opportunites/Watchlist affichent en plus les donnees globales reelles deja en base (recherches "plateforme" + derniers scans) -- rien a seeder pour ces deux ecrans.`
  );
}

main().catch((err) => {
  console.error("Echec du seed :", err instanceof Error ? err.message : err);
  process.exit(1);
});
