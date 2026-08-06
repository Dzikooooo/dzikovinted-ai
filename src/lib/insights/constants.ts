// Seuils nommes et justifies du moteur d'intelligence metier. Chaque valeur
// est soit deja validee ailleurs dans le produit (AGING_STOCK_DAYS existait
// deja, dupliquee dans DashboardHome.tsx/StockPage.tsx avant d'etre
// centralisee ici), soit choisie sur une base explicite documentee en
// commentaire - jamais un nombre arbitraire sans justification.

// Deja utilise pour le badge "+21j" sur le Stock avant ce moteur : reutilise
// tel quel plutot que d'introduire un second seuil different pour la meme
// idee (annonce en stock depuis longtemps).
export const AGING_STOCK_DAYS = 21;

// Au-dela de ce seuil, une annonce toujours "online" sans vente est
// consideree comme candidate a la republication - norme courante de
// renouvellement d'annonce sur les marketplaces de seconde main (Vinted
// recommande lui-meme de "remonter" une annonce apres plusieurs semaines
// d'inactivite).
export const REPUBLISH_AFTER_DAYS = 30;

// Nombre minimum de ventes dans une marque/categorie pour que sa moyenne
// (ROI, delai de vente) soit consideree fiable et utilisee comme reference
// par le moteur - en dessous, l'echantillon est trop faible pour justifier
// une recommandation ("cette marque se vend bien" ne veut rien dire sur une
// seule vente).
export const MIN_SAMPLE_SIZE_FOR_COMPARISON = 3;

// Deux instantanes doivent etre separes d'au moins ce delai pour qu'une
// tendance (perte de visibilite, evolution des vues) soit consideree
// significative plutot que du bruit de synchronisation rapprochee.
export const MIN_TREND_INTERVAL_DAYS = 3;

// Marge (prix de vente - prix d'achat - frais) en dessous de ce seuil,
// exprimee en euros : alerte "marge insuffisante". Volontairement un
// montant fixe plutot qu'un pourcentage - une marge de 2€ est un probleme
// que l'article coute 5€ ou 50€.
export const LOW_MARGIN_THRESHOLD_EUR = 5;

export const MAX_PRIORITIES = 5;

// ---------------------------------------------------------------------------
// Decision Engine — Lot 1 (2026-08-05)
//
// Tous les seuils ci-dessous sont des valeurs de DEPART pour la beta, pas une
// verite figee. Ils sont soit derives d'une constante deja validee ailleurs
// dans le produit (DORMANT_LISTING_DAYS, STALE_SYNC_THRESHOLD_HOURS), soit un
// point de depart raisonnable jamais encore calibre sur un usage reel
// (PRICE_ENGAGEMENT_RATIO_THRESHOLD, REVIEW_*, les deux cooldowns). Ils
// doivent etre revus explicitement avec les retours d'Albin et de vraies
// donnees de synchro/engagement -- voir LOT1_SPEC.md. Ne jamais les presenter
// a l'utilisateur comme un seuil scientifique ("exactement 60 jours"), les
// messages generes ne citent que les chiffres reels de l'annonce, jamais le
// seuil lui-meme.
// ---------------------------------------------------------------------------

// Au-dela de ce seuil ET avec un engagement nul (0 vue, 0 favori), une
// annonce online est consideree en dormance totale (considerer_republication,
// chemin B) -- deja le seuil utilise par ruleInactiveListing dans alerts.ts
// (REPUBLISH_AFTER_DAYS * 2), repris ici tel quel plutot qu'un nouveau
// chiffre invente.
export const DORMANT_LISTING_DAYS = REPUBLISH_AFTER_DAYS * 2;

// baisser_prix : vues/favoris consideres "faibles" en dessous de ce ratio de
// la mediane du compte. Point de depart, jamais calibre.
export const PRICE_ENGAGEMENT_RATIO_THRESHOLD = 0.5;

// revoir_annonce : vues considerees "elevees" au-dessus de ce ratio de la
// mediane du compte, combine a un nombre de favoris tres bas.
export const REVIEW_VIEWS_RATIO_THRESHOLD = 1.5;
export const REVIEW_MAX_FAVOURITES = 1;

// Fraicheur de synchro (listing.synced_at) : sous ce seuil, confiance haute
// possible. Entre ce seuil et STALE_SYNC_THRESHOLD_HOURS, confiance degradee
// a "standard". Au-dela de STALE_SYNC_THRESHOLD_HOURS, aucune recommandation
// d'engagement -- deja la valeur utilisee cote UI (DashboardHome.tsx
// STALE_SYNC_THRESHOLD_HOURS, ListingsManagementSection.tsx
// syncFreshnessClass), centralisee ici plutot que dupliquee une troisieme
// fois.
export const FRESH_SYNC_THRESHOLD_HOURS = 24;
export const STALE_SYNC_THRESHOLD_HOURS = 48;

// Anti-boucle : ne jamais re-suggerer une action deja tentee recemment.
// Deux constantes nommees distinctement (meme valeur de depart) car ce sont
// deux concepts differents -- republication vs changement de prix -- qui
// pourraient diverger independamment apres calibration.
export const ACTION_RETRY_COOLDOWN_DAYS = 7;
export const PRICE_CHANGE_COOLDOWN_DAYS = 7;

// ---------------------------------------------------------------------------
// Suivi des annonces (2026-08-06) -- listing_recommendation_log
//
// Garde-fous d'expiration d'un episode de recommandation (voir
// recommendationLog.ts) : jamais sur une seule disparition de la regle,
// jamais sur une synchro perimee/donnees insuffisantes -- uniquement apres
// PLUSIEURS evaluations fraiches consecutives sans rematch ET une duree
// minimale ecoulee depuis le premier "miss". Valeurs de depart pour la
// beta, non calibrees sur un usage reel -- a revoir avec les retours
// d'Albin, comme les seuils du Lot 1 (voir bloc ci-dessus).
// ---------------------------------------------------------------------------
export const MIN_CONSECUTIVE_FRESH_MISSES_BEFORE_EXPIRY = 3;
export const MIN_DAYS_BEFORE_EXPIRY = 3;
