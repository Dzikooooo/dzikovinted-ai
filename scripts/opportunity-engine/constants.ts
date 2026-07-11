// Seuils nommés et justifiés du moteur d'opportunités, même principe que
// src/lib/insights/constants.ts : jamais un nombre arbitraire sans
// commentaire expliquant son origine.

// BETA : seuils de sélectivité initiaux, non calibrés sur un vrai volume de
// scans ni sur un retour utilisateur réel - à ajuster une fois plusieurs
// semaines de production accumulées. Ne pas présenter ces valeurs comme
// optimales. Score neutre de départ 40 (préservé de l'ancien moteur) : un
// score >= 65 exige au moins un signal fort (ex. ROI >=150% = +20) plus un
// second signal positif (profit ou demande), sans pénalité majeure de bande
// de prix - délibérément conservateur plutôt que permissif, pour tenir la
// promesse "peu d'opportunités mais excellentes" plutôt qu'une longue liste
// moyenne.
export const MIN_SCORE_FOR_OPPORTUNITY = 65;

// La formule de confiance (suffisance d'échantillon + pénalité de
// dispersion) exige un pool d'au moins ~10 comparables pour atteindre 50 -
// en dessous, le prix de marché repose sur trop peu de données pour
// justifier une opportunité affichée comme fiable, quel que soit le score.
export const MIN_CONFIDENCE_FOR_OPPORTUNITY = 50;

// Score de départ neutre (identique à l'ancien scripts/market-engine.ts,
// préservé pour ne pas changer la distribution des scores sans raison).
export const BASE_SCORE = 40;

// Nombre minimum de prix comparables du batch courant pour calculer une
// médiane de marché (identique au comportement historique de
// scripts/market-price.ts - "Donnees insuffisantes" en dessous).
export const MIN_COMPARABLES_FOR_PRICE = 3;

// Nombre minimum d'observations historiques (market_price_observations, sur
// la fenêtre glissante ci-dessous) pour qu'une statistique de prix
// historique (médiane/moyenne/min/max dans le temps) soit considérée
// fiable - en dessous, ctx.historicalPriceStats reste null plutôt que
// calculé sur un échantillon trop faible.
export const MIN_OBSERVATIONS_FOR_HISTORY = 8;

// Fenêtre glissante sur laquelle l'historique de prix est agrégé - au-delà,
// un prix trop ancien n'est plus représentatif du marché actuel.
export const OBSERVATION_LOOKBACK_DAYS = 60;

// Nombre minimum d'échantillons de "disparition" (item vu puis absent d'un
// scan suivant, proxy de vente/retrait) pour qu'une estimation de délai de
// revente soit publiée - largement hors de portée au lancement (aucun
// historique n'existe encore), s'active automatiquement une fois
// market_price_observations suffisamment rempli, sans changement de code.
export const MIN_DELISTED_SAMPLES_FOR_RESALE_ESTIMATE = 5;

// watchlist.priority (1-3, jamais consommé par l'ancien moteur) devient un
// vrai signal de score : chaque point de priorité vaut ce nombre de points
// de score, remplaçant l'ancienne liste de mots-clés codée en dur.
export const PRIORITY_SCORE_WEIGHT = 4;

// Seuils d'agrégation des facteurs de risque (risk.ts) en un niveau à trois
// paliers - chaque facteur contribue des points nommés, comme le score,
// avant d'être classé.
export const RISK_LEVEL_THRESHOLDS = {
  eleve: 20, // >= ce total de points de risque
  modere: 8, // >= ce total, en dessous de "eleve"
  // en dessous de "modere" : faible
};

// Seuils du coefficient de variation (écart-type / moyenne) des prix
// comparables, utilisés à la fois pour pénaliser la confiance et pour
// alimenter le facteur de risque "volatilité". En dessous de MODERATE, les
// prix sont jugés stables (aucune pénalité) ; au-dessus de HIGH, la
// dispersion est jugée forte.
export const PRICE_DISPERSION_MODERATE = 0.15;
export const PRICE_DISPERSION_HIGH = 0.3;

// Seuils du facteur de risque "rareté de la donnée" (risk.ts) - distincts de
// MIN_CONFIDENCE_FOR_OPPORTUNITY (qui filtre l'affichage) : ici on note un
// risque même pour une opportunité déjà affichée, de façon graduée.
export const RISK_CONFIDENCE_LOW = 30;
export const RISK_CONFIDENCE_MODERATE = 50;

// Nombre d'annonces comparables au-delà duquel la concurrence sur ce
// marché est jugée forte (risque de pression sur le prix de revente).
export const RISK_HIGH_COMPETITION_COUNT = 15;

// Délai médian de revente (jours) au-delà duquel le facteur de liquidité
// contribue au risque - seulement calculable une fois
// MIN_DELISTED_SAMPLES_FOR_RESALE_ESTIMATE atteint.
export const RISK_SLOW_RESALE_DAYS = 30;

// Seuils de "sous-évaluation extrême" (prix affiché / prix de marché
// estimé). Justification par des données réelles (scan du 2026-07-11,
// ancien moteur) : plusieurs items scorés 99-100/100 avec confiance 100%
// avaient un ratio prix/marché de 1 à 12% (ex. "doudoune the north face
// nuptse 700" à 1€ pour un marché estimé à 85€, ROI 8400%) - dans
// l'immense majorité des cas réels, un ratio aussi extrême reflète une
// erreur de prix, une annonce type "prix à négocier"/bundle mal
// catégorisé, ou un titre trompeur (voir aussi "crampon nike tn", un
// article de football mal étiqueté qui matche isRelevant() sur
// brand+model), pas une vraie affaire. En dessous du seuil "extreme", le
// signal réduit à la fois la confiance (l'estimation de prix est hors
// distribution, donc moins fiable) et augmente le risque (à vérifier avant
// achat) - jamais une exclusion automatique, l'opportunité reste affichée
// mais honnêtement qualifiée.
export const EXTREME_UNDERPRICE_RATIO = 0.15;
export const MODERATE_UNDERPRICE_RATIO = 0.35;

// Vocabulaire imposé (contrainte produit explicite) : jamais de langage de
// certitude absolue, toujours une formulation probabiliste et traçable au
// moteur. Centralisé ici pour qu'explanation.ts soit la seule source de
// vérité sur le phrasé, testable en un seul endroit (voir __tests__).
export const FORBIDDEN_PHRASES = ['revente garantie', 'bénéfice assuré', 'benefice assure', 'les yeux fermés', 'les yeux fermes'];
