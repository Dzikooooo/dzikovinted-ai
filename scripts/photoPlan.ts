// Plan de recuperation des galeries photo (2026-08-26).
//
// La phase photos visitait la page de CHAQUE opportunite retenue (~100), en
// sequentiel : la moitie du temps total du scan pour un enrichissement qui
// n'est pas critique -- la modale de detail sait deja dire "galerie pas
// encore recuperee, visible sur Vinted", et la vignette issue de la recherche
// reste affichee dans tous les cas.
//
// Trois traitements distincts, dans cet ordre de priorite :
//   1. DEJA CONNUE  -> reutilisee telle quelle, quel que soit son rang. Les
//      photos d'une annonce Vinted ne changent pas, et c'est gratuit : aucune
//      requete. Une galerie en cache ne consomme donc PAS le plafond.
//   2. A RECUPERER  -> les meilleures opportunites d'abord, plafonnees. Ce
//      sont celles qu'on ouvrira reellement.
//   3. IGNOREE      -> vignette de recherche seulement.

export const MAX_GALLERY_FETCHES = 30;

// Concurrence VOLONTAIREMENT basse. Le scan sort d'une seule IP GitHub
// Actions ; doubler le debit est deja un changement de comportement visible
// cote Vinted. 2 divise le temps par ~2 tout en restant loin d'un profil de
// trafic agressif. Ne pas augmenter sans decision explicite.
export const PHOTO_FETCH_CONCURRENCY = 2;

export interface GalleryCandidate {
  url: string;
  score: number;
  profit: number;
}

export interface PhotoPlan {
  /** Deja en cache : servies sans aucune requete. */
  reused: string[];
  /** A visiter reellement, dans l'ordre de priorite. */
  toFetch: string[];
  /** Au-dela du plafond : vignette de recherche uniquement. */
  skipped: string[];
}

export function planGalleryFetches(
  items: GalleryCandidate[],
  isKnown: (url: string) => boolean,
  max: number = MAX_GALLERY_FETCHES
): PhotoPlan {
  const reused: string[] = [];
  const candidates: GalleryCandidate[] = [];

  for (const item of items) {
    if (isKnown(item.url)) reused.push(item.url);
    else candidates.push(item);
  }

  // Score d'abord, profit pour departager : deux opportunites au meme score
  // ne se valent pas si l'une rapporte le double. `slice()` avant `sort()` --
  // sort mute, et l'appelant reutilise sa liste ensuite pour l'upsert.
  const ranked = candidates
    .slice()
    .sort((a, b) => b.score - a.score || b.profit - a.profit);

  return {
    reused,
    toFetch: ranked.slice(0, Math.max(0, max)).map((i) => i.url),
    skipped: ranked.slice(Math.max(0, max)).map((i) => i.url),
  };
}

// Pool a N executants. Ecrit ici plutot qu'inline pour etre teste : une file
// concurrente qui perd silencieusement un element produirait exactement le
// symptome qu'on cherche a eviter -- des galeries manquantes sans erreur.
// `workerIndex` est indispensable, pas un confort : chaque executant doit
// utiliser SON onglet Playwright. Indexer les onglets par la position de
// l'element (index % N) parait equivalent mais ne l'est pas -- les executants
// piochent dans une file partagee, donc rien ne garantit que l'element 2
// revienne a celui qui traitait l'element 0. Deux `page.goto` concurrents sur
// le meme objet Page s'annulent mutuellement, et on perdrait des galeries
// sans la moindre erreur.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number, workerIndex: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async (workerIndex: number): Promise<void> => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index, workerIndex);
    }
  };

  // Jamais plus d'executants que d'elements, jamais moins de 1 (limit a 0
  // bloquerait indefiniment sur une liste non vide).
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, (_, i) => worker(i)));

  return results;
}
