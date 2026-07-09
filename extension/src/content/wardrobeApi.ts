// Recuperation exhaustive des annonces d'un compte Vinted via l'API REST
// same-origin que le propre frontend de Vinted appelle pour charger la
// suite du "wardrobe" au defilement (decouvert en direct le 2026-07-09 en
// observant les requetes reseau de https://www.vinted.fr/member/<id> pendant
// un scroll). Pas un contournement anti-bot : c'est exactement la requete
// que la page emet elle-meme (voir EXTENSION.md §8/§sync). Remplace
// l'ancienne lecture du DOM (fragile, limitee au premier lot de cartes
// rendues, incapable de distinguer les statuts) par une pagination fiable
// jusqu'a epuisement complet - aucune limite arbitraire.

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

export async function fetchAllWardrobeItems(vintedUserId: string): Promise<WardrobeItem[]> {
  const results: WardrobeItem[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const res = await fetch(
      `https://www.vinted.fr/api/v2/wardrobe/${vintedUserId}/items?page=${page}&per_page=${PER_PAGE}&order=relevance`,
      { headers: { Accept: "application/json" } }
    );

    if (!res.ok) {
      // Premiere page en echec = on ne sait rien de fiable, on remonte
      // l'erreur. Une page suivante en echec (rate limit ponctuel...) : on
      // garde ce qui a deja ete recupere plutot que de tout perdre - une
      // synchro partielle reste meilleure qu'aucune, et le prochain passage
      // sur le profil la completera.
      if (page === 1) throw new Error(`Echec recuperation wardrobe Vinted (HTTP ${res.status})`);
      break;
    }

    const data = (await res.json()) as VintedApiResponse;
    for (const raw of data.items ?? []) {
      const mapped = toWardrobeItem(raw);
      if (mapped) results.push(mapped);
    }

    totalPages = data.pagination?.total_pages ?? page;
    page += 1;
  } while (page <= totalPages);

  return results;
}
