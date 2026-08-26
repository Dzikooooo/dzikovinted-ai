# Decision Engine — Document d'architecture produit de référence

**Statut : document de conception, aucune ligne de code écrite, aucun commit créé.**
**Rôle de ce document : base de référence pour tout développement futur du Decision Engine. Toute implémentation doit s'y référer ; toute divergence doit être une décision explicite, pas un oubli.**

---

## 0. Préambule

### 0.1 Mission

Aujourd'hui, ResellOS *montre* des données à l'utilisateur (Dashboard, Stock, Comptabilité, Opportunités). Le Decision Engine doit lui *dire quoi faire*, avec un niveau de confiance explicite et une justification vérifiable.

### 0.2 Principes non négociables

1. **Le moteur est déterministe.** Toute recommandation provient de règles explicites, lisibles, testables — jamais d'un modèle de machine learning boîte noire, jamais d'un score "vibe" non justifiable.
2. **L'IA (Dziko) n'invente jamais une décision.** Elle reçoit une recommandation déjà calculée et la traduit en langage naturel, ou répond à une question sur des données déjà connues. Elle ne calcule jamais elle-même un prix, un score ou une priorité.
3. **Aucune action silencieuse.** Toute recommandation qui implique une écriture sur Vinted passe par l'Action Engine existant (`src/lib/actions/`) et son cycle vérifications → préparation → **validation utilisateur explicite** → exécution → résultat → historique. Ce principe est déjà acté dans ROADMAP.md ("Automatisations assistées : détection + proposition d'action, jamais d'action silencieuse") — le Decision Engine ne fait que le formaliser et le nourrir de vraies données.
4. **Jamais de donnée inventée.** Une recommandation sans donnée suffisante ne se force pas — elle ne s'affiche pas, ou s'affiche avec une confiance explicitement basse. C'est déjà la discipline du moteur `src/lib/insights/` existant (ex. `avgRoi` reste `null` en dessous de 3 ventes plutôt que de fabriquer une moyenne) — le Decision Engine généralise cette discipline, il ne la contredit pas.
5. **Aucune capacité Vinted n'est supposée.** Ce document ne décrit que ce que ResellOS peut réellement lire (API wardrobe same-origin, champs confirmés) et réellement écrire (Action Engine, contraintes DataDome/isTrusted documentées §11). Toute limite de Vinted rencontrée est écrite noire sur blanc, jamais contournée.
6. **Le moteur ne remplace pas l'existant, il l'absorbe.** `src/lib/insights/` (scores/alertes/recommandations/tendances/narrations) et `scripts/opportunity-engine/` (scoring des opportunités d'achat) sont deux moteurs déterministes déjà en production, déjà testés, déjà alignés sur ces principes. Le Decision Engine est leur **généralisation et leur unification** dans un pipeline commun — pas une réécriture depuis zéro. Chaque design ci-dessous précise explicitement ce qui est repris tel quel, ce qui est étendu, et ce qui est nouveau.

### 0.3 Ce que ce document n'est pas

Ce n'est pas un plan d'implémentation lot par lot prêt à coder (voir §12 pour le découpage, qui reste au niveau architecture — le détail fichier par fichier se fera au moment de planifier chaque lot). Ce n'est pas une promesse de capacité Vinted non vérifiée. Ce n'est pas une estimation d'effort en heures (aucune base fiable pour la chiffrer à ce stade — §12 donne un ordre de grandeur relatif entre lots, pas un chiffrage).

---

## 1. Audit complet des données disponibles

### 1.1 Vue d'ensemble

| Source | Table / fichier | Nature | Fraîcheur réelle |
|---|---|---|---|
| Annonces (sell-side) | `listings` | Vérité article, mélange ResellOS + Vinted | **Irrégulière, pilotée par l'utilisateur** (pas de cron) |
| Historique de tendance | `listing_metric_snapshots` | Append-only, un point par sync | Aussi irrégulière que `listings` |
| Comptes Vinted | `vinted_accounts` | État de connexion/synchro | Mis à jour à chaque sync |
| Marché (buy-side) | `market_price_observations` | Append-only, scan anonyme | Cron 4h (`scan_runs`) |
| Opportunités (buy-side) | `market_opportunities` | Snapshot recalculé à chaque scan | Cron 4h, table vidée-réécrite |
| Fraîcheur du scan marché | `scan_runs` | Historique d'exécution du cron | Temps réel (écrit à chaque run) |
| Historique d'actions | `action_log` / `action_log_entries` | Audit trail complet | Temps réel (Realtime déjà branché) |
| Watchlist | `watchlist` | Recherches suivies par l'utilisateur | Mise à jour manuelle |
| Notifications | `notifications` / `notification_reads` | Événements produit | Créées à l'événement, jamais de cron |
| Profil / plan | `profiles` | Crédits IA, plan | Temps réel |

### 1.2 Détail par donnée

#### `listings` (table centrale)

- **Où stockée** : table `listings`, RLS scoping `user_id = auth.uid()`.
- **Comment obtenue** : deux origines mélangées sur la même ligne, jamais séparées après création — `vinted_account_id`/`vinted_item_id` non-null = liée à un vrai compte Vinted, `null` = brouillon Générateur IA pur.
  - Création manuelle (Générateur IA) : `title`, `description`, `brand`, `category`, `color`, `size`, `material`, `condition`, `price`/`quick_price`/`premium_price`, `keywords`, `vinted_filters`, `image_urls`, `purchase_price`/`purchase_date`/`purchase_location` — saisis une fois, jamais réécrits par la synchro (règle de propriété de champ, voir ci-dessous).
  - Découverte/synchro Vinted (`extension/src/background/sync.ts::recordListings`, source = `extension/src/content/wardrobeApi.ts`, endpoint same-origin `GET https://www.vinted.fr/api/v2/wardrobe/{vinted_user_id}/items`) : `price`, `vinted_status`, `favourites`, `views`, `synced_at`, `vinted_url` — **toujours réécrits à chaque sync**, jamais protégés.
- **Champs réellement exposés par Vinted via cet endpoint** (confirmé par lecture du code, pas supposé par analogie) : `id`, `title`, `price.amount`, `url`, `photos[0].url`, `favourite_count`, `view_count`, `brand`, `size`, et 5 booléens de statut (`is_draft`/`is_closed`/`is_reserved`/`is_hidden`/`is_processing`) collapsés en un `vinted_status` unique (`online`/`reserved`/`sold_pending`/`sold_completed`/`draft`/`hidden`/`deleted`/`unknown`).
- **Fréquence de mise à jour — point critique, à ne jamais oublier dans tout calcul de confiance** : la synchro n'est **ni un cron ni un push**. Elle se déclenche uniquement quand (a) l'extension est appairée **et** (b) un onglet vinted.fr s'ouvre — soit passivement (l'utilisateur visite son profil), soit via le bouton "Synchroniser maintenant"/"Ouvrir Vinted" (`ListingsManagementSection.tsx`). Un utilisateur qui n'ouvre pas Vinted pendant une semaine a des données vieilles d'une semaine, sans aucun signal automatique pour le prévenir au-delà du bandeau de fraîcheur déjà présent (`syncFreshnessClass` : frais <24h, tendu 24-48h, périmé >48h — seuils déjà validés produit, réutilisés tels quels §7).
- **Niveau de fiabilité** : élevé pour les champs sync-owned au moment de la lecture (donnée réelle Vinted, pas une estimation), mais leur **âge** est le vrai facteur de risque, pas leur exactitude.
- **Historique disponible** : non, sur la table `listings` elle-même — c'est un instantané mutable. L'historique existe séparément (`listing_metric_snapshots`, ci-dessous).
- **Exploitable pour un moteur de décision** : oui, c'est la table pivot. Mais toute règle qui l'utilise doit pondérer par la fraîcheur de `synced_at`.

**`favourites`/`views` sont des compteurs cumulatifs, pas des taux.** Vinted expose `favourite_count`/`view_count` comme totaux depuis la création de l'annonce, jamais une vitesse ("vues aujourd'hui"). Toute notion de "vitesse d'engagement" doit être **dérivée** par ResellOS lui-même via un delta entre deux instantanés — voir `listing_metric_snapshots` ci-dessous. Ce n'est pas une donnée Vinted native, c'est une donnée calculée par le moteur, avec sa propre fiabilité (dépend de la densité de l'historique).

#### `listing_metric_snapshots`

- **Où stockée** : table dédiée, `id`, `listing_id` (FK), `views`, `favourites`, `price`, `vinted_status`, `captured_at`. RLS scoping via `listing_id in (select id from listings where user_id = auth.uid())`.
- **Comment obtenue** : un insert à **chaque** synchro réussie (`recordListings`), donc même cadence irrégulière que `listings`.
- **Fréquence** : identique à `listings` — pas de garantie de régularité.
- **Fiabilité** : haute (donnée réelle observée), mais la **densité** de la série varie énormément selon l'utilisateur (un power-user qui synchronise tous les jours a une série riche ; un utilisateur passif peut n'avoir que 2 points en un mois).
- **Historique** : c'est *la* source d'historique du produit. Déjà exploitée par `src/lib/insights/trends.ts::ruleVisibilityDrop`, avec un garde-fou déjà établi : aucun signal de tendance tant que < 2 instantanés espacés d'au moins `MIN_TREND_INTERVAL_DAYS = 3` jours (constante déjà en place, réutilisée telle quelle).
- **Exploitable** : oui, c'est la seule source honnête de "vitesse" (vues/jour, favoris/jour) — mais uniquement là où la densité le permet. Un signal de vitesse doit systématiquement porter son propre indicateur "n instantanés utilisés" pour que la confiance en aval sache le pondérer.

#### `vinted_accounts`

- **Où stockée** : table dédiée, RLS `user_id = auth.uid()`.
- **Comment obtenue** : `connected` (bool) mis à jour passivement par `recordAccountDetected`/`recordListings` — reflète "une vraie session Vinted a été détectée récemment", **pas** "l'extension est appairée" (deux concepts distincts, voir P-04 déjà résolu).
- **Fréquence** : mise à jour à chaque détection de session, donc là encore liée à l'activité de l'utilisateur.
- **Fiabilité** : haute pour ce qu'elle mesure (signal binaire simple), mais ne dit rien sur la fraîcheur des *données* du compte (voir `last_synced_at`/`listings_synced_at`, déjà distingués — `listings_synced_at` n'avance que si de vraies annonces ont été synchronisées, pas juste une détection de compte).
- **Historique** : non.
- **Exploitable** : oui, comme signal de "compte à vérifier" (§5).

#### `market_price_observations` (marché, buy-side)

- **Où stockée** : table append-only, `id`, `watchlist_id` (FK), `vinted_url`, `brand`, `category`, `price`, `favourites` (défaut 0), `scanned_at`. RLS lecture seule pour `authenticated`, écriture réservée à `service_role`.
- **Comment obtenue** : `scripts/vinted-scan.ts`, scraping anonyme (sans session, Playwright) déclenché par cron GitHub Actions toutes les 4h, uniquement sur les paires marque/modèle présentes dans la Watchlist (7 recherches plateforme + celles ajoutées par les utilisateurs, dédoublonnées entre utilisateurs avant scan).
- **Fréquence** : cron 4h, traçable via `scan_runs` (voir plus bas) — c'est la seule source de ce document avec une cadence garantie.
- **Fiabilité** : donnée réelle scrapée, mais **couverture très partielle** — uniquement les paires marque/catégorie suivies en Watchlist. Un article générique (ex. "Polo Ralph Lauren homme") n'aura quasiment jamais de comparables ici, confirmé par le comportement observé de `analyze-clothing` (la majorité des générations restent honnêtement `price_source: 'ai_estimate'`).
- **Historique** : oui, append-only — c'est la seule table de ce document qui accumule une vraie mémoire de prix dans le temps, avec fenêtre de lookback `OBSERVATION_LOOKBACK_DAYS = 60` déjà utilisée par `analyze-clothing`.
- **Exploitable** : oui, mais uniquement pour les articles dans le périmètre Watchlist, et à condition d'avoir ≥ `MIN_COMPARABLES_FOR_MARKET_PRICE = 3` observations récentes.

#### `market_opportunities` (buy-side, sortie du moteur d'opportunités)

- **Où stockée** : table snapshot recalculée à chaque scan (delete-all + upsert, pas d'append).
- **Comment obtenue** : `scripts/opportunity-engine/` — score additif (base 40), confiance (base sur le nombre de comparables × 5, pénalités de dispersion et de sous-évaluation extrême), niveau de risque, estimation de délai de revente.
- **Fréquence** : cron 4h.
- **Fiabilité** : élevée sur le calcul (moteur déjà testé, additif et transparent), mais dépend en amont de la même couverture partielle que `market_price_observations`.
- **Historique** : non sur cette table (écrasée à chaque scan) — l'historique réel est dans `market_price_observations`.
- **Exploitable** : oui, c'est déjà un moteur de décision *buy-side* fonctionnel et un modèle à suivre pour le reste du Decision Engine (voir §4.3).

#### `scan_runs`

- **Où stockée** : table dédiée, lecture seule pour `authenticated`, écriture `service_role` uniquement.
- **Comment obtenue** : un insert par exécution du cron (ou déclenchement manuel via `scan_market`, la seule action de l'Action Engine avec un vrai `execute()`).
- **Fréquence** : 4h (cron) ou à la demande.
- **Fiabilité** : haute, c'est un simple journal d'exécution.
- **Historique** : oui, c'est lui-même un historique.
- **Exploitable** : oui — c'est **le seul signal fiable de fraîcheur des données de marché**. Toute recommandation buy-side doit citer l'heure du dernier `scan_runs` réussi plutôt que supposer une fraîcheur temps réel.

#### `action_log` / `action_log_entries`

- **Où stockées** : deux tables, RLS `user_id = auth.uid()` (via jointure pour `action_log_entries`).
- **Comment obtenues** : écrites par l'Action Engine (`src/lib/actions/engine.ts`) à chaque `prepare`/`confirm`/`cancel`.
- **Fréquence** : temps réel (Realtime déjà branché, `useActionHistory.ts`).
- **Fiabilité** : haute, c'est un audit trail complet (qui/quoi/quand/quel compte/quelle annonce/résultat/durée).
- **Historique** : oui, c'est lui-même l'historique.
- **Exploitable** : oui, essentiel pour ne jamais re-proposer une action déjà en cours ou déjà tentée récemment (§4.4, §6).

#### `notifications` / `notification_reads`

- **Où stockées** : deux tables (2026-08-04), RLS `user_id = auth.uid() or user_id is null` (broadcast).
- **Comment obtenues** : deux points d'insertion réels seulement — `notifySale` (vente marquée) et `notifyCommunityPublish` (publication admin Communauté). Le type `admin_broadcast` existe dans le schéma/RLS mais **aucun code ne le produit aujourd'hui**.
- **Fréquence** : à l'événement, pas de cadence.
- **Fiabilité** : haute pour ce qui existe, mais **système rudimentaire** — liste plate, 3 types, aucune notion de priorité/urgence/regroupement (confirmé par lecture complète de `useNotifications.ts`).
- **Historique** : fenêtre de 30 jours (`RECAP_WINDOW_DAYS`).
- **Exploitable** : oui comme **canal de sortie** existant à étendre (§9), pas comme source de signal en entrée.

#### `profiles` (crédits/plan)

- **Où stockée** : table `profiles`.
- **Comment obtenue** : gérée par les RPC crédits déjà sécurisées (P-02).
- **Fréquence** : temps réel.
- **Fiabilité** : haute.
- **Historique** : non directement.
- **Exploitable** : oui, comme contrainte de capacité (un plan Free a moins de budget d'appels IA — voir §8.5 sur la contrainte réelle du quota Gemini gratuit).

### 1.3 Données manquantes — à ne jamais supposer disponibles

Cette liste est aussi importante que la précédente : le Decision Engine ne doit **jamais** faire semblant d'avoir ce qui suit.

- **Aucune donnée de visiteurs uniques** distincte du compteur cumulatif de vues (`view_count`). Impossible de savoir "combien de personnes différentes ont vu l'annonce aujourd'hui".
- **Aucun horodatage d'ajout en favori.** `favourite_count` est un total, jamais un journal d'événements — impossible de savoir *quand* un favori a été ajouté, seulement que le total a augmenté entre deux synchros.
- **Aucune donnée d'impressions / apparition en recherche.** Vinted n'expose rien sur le positionnement de l'annonce dans les résultats de recherche.
- **Aucune donnée de messages ni d'offres** aujourd'hui (Phase 5/6 de la roadmap produit, "pas commencée") — aucun signal ne peut donc porter sur "l'acheteur a négocié" ou "3 messages sans réponse".
- **Aucune donnée démographique ou comportementale sur les acheteurs.**
- **Aucun signal de concurrence directe en temps réel** au-delà de `competing_listings_count` (calculé par le moteur d'opportunités, buy-side uniquement, pas disponible côté sell-side pour les annonces de l'utilisateur).
- **Aucune donnée retour/litige.**
- **Aucun accès à l'historique complet de prix d'une annonce tierce** — seulement les observations retenues par `market_price_observations`, limitées aux paires Watchlist.
- **Confirmation du niveau de facturation Gemini non refaite depuis le dernier audit (2026-07-11)** — à vérifier avant toute dépendance forte sur la capacité d'appel IA (§8.5).

---

## 2. Les signaux

Un signal est une transformation directe et locale d'une ou plusieurs données brutes — pas encore une décision, pas encore une feature composite. Chaque signal ci-dessous précise s'il existe déjà dans `src/lib/insights/` (repris tel quel), ou s'il est nouveau pour le Decision Engine.

| Signal | Formule exacte | Dépendances | Confiance | Coût de calcul | Statut |
|---|---|---|---|---|---|
| `sync_freshness` | `now - listing.synced_at` classé fresh (<24h) / tendu (24-48h) / périmé (>48h) | `listings.synced_at` | Élevée (mesure directe) | O(1) | **Existant** (`syncFreshnessClass`) |
| `views_vs_median` | `listing.views / activeMedianViews` (médiane des annonces `online` du compte/segment) | `listings.views`, médiane calculée en contexte | Moyenne — dépend de `sync_freshness` | O(n) une fois par lot (médiane) | **Existant** (`scoring.ts`, `alerts.ts`) |
| `favourites_vs_median` | `listing.favourites / activeMedianFavourites` | idem | Moyenne | O(n) | **Existant** |
| `listing_age_days` | `daysSince(created_at, now)` | `listings.created_at` | Élevée | O(1) | **Existant** (`math.ts::daysSince`) |
| `views_velocity` | `(snapshot_last.views - snapshot_first.views) / joursEntreLesDeux`, calculé uniquement si ≥2 instantanés espacés ≥ `MIN_TREND_INTERVAL_DAYS` (3j) | `listing_metric_snapshots` (≥2 points) | **Faible si peu de points, sinon moyenne-haute** — doit porter le nombre d'instantanés utilisés | O(1) par annonce, une fois les snapshots chargés | **Existant** (`trends.ts::ruleVisibilityDrop`, actuellement seuillé sur une baisse ≥15%, jamais utilisé en positif) — **à étendre** en signal continu réutilisable (hausse ET baisse) |
| `price_vs_category_avg_sold` | `(listing.price - byCategory.avgSoldPrice) / byCategory.avgSoldPrice` | `listings` (ventes réelles ≥ `MIN_SAMPLE_SIZE_FOR_COMPARISON`=3), même catégorie | Basse si échantillon < 3 (alors `null`, jamais fabriqué) | O(1) après agrégation | **Existant** (`alerts.ts::ruleIncoherentPrice`) |
| `price_vs_market_observation` | médiane de `market_price_observations` filtrée marque+catégorie, fenêtre 60j | `market_price_observations`, ≥3 comparables | Dépend de la couverture Watchlist — souvent `null` | O(n) sur la fenêtre | **Existant** (`analyze-clothing`, `priceModel.ts`) — **non branché côté sell-side aujourd'hui** (utilisé seulement à la génération, jamais réévalué après publication) |
| `roi_realized` | `(sold_price - purchase_price - fees) / purchase_price`, uniquement si `purchase_price` connu | `listings` (vendu, `purchase_price` non-null) | Élevée si connu, signal absent sinon (jamais 0 par défaut) | O(1) | **Existant** (`scoring.ts`) |
| `margin_absolute` | `referencePrice - purchase_price - fees` | idem | Élevée si connu | O(1) | **Existant** (`alerts.ts::ruleInsufficientMargin`, seuil 5€) |
| `brand_performance_ratio` / `category_performance_ratio` | `groupStats.avgRoi / overall.avgRoi` | ventes ≥3 par groupe | Basse en dessous du seuil d'échantillon | O(1) après agrégation | **Existant** |
| `account_connection_state` | `vinted_accounts.connected` + `extensionState` (ready/paired) | `vinted_accounts`, état runtime extension | Élevée (binaire) | O(1) | **Existant** (VintedAccountPage) — **jamais consommé par le moteur de décision aujourd'hui** |
| `sync_staleness_account` | `now - max(last_synced_at)` sur les comptes actifs | `vinted_accounts.last_synced_at` | Élevée | O(1) | **Existant** (`DashboardHome.tsx`, seuil 48h) |
| `brand_locked_on_edit` | Bandeau natif Vinted "certaines marques ne peuvent être modifiées qu'en supprimant et en ajoutant à nouveau" détecté (`isBrandLocked()`) | Détection DOM au moment de l'édition, pas une donnée stockée | Élevée quand observée (fait, pas une estimation) | O(1), coût réseau (ouverture d'onglet) | **Existant côté extension**, jamais remonté comme signal au Decision Engine |
| `needs_republish` | `status='en_stock'` ET (`vinted_item_id` absent OU `vinted_status ∈ {hidden, deleted, draft, unknown}`) | `listings` | Élevée (règle binaire déjà en prod) | O(1) | **Existant** (`listingStatus.ts::needsRepublish`) |
| `market_opportunity_freshness` | `now - scan_runs.completed_at` (dernier run `success`) | `scan_runs` | Élevée | O(1) | **Nouveau, trivial à ajouter** |
| `photo_count` | `listing.image_urls.length` | `listings` | Élevée | O(1) | **Nouveau** (déjà utilisé comme check binaire dans `checkListingHasPhotos`, jamais comme signal continu) |
| `days_since_last_action_attempt` | dernier `action_log.started_at` pour cette annonce, tout `kind` confondu | `action_log` | Élevée | O(1) indexé | **Nouveau** — nécessaire pour éviter de re-proposer une action juste tentée (§6) |
| `credits_remaining` | `profiles.credits` vs `PLAN_LIMITS[plan]` | `profiles` | Élevée | O(1) | **Existant**, jamais consommé comme contrainte de recommandation |

**Sur le coût de calcul** : tous les signaux ci-dessus sont O(1) à O(n) sur le nombre d'annonces d'un utilisateur — jamais O(n²), cohérent avec le pattern déjà en place (`buildContext()` pré-calcule les agrégats une seule fois, partagés par toutes les règles). Aucun signal ne nécessite d'appel réseau à l'exécution (tout est déjà en base au moment du calcul), sauf `brand_locked_on_edit` qui n'est observable qu'au moment réel d'une tentative d'édition (côté extension), pas pré-calculable.

---

## 3. Features

Une feature est une composition de plusieurs signaux en un indicateur agrégé, à plage de valeur normalisée, réutilisable par plusieurs règles. Toutes les features ci-dessous sont calculées par annonce (sauf mention contraire), sur une échelle 0-100, avec la même philosophie additive/transparente que `scoring.ts`/`confidence.ts` existants — jamais une boîte noire.

| Feature | Calcul | Données utilisées | Utilité | Plage |
|---|---|---|---|---|
| **ListingHealth** | Score additif base 50 : `+10/-10` selon `views_vs_median`, `+10/-10` selon `favourites_vs_median`, `-8/-15` selon `listing_age_days` vs `AGING_STOCK_DAYS`(21)/`REPUBLISH_AFTER_DAYS`(30) | signaux d'engagement + âge | Vue synthétique "cette annonce va-t-elle bien ?" | 0-100 | **Existant, c'est `computeScores()` déjà en prod, renommé conceptuellement ici** |
| **VisibilityScore** | Dérivé de `views_vs_median` + `views_velocity` (si disponible) — pénalité si `views_velocity` négative sur ≥2 instantanés, bonus si positive et forte | `views`, `listing_metric_snapshots` | Distingue "peu vue depuis toujours" de "était bien vue, chute maintenant" — deux causes différentes, deux recommandations différentes | 0-100 | **Nouveau — combine un signal existant (`views_vs_median`) et un signal étendu (`views_velocity` continu, §2)** |
| **PricePressure** | Écart signé entre `listing.price` et le meilleur repère disponible dans cet ordre de préférence : `price_vs_market_observation` (si ≥3 comparables) sinon `price_vs_category_avg_sold` (si ≥3 ventes) sinon `null` (pas de feature calculée) | prix + repères de marché/historique interne | Faut-il baisser, monter, ou ne rien dire sur le prix | -100 (très sous-évalué) à +100 (très sur-évalué), ou **absent** si aucun repère fiable | **Nouveau — unifie deux repères déjà existants séparément (`ruleIncoherentPrice` et `analyze-clothing`), jamais combinés côté sell-side aujourd'hui** |
| **DemandStrength** | Combinaison `views_vs_median` + `favourites_vs_median`, tous deux nécessaires (ni l'un ni l'autre seul ne suffit — cohérent avec `ruleHighDemand`/`ruleRaisePriceUndervalued` existants qui exigent déjà les deux) | vues + favoris relatifs | Détecte une sous-évaluation ("le marché adore, augmente le prix") vs un vrai désintérêt | 0-100 | **Existant en pratique dans `recommendations.ts`/`alerts.ts`, jamais nommé/exposé comme feature indépendante** |
| **ROIQuality** | `roi_realized` si vendu, sinon `(referencePrice - purchase_price - fees) / purchase_price` projeté sur le prix affiché actuel si `purchase_price` connu, sinon **absente** | `purchase_price`, `price`/`sold_price`, `fees` | Rentabilité réelle ou projetée | -100 à +100, ou **absente** | **Existant** (`scoring.ts` ROI tiers) |
| **MarketHealth** (buy-side) | Reprend tel quel `computeScore()`/`computeConfidence()` de `scripts/opportunity-engine/` | `market_price_observations`, watchlist priority | Qualité d'une opportunité d'achat | 0-100 score + 0-100 confiance séparée | **Existant, buy-side, déjà en prod** |
| **AccountHealth** | `account_connection_state` + `sync_staleness_account`, binaire pondéré (connecté+frais=100, déconnecté ou périmé=0, tendu=50) | `vinted_accounts` | Le "tout fonctionne-t-il" de base — condition préalable à toute autre recommandation sur ce compte | 0/50/100 | **Nouveau, trivial** |
| **RepublishEligibility** | `needs_republish` (binaire) combiné à `listing_age_days` et à `days_since_last_action_attempt` (évite de reproposer juste après un échec) | `listings`, `action_log` | Filtre d'éligibilité avant même de calculer une recommandation de republication | booléen + délai avant réessai | **Étend `needsRepublish()` existant avec la dimension "dernière tentative"** |

**Sur les plages de valeur** : le choix 0-100 est repris tel quel de `computeScores()` (déjà en prod, déjà compris par l'équipe et potentiellement affiché à l'utilisateur via `OneScoreBar`). `PricePressure`/`ROIQuality` utilisent une échelle signée (-100/+100) parce qu'elles portent une **direction** (trop cher vs pas assez cher), pas seulement une intensité — un score 0-100 masquerait cette distinction essentielle à la recommandation.

---

## 4. Decision Engine — le pipeline

```
Raw data  →  Signals  →  Features  →  Rules  →  Confidence  →  Recommendation  →  Dziko IA
```

### 4.1 Raw data

Les tables et sources du §1, chargées une fois par exécution (pas de requête répétée par règle — c'est déjà le pattern de `buildContext()` dans `src/lib/insights/context.ts`, à généraliser).

### 4.2 Signals

Fonctions pures, indépendantes, chacune calculée à partir des raw data et éventuellement d'agrégats de contexte pré-calculés (médianes, moyennes par groupe — déjà le rôle de `EngineContext`/`GroupStats`). Un signal ne connaît jamais d'autre signal — c'est la couche §2.

### 4.3 Features

Compositions de plusieurs signaux, toujours par une formule nommée et documentée (jamais une pondération arbitraire sans justification — voir §7 pour la discipline de nommage des pénalités/bonus, déjà appliquée dans `scoring.ts`). C'est la couche §3.

### 4.4 Rules

Une règle est une fonction pure `(listing, features, context) → Recommendation | null`. Deux familles de règles coexistent, sur le modèle déjà en place :

- **Règles à liste ordonnée, un seul résultat retenu** (modèle `recommendations.ts` actuel : la première règle qui matche gagne, jamais d'empilement de conseils contradictoires sur une même annonce).
- **Règles à chaîne de paliers déterministe pour la priorité globale** (modèle `dominantSignal.ts` déjà validé produit le 2026-07-23, qui a *explicitement remplacé* un score continu de priorité — décision produit à respecter, pas à re-questionner sans preuve nouvelle). Le Decision Engine généralise cette chaîne à plusieurs signaux simultanés visibles (pas un seul "signal dominant" mais une liste ordonnée pour le Centre des Actions, §10) tout en gardant le même principe : ordre de paliers explicite, jamais un score flou pour départager.

Chaque règle déclare ses **checks d'éligibilité** avant de produire quoi que ce soit — reprend le pattern `ActionCheck` déjà en place dans `src/lib/actions/checks.ts` (ex. une règle "republier" ne s'exécute jamais sur une annonce vendue, exactement comme `checkListingNeedsRepublish` le garantit déjà côté Action Engine — le Decision Engine et l'Action Engine doivent utiliser les **mêmes** conditions d'éligibilité, jamais deux définitions divergentes du même critère).

### 4.5 Confidence

Voir §7 en détail. À ce stade du pipeline, chaque recommandation produite par une règle porte un score de confiance calculé, jamais supposé.

### 4.6 Recommendation

Sortie structurée : `{ listingId, kind, message, reason, confidence, tier, actionKind? }`. `actionKind` est optionnel et ne pointe vers une entrée de l'Action Engine (`src/lib/actions/types.ts::ActionKind`) **que si une action exécutable existe réellement** — sinon la recommandation reste une simple suggestion textuelle sans bouton d'exécution (voir §11 : aujourd'hui, `publish_listing`/`republish_listing` sont bloqués et `pause_listing`/`delete_listing` n'existent pas, donc plusieurs recommandations de ce document n'ont **aucune** action réellement cliquable derrière — c'est assumé et documenté, jamais masqué).

### 4.7 Dziko IA

Couche finale, uniquement pour la mise en langage naturel et les questions ouvertes — jamais pour la génération de la recommandation elle-même. Détail complet §8.

---

## 5. Catalogue des recommandations

Chaque recommandation liste : conditions d'émission, risques, confiance typique, justification. La colonne **Exécutable ?** indique honnêtement si une action Action Engine existe aujourd'hui pour l'exécuter en un clic (voir §11) — sinon la recommandation reste informative, à exécuter manuellement par l'utilisateur sur Vinted.

### 5.1 Recommandations sell-side (annonces existantes)

| Recommandation | Conditions | Risques | Confiance typique | Justification | Exécutable ? |
|---|---|---|---|---|---|
| **Attendre** | Aucune règle ne matche, ou signaux contradictoires sans direction claire | Aucun (c'est l'option par défaut, sûre) | N/A (recommandation neutre) | Absence de signal fort = pas de conseil forcé | N/A |
| **Baisser le prix** | `listing_age_days ≥ REPUBLISH_AFTER_DAYS`(30) ET engagement faible (`views_vs_median ≤ 0.5` ET `favourites_vs_median ≤ 0.5`) | Marge réduite, vente précipitée si le vrai problème est ailleurs (photos, titre) | Moyenne-haute si `PricePressure` confirme un repère marché ; moyenne seule si dérivée uniquement de l'engagement | Reprend `ruleLowerPriceStale` existant, enrichi par `PricePressure` quand disponible | Oui — `edit_price` via `edit_listing` (Beta Ready, clic manuel requis, §11) |
| **Augmenter le prix** | `views_vs_median ≥ 2` ET `favourites_vs_median ≥ 2` (demande forte confirmée) | Ralentir une vente qui allait se faire au prix actuel | Haute (deux signaux indépendants concordants) | Reprend `ruleRaisePriceUndervalued` existant | Oui — `edit_price` |
| **Revoir le prix (sans direction imposée)** | `views_vs_median ≥ 1.5` mais `favourites ≤ 1` (beaucoup de clics, aucune conversion en favori) | Aucune direction certaine (peut être le prix, peut être la photo) | Moyenne | Reprend `ruleReviewPriceHighViewsLowFavourites` existant — délibérément non directionnel, honnête sur l'incertitude | Non (recommandation d'investigation, pas d'action directe) |
| **Republier** | `needs_republish` = vrai ET `listing_age_days ≥ REPUBLISH_AFTER_DAYS` ET pas de tentative `republish`/`publish` dans les dernières 24h (`days_since_last_action_attempt`) | Doublon si l'ancienne annonce n'est pas réellement hors ligne (à vérifier via `vinted_status`) | Haute sur l'éligibilité (règle binaire), mais **exécution bloquée aujourd'hui** (§11) | `REPUBLISH_AFTER_DAYS`=30 déjà justifié en commentaire (`constants.ts`) comme norme de renouvellement de seconde main | **Non — bloqué par `checkPublishTemporarilyDisabled` (§11), recommandation informative uniquement pour l'instant** |
| **Modifier le titre** | Signal indirect uniquement : `views_vs_median` très bas malgré une catégorie à forte activité globale (comparaison indirecte, pas un signal direct sur le contenu du titre) | Vinted déclenche parfois une revue de contenu après modification de titre (délai observé, comportement Vinted confirmé, pas un bug) | **Basse** — ResellOS n'a aucune donnée sur la qualité intrinsèque d'un titre (pas de SEO Vinted mesurable) | Recommandation faible et assumée comme telle — ne jamais afficher une confiance élevée ici, ce serait inventer un signal | Oui — `edit_listing` (titre seul, Beta Ready) |
| **Modifier la description** | Idem titre — signal indirect faible | Idem | Basse | Idem | Oui — `edit_listing` |
| **Modifier les photos** | `photo_count < PLAN_PHOTO_LIMITS[plan]` ET engagement faible | Aucun signal direct sur la qualité des photos existantes (ResellOS ne les analyse pas) | Basse (uniquement sur le comptage, jamais sur la qualité) | Signal purement quantitatif, honnête sur sa limite | **Non — `edit_photos` n'a aucun handler (§11)**, recommandation informative |
| **Changer la catégorie** | Aucun signal automatique aujourd'hui — nécessiterait de détecter une catégorie mal choisie, ce que ResellOS ne peut pas déduire sans référentiel externe | Risque élevé (changement de catégorie affecte la découvrabilité) | **Non calculable avec les données actuelles — à ne jamais recommander automatiquement tant qu'aucun signal fiable n'existe** | — | Non — champ non vérifiable après édition (§11), et modification manuelle requise |
| **Changer la marque** | Idem — aucun signal | — | Non calculable | — | Non — verrouillé nativement par Vinted pour certains articles (`isBrandLocked`), et non vérifiable |
| **Changer la taille** | Idem — aucun signal | — | Non calculable | — | Non testé en conditions réelles (§11) |
| **Supprimer** | `listing_age_days` très élevé (> `REPUBLISH_AFTER_DAYS * 2`) ET zéro engagement (`views=0` ET `favourites=0`) ET déjà republiée sans effet (vérifiable via `action_log`, historique de `republish_listing` sur cette annonce) | Perte définitive si l'article se serait finalement vendu | Moyenne (signal déjà utilisé pour `ruleInactiveListing`, mais la décision "supprimer" est plus radicale que "republier" — seuil de déclenchement volontairement plus strict, à valider avec l'utilisateur avant implémentation) | Étend `ruleInactiveListing` existant vers une action plus radicale, seuil non encore arbitré (voir §12, à trancher en lot) | **Non — `delete_listing` n'a aucun handler (§11)** |
| **Archiver** | Même famille que "Supprimer" mais moins définitif — pas de mécanisme Vinted natif équivalent identifié aujourd'hui (à vérifier : Vinted a un état "masqué" natif, potentiellement mappable) | Faible si bien distingué de "supprimer" | Basse tant que le mécanisme Vinted réel n'est pas confirmé | **À vérifier avant implémentation — ne pas supposer que "masquer" est disponible sans confirmation** | Non — aucune capacité d'écriture identifiée |
| **Conserver** | Signaux tous neutres ou positifs, rien à changer | Aucun | N/A | Recommandation "rien à faire", aussi légitime que les autres — évite de forcer une action là où il n'y en a pas | N/A |
| **Vérifier la connexion du compte** | `AccountHealth < 100` (déconnecté ou sync périmée) | Aucun (recommandation opérationnelle, pas produit) | Haute (signal binaire direct) | Nouveau — comble un vrai trou : aujourd'hui rien ne dit explicitement à l'utilisateur "reconnecte ton extension" en dehors des pages Compte Vinted/Mes annonces elles-mêmes | Non — c'est une action utilisateur hors Action Engine (reconnexion extension) |

### 5.2 Recommandations buy-side (sourcing, réutilise le moteur d'opportunités existant)

| Recommandation | Conditions | Confiance | Exécutable ? |
|---|---|---|---|
| **Acheter davantage de ce type d'article** | `MarketHealth` (score+confiance opportunité) élevé de façon répétée sur plusieurs scans pour une même paire marque/modèle de la Watchlist | Haute si répété dans le temps (à vérifier via l'historique `market_price_observations`, pas un seul scan isolé) | N/A — c'est une décision d'achat hors Vinted, jamais une action ResellOS |
| **Arrêter d'acheter ce type** | Symétrique — `MarketHealth` durablement bas ou `risk_level='eleve'` répété | Haute si répété | N/A |
| **Suivre cette recherche (ajouter à la Watchlist)** | Une opportunité isolée forte apparaît hors Watchlist — non calculable aujourd'hui car le scan ne couvre que la Watchlist elle-même (limite déjà documentée §1.2) | N/A tant que cette limite n'est pas levée | Oui — CRUD Watchlist existant, hors Action Engine |

**Note de cohérence** : les recommandations buy-side utilisent un moteur (scoring/confiance) **différent** de celui du sell-side (§3), déjà en production séparément. Le Decision Engine ne les fusionne pas en un seul calcul — il les fait cohabiter sous le même pipeline conceptuel (§4) et le même Centre des Actions (§10), avec chacune sa propre logique de score, exactement comme aujourd'hui `src/lib/insights/` et `scripts/opportunity-engine/` sont deux modules distincts. Fusionner leurs formules de score serait une décision architecturale lourde, non demandée, non nécessaire — à ne pas faire sans raison explicite.

---

## 6. Cycle de vie complet d'une annonce

Le cycle ci-dessous n'est pas une machine à états rigide — chaque transition dépend du **contexte réel** (fraîcheur des données, historique d'actions déjà tentées, signaux disponibles), jamais d'un simple compteur de jours isolé.

**Jour 0 — Publication.**
Une annonce naît soit du Générateur IA (brouillon `status='draft'`, jamais liée à Vinted tant qu'elle n'est pas publiée — aujourd'hui bloqué, §11), soit d'une synchro Vinted découvrant une annonce déjà existante ailleurs. Le Decision Engine n'a aucun signal avant la première synchro post-publication — c'est un vrai "point mort" assumé, pas un oubli.

**Observation (J0 à J+30, borne haute = `REPUBLISH_AFTER_DAYS`).**
Chaque synchro accumule un `listing_metric_snapshots`. Tant que la série a moins de 2 points espacés d'au moins 3 jours, **aucun signal de tendance n'est calculable** — le moteur reste silencieux sur la vitesse, mais peut déjà comparer l'annonce à la médiane instantanée du compte (`views_vs_median`).

**Premiers signaux (dès qu'un premier écart à la médiane apparaît).**
Le moteur ne produit **pas** de recommandation dès le premier signal isolé — une seule règle qui matche produit une recommandation, mais chaque règle exige déjà un contexte suffisant (échantillon ≥3, écart marqué, pas juste un signal faible). C'est la même discipline que `ruleHighDemand` (exige `≥2.5x` la médiane, pas `1.1x`).

**Premières recommandations.**
Dès qu'une règle matche avec une confiance suffisante (§7), une recommandation apparaît dans le Centre des Actions (§10). Elle n'est **jamais** exécutée automatiquement — elle attend soit une validation explicite (si une action existe, §11), soit reste informative.

**Évolution — la clé du "pas de règles simplistes".**
Le contexte change la lecture d'un même signal brut :
- Une annonce à J+35 avec `views_vs_median=0.4` **et** un historique de tendance montrant que la vitesse de vue **ralentit encore** (deux instantanés le confirment) mérite une recommandation "baisser le prix" à confiance haute.
- La même annonce à J+35 avec `views_vs_median=0.4` mais **sans** historique de tendance disponible (sync trop rare) ne mérite qu'une recommandation à confiance moyenne, avec la raison explicite "peu de données de tendance disponibles" — jamais présentée avec la même assurance.
- Une annonce déjà republiée une fois (`action_log` porte une entrée `republish_listing` réussie il y a 20 jours) et qui retombe dans les mêmes signaux faibles ne redéclenche pas "republier" à l'identique — le signal `days_since_last_action_attempt` couplé à un compteur de republications déjà faites doit faire monter la sévérité (voir "Supprimer" en §5.1) plutôt que répéter le même conseil en boucle.

**Deuxième décision, troisième décision.**
Chaque nouvelle recommandation prend en compte l'historique des recommandations précédentes sur cette même annonce (via `action_log` pour les actions réellement exécutées, et — nouveau besoin, voir §12 — un futur horodatage "dernière recommandation affichée" pour éviter de re-notifier une recommandation ignorée en boucle sans escalade, cf. §9 sur le silence intelligent).

**Annonce morte.**
`listing_age_days` très élevé, engagement nul, déjà republiée sans effet (ou republication impossible aujourd'hui, §11) → recommandation "Supprimer" ou "Archiver" (seuils à arbitrer en lot, §12), toujours avec confiance explicite et jamais en action automatique.

**Republication → nouvelle vie.**
Une republication réussie (via l'Action Engine, une fois le blocage §11 levé) réinitialise le cycle : nouvel horodatage de référence pour `listing_age_days`, nouveaux instantanés à accumuler avant tout signal de tendance fiable. Le moteur ne réutilise jamais les anciens instantanés `listing_metric_snapshots` d'avant republication pour calculer une vitesse sur la nouvelle période — ce serait mélanger deux cycles de vie distincts.

---

## 7. Confiance

### 7.1 Principe

La confiance n'est pas un nombre magique — c'est la **combinaison transparente et nommée** de facteurs vérifiables, sur le modèle déjà en place dans `scripts/opportunity-engine/confidence.ts` (base + pénalités nommées, jamais un multiplicateur arbitraire).

### 7.2 Facteurs de confiance (proposés, à valider en lot d'implémentation)

| Facteur | Effet | Justification |
|---|---|---|
| **Fraîcheur de synchro** (`sync_freshness`) | Confiance plafonnée : frais → pas de plafond, tendu (24-48h) → plafond 70, périmé (>48h) → plafond 40 | Réutilise les seuils déjà validés produit (`syncFreshnessClass`, `STALE_SYNC_THRESHOLD_HOURS=48`) plutôt que d'en inventer de nouveaux |
| **Taille d'échantillon** (comparables marché, ventes du groupe) | En dessous de `MIN_SAMPLE_SIZE_FOR_COMPARISON`(3), le repère est `null` — la recommandation qui en dépend perd le bonus correspondant, jamais un score forcé | Réutilise la constante déjà justifiée en commentaire dans `constants.ts` |
| **Densité d'historique de tendance** | Confiance réduite si `views_velocity` calculée sur seulement 2 instantanés vs bonus si ≥5 | Plus de points = moins de bruit, principe déjà appliqué à `MIN_TREND_INTERVAL_DAYS` |
| **Accord entre signaux indépendants** | Bonus si `views_vs_median` et `favourites_vs_median` pointent dans la même direction ; recommandation dégradée en "à surveiller" si contradictoires | Déjà le principe implicite de `ruleHighDemand`/`ruleRaisePriceUndervalued`, qui exigent les deux signaux ensemble plutôt qu'un seul |
| **Distance au seuil de la règle** | Un écart de 3x la médiane est plus confiant qu'un écart de 1.21x (juste au-dessus du seuil `1.2` de `scoring.ts`) | Évite qu'une annonce à la limite exacte d'un seuil déclenche une recommandation aussi confiante qu'un cas extrême |
| **Historique d'échec récent sur une action similaire** | Une recommandation liée à une action qui a déjà échoué récemment (`action_log.status='error'`) voit sa confiance d'*exécutabilité* baisser, même si le signal produit reste valide | Distingue "le signal est vrai" de "l'action va probablement réussir" — deux notions de confiance différentes, à ne jamais confondre dans l'interface |

### 7.3 Évolution de la confiance

La confiance n'est jamais figée — elle se recalcule à chaque nouvelle synchro. Elle **monte** typiquement quand : une nouvelle synchro confirme la même direction, un nouvel instantané allonge la série de tendance, un signal supplémentaire se met à concorder. Elle **baisse** typiquement quand : la synchro devient périmée (le simple passage du temps sans nouvelle donnée dégrade la confiance, même si le dernier signal connu était fort), une nouvelle synchro contredit le signal précédent, une tentative d'exécution de l'action associée a échoué.

### 7.4 Pourquoi une recommandation peut rester faible malgré "beaucoup de données"

Trois cas réels, à toujours pouvoir expliquer à l'utilisateur (c'est le rôle de Dziko, §8) :
1. **Beaucoup de vues, mais signaux contradictoires** — ex. vues très élevées, favoris moyens, prix ni haut ni bas : aucune règle ne matche franchement, donc aucune recommandation à confiance haute, même si la fiche annonce "a l'air" très suivie.
2. **Beaucoup d'historique, mais hors du périmètre couvert** — ex. une marque très vendue par l'utilisateur mais absente de la Watchlist n'a aucun repère `market_price_observations`, donc `PricePressure` reste `null` malgré un historique de ventes personnel riche.
3. **Signal fort, mais donnée périmée** — une annonce à 400% de la médiane de vues il y a 5 jours (avant que la synchro ne s'arrête) affiche toujours ce chiffre en base, mais la confiance est plafonnée à 40 par la règle de fraîcheur — le moteur ne prétend jamais qu'une donnée vieille de 5 jours est aussi fiable qu'une donnée d'aujourd'hui.

---

## 8. Dziko IA

### 8.1 Rôle exact

Dziko IA **explique**, ne décide jamais. Concrètement : il reçoit une `Recommendation` déjà calculée par le pipeline déterministe (§4-§7) et la traduit en langage naturel, ou répond à une question de l'utilisateur en s'appuyant sur les mêmes données déjà connues du moteur — jamais en recalculant lui-même un score, un prix, ou une priorité.

**État réel aujourd'hui** (à ne pas oublier en concevant la suite) : `DzikoAiBubble.tsx` est un vrai appel LLM (`gemini-2.5-flash`, `supabase/functions/dziko-assistant`), **désactivé par défaut** derrière un feature flag (`VITE_DZIKO_AI_ENABLED`), jamais déployé/testé en conditions réelles. Il reçoit aujourd'hui des données brutes (profil, 50 dernières annonces, comptes Vinted, compteur global d'opportunités) mais **ne reçoit aucune sortie du moteur d'insights ni de l'Action Engine** — il n'a donc aujourd'hui aucune connaissance des scores, alertes ou recommandations déjà calculés par ResellOS. C'est le premier écart à combler (§12).

### 8.2 Données qu'il doit recevoir (état cible)

- La ou les `Recommendation` concernées (kind, message, reason, confidence, tier) — jamais les données brutes seules sans le calcul déjà fait, pour éviter que le modèle ne "recalcule" implicitement sa propre estimation en langage naturel.
- Le contexte minimal nécessaire pour reformuler honnêtement : nom/marque de l'annonce, chiffres cités dans `reason` (déjà des chaînes formatées côté déterministe aujourd'hui dans `narrative.ts`/`recommendations.ts` — ce pattern doit être conservé, pas contourné par un prompt qui regénère les phrases depuis les nombres bruts).
- L'historique de conversation en cours (déjà géré, en mémoire, jamais persisté).

### 8.3 Ce qu'il ne doit jamais inventer

- **Aucun chiffre non fourni.** S'il ne connaît pas la valeur exacte, il ne l'approxime pas — il dit qu'il ne l'a pas (cohérent avec `FORBIDDEN_PHRASES` déjà présent dans `scripts/opportunity-engine/constants.ts` pour l'explication buy-side, principe à étendre).
- **Aucune capacité Vinted.** Il ne doit jamais suggérer une action que l'Action Engine ne sait pas exécuter aujourd'hui sans le dire explicitement (ex. ne jamais dire "je republie ton annonce" — dire "je te recommande de republier, mais il faudra le faire toi-même sur Vinted pour l'instant" tant que §11 n'est pas levé).
- **Aucune promesse de résultat** ("cette annonce va se vendre") — seulement une reformulation de la confiance déjà calculée ("le moteur estime cette recommandation avec une confiance moyenne, car...").
- **Aucun recalcul silencieux** — s'il doit citer un chiffre, c'est toujours un chiffre qui existe déjà dans les données transmises, jamais une estimation de sa part.

### 8.4 Transformation recommandation → langage naturel

Le pipeline déterministe produit déjà des messages/raisons en français structuré (`recommendations.ts`, `alerts.ts`, `narrative.ts` — de simples templates, pas de LLM). Dziko IA **enrichit le ton et la mise en contexte conversationnelle**, il ne remplace pas ces templates — il les prend en entrée. Sur une question directe ("pourquoi tu me dis ça ?"), il doit pouvoir répéter la `reason` fournie, éventuellement reformulée, jamais une justification différente inventée à la volée.

### 8.5 Contrainte de capacité réelle — à ne jamais oublier

`GEMINI_API_KEY` tourne encore, à la dernière vérification (2026-07-11, **non reconfirmée depuis**), sur le **niveau gratuit** de l'API Gemini : 10 RPM, 250 000 TPM, **250 requêtes/jour**. `dziko-assistant` et `analyze-clothing` partagent cette même clé. Si le Decision Engine se met à déclencher un appel Dziko pour "expliquer" automatiquement chaque nouvelle recommandation, ce plafond serait atteint en quelques dizaines d'utilisateurs actifs — **avant même que la question de coût ne se pose** (l'audit précédent a déjà établi que le coût en euros n'est jamais le facteur limitant, le nombre de requêtes/jour l'est).

**Conséquence architecturale directe pour ce chantier** : Dziko IA ne doit **jamais** être appelé automatiquement pour chaque recommandation produite. Le pipeline déterministe (§4-§7) doit rester **totalement autonome et fonctionnel sans aucun appel IA** — les messages/raisons textuels déjà générés par templates (comme aujourd'hui) restent la source principale d'explication dans l'interface. Dziko IA n'intervient qu'à la demande explicite de l'utilisateur (bouton "demander à Dziko" / question posée dans le chat), jamais en arrière-plan à l'échelle de toutes les recommandations de tous les utilisateurs. Ne pas revérifier l'état de facturation avant de dimensionner un usage plus large serait répéter une erreur déjà documentée deux fois dans ce projet (coupure `gemini-2.0-flash`, quota gratuit non résolu depuis).

### 8.6 Anti-hallucination — mécanismes concrets

- Prompt système qui liste explicitement les données transmises et interdit toute donnée hors de cette liste (extension du pattern déjà en place côté `analyze-clothing`/`dziko-assistant`, à documenter précisément au moment du lot d'implémentation).
- Aucune sortie de Dziko IA n'est jamais écrite en base ni utilisée comme entrée d'une règle ultérieure — c'est une couche de présentation terminale, jamais un maillon du pipeline de décision. C'est la garantie structurelle la plus importante de cette section : même si Dziko hallucine dans une réponse conversationnelle, cela ne peut **jamais** corrompre une recommandation future, parce que le pipeline de décision ne le lit jamais en retour.

---

## 9. Notifications

### 9.1 Constat de départ

Le système actuel (`notifications`/`notification_reads`) est une liste plate, sans priorité, sans regroupement, avec seulement deux événements réellement produits (vente, publication Communauté). C'est une bonne fondation technique (RLS déjà correcte, broadcast déjà géré) mais aucune intelligence de priorisation n'existe.

### 9.2 Principes du système cible

- **Pas de spam** : une notification n'est créée que si elle correspond à un changement d'état réel détecté entre deux calculs du moteur (ex. une recommandation qui vient d'apparaître, pas une recommandation déjà notifiée hier qui persiste).
- **Priorité** : reprend directement les paliers déjà établis par `dominantSignal.ts` (`critical_alert` > `opportunity` > `warning_alert` > `recommendation` > `stat`), étendus en une échelle de sévérité de notification cohérente avec `AlertSeverity` déjà défini (`info`/`warning`/`critical`).
- **Urgence** : dérivée de la confiance (§7) et de la sévérité — une recommandation à haute confiance et sévérité `critical` mérite une remontée immédiate ; une recommandation à confiance moyenne et sévérité `info` attend le digest quotidien.
- **Regroupement** : plusieurs recommandations de même nature sur plusieurs annonces (ex. "5 annonces candidates à la republication") se regroupent en une seule notification — c'est déjà le principe des alertes globales existantes (`ruleDormantStock`, `ruleRepublishOpportunity`), à généraliser à toutes les familles de règles plutôt qu'à notifier annonce par annonce.
- **Silence intelligent** : une recommandation déjà notifiée et non traitée par l'utilisateur ne se renotifie pas en boucle à chaque cycle — elle attend soit un changement de contexte réel (la confiance a monté, un nouveau signal s'ajoute), soit une cadence de rappel espacée (ex. rappel hebdomadaire max sur une recommandation ignorée, jamais quotidien).

### 9.3 Cadences

| Cadence | Contenu | Condition de déclenchement |
|---|---|---|
| **Temps réel** | Sévérité `critical` uniquement (aujourd'hui, aucune règle n'en émet — palier réservé pour l'avenir, cohérent avec le commentaire déjà présent dans `dominantSignal.ts`) | Immédiat |
| **Quotidien** | Digest des nouvelles recommandations/alertes `warning` apparues dans les dernières 24h, regroupées par type | Une fois par jour, seulement s'il y a du nouveau (jamais un digest vide) |
| **Hebdomadaire** | Narrations de tendance (`narrative.ts` déjà existant — ventes de la semaine, marque/catégorie la plus performante) + rappel des recommandations `info` en attente depuis plus de 7 jours | Une fois par semaine |

**Dépendance explicite non résolue** : un vrai système d'envoi (email/Discord/Telegram) est la Phase 4 "Alertes" déjà identifiée dans ROADMAP.md, **en pause depuis le 2026-07-12** faute de décision sur le fournisseur (Resend/Postmark/SMTP pour email, webhook vs bot pour Discord, gestion du secret de bot Telegram). Ce chantier Decision Engine ne tranche pas ce choix — il produit le contenu et la logique de priorisation, l'envoi externe reste un chantier à part (voir §12).

---

## 10. Centre des actions — l'écran

### 10.1 Constat de départ

Le "Centre des Actions" existe (`src/pages/dashboard/ActionsPage.tsx`), mais a été fusionné en 2026-07-31 avec l'onglet Opportunités sous une page "Niches", et son onglet Historique est aujourd'hui une **liste plate chronologique** filtrable (période/type/résultat/compte), sans aucune notion d'urgent/peut attendre/recommandé/terminé.

### 10.2 Structure cible

Un vrai centre de pilotage distingue clairement quatre zones, dans cet ordre de priorité visuelle :

1. **Urgent** — recommandations de sévérité `critical`/`warning` à confiance haute, jamais plus de quelques éléments à la fois (éviter l'écran surchargé — cohérent avec `MAX_PRIORITIES`, constante déjà définie dans `constants.ts` mais aujourd'hui non consommée nulle part, à réactiver ici plutôt qu'à réinventer un nouveau seuil).
2. **Recommandé** — le reste des recommandations actives, groupées par type (prix, republication, vérification compte), avec confiance affichée.
3. **En attente d'action** — les `PreparedAction` déjà en `pending_confirmation` dans `action_log` (reprend directement l'état existant, aucune nouvelle donnée).
4. **Terminé** — l'historique déjà existant (`NichesHistoryTab`), inchangé dans son fonctionnement (filtres période/type/résultat déjà là, Realtime déjà branché).

### 10.3 Ce qui est repris tel quel

`ActionStatusBadge`, `ActionStepTimeline`, `useActionHistory`/`useActionLogEntries` (Realtime déjà fonctionnel), la pagination `range()` déjà en place. Le Decision Engine ajoute une **couche de regroupement/priorisation au-dessus**, il ne réécrit pas la mécanique d'historique déjà validée en prod.

### 10.4 Ce qui est nouveau

Le calcul des sections "Urgent"/"Recommandé" à partir du pipeline (§4), une vue "par annonce" qui superpose recommandation + dernière action tentée sur cette annonce (aujourd'hui, `action_log` et les recommandations d'insights ne sont jamais croisés dans la même vue).

---

## 11. Republication — réalité de l'architecture actuelle

**Cette section est la plus importante pour ne pas concevoir un moteur qui promet des exécutions impossibles aujourd'hui.**

### 11.1 Ce qui est codé

L'Action Engine générique (`src/lib/actions/`) est solide, testé, et déjà le bon modèle : cycle `prepare` (checks → preview → insertion `action_log` en `pending_confirmation`) → `confirm` (exécution via `execute()` natif ou délégation extension, mise à jour terminale de la ligne) → `cancel`. Quatre `ActionDefinition` existent réellement : `publishListing`, `editListing`, `republishListing`, `scanMarket`. Huit valeurs de `ActionKind` (`edit_price`, `edit_photos`, `pause_listing`, `reactivate_listing`, `delete_listing`, `reply_message`, `accept_offer`, `counter_offer`) sont déclarées dans le type mais **n'ont aucune implémentation** — ni `ActionDefinition` côté app, ni handler côté extension (`extension/src/background/runAction.ts::HANDLERS` ne contient que 3 entrées : `publish_listing`, `edit_listing`, `republish_listing`).

### 11.2 Ce qui fonctionne

`edit_listing` est **Beta Ready** pour titre/description/prix — validé en conditions réelles (7 scénarios, seuls et combinés) sur une annonce sandbox réelle. Architecture : onglet Vinted ouvert au premier plan, l'utilisateur clique lui-même sur "Valider", le pipeline détecte la navigation réelle puis vérifie la valeur effectivement changée. C'est un flux **semi-assisté**, pas une automatisation silencieuse — et c'est un choix d'architecture délibéré, pas une limitation temporaire à corriger.

### 11.3 Ce qui est bloqué

- **`publish_listing` et `republish_listing` échouent à 100% aujourd'hui**, bloqués dès le check `checkPublishTemporarilyDisabled` (retourne systématiquement `ok:false`), parce que `resolveCategory()` (`extension/src/content/formFill.ts`) lève désormais inconditionnellement une erreur — le sélecteur de catégorie Vinted exige une interaction `isTrusted:true` qu'aucune séquence d'événements synthétiques ne peut simuler (confirmé par instrumentation dédiée : un clic réel ouvre le panneau en ~75ms, tout clic synthétique échoue systématiquement).
- **`republish_listing` n'est pas un flux distinct** — il réutilise littéralement `handlePublishListing` pour créer une **nouvelle** annonce Vinted (jamais de suppression/recréation de l'ancienne). Il hérite donc du même blocage que `publish_listing`.
- **`pause_listing`, `reactivate_listing`, `delete_listing`, `edit_photos`, `edit_price`(en tant qu'action séparée — le prix passe en fait par `edit_listing`), `reply_message`, `accept_offer`, `counter_offer` n'existent tout simplement pas.**

### 11.4 Ce qui dépend de DataDome (au sens strict)

Une seule preuve directe existe : la requête `PUT https://www.vinted.fr/api/v2/item_upload/items/{id}` (sauvegarde d'édition), rejouée après un clic synthétique, ne se déclenche jamais côté Vinted ; capturée une seule fois après un vrai clic utilisateur, elle porte l'en-tête `x-datadome: protected`. C'est la **seule** route explicitement confirmée protégée par un anti-bot avec preuve technique directe.

Le blocage du sélecteur de catégorie (`isTrusted` requis) est une contrainte de même **classe** (impossible à simuler depuis du JavaScript, quel que soit le navigateur) mais n'a **pas** la même preuve directe (pas d'en-tête `x-datadome` observé sur cette route précise — l'échec vient du fait que le panneau ne s'ouvre jamais, pas d'une réponse serveur explicite). Les deux contraintes ont le même effet pratique (clic manuel requis) mais ne doivent pas être présentées comme identiques dans la documentation utilisateur — l'une est confirmée par preuve serveur, l'autre par preuve comportementale navigateur.

### 11.5 Ce qui est possible

- Étendre l'architecture "clic manuel" déjà validée pour `edit_listing` (titre/description/prix) au flux de publication (`publish_listing`/`republish_listing`) : ouvrir l'onglet au premier plan, laisser l'utilisateur sélectionner lui-même la catégorie et cliquer sur "Ajouter", puis vérifier le résultat — exactement le même patron que l'édition, jamais tenté aujourd'hui pour la publication.
- Revalider marque/catégorie/taille/couleur/matière sur un **vrai flux de publication** plutôt que sur l'annonce sandbox d'édition (décision déjà prise le 2026-07-26, pas encore exécutée).
- Construire `pause_listing`/`reactivate_listing`/`delete_listing` si Vinted expose une action correspondante accessible sans passer par un formulaire complexe (à vérifier au moment de l'implémentation — **ne pas supposer que ces actions existent côté Vinted sous une forme automatisable avant de l'avoir observé en conditions réelles**, exactement comme cela a été fait pour l'édition).

### 11.6 Ce qui n'est pas possible (à ne jamais reproposer sans preuve nouvelle)

- Rejouer silencieusement la requête PUT d'édition sans clic réel — décision explicite de l'utilisateur de ne pas tenter de contourner cette protection.
- Simuler un clic `isTrusted:true` sur le sélecteur de catégorie — contrainte du navigateur, pas de Vinted, non contournable en JavaScript.

### 11.7 Conséquence directe pour le Decision Engine

**Toute recommandation qui implique une écriture Vinted aujourd'hui doit être honnête sur le fait qu'elle nécessite un clic manuel de l'utilisateur, sauf pour `edit_listing` (titre/description/prix) qui est le seul flux réellement semi-assisté et validé.** "Republier", "Modifier photos/catégorie/marque/taille", "Mettre en pause", "Supprimer" sont des recommandations **informatives** aujourd'hui, pas des actions à un clic — le catalogue §5 l'indique explicitement pour chacune, et l'interface (Centre des Actions, §10) doit refléter cette distinction sans l'atténuer.

---

## 12. Roadmap

Chaque lot ci-dessous est conçu pour être autonome, testable, avoir une vraie valeur utilisateur isolément, et rester compatible avec l'état actuel de la bêta (aucune régression sur ce qui fonctionne déjà). L'ordre proposé suit la dépendance logique du pipeline (§4) : on ne peut pas prioriser sans confiance, on ne peut pas notifier sans priorité.

### Lot 1 — Unification des signaux et features

**Contenu** : extraire `EngineContext`/signaux existants de `src/lib/insights/` dans une forme réutilisable par le futur pipeline (§2-§3), sans changer le comportement actuel du Dashboard/Copilote — un refactor pur, zéro régression visible. Ajouter les signaux nouveaux mais triviaux du §2 (`market_opportunity_freshness`, `photo_count`, `days_since_last_action_attempt`, `credits_remaining`).
**Valeur utilisateur isolée** : aucune visible directement — c'est la fondation. À ne livrer qu'accompagné d'un lot suivant qui l'exploite, ou en même passe.
**Dépendances** : aucune — s'appuie uniquement sur du code déjà en prod.
**Risques** : faible, refactor de code déjà testé (couverture Vitest existante à conserver intacte).
**Migrations** : aucune.
**Tests** : non-régression complète de la suite Vitest existante (`src/lib/insights/__tests__/`) + nouveaux tests unitaires pour les 4 signaux ajoutés.

### Lot 2 — Confiance unifiée et Features composites

**Contenu** : implémenter §3 (features) et §7 (formule de confiance) comme calculs purs, branchés sur le Lot 1. Exposer ces valeurs quelque part de vérifiable (ex. dans le detail panel d'une recommandation existante) avant de les utiliser pour prioriser quoi que ce soit.
**Valeur utilisateur isolée** : transparence accrue sur "pourquoi cette recommandation" si affichée, même partiellement.
**Dépendances** : Lot 1.
**Risques** : faible — calculs additifs purs, testables unitairement, aucune écriture.
**Migrations** : aucune.
**Tests** : cas limites de confiance (échantillon insuffisant, sync périmée, signaux contradictoires) — chaque cas du §7.4 doit avoir un test dédié.

### Lot 3 — Centre des Actions : regroupement Urgent/Recommandé/En attente/Terminé

**Contenu** : §10 — ajouter les sections de regroupement au-dessus de l'historique existant (`NichesHistoryTab`), sans toucher à la mécanique d'historique elle-même. Réactive `MAX_PRIORITIES` (déjà défini, jamais utilisé).
**Valeur utilisateur isolée** : forte et immédiatement visible — c'est le premier "vrai centre de pilotage" concret du chantier.
**Dépendances** : Lot 2 (pour trier par confiance/sévérité).
**Risques** : moyen — c'est une UI consommée quotidiennement, régression visible immédiatement si mal testée. Tester en particulier le cas "zéro recommandation" (ne jamais afficher une section vide sans raison, cohérent avec les `EmptyState` déjà en place ailleurs).
**Migrations** : aucune (lecture seule sur des données déjà en base).
**Tests** : rendu de chaque combinaison de sections vides/pleines, tri par confiance, non-régression sur l'historique existant.

### Lot 4 — Notifications intelligentes (digest quotidien/hebdomadaire, silence intelligent)

**Contenu** : §9 — logique de regroupement/déduplication/cadence, sur le canal `notifications` déjà existant (pas de nouvelle table pour le digest lui-même, réutilisation de `notification_reads`). N'inclut **pas** l'envoi externe (email/Discord/Telegram, Phase 4 en pause).
**Valeur utilisateur isolée** : moyenne seule — visible via le `NotificationRecapModal` déjà existant, enrichi de vraies priorités plutôt que d'une liste plate.
**Dépendances** : Lot 2 (confiance/sévérité) et Lot 3 (mêmes définitions de priorité, pour ne jamais diverger entre les deux écrans).
**Risques** : moyen — risque de sur-notifier si le "silence intelligent" est mal calibré ; à tester avec des scénarios de non-régression explicites (une recommandation ignorée ne doit jamais réapparaître plus d'une fois par semaine).
**Migrations** : possible ajout d'une colonne de déduplication (ex. `dedup_key` sur `notifications`) — à confirmer au moment de l'implémentation, pas supposé nécessaire ici sans avoir conçu le détail.
**Tests** : scénarios de cadence (quotidien vide, hebdomadaire avec rappels, pas de doublon sur 48h).

### Lot 5 — Dziko IA connecté au pipeline (à la demande uniquement)

**Contenu** : §8 — brancher `dziko-assistant` pour recevoir une `Recommendation` en contexte quand l'utilisateur pose une question depuis le Centre des Actions ("pourquoi cette recommandation ?"). Reste derrière le feature flag existant (`VITE_DZIKO_AI_ENABLED`), toujours désactivé par défaut tant que non testé en conditions réelles. **Aucun appel automatique en arrière-plan** (§8.5).
**Valeur utilisateur isolée** : forte si activé, mais reste optionnelle par construction (feature flag).
**Dépendances** : Lot 2 (les `Recommendation` doivent porter confiance/reason déjà calculés).
**Risques** : élevé sur la capacité (quota Gemini gratuit, §8.5) — **avant ce lot, revérifier l'état réel de facturation Gemini** (non confirmé depuis 2026-07-11). Risque de hors-sujet/hallucination — mitigé par 8.6, mais à valider par test manuel réel avant activation en prod, pas juste par relecture de prompt.
**Migrations** : aucune.
**Tests** : injection de prompts adverses ("invente-moi un chiffre"), vérification qu'aucune réponse ne cite un chiffre absent du contexte transmis.

### Lot 6 — Extension du flux "clic manuel" à la publication (débloque `publish_listing`/`republish_listing`)

**Contenu** : §11.5 — appliquer le patron déjà validé pour `edit_listing` (onglet premier plan, attente d'un clic réel, vérification post-clic) à `resolveCategory()`/`publish_listing`. Retire `checkPublishTemporarilyDisabled` une fois (et seulement une fois) ce nouveau flux validé en conditions réelles.
**Valeur utilisateur isolée** : très forte — débloque "Republier" en action réellement exécutable, pas seulement informative (change le statut de plusieurs lignes du catalogue §5).
**Dépendances** : aucune sur les lots précédents (peut être fait en parallèle) — c'est un chantier extension pure, indépendant du reste du Decision Engine, mais sa livraison change directement quelles lignes du §5 deviennent "Exécutable : Oui".
**Risques** : élevé — touche à une zone déjà documentée comme fragile (isTrusted, DataDome), nécessite le même protocole de test live en deux temps déjà utilisé pour la validation d'`edit_listing` (vérifier jusqu'au bouton actif sans cliquer, puis accord explicite séparé avant le premier clic réel).
**Migrations** : aucune migration base de données ; potentiel changement de permissions extension à vérifier (host_permissions déjà larges pour edit_listing, à confirmer suffisantes pour publish).
**Tests** : reprise du protocole de validation déjà utilisé pour `edit_listing` (scénarios seuls puis combinés), sur compte de test dédié, jamais sur un compte de production sans accord explicite.

### Lot 7 — Recommandations sell-side étendues (PricePressure croisé marché, vitesse de tendance continue)

**Contenu** : §2-§3 — étendre `views_velocity` en signal continu (pas seulement le seuil binaire de baisse déjà en place dans `trends.ts`), brancher `PricePressure` sur `market_price_observations` côté sell-side (aujourd'hui utilisé uniquement à la génération, jamais réévalué après publication).
**Valeur utilisateur isolée** : moyenne-forte — recommandations de prix plus précises pour les catégories couvertes par la Watchlist.
**Dépendances** : Lot 1.
**Risques** : faible-moyen — attention à ne pas sur-promettre sur les catégories non couvertes (couverture partielle déjà documentée §1.2, l'UI doit continuer à afficher honnêtement "ai_estimate"/absence de repère quand c'est le cas).
**Migrations** : aucune.
**Tests** : cas de couverture nulle (aucun comparable) doit produire `PricePressure` absente, jamais une valeur par défaut.

### Ordre recommandé et compatibilité bêta

Lots 1 → 2 → 3 en séquence stricte (chacun dépend du précédent). Lot 6 peut démarrer en parallèle dès aujourd'hui (indépendant). Lots 4, 5, 7 peuvent suivre dans un ordre flexible une fois le Lot 2 livré, selon priorité produit à trancher par l'utilisateur au moment venu — ce document ne tranche pas cet ordre à sa place. Aucun lot ne requiert de couper l'accès à une fonctionnalité déjà en bêta ; chacun est un ajout ou un refactor interne, jamais un retrait.

---

## Annexe — Ce qui reste explicitement non tranché par ce document

- Le seuil exact déclenchant "Supprimer" vs "Archiver" (§5.1) — nécessite un arbitrage produit, pas une donnée technique.
- Le mécanisme Vinted réel pour "archiver"/"masquer" une annonce sans la supprimer (§5.1) — à vérifier en conditions réelles avant toute promesse.
- Le fournisseur d'envoi de notifications externes (email/Discord/Telegram) — Phase 4 déjà en pause, hors périmètre de ce document.
- L'ordre de priorité entre Lots 4/5/7 (§12) — décision produit à prendre au moment venu.
- La reconfirmation de l'état de facturation Gemini (gratuit vs payant) — action opérationnelle préalable au Lot 5, pas une question d'architecture.
