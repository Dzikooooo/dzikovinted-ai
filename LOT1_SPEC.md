# Lot 1 — Spécification finale des 5 recommandations + plan d'implémentation

**Statut : spécification validée en discussion, en attente de validation finale avant tout code. Aucune ligne de code écrite, aucune migration, aucun commit.**

Ce document est la spécification d'exécution du Lot 1, dérivée de [DECISION_ENGINE.md](DECISION_ENGINE.md) (architecture cible) et [DECISION_ENGINE_MVP.md](DECISION_ENGINE_MVP.md) (revue critique + recadrage MVP), affinée avec les décisions définitives suivantes :

- Aucune migration ; réutilisation de `src/lib/insights/` ; exactement 5 recommandations ; confiance à 2 paliers (haute / standard) ; état explicite « données insuffisantes » ; aucune couche Signals/Features générique ; aucun appel Dziko IA/Gemini ; aucune republication automatique ; aucune suppression automatique ; aucune hausse de prix ; aucune donnée inventée.

---

## Précondition globale et algorithme d'arbitrage

**Le moteur ne s'exécute que sur les annonces `status = 'en_stock'`.** Un brouillon jamais publié (`status='draft'`) ou une annonce vendue (`status='vendu'`) ne produit ni recommandation ni état — elles sont hors champ du Lot 1, aucun signal utile à en tirer.

**Une seule recommandation principale par annonce, jamais d'empilement.** L'arbitrage suit une chaîne déterministe, la première condition vraie l'emporte — même principe que `dominantSignal.ts` déjà en production (paliers ordonnés, jamais un score continu pour départager) :

```
1. verifier_annonce matche ?                         → oui : retourner verifier_annonce (confiance haute)
2. synchro périmée (> 48h) sur vinted_status/vues/favoris ? → oui : retourner donnees_insuffisantes ("synchro périmée")
3. considerer_republication matche (chemin A ou B) ?  → oui : retourner considerer_republication
4. échantillon du compte < 3 annonces actives ?       → oui : retourner donnees_insuffisantes ("échantillon insuffisant")
5. baisser_prix matche ?                              → oui : retourner baisser_prix
6. revoir_annonce matche ?                            → oui : retourner revoir_annonce
7. sinon                                              →      retourner attendre
```

**Pourquoi cet ordre précis** : `verifier_annonce` passe en premier parce qu'il est indépendant de toute donnée d'engagement (un champ vide reste vide quelle que soit la fraîcheur de synchro) — c'est le seul check qui reste valable même sur une synchro périmée. La vérification de péremption globale vient ensuite, avant tout ce qui dépend de `vues`/`favoris`. `considerer_republication` passe avant l'échantillon minimal parce que son chemin B (dormance totale) est un seuil absolu (zéro vue, zéro favori) qui ne nécessite aucune médiane de comparaison — il resterait valide même avec un compte d'une seule annonce. `baisser_prix`/`revoir_annonce`, eux, comparent à une médiane et exigent donc un échantillon minimal pour avoir un sens.

---

## Contraintes transversales appliquées à chaque règle

- **Jamais l'âge seul.** Aucune règle ci-dessous ne se déclenche sur `listing_age_days` sans un signal d'engagement combiné (vues/favoris/statut Vinted réel) — vérifié explicitement pour chacune ci-dessous.
- **Vues/favoris non fiables ou trop anciens → confiance réduite ou silence**, jamais une recommandation présentée avec la même assurance qu'avec des données fraîches.
- **Aucune donnée "offres"** : ResellOS n'a aujourd'hui aucun signal sur les négociations/offres (Phase 6 non construite) — jamais mentionné, jamais supposé.
- **Le CTA correspond toujours à une action réellement disponible aujourd'hui** : soit `edit_listing` (titre/description/prix, Beta Ready, clic manuel), soit un simple lien "Ouvrir Vinted" (`vinted_url`) sans exécution ResellOS. Jamais un bouton qui suggère une exécution automatique inexistante.

---

## 1. `verifier_annonce`

| # | Champ | Contenu |
|---|---|---|
| 1 | Identifiant technique | `verifier_annonce` |
| 2 | Libellé utilisateur | **Annonce à vérifier** |
| 3 | Objectif | Signaler un problème structurel factuel (pas une inférence statistique) qui empêche l'annonce de fonctionner correctement sur Vinted. |
| 4 | Données obligatoires | `listing.vinted_item_id`, `listing.vinted_url`, `listing.image_urls`, `listing.category`, `listing.condition`, `listing.vinted_sync_status`, `listing.status` |
| 5 | Règle déterministe exacte | `vinted_item_id IS NOT NULL` ET `vinted_url IS NOT NULL` ET `status = 'en_stock'` ET (`image_urls.length = 0` OU `category IS NULL` OU `condition IS NULL` OU `vinted_sync_status = 'sync_failed'`) |
| 6 | Exclusions et garde-fous | Ne se déclenche jamais sur un brouillon jamais publié (`vinted_item_id` null — pas de Vinted à ouvrir) ; jamais si `vinted_url` absent (le CTA n'aurait nulle part où pointer, même si une autre condition est vraie) ; si plusieurs causes sont vraies simultanément, une seule est affichée, par ordre de priorité `sync_failed` > `image_urls vide` > `category`/`condition` manquant (la plus actionnable en premier) |
| 7 | Confiance haute / standard | **Toujours haute** — c'est un fait vérifiable (un champ est vide ou ne l'est pas), jamais une inférence, indépendant de la fraîcheur de synchro |
| 8 | Conditions « données insuffisantes » | Aucune — ce check ne dépend jamais de la fraîcheur d'engagement. La seule non-applicabilité est l'absence de `vinted_url`/`vinted_item_id`, traitée comme une exclusion (§6), pas comme un état d'insuffisance |
| 9 | Explication affichée | *"Une modification précédente a échoué — vérifie l'annonce sur Vinted."* (si `sync_failed`) / *"Cette annonce n'a aucune photo sur Vinted."* (si photos vides) / *"Catégorie ou état manquant sur cette annonce."* (sinon) |
| 10 | CTA associé | "Ouvrir Vinted" — lien direct `vinted_url`, aucune exécution ResellOS |
| 11 | Comportement si synchro périmée | **Aucun changement** — ce check reste valable et prioritaire même sur une synchro périmée, puisqu'il ne dépend d'aucune donnée d'engagement volatile |
| 12 | Tests unitaires nécessaires | Chaque cause déclenche seule (3 cas) ; combinaison de plusieurs causes affiche la bonne priorité ; brouillon jamais publié exclu ; annonce vendue exclue ; `vinted_url` absent bloque même si `category` est null ; annonce complète ne déclenche rien |

---

## 2. `considerer_republication`

| # | Champ | Contenu |
|---|---|---|
| 1 | Identifiant technique | `considerer_republication` |
| 2 | Libellé utilisateur | **Republication à envisager** |
| 3 | Objectif | Signaler qu'une annonce a perdu toute traction ou n'est structurellement plus visible sur Vinted — jamais uniquement parce qu'elle est ancienne. |
| 4 | Données obligatoires | `listing.vinted_status`, `listing.vinted_item_id`, `listing.status`, `listing.created_at`, `listing.views`, `listing.favourites`, `listing.synced_at`, `action_log` (dernières tentatives `publish_listing`/`republish_listing` sur cette annonce) |
| 5 | Règle déterministe exacte | **Chemin A (structurel, priorité)** : `vinted_item_id IS NOT NULL` ET `status = 'en_stock'` ET `vinted_status ∈ {hidden, deleted, unknown}`. **Chemin B (dormance totale)** : `vinted_status = 'online'` ET `age ≥ REPUBLISH_AFTER_DAYS × 2` (60 jours, seuil déjà utilisé par `ruleInactiveListing` existant, pas un nouveau chiffre inventé) ET `views = 0` ET `favourites = 0`. Dans les deux cas, condition supplémentaire : aucune entrée `action_log` de type `publish_listing`/`republish_listing` sur cette annonce datée de moins de 7 jours |
| 6 | Exclusions et garde-fous | Jamais sur `status ≠ 'en_stock'` ; jamais sur un brouillon jamais publié (`vinted_item_id` null — c'est un cas de première publication, hors périmètre, pas une republication) ; chemin B jamais déclenché si `views` ou `favourites` est `null` (donnée manquante ≠ zéro, ne jamais confondre) ; chemin A explicitement exclut `draft` (un brouillon Vinted natif est un cas différent, non couvert) ; évaluée **avant** `baisser_prix` dans la chaîne d'arbitrage — si les deux conditions sont techniquement vraies, `considerer_republication` l'emporte car c'est le signal le plus sévère (zéro engagement absolu, pas juste "en dessous de la moyenne") |
| 7 | Confiance haute / standard | Chemin A = **haute** (fait structurel direct : le statut Vinted réel dit explicitement que l'annonce n'est plus en ligne) ; Chemin B = **standard** (combinaison temporelle + absence totale d'engagement, plus indirect) |
| 8 | Conditions « données insuffisantes » | `vinted_status`/`views`/`favourites` périmés (synchro > 48h) → aucun des deux chemins n'est évalué, retombe sur `donnees_insuffisantes` ("synchro périmée") avant même d'atteindre cette règle dans la chaîne |
| 9 | Explication affichée | Chemin A : *"Cette annonce n'est plus visible sur Vinted (statut : {vinted_status}) — la republier redonnerait de la visibilité."* Chemin B : *"Cette annonce est en ligne depuis {age} jours sans aucune vue — une republication pourrait relancer sa visibilité."* Les deux ajoutent : *"La republication automatique n'est pas encore disponible dans ResellOS — tu peux la refaire toi-même sur Vinted."* |
| 10 | CTA associé | "Ouvrir Vinted" uniquement — **aucun bouton d'exécution**, la republication automatique reste bloquée (voir DECISION_ENGINE.md §11) |
| 11 | Comportement si synchro périmée | > 48h sur `vinted_status`/`views`/`favourites` → `donnees_insuffisantes`, jamais cette recommandation affichée avec une confiance quelconque |
| 12 | Tests unitaires nécessaires | Chemin A seul (statut `hidden`/`deleted`/`unknown`, 3 cas) ; chemin B seul (âge exactement 60j, 59j exclu) ; brouillon jamais publié exclu des deux chemins ; annonce vendue exclue ; anti-boucle (tentative à J-3 bloque, J-8 autorise) ; `views`/`favourites` null n'active jamais le chemin B ; synchro périmée bloque les deux chemins ; priorité sur `baisser_prix` quand les deux conditions sont vraies |

---

## 3. `baisser_prix`

| # | Champ | Contenu |
|---|---|---|
| 1 | Identifiant technique | `baisser_prix` |
| 2 | Libellé utilisateur | **Baisse de prix conseillée** |
| 3 | Objectif | Signaler qu'un prix semble freiner la vente d'une annonce qui reçoit un peu d'attention mais insuffisamment — jamais uniquement parce qu'elle est ancienne. |
| 4 | Données obligatoires | `listing.views`, `listing.favourites` (non-null), `listing.created_at`, `listing.vinted_status`, `listing.synced_at`, médiane de vues/favoris calculée sur les annonces `online` du compte (≥ 3 annonces actives) |
| 5 | Règle déterministe exacte | `vinted_status = 'online'` ET `age ≥ REPUBLISH_AFTER_DAYS` (30 jours) ET `views > 0` (exclut le zéro absolu, réservé à `considerer_republication`) ET `views ≤ médiane_vues × 0.5` ET `favourites ≤ médiane_favoris × 0.5` |
| 6 | Exclusions et garde-fous | Jamais si `considerer_republication` a déjà matché (priorité, §2 col. 6) ; jamais si `views = 0` ET `favourites = 0` (domaine exclusif de `considerer_republication`) ; jamais si échantillon < 3 annonces actives ; jamais si `age < 30` jours même avec un engagement faible (une annonce récente avec peu de vues est normale à ce stade, pas un signal) |
| 7 | Confiance haute / standard | **Haute** si synchro < 24h ET les deux ratios ≤ 0.5 confirmés simultanément ; **standard** si synchro entre 24h et 48h |
| 8 | Conditions « données insuffisantes » | Échantillon < 3 annonces actives, OU synchro > 48h, OU `views`/`favourites` null |
| 9 | Explication affichée | *"Peu de vues et de favoris après {age} jours en ligne ({views} vues, {favourites} favoris, pour une moyenne de {médiane} sur ton compte) — le prix semble au-dessus du marché."* |
| 10 | CTA associé | "Ouvrir Vinted pour modifier le prix" → déclenche `edit_listing` (Beta Ready, clic manuel requis), champ prix pré-ciblé |
| 11 | Comportement si synchro périmée | > 48h → `donnees_insuffisantes`, jamais cette recommandation |
| 12 | Tests unitaires nécessaires | Cas positif exact au seuil (ratio = 0.5 pile, doit déclencher) ; cas juste au-dessus (0.51, ne doit pas déclencher) ; âge = 29 jours (ne déclenche pas) ; âge = 30 jours (déclenche) ; `views = 0` (exclu, réservé à `considerer_republication`) ; échantillon = 2 (insuffisant) ; échantillon = 3 (cas limite, autorisé) ; synchro périmée bloque |

---

## 4. `revoir_annonce`

| # | Champ | Contenu |
|---|---|---|
| 1 | Identifiant technique | `revoir_annonce` |
| 2 | Libellé utilisateur | **Annonce à revoir** |
| 3 | Objectif | Signaler un signal ambigu (beaucoup de vues, peu de favoris) sans jamais prétendre connaître la cause précise. |
| 4 | Données obligatoires | Identiques à `baisser_prix` : `views`, `favourites` (non-null), médiane sur ≥ 3 annonces actives, `synced_at` |
| 5 | Règle déterministe exacte | `vinted_status = 'online'` ET `views ≥ médiane_vues × 1.5` ET `favourites ≤ 1` |
| 6 | Exclusions et garde-fous | N'entre en conflit avec aucune autre règle par construction (conditions opposées sur `views` par rapport à `baisser_prix`/`considerer_republication`), mais reste après elles dans la chaîne d'arbitrage par principe de priorité explicite, jamais par hasard ; jamais si échantillon < 3 |
| 7 | Confiance haute / standard | **Standard uniquement, jamais haute** — le signal est délibérément non directionnel (le moteur ne sait pas si la cause est le prix, les photos ou la description) |
| 8 | Conditions « données insuffisantes » | Échantillon < 3, synchro > 48h, `views`/`favourites` null |
| 9 | Explication affichée | *"Beaucoup de vues ({views}) mais peu de favoris ({favourites}) — quelque chose freine peut-être la conversion (prix, photos, description). Le moteur ne peut pas identifier la cause précise."* |
| 10 | CTA associé | "Ouvrir Vinted pour modifier" (édition libre via `edit_listing`, aucun champ pré-ciblé puisque la cause n'est pas identifiée) |
| 11 | Comportement si synchro périmée | > 48h → `donnees_insuffisantes` |
| 12 | Tests unitaires nécessaires | Seuil exact 1.5× (déclenche), 1.49× (ne déclenche pas) ; `favourites = 1` (inclus, déclenche) vs `favourites = 2` (exclu) ; échantillon insuffisant ; synchro périmée |

---

## 5. `attendre`

| # | Champ | Contenu |
|---|---|---|
| 1 | Identifiant technique | `attendre` |
| 2 | Libellé utilisateur | **Rien à signaler** |
| 3 | Objectif | État neutre explicite quand aucune des 4 règles précédentes ne matche, mais que les données disponibles sont suffisantes pour l'affirmer avec confiance. |
| 4 | Données obligatoires | Mêmes gardes que les autres règles d'engagement (synchro < 48h, échantillon ≥ 3) — nécessaires pour distinguer "on a vérifié, rien ne ressort" de "on ne sait pas" |
| 5 | Règle déterministe exacte | Aucune des règles 1 à 4 ne matche, ET synchro fraîche (< 48h), ET échantillon ≥ 3 |
| 6 | Exclusions et garde-fous | Ne se déclenche jamais si les gardes de fraîcheur/échantillon échouent — dans ce cas c'est `donnees_insuffisantes`, jamais `attendre` par défaut silencieux |
| 7 | Confiance haute / standard | **Haute** — "on a vérifié avec des données fraîches et rien ne ressort" est en soi une affirmation fiable, pas une absence de réponse |
| 8 | Conditions « données insuffisantes » | Par construction, si les gardes échouent, ce n'est plus `attendre`, c'est `donnees_insuffisantes` — les deux états ne se confondent jamais |
| 9 | Explication affichée | *"Cette annonce n'a besoin de rien pour l'instant."* |
| 10 | CTA associé | Aucun |
| 11 | Comportement si synchro périmée | Devient `donnees_insuffisantes` à la place — `attendre` n'est jamais affiché sur une donnée périmée |
| 12 | Tests unitaires nécessaires | Cas où aucune règle ne matche avec données fraîches et échantillon suffisant → `attendre` ; cas où aucune règle ne matche mais données insuffisantes → `donnees_insuffisantes` (jamais `attendre`) |

---

## État non-comptabilisé : `donnees_insuffisantes`

Ce n'est pas une 6ᵉ recommandation (le compte reste à exactement 5), c'est l'état explicite que le moteur retourne quand il **ne peut pas** évaluer les règles 3 à 6 de la chaîne d'arbitrage avec un niveau de confiance acceptable.

- **Déclencheurs** : synchro périmée (> 48h) sur `vinted_status`/`views`/`favourites`, OU échantillon du compte < 3 annonces actives (uniquement pour les règles qui en dépendent — `baisser_prix`/`revoir_annonce`/`attendre`, jamais pour `verifier_annonce`/`considerer_republication` chemin A qui n'en ont pas besoin).
- **Raison affichée, toujours explicite** : *"Pas assez de données pour recommander une action fiable"*, suivi de la cause précise (*"dernière synchronisation il y a {n} jours"* ou *"pas assez d'annonces actives sur ce compte pour comparer"*) — jamais un message générique sans cause.
- **Jamais confondu avec `attendre`** dans l'interface — les deux doivent être visuellement distincts (§ critères d'acceptation).

---

## Plan d'implémentation du Lot 1

### Fichiers exacts

| Fichier | Action | Rôle |
|---|---|---|
| `src/lib/insights/constants.ts` | **Modifier** | Ajouter les seuils nommés manquants : `DORMANT_LISTING_DAYS` (= `REPUBLISH_AFTER_DAYS * 2`, dérivé, pas un nouveau chiffre inventé), `PRICE_ENGAGEMENT_RATIO_THRESHOLD` (0.5, déjà utilisé implicitement dans `ruleLowerPriceStale` — formalisé en constante nommée), `REVIEW_VIEWS_RATIO_THRESHOLD` (1.5), `REVIEW_MAX_FAVOURITES` (1), `FRESH_SYNC_THRESHOLD_HOURS` (24), `STALE_SYNC_THRESHOLD_HOURS` (48, déjà la valeur utilisée côté UI dans `DashboardHome.tsx`/`ListingsManagementSection.tsx`, centralisée ici plutôt que dupliquée), `ACTION_RETRY_COOLDOWN_DAYS` (7, anti-boucle republication) |
| `src/lib/insights/dataSufficiency.ts` | **Créer** | `isSyncFresh(listing, now)`, `getSyncFreshnessTier(listing, now): 'fraiche' \| 'tendue' \| 'perimee'`, `hasSufficientSample(ctx): boolean` — fonctions pures, chacune retourne aussi une raison lisible, pas juste un booléen |
| `src/lib/insights/types.ts` | **Modifier** | Types décrits ci-dessous |
| `src/lib/insights/recommendations.ts` | **Modifier (restructuration)** | Remplacer les 4 règles actuelles (`ruleRepublishAging`, `ruleReviewPriceHighViewsLowFavourites`, `ruleLowerPriceStale`, `ruleRaisePriceUndervalued`) par les 5 nouvelles règles + la chaîne d'arbitrage décrite ci-dessus. `ruleRaisePriceUndervalued` est retirée (hors périmètre validé) — son code peut être supprimé plutôt que juste filtré, puisqu'aucune valeur `raise_price` ne doit plus jamais être produite pendant ce lot |
| `src/lib/insights/engine.ts` | **Modifier (mineur)** | Adapter la signature de sortie de `computeInsights()` pour porter le nouveau résultat par annonce (voir types) sans casser la structure `InsightsReport` existante (`scores`, `alerts`, `narratives` inchangés) |
| `src/lib/dominantSignal.ts` | **Modifier (mineur)** | Vérifier/adapter la consommation de `recommendations` : ne doit recevoir que les recommandations à `status: 'action'` (jamais `attendre`/`donnees_insuffisantes`), pour ne pas changer le comportement du palier "recommandation" déjà en place |
| `src/pages/dashboard/watchlist/ListingsManagementSection.tsx` | **Modifier** | Afficher le badge de recommandation existant avec `confidence` (haute/standard) ; afficher explicitement l'état `donnees_insuffisantes` (texte + raison) là où aujourd'hui l'absence de recommandation est silencieuse ; afficher `attendre` de façon visuellement distincte de `donnees_insuffisantes` |
| `src/pages/dashboard/DashboardHome.tsx` | **Vérifier, modifier si besoin** | Non-régression du Copilote existant (narrations inchangées) et de `computeDominantSignal` |

**Aucune migration.** Toutes les données nécessaires existent déjà dans `listings`, `vinted_accounts` (implicitement via le compte courant), `action_log`.

### Types (description, pas de code)

```
RecommendationKind = 'verifier_annonce' | 'considerer_republication' | 'baisser_prix' | 'revoir_annonce'

CTA =
  | { type: 'open_vinted' }
  | { type: 'edit_listing', field: 'price' | null }

ListingRecommendationResult =
  | { status: 'action', kind: RecommendationKind, confidence: 'haute' | 'standard',
      message: string, reason: string, cta: CTA, listingId: string }
  | { status: 'attendre', message: string, listingId: string }
  | { status: 'donnees_insuffisantes', reason: string, listingId: string }
```

`Recommendation` (type existant, consommé par `dominantSignal.ts`) reste inchangé dans sa forme — un adaptateur pur extrait les entrées `status: 'action'` de `ListingRecommendationResult[]` vers `Recommendation[]`, pour ne jamais casser la compatibilité descendante avec le Copilote existant.

### Fonctions à créer/modifier

- `dataSufficiency.ts::isSyncFresh(listing, now)` — nouvelle.
- `dataSufficiency.ts::hasSufficientSample(ctx)` — nouvelle.
- `recommendations.ts::ruleVerifierAnnonce(listing)` — nouvelle.
- `recommendations.ts::ruleConsidererRepublicationA(listing)` / `ruleConsidererRepublicationB(listing, ctx)` — nouvelles (deux chemins distincts, cf. §2 col. 5).
- `recommendations.ts::ruleBaisserPrix(listing, ctx)` — reprise/adaptation de `ruleLowerPriceStale`.
- `recommendations.ts::ruleRevoirAnnonce(listing, ctx)` — reprise/adaptation de `ruleReviewPriceHighViewsLowFavourites`.
- `recommendations.ts::computeListingRecommendation(listing, ctx, now): ListingRecommendationResult` — nouvelle fonction orchestratrice, implémente la chaîne d'arbitrage complète.
- `recommendations.ts::computeRecommendations(ctx): Recommendation[]` — signature conservée, réimplémentée en appelant `computeListingRecommendation` pour chaque annonce et en filtrant `status: 'action'`.
- `recommendations.ts::computeListingStates(ctx): Map<string, ListingRecommendationResult>` — nouvelle, expose l'état complet par annonce (y compris `attendre`/`donnees_insuffisantes`) pour l'UI.

### Tests unitaires

Repris intégralement des colonnes 12 de chaque tableau ci-dessus, plus :
- Tests de la chaîne d'arbitrage elle-même (pas seulement des règles individuelles) : une annonce qui matche techniquement plusieurs conditions ne produit jamais qu'un seul résultat, dans le bon ordre de priorité.
- Non-régression complète de la suite Vitest existante (`src/lib/insights/__tests__/`) — en particulier vérifier qu'aucun test existant ne dépendait de `raise_price`/`ruleRaisePriceUndervalued` retiré.

### Tests avec données réelles

Protocole manuel (pas automatisé) : sélectionner 2-3 annonces réelles à des âges/engagements différents (compte de test jetable, ou extrait du compte d'Albin avec son accord explicite), vérifier à la main que chaque sortie correspond à l'attendu, puis simuler une synchro périmée (ne pas resynchroniser pendant plus de 48h) pour confirmer le basculement vers `donnees_insuffisantes`.

### Critères d'acceptation

- Seules les valeurs `verifier_annonce`/`considerer_republication`/`baisser_prix`/`revoir_annonce`/`attendre`/`donnees_insuffisantes` apparaissent jamais un 7ᵉ état.
- Aucun résultat `status: 'action'` sans `confidence` renseignée.
- Synchro > 48h → jamais de résultat `baisser_prix`/`revoir_annonce`/`considerer_republication` (chemin B), uniquement `verifier_annonce` (si applicable) ou `donnees_insuffisantes`.
- `attendre` et `donnees_insuffisantes` sont visuellement distincts dans l'UI, jamais confondus.
- Une seule recommandation par annonce, toujours.
- Zéro régression sur la suite de tests existante.
- Aucune valeur `raise_price` ne peut plus être produite.

### Risques

- Seuils (0.5, 1.5, 60 jours, 24h/48h, échantillon 3) non calibrés par un usage réel — assumés comme point de départ raisonnable (repris de constantes déjà validées ailleurs dans le produit), explicitement révisables après le retour d'Albin, jamais présentés comme définitifs.
- `verifier_annonce` peut produire des faux positifs sur d'anciennes annonces synchronisées avant que certains champs ne soient systématiquement remplis côté extension — à vérifier sur un échantillon réel avant d'y accorder une confiance totale en usage.
- Suppression de `ruleRaisePriceUndervalued`/`raise_price` : vérifier qu'aucun composant UI existant (badges, filtres) ne référence ce kind ailleurs que dans `recommendations.ts`/ses tests, pour ne pas casser un affichage existant en le retirant.

### Estimation

Toujours pas de base fiable pour un chiffrage en heures. Ordre de grandeur : effort concentré dans 3 fichiers de `src/lib/insights/` (un nouveau, deux restructurés) + 1 fichier de constantes + adaptations mineures sur 3 fichiers de consommation (dominantSignal, deux pages dashboard) — pas de nouvelle infrastructure, pas de migration. Reste dans la catégorie "petit à moyen" déjà annoncée dans la revue précédente.

### Découpage en commits indépendants

1. `feat(insights): ajoute les constantes et garde-fous de suffisance de données` — `constants.ts` + `dataSufficiency.ts` + tests. Aucune dépendance, aucune régression possible (code neuf, pas encore branché).
2. `refactor(insights): restructure les règles de recommandation en 5 kinds avec chaîne d'arbitrage` — `types.ts` + `recommendations.ts` (règles + `computeListingRecommendation` + `computeRecommendations` adapté + `computeListingStates`) + tests unitaires complets. C'est le cœur du lot, testable isolément via Vitest avant tout branchement UI.
3. `fix(insights): adapte dominantSignal.ts au nouveau contrat de Recommendation` — vérifie/ajuste la compatibilité, tests de non-régression sur les paliers existants.
4. `feat(dashboard): affiche confiance et état données insuffisantes dans Mes annonces` — `ListingsManagementSection.tsx`, vérification visuelle réelle des 6 états à l'écran.
5. `chore(dashboard): vérifie la non-régression du Copilote sur DashboardHome` — modifications mineures si nécessaires, sinon commit de vérification seule (tests + walkthrough navigateur).

Chaque commit reste indépendamment testable (typecheck/lint/build/test) avant le suivant, cohérent avec la pratique déjà en place sur ce projet.

---

## Ce qui reste à valider avant tout code

- Le format exact des messages utilisateur (§9 de chaque tableau) — proposés ici, ajustables sans impact architectural.
- Les seuils numériques eux-mêmes (0.5 / 1.5 / 60j / 24h-48h / échantillon 3) — repris de constantes déjà existantes ou dérivées directement, mais jamais recalibrés sur un usage réel puisqu'aucun n'existe encore.
- Le choix de supprimer `raise_price` du code plutôt que de le garder désactivé en coulisse (option alternative plus prudente, à trancher).
