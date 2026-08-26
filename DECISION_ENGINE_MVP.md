# Decision Engine — Revue critique et plan d'exécution MVP (bêta Albin)

**Statut : revue critique + spécification, aucune ligne de code écrite, aucune migration, aucun commit.**
**Ce document challenge [DECISION_ENGINE.md](DECISION_ENGINE.md) (l'architecture cible complète) et en extrait un premier lot réellement exécutable et raisonnable pour une bêta avec un seul testeur réel (Albin). Il ne remplace pas le document d'architecture, il le met sous tension.**

---

## 1. Résumé décisionnel

**Vision du moteur.** ResellOS ne doit plus seulement montrer des chiffres, il doit dire quoi faire — mais uniquement via des règles déterministes et lisibles. L'IA (Dziko) explique, elle ne décide jamais. Ce principe n'est pas négociable et reste inchangé après cette revue.

**Données réellement fiables aujourd'hui** (par ordre de fiabilité décroissante) :
1. `purchase_price`/`sold_price`/`fees` quand renseignés — jamais fabriqués si absents, déjà bien gardé dans le code existant.
2. `vinted_status`, `views`, `favourites` **au moment de la lecture**, mais leur âge est incertain — la synchro n'est ni un cron ni un push, elle dépend de l'activité de l'utilisateur sur Vinted. **Faiblesse identifiée dans cette revue** : le code existant (`src/lib/insights/recommendations.ts`, `alerts.ts`) utilise déjà `views`/`favourites` sans jamais vérifier la fraîcheur de `synced_at` — la dégradation de confiance par fraîcheur, présentée dans le document d'architecture comme une extension naturelle de l'existant, n'existe en réalité **nulle part dans le code aujourd'hui**. C'est un vrai trou à combler dans le Lot 1, pas un raffinement optionnel.
3. `listing_metric_snapshots` (tendance) — fiable mais rare : exige ≥2 instantanés espacés d'au moins 3 jours, ce qu'une bêta de quelques semaines avec un seul testeur ne garantit absolument pas.
4. `market_price_observations` — fiable mais quasi inexploitable en pratique pour la bêta : ne couvre que les paires marque/catégorie suivies en Watchlist (7 recherches plateforme + ajouts éventuels). Pour la grande majorité des annonces d'Albin, ce repère sera `null`.

**Recommandations réellement possibles.** Une seule action d'écriture Vinted fonctionne aujourd'hui de bout en bout : `edit_listing` (titre/description/prix), via un clic manuel de l'utilisateur (contrainte DataDome confirmée). Tout le reste — publier, republier, mettre en pause, supprimer, changer catégorie/marque/taille — n'a **aucun** chemin d'exécution réel. Toute recommandation portant sur ces actions doit rester **informative**, jamais présentée comme un bouton qui "fait le travail".

**Limites actuelles.** Synchro irrégulière (pas de fraîcheur garantie), couverture marché quasi nulle hors Watchlist, quota Gemini gratuit (250 requêtes/jour, dernière vérification 2026-07-11 **non reconfirmée**), Dziko IA jamais testée en production, 8 des 12 types d'action déclarés dans l'Action Engine n'ont aucun handler.

**Rôle exact de Dziko IA.** Reformulation en langage naturel d'une recommandation déjà calculée par le pipeline déterministe, et réponse à des questions ouvertes strictement bornées aux données transmises. Jamais un maillon du calcul. Jamais appelée automatiquement en boucle sur chaque recommandation (le quota Gemini l'interdit structurellement).

**Dépendances critiques.** (1) La fraîcheur de synchro conditionne toute recommandation d'engagement — sans mécanisme de dégradation de confiance par fraîcheur, le moteur peut mentir par omission sur des données vieilles de plusieurs jours. (2) L'état réel de facturation Gemini doit être reconfirmé avant toute activation de Dziko, même à la demande. (3) Le déblocage du sélecteur de catégorie Vinted (`isTrusted`) conditionne toute republication réellement exécutable — hors périmètre de ce MVP.

---

## 2. Challenge de l'architecture

Cette section cherche délibérément les faiblesses de [DECISION_ENGINE.md](DECISION_ENGINE.md), partie par partie — sans les défendre.

### §1-3 (Audit de données, Signaux, Features)

- **Existe déjà** : l'audit de données lui-même est correct et vérifié (relu, pas deviné). Le contexte agrégé (`EngineContext`/`GroupStats`, médianes, moyennes par groupe) existe déjà et fonctionne.
- **Ce qui doit réellement être construit** : rien de nouveau structurellement — seulement de la dégradation de confiance par fraîcheur (absente aujourd'hui, voir §1 ci-dessus).
- **Trop ambitieux pour la bêta** : la couche `Features` formelle (`ListingHealth`/`VisibilityScore`/`PricePressure`/`DemandStrength`/`ROIQuality`/`MarketHealth`/`AccountHealth`/`RepublishEligibility`) est une abstraction généreuse qui n'apporte **aucune valeur visible** tant qu'elle n'est pas consommée par une vraie recommandation nouvelle. Construire cette couche avant d'avoir un seul utilisateur qui voit une seule recommandation serait exactement l'erreur de sur-ingénierie que ce projet évite habituellement (cf. la discipline "pas d'abstraction prématurée" déjà appliquée ailleurs dans le code).
- **Repose sur une donnée insuffisante** : `PricePressure` (repère marché) sera `null` pour la quasi-totalité des annonces d'Albin — construire une feature entière autour d'un signal qui ne s'activera presque jamais pendant la bêta n'est pas un bon investissement initial.
- **Risque de mauvaises recommandations** : `views_velocity` (vitesse de tendance) réclame un historique que la bêta n'aura probablement pas le temps d'accumuler (≥2 instantanés espacés de 3 jours). Si le moteur s'appuie dessus trop tôt, il produira du silence presque tout le temps sur cet axe — ce n'est pas dangereux en soi (le silence est le comportement sûr), mais ça rend la feature inutile pour la durée de la bêta. Autant ne pas la construire maintenant.
- **Peut être simplifié** : sauter entièrement la couche Signals/Features formelle pour le MVP. Aller directement de la donnée brute à la règle, exactement comme le fait déjà `src/lib/insights/recommendations.ts` aujourd'hui — juste enrichi d'une vérification de fraîcheur et d'un score de confiance à deux ou trois niveaux, pas une formule multi-facteurs.

### §4 (Pipeline)

- **Existe déjà** : la couche Rules/Recommendation existe déjà en pratique (4 règles dans `recommendations.ts`).
- **Doit réellement être construit** : la couche Confidence n'existe **pas du tout** aujourd'hui — aucune recommandation actuelle ne porte de score de confiance, seulement un texte de justification qualitatif. C'est la vraie nouveauté de ce chantier, pas un raffinement.
- **Trop ambitieux** : le pipeline en 6 couches nommées (Signals→Features→Rules→Confidence→Recommendation→Dziko) est une bonne cible à moyen terme mais une mauvaise unité de livraison — personne ne peut valider "le pipeline" en soi, seulement des recommandations concrètes qui en sortent. Le Lot 1 doit livrer des recommandations, pas un pipeline.

### §5 (Catalogue de recommandations)

- **Existe déjà** : republish/lower_price/raise_price/review_price sont déjà codées et testées.
- **Trop ambitieux pour la bêta** : le document d'architecture le disait déjà lui-même, noir sur blanc, pour la moitié du catalogue ("Non calculable avec les données actuelles", "Non — aucun handler") — changer catégorie/marque/taille, archiver, acheter/arrêter d'acheter davantage. Cette revue confirme : **ces lignes doivent sortir du périmètre MVP sans hésitation**, elles n'auraient jamais dû sembler "presque prêtes" dans un document de référence.
- **Risque de mauvaises recommandations** : "Supprimer" est la plus dangereuse du catalogue — un signal purement quantitatif (âge + zéro engagement) qui peut se tromper et coûter un vrai article à l'utilisateur si le vrai problème était ailleurs (mauvaise photo, mauvais moment). À exclure du MVP, à ne réintroduire qu'après un vrai historique d'usage.
- **Peut être simplifié** : `raise_price` (augmenter le prix), bien que déjà codée et fonctionnelle, n'est **pas** dans la liste des 4-5 recommandations demandées par l'utilisateur pour cette bêta. Décision assumée dans ce document : la règle reste en code (aucune régression à introduire), mais elle est **filtrée hors de la surface affichée** pendant la bêta Albin — un simple filtre d'allowlist, pas une suppression.

### §7 (Confiance)

- **Trop ambitieux** : le système multi-facteurs proposé (fraîcheur + taille d'échantillon + densité de tendance + accord entre signaux + distance au seuil + historique d'échec) est correct comme cible mais bien trop lourd pour un MVP — six facteurs à calibrer sans aucune donnée réelle pour les régler correctement. **Risque concret** : des seuils mal calibrés produiraient une fausse précision (une confiance à 73 qui n'a pas plus de sens qu'une confiance à 68), pire qu'une confiance simple et honnête à 2-3 paliers.
- **Simplification retenue pour le MVP** : confiance à deux paliers (haute/moyenne) + un état explicite "insuffisant" qui empêche toute recommandation plutôt qu'un chiffre. Voir §4.

### §8 (Dziko IA)

- Déjà bien cadrée dans le document d'architecture (jamais d'appel automatique). Cette revue va plus loin : même l'appel à la demande n'a **aucune valeur ajoutée démontrée** tant que le texte déterministe n'a pas été testé seul. Recommandation de cette revue : **ne pas connecter Dziko du tout au Lot 1**, uniquement calibrer le texte déterministe, réévaluer après le retour d'Albin.

### §9-10 (Notifications, Centre des Actions)

- **Trop ambitieux pour la bêta, sans exception.** Un système de priorité/regroupement/silence intelligent a besoin de volume réel pour être calibré — avec un seul testeur et quelques dizaines d'annonces, une liste simple annotée (badge + confiance) est non seulement suffisante mais **plus sûre** : moins de risque qu'une logique de "silence intelligent" mal réglée cache la seule chose qu'Albin avait besoin de voir.

### §11 (Republication)

- Déjà traitée avec l'honnêteté requise dans le document d'architecture — cette revue confirme et durcit : **aucune tentative de contournement, aucune promesse d'exécution automatique dans le MVP.** Détail §5 de ce document.

### §12 (Roadmap)

- **Faiblesse la plus importante de cette revue** : le "Lot 1" du document d'architecture original (extraction de la couche Signals/Features, "aucune valeur visible" — cité tel quel dans le document lui-même) est un **mauvais premier lot**. Un premier lot doit produire de la valeur visible en bêta, pas un refactor invisible. Ce document redéfinit entièrement le Lot 1 en §7.

---

## 3. MVP bêta pour Albin — 5 recommandations

Toutes construites sur des règles déjà partiellement en place (`src/lib/insights/`), sans nouvelle table, sans nouvelle migration. Ordre de priorité d'évaluation (la première règle qui matche l'emporte, jamais d'empilement — principe déjà en place dans `recommendations.ts`) : `ouvrir_vinted_modifier` (structurel, indépendant de la fraîcheur) → `baisser_prix` → `revoir_annonce` → `considerer_republication` → `attendre` (repli par défaut).

### 3.1 Attendre

- **Données obligatoires** : `vinted_status = 'online'`, synchro < 48h.
- **Règle exacte** : c'est l'état par défaut — aucune des quatre autres règles ne matche. Ce n'est pas une règle positive, c'est l'absence de signal fort.
- **Cas où aucune recommandation ne doit être produite** : si la synchro est périmée (>48h), ne pas afficher "Attendre" avec assurance — afficher l'état "pas assez de données récentes" (§4) à la place, jamais un faux calme.
- **Niveau de confiance minimal** : N/A — ce n'est pas une recommandation active, pas de score de confiance à porter.
- **Texte utilisateur** : *"Cette annonce n'a besoin de rien pour l'instant."*
- **Action proposée** : aucune.
- **Ce que le moteur ne sait pas** : si la qualité intrinsèque de l'annonce (photos, titre) est bonne — seulement que les signaux quantitatifs disponibles ne déclenchent aucune alerte.

### 3.2 Baisser le prix

- **Données obligatoires** : `listing.created_at`, `listing.views`, `listing.favourites` (non-null), médiane de vues/favoris du compte calculée sur **au moins 3 annonces actives** (échantillon minimal), synchro < 48h.
- **Règle exacte** : reprend `ruleLowerPriceStale` existant — âge ≥ `REPUBLISH_AFTER_DAYS` (30j) ET `views ≤ 0.5 × médiane` ET `favourites ≤ 0.5 × médiane`.
- **Cas où aucune recommandation ne doit être produite** : synchro > 48h ; moins de 3 annonces actives dans le compte (médiane non fiable) ; `views`/`favourites` null (annonce jamais synchronisée avec engagement connu).
- **Niveau de confiance minimal** : "haute" si synchro < 24h ET ratio ≤ 0.5 confirmé sur les deux signaux ; "moyenne" si synchro entre 24h et 48h ; en dessous, pas de recommandation du tout (voir §4).
- **Texte utilisateur** : *"Peu de vues et de favoris après {âge} jours en ligne ({views} vues, {favourites} favoris, pour une moyenne de {médiane} sur ton compte) — le prix semble au-dessus du marché."*
- **Action proposée** : "Ouvrir Vinted pour modifier le prix" → déclenche `edit_listing` (Beta Ready, clic manuel requis), champ prix pré-ciblé.
- **Ce que le moteur ne sait pas** : le vrai prix de marché pour cette catégorie précise (sauf couverture Watchlist, rare) — c'est une comparaison relative au reste du stock de l'utilisateur, jamais un vrai comparatif de marché externe.

### 3.3 Revoir l'annonce

- **Données obligatoires** : mêmes que 3.2 (`views`, `favourites`, médiane sur ≥3 annonces, synchro < 48h).
- **Règle exacte** : reprend `ruleReviewPriceHighViewsLowFavourites` existant — `views ≥ 1.5 × médiane` ET `favourites ≤ 1`.
- **Cas où aucune recommandation ne doit être produite** : synchro > 48h ; échantillon < 3 ; conditions non réunies simultanément (les deux, jamais une seule).
- **Niveau de confiance minimal** : "moyenne" uniquement — jamais "haute", parce que le signal est volontairement non directionnel (le moteur ne sait pas *quoi* est en cause).
- **Texte utilisateur** : *"Beaucoup de vues ({views}) mais peu de favoris ({favourites}) — quelque chose freine peut-être la conversion (prix, photos, description). Le moteur ne peut pas identifier la cause précise."*
- **Action proposée** : "Ouvrir Vinted pour modifier" (édition libre, aucun champ pré-ciblé puisque la cause n'est pas identifiée).
- **Ce que le moteur ne sait pas** : la cause exacte — c'est explicitement dit dans le texte utilisateur, jamais masqué derrière une fausse certitude.

### 3.4 Ouvrir Vinted pour modifier (vérification structurelle)

Distincte des deux précédentes : ne dépend d'**aucun** signal d'engagement, donc peut s'appliquer même à une annonce toute neuve sans historique.

- **Données obligatoires** : `image_urls`, `category`, `condition`, `vinted_sync_status`.
- **Règle exacte** : matche si `image_urls.length === 0` OU (`category` null OU `condition` null, sur une annonce déjà en ligne — cas d'une synchro Vinted incomplète) OU `vinted_sync_status === 'sync_failed'`.
- **Cas où aucune recommandation ne doit être produite** : annonce complète (photo présente, catégorie et état renseignés) ET pas d'échec de synchro récent.
- **Niveau de confiance minimal** : "haute" toujours — c'est un fait vérifiable (un champ est vide ou ne l'est pas), pas une inférence statistique.
- **Texte utilisateur** : variantes selon la cause — *"Cette annonce n'a aucune photo sur Vinted."* / *"Une modification précédente a échoué — vérifie l'annonce sur Vinted."* / *"Catégorie ou état manquant sur cette annonce."*
- **Action proposée** : "Ouvrir Vinted" — lien direct vers l'annonce, **pas** le flux `edit_listing` (les photos ne sont pas éditables via ce flux aujourd'hui) — l'utilisateur agit lui-même.
- **Ce que le moteur ne sait pas** : si le problème est déjà résolu côté Vinted mais pas encore resynchronisé côté ResellOS (délai de sync) — le texte doit inviter à *vérifier*, jamais affirmer catégoriquement.

### 3.5 Considérer une republication plus tard

- **Données obligatoires** : `needsRepublish()` (déjà existant, `listingStatus.ts`), `listing.created_at`, synchro < 48h.
- **Règle exacte** : reprend `ruleRepublishAging` + `needsRepublish()` — âge ≥ 30j ET `vinted_status` indique que l'annonce a besoin d'être republiée.
- **Cas où aucune recommandation ne doit être produite** : synchro > 48h ; annonce déjà vendue ou en brouillon ; une republication a déjà été tentée dans les dernières 24h (`action_log`, évite la boucle).
- **Niveau de confiance minimal** : "moyenne" — le signal d'âge est fiable, mais le mot "considérer" reste volontairement prudent puisque l'action n'est pas exécutable en un clic aujourd'hui.
- **Texte utilisateur** : *"Cette annonce est en ligne depuis {âge} jours sans mouvement. Une republication pourrait relancer sa visibilité — la republication automatique n'est pas encore disponible dans ResellOS, tu peux la refaire toi-même sur Vinted."*
- **Action proposée** : "Ouvrir Vinted" uniquement — **aucun bouton d'exécution**, honnêteté explicite que ce n'est pas un clic ResellOS (voir §5).
- **Ce que le moteur ne sait pas** : si republier améliorerait réellement les résultats — aucune donnée historique sur l'effet réel d'une republication passée, faute de volume.

---

## 4. Gestion du manque de données

Le moteur doit pouvoir dire explicitement, dans l'interface, *"Pas assez de données pour recommander une action fiable"* — un état à part entière, jamais une absence silencieuse.

### Seuils minimaux de données

| Seuil | Valeur | S'applique à |
|---|---|---|
| Fraîcheur de synchro | < 48h (idéal < 24h pour confiance haute) | Toute règle basée sur `views`/`favourites`/`vinted_status` (3.2, 3.3, 3.5) |
| Taille d'échantillon (médiane du compte) | ≥ 3 annonces actives | 3.2, 3.3 |
| Densité de tendance | ≥ 2 instantanés espacés ≥ 3 jours | **Hors périmètre MVP** — aucune règle du §3 n'en dépend, volontairement (voir §2) |
| Fraîcheur d'un échec de synchro | Pas de seuil temporel précis retenu pour le MVP — tout `sync_failed` déclenche 3.4 tant qu'il n'a pas été corrigé par une nouvelle tentative réussie | 3.4 |

### Signaux manquants — à toujours dire honnêtement

Aucune donnée de qualité de photo ou de titre/description ; aucun vrai comparatif marché en dehors de la Watchlist (quasi jamais actif pendant la bêta) ; aucune vitesse de vue fiable (densité de tendance insuffisante, écarté du MVP).

### Dégradation de confiance

- Synchro 0-24h → confiance nominale de la règle (haute pour 3.2/3.4, moyenne pour 3.3/3.5 par nature).
- Synchro 24-48h → confiance dégradée d'un cran (haute → moyenne).
- Synchro > 48h → **aucune** recommandation d'engagement (3.2, 3.3, 3.5), remplacée par l'état explicite "pas assez de données récentes". 3.4 (structurel) reste valable puisqu'il ne dépend pas de la fraîcheur d'engagement — seulement de `image_urls`/`category`/`condition`, des champs stables.
- Échantillon < 3 annonces actives → 3.2/3.3 ne produisent rien, jamais une comparaison sur un échantillon jugé trop faible en interne.

### Silence préférable à une mauvaise recommandation

- Échantillon insuffisant pour toute comparaison relative.
- Synchro périmée pour tout signal d'engagement.
- Signaux contradictoires non couverts par une règle explicite (ex. vues hautes ET favoris hauts ET recommandation "baisser le prix" ne matchant pas ses propres conditions) — le moteur ne force jamais une règle voisine à la place, il retombe sur "Attendre" ou "insuffisant".

---

## 5. Republication — ce que le MVP promet et ne promet pas

Quatre notions à ne jamais confondre dans l'interface :

1. **Recommander de republier** — ce que fait 3.5 : un texte informatif, avec confiance explicite, sans bouton d'exécution.
2. **Préparer une version retravaillée dans ResellOS** — **n'existe pas aujourd'hui, hors périmètre du MVP.** Idée future possible (pré-remplir un brouillon avec les champs à revoir avant republication manuelle) mais non conçue en détail ici — ne pas la promettre.
3. **Ouvrir Vinted** — seule action réellement proposée par 3.5 : un lien direct, l'utilisateur republie lui-même sur Vinted.
4. **Ce qui reste impossible aujourd'hui** — la republication en un clic depuis ResellOS (`publish_listing`/`republish_listing` via l'Action Engine), bloquée à 100% par `checkPublishTemporarilyDisabled` (sélecteur de catégorie Vinted, contrainte `isTrusted`, même famille que la protection DataDome confirmée sur `edit_listing`). **Aucun contournement n'est envisagé, aucune tentative de rejouer une requête protégée, aucun clic synthétique sur un élément protégé.** Le MVP ne doit jamais afficher un bouton qui laisse croire le contraire.

---

## 6. Dziko IA — quotas et garde-fous du MVP

- **Aucun appel automatique par annonce, sans exception.** Le pipeline déterministe (§3) doit fonctionner à 100% sans Gemini — déjà vrai aujourd'hui pour les textes de `recommendations.ts`/`alerts.ts`, à préserver strictement.
- **Décision de cette revue : Dziko IA reste entièrement hors du Lot 1.** Le feature flag (`VITE_DZIKO_AI_ENABLED`) reste à `false` pour la bêta Albin. Aucune connexion entre le pipeline de recommandations et `dziko-assistant` n'est construite dans ce lot.
- **Si une connexion à la demande est activée plus tard** (après retour d'Albin sur le texte déterministe seul), garde-fous proposés à ce moment-là :
  - Bouton explicite "Demander à Dziko" à côté d'une recommandation — jamais déclenché automatiquement à l'affichage.
  - Quota par utilisateur : proposition **10 à 20 appels/jour maximum**, arbitraire mais justifié — protège le budget global partagé (250 requêtes/jour tous utilisateurs confondus) d'un seul utilisateur qui épuiserait le quota pour tout le monde.
  - Coupe-circuit global : si le total quotidien d'appels Gemini (toutes fonctions confondues, `analyze-clothing` + `dziko-assistant`) dépasse un seuil de sécurité (proposition : 200/jour, sous la limite réelle de 250), désactiver Dziko IA jusqu'au lendemain plutôt que de risquer un `429` en pleine utilisation du Générateur IA — le Générateur reste prioritaire, c'est la fonctionnalité payante du produit.
  - **Précondition absolue avant toute activation, même limitée** : reconfirmer l'état réel de facturation Gemini (gratuit vs payant), non vérifié depuis 2026-07-11.

---

## 7. Lot 1 exécutable — spécification technique complète

### Périmètre

**Dans le périmètre** : les 5 recommandations du §3, le calcul de confiance à deux paliers + état "insuffisant", la vérification de fraîcheur/échantillon (§4), l'affichage dans l'interface existante (badges déjà présents sur `ListingsManagementSection.tsx`/`DashboardHome.tsx`).

**Hors périmètre, explicitement** : couche Signals/Features formelle, notifications intelligentes, regroupement du Centre des Actions, connexion Dziko, republication exécutable, `raise_price`/`changer catégorie`/`supprimer`/tout ce qui n'est pas dans la liste des 5.

### Architecture

Extension de `src/lib/insights/` existant — **pas** un nouveau module parallèle. Réutilise `EngineContext`/`buildContext()` tels quels (médianes déjà calculées). `recommendations.ts` est restructuré (pas dupliqué) pour produire exactement les 5 kinds ci-dessus, `raise_price` reste dans le code mais est filtré hors de la sortie exposée à l'UI pendant la bêta (allowlist simple, réversible en une ligne).

### Types (description, pas de code)

- Extension de `Recommendation` (`src/lib/insights/types.ts`) : ajout d'un champ `confidence: 'haute' | 'moyenne'` (l'absence de recommandation remplace le palier "insuffisant" — jamais un objet avec `confidence: 'insuffisante'`, cohérent avec le principe "silence plutôt que mauvaise recommandation").
- Nouveau type `RecommendationKind` restreint aux 5 valeurs MVP : `'attendre' | 'baisser_prix' | 'revoir_annonce' | 'ouvrir_vinted_modifier' | 'considerer_republication'` (remplace/étend l'union actuelle, `raise_price` retiré de l'union exposée — conservé en interne le temps de la transition ou simplement non exporté).
- Nouveau type `DataSufficiency` : `{ sufficient: boolean; reason: string | null }` — retour explicite des fonctions de garde, jamais un simple booléen muet.

### Règles (description)

Cinq fonctions pures, même signature que les règles existantes (`(listing, ctx) => Recommendation | null`), évaluées dans cet ordre par une nouvelle fonction orchestratrice qui remplace `computeRecommendations()` :
1. `ruleOuvrirVintedModifier` (nouvelle, structurelle, sans garde de fraîcheur).
2. `ruleBaisserPrix` (renommage/reprise de `ruleLowerPriceStale`, garde de fraîcheur + échantillon ajoutée).
3. `ruleRevoirAnnonce` (renommage/reprise de `ruleReviewPriceHighViewsLowFavourites`, même garde).
4. `ruleConsidererRepublication` (renommage/reprise de `ruleRepublishAging`, garde de fraîcheur ajoutée + vérification `action_log` récente).
5. Repli implicite `attendre` si aucune des quatre ne matche et que les gardes de fraîcheur/échantillon sont satisfaites — sinon état "insuffisant" explicite.

### Tables ou migrations

**Aucune.** Toutes les données nécessaires existent déjà (`listings`, `listing_metric_snapshots` non utilisé dans ce lot, `vinted_accounts`, `action_log` pour la vérification anti-boucle de 3.5). C'est une force de ce lot recadré par rapport au document d'architecture original.

### Fonctions et fichiers à créer/modifier

| Fichier | Action | Contenu |
|---|---|---|
| `src/lib/insights/dataSufficiency.ts` | **Créer** | `hasFreshSync(listing, thresholdHours)`, `hasEnoughSampleSize(ctx)` — retournent `DataSufficiency`, réutilisent les seuils déjà validés produit (24h/48h de `syncFreshnessClass`) plutôt que d'en inventer de nouveaux. |
| `src/lib/insights/recommendations.ts` | **Modifier** | Restructurer les règles selon la liste ci-dessus, brancher les gardes de fraîcheur/échantillon, ajouter `confidence` à chaque `Recommendation` produite, retirer `raise_price` de la sortie exposée. |
| `src/lib/insights/types.ts` | **Modifier** | Types décrits ci-dessus. |
| `src/lib/insights/engine.ts` | **Modifier** | Aucun changement de structure (toujours `computeInsights()` en point d'entrée unique), juste consommer les nouveaux types. |
| `src/pages/dashboard/watchlist/ListingsManagementSection.tsx` | **Modifier** | Afficher `confidence` sur le badge de recommandation déjà existant ; afficher l'état "Pas assez de données pour recommander une action fiable" quand aucune recommandation n'est produite ET que les gardes de fraîcheur/échantillon échouent (distinct de "Attendre"). |
| `src/pages/dashboard/DashboardHome.tsx` | **Modifier (mineur)** | Vérifier que le Copilote existant reste cohérent avec les nouveaux kinds (pas de régression sur `dominantSignal.ts`, qui consomme déjà `recommendations`). |

### Tests unitaires

- Un cas positif et un cas négatif (garde qui bloque) par règle des 5.
- Fraîcheur : sync à 23h (confiance haute), 47h (confiance moyenne), 49h (aucune recommandation d'engagement, structurel toujours actif).
- Échantillon : 2 annonces actives (bloqué), 3 (autorisé, cas limite explicitement testé).
- Anti-boucle 3.5 : republication tentée il y a 12h (bloqué), il y a 25h (autorisé).
- Non-régression complète de la suite Vitest existante (`src/lib/insights/__tests__/`).

### Tests avec données réelles

Protocole manuel, pas automatisé : sélectionner 2-3 annonces réelles synchronisées (compte de test jetable ou, avec l'accord explicite d'Albin, un extrait anonymisé de son propre compte) à différents âges/niveaux d'engagement, vérifier à la main que la recommandation produite correspond à l'attendu, puis simuler artificiellement une synchro périmée (ne pas resynchroniser pendant 3 jours) pour vérifier que la dégradation de confiance se comporte comme spécifié.

### Critères d'acceptation

- Seules les 5 recommandations (+ silence/insuffisant) apparaissent jamais un 6ᵉ type dans l'UI pendant la bêta.
- Aucune `Recommendation` sans champ `confidence` renseigné.
- Synchro > 48h → jamais de recommandation 3.2/3.3/3.5, uniquement 3.4 si applicable.
- L'état "pas assez de données" est visuellement distinct de "Attendre" (les deux ne doivent jamais se confondre à l'écran).
- Zéro régression sur la suite de tests existante.

### Risques

- Seuils de confiance/fraîcheur non calibrés par de l'usage réel — **à traiter explicitement comme provisoires**, à ajuster avec le retour d'Albin (voir §8), pas figés dès ce lot.
- `ouvrir_vinted_modifier` (3.4) peut se déclencher sur de vieilles annonces synchronisées avant que certains champs (catégorie/état) ne soient systématiquement remplis côté extension — risque de faux positifs d'origine historique, à vérifier sur un échantillon réel avant activation large.
- Retirer `raise_price` de la surface exposée sans le supprimer du code introduit une divergence temporaire entre "ce que le moteur peut calculer" et "ce qui est montré" — à documenter clairement en commentaire pour ne pas être redécouvert comme un bug plus tard.

### Estimation

Aucune base fiable pour un chiffrage en heures sur ce type de tâche dans ce projet — à ne pas inventer. Ordre de grandeur qualitatif : effort concentré presque entièrement dans `src/lib/insights/` (restructuration de règles déjà existantes, pas de création ex nihilo), zéro migration, surface UI limitée à des badges déjà en place — un lot **petit à moyen**, sensiblement plus léger que l'ensemble du document d'architecture original ne le laissait supposer pour un "Lot 1".

---

## 8. Décision finale

**À construire avant la bêta Albin** : le Lot 1 tel que spécifié en §7 — les 5 recommandations, la dégradation de confiance par fraîcheur, l'état explicite "pas assez de données". Rien de plus.

**Ce qui peut être testé pendant sa bêta** : la calibration réelle des seuils (fraîcheur 24h/48h, ratio 0.5/1.5 des règles de prix, échantillon minimal de 3) au contact de son usage réel ; la fréquence à laquelle il synchronise réellement son compte (conditionne si la densité de tendance deviendra un jour exploitable) ; la pertinence perçue de `ouvrir_vinted_modifier` (3.4) sur ses vraies annonces ; si le texte déterministe seul (sans Dziko) est déjà suffisamment clair.

**Ce qui doit attendre après ses retours** : la couche Signals/Features formelle, les notifications intelligentes (digest/priorité/silence), le regroupement Urgent/Recommandé/En attente/Terminé du Centre des Actions, toute connexion à Dziko IA (même à la demande), l'extension du flux clic-manuel à `publish_listing`/`republish_listing`, et l'ensemble des recommandations écartées du catalogue original (changer catégorie/marque/taille, archiver, supprimer, buy-side "acheter davantage").
