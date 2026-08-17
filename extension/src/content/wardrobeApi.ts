// Recuperation exhaustive des annonces d'un compte Vinted via l'API REST
// same-origin que le propre frontend de Vinted appelle pour charger la
// suite du "wardrobe" au defilement (decouvert en direct le 2026-07-09 en
// observant les requetes reseau de https://www.vinted.fr/member/<id> pendant
// un scroll). Pas un contournement anti-bot : c'est exactement la requete
// que la page emet elle-meme (voir EXTENSION.md §8/§sync). Remplace
// l'ancienne lecture du DOM (fragile, limitee au premier lot de cartes
// rendues, incapable de distinguer les statuts) par une pagination fiable
// jusqu'a epuisement complet - aucune limite arbitraire.
//
// Mission "FIABILISATION SYNCHRO VINTED, lot 1" (2026-08-16) : CAUSE REELLE
// identifiee par audit -- l'ancienne version retournait un simple tableau
// pour TOUS les cas, y compris quand une page >= 2 echouait apres la
// premiere (`break`, items deja collectes renvoyes tels quels). Ce tableau
// tronque etait ensuite traite par sync.ts::recordListings() comme un scan
// COMPLET, dont toute absence sert de preuve de suppression -- une simple
// panne reseau transitoire sur la page 2/3 pouvait donc marquer a tort de
// VRAIES annonces `vinted_status='deleted'`. Retourne desormais un resultat
// STRUCTURE (`WardrobeFetchResult`) qui distingue explicitement un scan
// complet d'un scan partiel -- recordListings() (sync.ts) doit desormais
// EXIGER `complete === true` avant toute logique de suppression.

export interface WardrobeItem {
  vintedItemId: string;
  title: string;
  price: number | null;
  imageUrl: string | null;
  vintedUrl: string;
  favourites: number | null;
  views: number | null;
  status: string;
  brand: string | null;
  size: string | null;
}

interface VintedApiItem {
  id: number;
  title?: string;
  price?: { amount?: string };
  url?: string;
  photos?: { url?: string }[];
  favourite_count?: number;
  view_count?: number;
  is_draft?: boolean;
  is_closed?: boolean;
  is_reserved?: boolean;
  is_hidden?: boolean;
  is_processing?: boolean;
  brand?: string;
  size?: string;
}

interface VintedApiResponse {
  items?: VintedApiItem[];
  pagination?: { current_page: number; total_pages: number; total_entries: number };
}

const PER_PAGE = 50;

// Resultat structure -- `complete` est le champ qui protege sync.ts::recordListings()
// de tirer une conclusion "annonce supprimee" d'un scan tronque. `pagesRead`/
// `pagesExpected` sont purement diagnostiques (logs), jamais utilises pour
// une decision metier.
export interface WardrobeFetchResult {
  items: WardrobeItem[];
  complete: boolean;
  pagesRead: number;
  pagesExpected: number;
}

// Priorite explicite quand plusieurs booleens seraient vrais en meme temps
// (ex. une annonce fermee ne devrait normalement plus etre "reservee", mais
// on ne fait pas confiance a l'exhaustivite mutuelle de ces flags cote
// Vinted). "sold_completed" et "draft" sont les etats les plus
// definitifs/exclusifs, donc verifies en premier. "sold_pending" (is_processing)
// n'a jamais ete observe a true en conditions reelles (verifie sur les deux
// comptes de test le 2026-07-09) mais le champ existe cote Vinted - conserve
// au cas ou une transaction en cours le declenche.
function normalizeStatus(item: VintedApiItem): string {
  if (item.is_draft) return "draft";
  if (item.is_closed) return "sold_completed";
  if (item.is_processing) return "sold_pending";
  if (item.is_reserved) return "reserved";
  if (item.is_hidden) return "hidden";
  return "online";
}

function toWardrobeItem(item: VintedApiItem): WardrobeItem | null {
  if (!item.id) return null; // aucun identifiant exploitable, rien a faire de cet item
  const priceAmount = item.price?.amount ? Number.parseFloat(item.price.amount) : NaN;

  return {
    vintedItemId: String(item.id),
    // Un titre manquant est remonte comme "unknown" plutot que d'etre
    // silencieusement ignore - l'annonce existe reellement sur Vinted, la
    // cacher casserait le miroir sans que l'utilisateur le sache.
    title: item.title || "Titre indisponible",
    price: Number.isNaN(priceAmount) ? null : priceAmount,
    imageUrl: item.photos?.[0]?.url ?? null,
    vintedUrl: item.url ?? `https://www.vinted.fr/items/${item.id}`,
    favourites: item.favourite_count ?? null,
    views: item.view_count ?? null,
    status: item.title ? normalizeStatus(item) : "unknown",
    brand: item.brand || null,
    size: item.size || null,
  };
}

// Mission "FIABILISATION SYNCHRO VINTED, lot 1" : bornee (3 tentatives,
// backoff 500ms/1000ms) -- une page individuelle qui echoue une fois sur un
// blip reseau transitoire ne doit pas degrader tout le scan en "partiel"
// pour rien. Jamais de boucle non bornee : au-dela de PAGE_FETCH_MAX_ATTEMPTS,
// l'appelant (fetchAllWardrobeItems) traite l'echec normalement (page 1 =>
// erreur totale, page >= 2 => scan partiel).
const PAGE_FETCH_MAX_ATTEMPTS = 3;
const PAGE_FETCH_RETRY_BASE_DELAY_MS = 500;

async function fetchWardrobePage(vintedUserId: string, page: number): Promise<VintedApiResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= PAGE_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(
        `https://www.vinted.fr/api/v2/wardrobe/${vintedUserId}/items?page=${page}&per_page=${PER_PAGE}&order=relevance`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as VintedApiResponse;
    } catch (err) {
      lastError = err;
      if (attempt < PAGE_FETCH_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, PAGE_FETCH_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastError;
}

export async function fetchAllWardrobeItems(vintedUserId: string): Promise<WardrobeFetchResult> {
  const results: WardrobeItem[] = [];
  let page = 1;
  let totalPages = 1;
  let pagesRead = 0;

  do {
    let data: VintedApiResponse;
    try {
      data = await fetchWardrobePage(vintedUserId, page);
    } catch (err) {
      // Premiere page en echec (meme apres les tentatives bornees) = on ne
      // sait rien de fiable, on remonte l'erreur -- aucun appelant ne doit
      // traiter ce cas comme un scan, complet ou non.
      if (page === 1) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Echec recuperation wardrobe Vinted (page 1, apres ${PAGE_FETCH_MAX_ATTEMPTS} tentatives) : ${message}`);
      }
      // Page >= 2 en echec apres tentatives bornees : scan INCOMPLET,
      // jamais un succes total silencieux (cause reelle confirmee par audit
      // -- un ancien `break` ici retournait un simple tableau tronque,
      // traite ensuite comme un scan complet par recordListings()).
      return { items: results, complete: false, pagesRead, pagesExpected: totalPages };
    }

    for (const raw of data.items ?? []) {
      const mapped = toWardrobeItem(raw);
      if (mapped) results.push(mapped);
    }

    pagesRead += 1;
    totalPages = data.pagination?.total_pages ?? page;
    page += 1;
  } while (page <= totalPages);

  return { items: results, complete: true, pagesRead, pagesExpected: totalPages };
}
