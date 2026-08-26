// Relance favoris assistee (2026-08-26) : memorise le nombre de favoris de
// chaque annonce tel qu'il etait a la DERNIERE consultation de la section,
// pour pouvoir dire "+3 depuis ta derniere visite" plutot qu'un total brut
// qui ne dit pas ce qui est nouveau.
//
// CHOIX ASSUME : localStorage, PAS une colonne en base -- meme raisonnement
// et memes limites que republishAcknowledgements.ts. Consequence honnete a
// connaitre : la reference est LOCALE AU NAVIGATEUR. Ouvrir ResellOS sur un
// autre appareil repartira d'une reference vide, donc affichera les totaux
// comme s'ils etaient tous nouveaux. C'est le bon sens du compromis (mieux
// vaut proposer une relance de trop qu'en manquer une), mais si le suivi
// multi-appareils devient necessaire, la vraie solution est une colonne
// `favourites_seen_at`/`favourites_seen_count` sur listings.
//
// Meme discipline que src/lib/storage.ts : jamais d'acces direct a
// localStorage disperse dans l'UI, et toujours protege par try/catch --
// localStorage peut lever (navigation privee, quota, storage desactive) et
// cela ne doit JAMAIS casser l'affichage de la page.

const STORAGE_KEY = 'resellos:favouritesBaseline';
// Garde-fou de taille : au-dela, on ne garde que les entrees les plus
// recemment ecrites. Sans cela la table grandirait a chaque annonce vue.
const MAX_ENTRIES = 500;

export type FavouritesBaseline = Record<string, number>;

export function readFavouritesBaseline(): FavouritesBaseline {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: FavouritesBaseline = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

// Enregistre l'etat COURANT comme nouvelle reference. Appele quand
// l'utilisateur a reellement vu la liste -- jamais au simple montage d'une
// page qu'il n'a pas ouverte, sinon on effacerait des relances non traitees.
export function writeFavouritesBaseline(counts: FavouritesBaseline): void {
  try {
    const entries = Object.entries(counts).slice(-MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* storage indisponible -- la section fonctionne, elle repartira d'une
       reference vide au prochain chargement */
  }
}

export interface FavouritesGain {
  listingId: string;
  current: number;
  /** null = jamais vu auparavant : on ne peut pas parler de "gain". */
  gained: number | null;
}

// Calcule le gain par annonce. Une annonce jamais vue rend `gained: null`
// plutot que `gained: current` : on ne SAIT pas si ces favoris sont recents,
// et l'annoncer comme un gain serait inventer une information.
export function computeFavouritesGains(
  listings: Array<{ id: string; favourites: number | null }>,
  baseline: FavouritesBaseline
): FavouritesGain[] {
  return listings.map((l) => {
    const current = l.favourites ?? 0;
    const previous = baseline[l.id];
    return {
      listingId: l.id,
      current,
      gained: previous === undefined ? null : Math.max(0, current - previous),
    };
  });
}
