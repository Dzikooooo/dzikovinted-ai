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
