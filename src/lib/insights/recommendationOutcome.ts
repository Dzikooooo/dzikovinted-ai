import type { ListingMetricSnapshot } from '../types';

// Mesure du resultat d'une recommandation SUIVIE (Lot "Suivi des annonces",
// voir LOT_SUIVI_ANNONCES_SPEC.md §4 + garde-fou explicite de la validation
// utilisateur) -- fonction PURE, jamais d'acces reseau/base ici.
//
// Regle absolue : toujours une EVOLUTION OBSERVEE, jamais un IMPACT CAUSE.
// Aucune phrase du type "cette baisse a genere X vues" -- uniquement
// "dans les N jours suivant cette action, les vues sont passees de X a Y."
// Une vente qui suit une action reste un fait date, jamais attribuee a
// l'action qui l'a precedee.
//
// Perimetre volontairement simple (demande explicite : "definis un
// mecanisme SIMPLE") : opere sur les snapshots d'UNE annonce. Pour
// considerer_republication (qui cree une nouvelle ligne `listings`, voir
// RepublishListingPayload.previousVintedItemId), l'appelant compare deux
// resultats distincts (ancienne annonce = "avant", nouvelle annonce =
// "apres" avec baseline null) plutot que cette fonction ne fasse elle-meme
// une jointure entre deux listing_id.
//
// verifier_annonce n'a delibrement PAS de mesure d'engagement ici (son
// resultat est binaire -- le defaut signale a-t-il disparu -- pas une
// comparaison de vues/favoris, voir LOT_SUIVI_ANNONCES_SPEC.md §4) : hors
// perimetre de cette fonction, a traiter separement si besoin.

const WINDOW_DAYS = [3, 7] as const;
type WindowDays = (typeof WINDOW_DAYS)[number];

export interface OutcomeWindow {
  days: WindowDays;
  measurable: boolean;
  before: { views: number; favourites: number } | null;
  after: { views: number; favourites: number } | null;
  // Phrase factuelle prete a l'affichage, deja au format attendu -- null
  // si measurable est false (l'appelant affiche alors "Résultat non
  // mesurable" lui-meme, jamais une phrase fabriquee sur des donnees
  // manquantes).
  summary: string | null;
}

export interface RecommendationOutcome {
  windows: OutcomeWindow[];
  // Delai reel entre l'action et une vente ulterieure -- un FAIT date,
  // jamais presente comme une consequence de l'action (voir commentaire
  // d'en-tete).
  soldAfterDays: number | null;
}

function closestBefore(snapshots: ListingMetricSnapshot[], atMs: number): ListingMetricSnapshot | null {
  let best: ListingMetricSnapshot | null = null;
  for (const s of snapshots) {
    const t = new Date(s.captured_at).getTime();
    if (t > atMs) continue;
    if (!best || t > new Date(best.captured_at).getTime()) best = s;
  }
  return best;
}

// Le point le plus proche de la fin de fenetre, mais strictement APRES
// l'action et STRICTEMENT DANS la fenetre annoncee -- jamais un point pris
// hors fenetre presente comme "dans les N jours" (mensonge par omission).
function closestWithinWindow(snapshots: ListingMetricSnapshot[], afterMs: number, windowEndMs: number): ListingMetricSnapshot | null {
  let best: ListingMetricSnapshot | null = null;
  for (const s of snapshots) {
    const t = new Date(s.captured_at).getTime();
    if (t <= afterMs || t > windowEndMs) continue;
    if (!best || t > new Date(best.captured_at).getTime()) best = s;
  }
  return best;
}

export function measureRecommendationOutcome(
  actionCompletedAt: string,
  snapshots: ListingMetricSnapshot[],
  sale: { soldAt: string } | null
): RecommendationOutcome {
  const actionMs = new Date(actionCompletedAt).getTime();
  const before = closestBefore(snapshots, actionMs);

  const windows: OutcomeWindow[] = WINDOW_DAYS.map((days) => {
    const windowEndMs = actionMs + days * 24 * 60 * 60 * 1000;
    const after = before ? closestWithinWindow(snapshots, actionMs, windowEndMs) : null;

    if (!before || !after || before.views === null || before.favourites === null || after.views === null || after.favourites === null) {
      return { days, measurable: false, before: null, after: null, summary: null };
    }

    const beforeValues = { views: before.views, favourites: before.favourites };
    const afterValues = { views: after.views, favourites: after.favourites };
    const summary = `Dans les ${days} jours suivant cette action, les vues sont passées de ${beforeValues.views} à ${afterValues.views} et les favoris de ${beforeValues.favourites} à ${afterValues.favourites}.`;

    return { days, measurable: true, before: beforeValues, after: afterValues, summary };
  });

  const soldAfterDays =
    sale && new Date(sale.soldAt).getTime() >= actionMs
      ? Math.round((new Date(sale.soldAt).getTime() - actionMs) / (24 * 60 * 60 * 1000))
      : null;

  return { windows, soldAfterDays };
}
