# Audit — Suivi du cycle de vie des annonces & Communication Vinted

**Statut : audit architecture uniquement. Aucun code, aucune migration, aucun commit, aucun push.**

Tout ce document est ancré dans le code réel du repo (migrations SQL, `extension/src/background/sync.ts`, `extension/src/content/wardrobeApi.ts`/`formFill.ts`, `src/lib/actions/checks.ts`, `src/pages/dashboard/CommunicationPage.tsx`). Quand une donnée ou une capacité n'existe pas, c'est dit explicitement — jamais supposé.

---

## PARTIE A — SUIVI DU CYCLE DE VIE DES ANNONCES

### A.1 — Quelles données existent déjà ?

Sur la table `listings` (source unique depuis la fusion du 2026-07-09) :

| Donnée | Colonne | Origine |
|---|---|---|
| Date de création (≈ date de publication si liée à Vinted dès le départ) | `created_at` | Insertion (Generateur ou synchro) |
| Dernière synchro | `synced_at` | Réécrite à chaque `recordListings`/`recordSingleItemImport` |
| Vues, favoris (compteurs cumulés, pas des séries) | `views`, `favourites` | Réécrits à chaque synchro |
| Prix courant | `price` | Réécrit à chaque synchro (sauf brouillon local en attente) |
| Statut réel Vinted | `vinted_status` | Réécrit à chaque synchro (`online`/`hidden`/`deleted`/`unknown`/…) |
| Statut du push sortant ResellOS→Vinted | `vinted_sync_status` | `null`/`sync_pending`/`sync_success`/`sync_failed` |
| Dernière édition manuelle (ResellOS) | `last_edited_at` | Écrit par `EditListingModal.tsx` |
| Photos, catégorie, état, couleur, matière, description | `image_urls`, `category`, `condition`, `color`, `material`, `description` | **Fixées à la création SEULEMENT** — voir A.3 |

Sur `action_log` (Phase 3, Action Engine) : chaque action déclenchée (`publish_listing`, `edit_listing`, `republish_listing`…) laisse une ligne avec `kind`, `status`, `payload`, `result_payload`, `started_at`, `completed_at`, `listing_id`. C'est déjà un vrai journal d'actions par annonce, exploitable tel quel.

Sur `action_log_entries` : sous-journal détaillé (`step`, `message`, `at`) rattaché à une `action_log` — déjà le mécanisme générique de timeline d'étapes, réutilisable.

**Ce qui n'existe nulle part** : aucune trace des recommandations elles-mêmes. Le Lot 1 du Decision Engine (`computeListingRecommendation`) est une fonction pure, recalculée en mémoire à chaque chargement de `useInsights()` — rien n'est jamais écrit en base. Impossible aujourd'hui de savoir "qu'est-ce qui a été recommandé la semaine dernière sur cette annonce".

### A.2 — Quelles données sont historisées ?

Une seule table : `listing_metric_snapshots` (créée le 2026-07-09, migration `20260709200000`). Append-only, jamais d'update/delete. Colonnes : `listing_id`, `views`, `favourites`, `price`, `vinted_status`, `captured_at`.

**Écrite uniquement par `recordListings()`** (synchro passive en masse, à chaque visite du profil Vinted), un instantané par annonce à chaque passage — y compris le tout premier (point de départ). **Non écrite par `recordSingleItemImport()`** (import/ré-import explicite d'un article précis) : un ré-import individuel ne crée pas de point d'historique. Gap réel, à corriger si l'historique doit être fiable.

C'est la seule donnée qui a une vraie forme de série temporelle exploitable aujourd'hui — mais **jamais lue** par le Lot 1 du Decision Engine (décision explicite de la phase précédente : historique jugé trop épars pour la bêta) ni affichée nulle part dans l'UI.

`action_log`/`action_log_entries` sont eux aussi un historique réel (append-only par construction), mais uniquement pour les *actions déclenchées*, pas pour l'évolution passive des métriques.

### A.3 — Quelles données sont seulement écrasées à chaque sync ?

Confirmé en lisant `sync.ts::recordListings()` ligne par ligne :

- **Toujours réécrits sans trace de l'ancienne valeur** : `price`, `vinted_status`, `favourites`, `views`, `synced_at`, `vinted_url` (sauf si `vinted_sync_status` indique un brouillon local en attente).
- **Fixés à la création, jamais retouchés par la synchro passive** : `title`, `brand`, `size`, `image_urls`, `purchase_price`. Pour une annonce créée via **synchro de masse** (pas un import explicite), le payload d'insertion n'écrit même **pas** `category`/`condition`/`color`/`material`/`description` du tout — ces champs restent vides sauf si l'article a été créé via le Générateur IA ou importé explicitement (`recordSingleItemImport`, qui lui rafraîchit tout à chaque clic délibéré).

Conséquence directe pour le suivi : **`views`/`favourites`/`price` sont donc doublement présents** — une valeur "vivante" sur `listings` (toujours la dernière) et un historique réel sur `listing_metric_snapshots` (toutes les valeurs passées). C'est la table à exploiter pour toute timeline, pas `listings`.

### A.4 — Quelles migrations seraient nécessaires ?

Aucune n'est indispensable pour un MVP minimal (voir A.8) — `listing_metric_snapshots` + `action_log` couvrent déjà l'essentiel de l'historique brut. Deux migrations seraient nécessaires pour aller au-delà du MVP :

1. **`listing_recommendation_log`** (nouvelle table) — seule vraie lacune structurelle. Sans elle, impossible de répondre à "une recommandation a-t-elle aidé ?" (voir A.6). Colonnes envisageables : `id`, `listing_id`, `kind` (`RecommendationKind`), `confidence`, `reason`, `shown_at`, `resolved_at` (nullable), `resolution` (`'suivie'` / `'ignoree'` / `'devenue_obsolete'`). Append-only comme `listing_metric_snapshots`.
2. **`recordSingleItemImport` écrit aussi dans `listing_metric_snapshots`** — pas une migration de schéma, un correctif de code (hors périmètre "aucun code" de cet audit, juste signalé).

Rien d'autre : pas besoin de dupliquer `created_at` en "date de publication" (déjà la même chose tant que l'annonce est liée à Vinted dès la création), pas besoin de dénormaliser un "âge" (calculable à la volée, déjà fait dans `dataSufficiency.ts`/`alerts.ts` via `daysSince`).

### A.5 — Comment créer une timeline par annonce ?

Techniquement possible **aujourd'hui, sans migration**, en assemblant trois sources déjà réelles :

1. `listing_metric_snapshots` filtré sur `listing_id`, trié par `captured_at` → série de points (vues/favoris/prix/statut dans le temps).
2. `action_log` (+ `action_log_entries`) filtré sur `listing_id` → actions déclenchées et leur résultat, déjà daté (`started_at`/`completed_at`).
3. Les recommandations **actuelles uniquement** (pas d'historique) via `insights.listingRecommendations.get(listingId)` — un seul point "maintenant", pas une timeline.

Une fonction `buildListingTimeline(listingId)` fusionnerait ces trois flux triés par date en une liste d'événements typés (`'snapshot' | 'action' | 'recommandation_actuelle'`) — pure recomposition, aucune nouvelle donnée nécessaire pour un premier jet. Elle deviendrait complète (recommandations passées incluses) seulement avec `listing_recommendation_log` (A.4).

### A.6 — Comment mesurer si une recommandation a aidé ?

**Impossible aujourd'hui**, faute de persistance (voir A.1/A.4). Avec `listing_recommendation_log`, une mesure simple et honnête (pas de ML) :

- **`baisser_prix`/`revoir_annonce`** : comparer `listing_metric_snapshots` avant/après `shown_at` — évolution des vues/favoris sur une fenêtre fixe (ex. 7 jours après l'action réellement effectuée, retrouvée via `action_log`). Jamais une causalité affirmée ("+12 vues" est un fait, "cette annonce fonctionne mieux" est déjà une interprétation à formuler prudemment).
- **`considerer_republication`** : la republication crée une nouvelle ligne `listings` (nouveau `vinted_item_id`) reliée à l'ancienne via `RepublishListingPayload.previousVintedItemId` (déjà tracé) — comparer les deux séries de snapshots.
- **`verifier_annonce`** : mesure binaire simple — le défaut signalé (photo/catégorie manquante) a-t-il disparu au prochain `listing_metric_snapshots`/`synced_at` ? Pas de mesure de "performance", juste de résolution.

Rien de plus sophistiqué n'est raisonnable pour la bêta — un seul utilisateur (Albin) ne donne aucune base statistique pour un vrai scoring d'efficacité.

### A.7 — Intégration dans l'existant

- **Mes annonces** (`ListingsManagementSection.tsx`) : déjà partiellement fait (Lot 1) — badge de recommandation courante + confiance. Ajout minimal viable : une puce "Dernière action : il y a Xj" par carte (lecture `action_log`, déjà fetché par ailleurs pour les cooldowns — juste à exposer côté UI).
- **Fiche annonce** : **n'existe pas aujourd'hui** (confirmé — aucune vue détail/historique par annonce nulle part dans `src/pages/dashboard/`). `EditListingModal.tsx` est un formulaire d'édition, pas une fiche de suivi. C'est le point d'ancrage naturel pour `buildListingTimeline()` (A.5) — un nouvel onglet "Historique" dans une modale/panneau dédié, pas nécessairement un nouveau composant lourd.
- **Dashboard** (`DashboardHome.tsx`) : rien de spécifique par annonce n'y a sa place (vue agrégée par design) — au mieux, un lien "annonces à réévaluer bientôt" une fois `listing_recommendation_log` existant (compte simple, pas une timeline).
- **Centre des actions** (`ActionsPage.tsx`) : déjà exactement le bon endroit pour l'historique d'actions par annonce — `useActionHistory`/`useActionLogEntries` existent déjà et sont filtrables par `listing_id`. Rien à construire, juste un lien direct depuis la fiche annonce vers ce filtre.

### A.8 — Proposition de MVP bêta

Volontairement minimal, sans nouvelle table obligatoire (sauf `listing_recommendation_log`, seule addition proposée) :

1. **Suivi visible** : sur chaque carte de "Mes annonces", trois lignes de texte factuelles — âge réel (`daysSince(created_at)`, déjà calculé ailleurs), dernière synchro (déjà affichée via `formatRelativeSync`), dernière action (`action_log` le plus récent pour ce `listing_id`).
2. **Dernière action** : réutilisation directe de `useActionHistory` filtré par annonce — zéro nouveau code de fetch, juste un nouveau point d'affichage.
3. **Prochaine recommandation** : déjà produit par le Lot 1 (`listingRecommendations`) — rien à ajouter, juste à relier visuellement à "dernière action" pour raconter une histoire ("le prix a été baissé il y a 5j → attendre encore" plutôt que deux informations séparées sans lien).
4. **Historique minimal** : `listing_recommendation_log` (une seule table, append-only, insert-only depuis `computeInsights`) + une simple liste chronologique dans la fiche annonce (pas de graphique, pas de courbe — une liste de lignes "Le [date], ResellOS a recommandé [X] — [résolu/ignoré/toujours actif]").
5. **Aucun apprentissage automatique** : toute mesure d'"aide" reste un simple avant/après sur des chiffres réels (A.6), jamais un score prédictif.

---

## PARTIE B — COMMUNICATION VINTED

### B.1 — Contexte technique déjà établi (rappel, vérifié à nouveau dans cet audit)

- `wardrobeApi.ts` (seul endpoint Vinted exploité aujourd'hui, `GET /api/v2/wardrobe/{id}/items`) expose : id, titre, prix, photo, url, `favourite_count`, `view_count`, statut, marque, taille. **Aucune donnée de conversation, d'offre, ou d'identité d'acheteur.** Compteur de favoris agrégé uniquement — jamais *qui* a mis en favori.
- Le picker catégorie de Vinted (`resolveCategory()`, `formFill.ts`) exige un clic `isTrusted:true` réel — **prouvé en test live**, aucune automatisation possible (`dispatchEvent()`/`.click()` produisent toujours `isTrusted:false`). La sauvegarde d'annonce (`PUT /api/v2/item_upload/items/{id}`) répond avec l'en-tête `x-datadome: protected`, confirmant une protection anti-bot active sur les routes d'écriture Vinted.
- `ActionKind` déclare déjà `reply_message`, `accept_offer`, `counter_offer` dans les types (`src/lib/actions/types.ts`) — **zéro implémentation** (pas de handler extension, pas de check, pas de content script). Scaffolding de nommage seulement.
- `CommunicationPage.tsx` : 100% mockup visuel, données fictives explicitement étiquetées, bouton "Valider et envoyer" désactivé (`disabled`), bandeau honnête "Pas encore construit". Page masquée de la navigation bêta (2026-08-03).
- Aucun endpoint de conversation/inbox/offre n'a jamais été observé ou documenté — `EXTENSION.md` mentionne un ancien projet non implémenté (`sync_inbox`, jamais construit, remplacé par `action_log`).

### B.2 — Tableau de faisabilité par fonctionnalité

| Fonctionnalité | Données accessibles | Endpoint/DOM | Clic utilisateur requis | DataDome/isTrusted | Faisabilité technique | Risque blocage compte | Conforme Vinted | Automatisable | Préparer/guider seulement | Impossible aujourd'hui |
|---|---|---|---|---|---|---|---|---|---|---|
| Messages aux favoris | Aucune (pas d'identité acheteur, juste un compteur) | Aucun connu | — | Inconnu (jamais exploré) | Non évaluable : la donnée de base (qui a favorité) n'existe pas | Élevé si tentative de scraping DOM de la messagerie | Douteux (message non sollicité = spam potentiel selon CGU Vinted) | Non | Non (rien à préparer sans la donnée) | **Oui** |
| Offres automatiques (accepter/refuser/contrer) | Inconnue (jamais observée) | Aucun endpoint découvert | Vraisemblable (formulaires Vinted similaires à l'édition = pickers custom) | Vraisemblable par analogie avec le picker catégorie | Non vérifié en conditions réelles | Élevé si automatisé sans validation | Risqué (action financière automatique = zone sensible) | Non (jamais démontré) | **Oui** — bouton qui ouvre l'onglet Vinted sur la bonne offre | Automatisation complète, oui |
| Messages programmés | Dépend de l'existence d'un endpoint d'envoi (aucun trouvé) | Aucun | Oui, à minima pour l'envoi initial | Inconnu | Non — aucune brique de base (envoi) n'existe | Élevé (spam programmé = signal fort anti-bot) | Non conforme si sans intervention humaine à l'envoi | Non | **Oui** — rappel ResellOS ("tu voulais relancer cet acheteur"), envoi resté manuel | Envoi automatique, oui |
| Réponses rapides (modèles pré-remplis, clic pour ouvrir) | Aucune donnée Vinted nécessaire — juste des modèles stockés côté ResellOS | Aucun (ouvre Vinted, l'utilisateur colle/adapte) | Oui, systématique | Non concerné (pas d'écriture Vinted automatisée) | **Élevée** — proche de ce que fait déjà `edit_listing` (préparation + clic manuel) | Nul si l'envoi reste 100% manuel | Conforme | Partiellement (préparation du texte, jamais l'envoi) | **Oui**, c'est le cœur de la fonctionnalité | Non |
| Relances (rappel "réponds à ce message") | Aucune (pas d'accès aux messages non lus) | Aucun | — | — | Non — dépend de savoir qu'un message existe, ce qui n'est pas lisible aujourd'hui | Nul (aucune écriture) | Conforme (c'est un rappel, pas une action) | Non | Seulement si une future lecture de conversations existe | **Oui**, sans lecture d'inbox |
| Modèles de messages (bibliothèque de textes réutilisables) | Aucune donnée Vinted — 100% ResellOS | Aucun | Non (juste de la gestion de contenu côté ResellOS) | Non concerné | **Élevée** — c'est une simple feature CRUD interne | Nul | Conforme | Oui (la gestion des modèles, pas l'envoi) | — | Non |
| Notifications (nouveaux favoris/offres/messages) | Favoris : compteur agrégé seulement (delta calculable). Offres/messages : aucune donnée | `wardrobeApi.ts` pour le delta de favoris uniquement | Non (lecture passive déjà en place) | Non concerné (lecture, endpoint déjà légitimement utilisé) | **Partielle** — delta de favoris oui (diff de `favourite_count` entre deux `listing_metric_snapshots`), offres/messages non | Nul | Conforme (lecture passive déjà pratiquée) | Le delta de favoris, oui | Offres/messages, seulement si une lecture devient possible un jour | Notification précise "qui/quoi" pour offres/messages, oui |
| Suivi de conversation (afficher l'historique d'échange dans ResellOS) | Aucune | Aucun endpoint/DOM identifié | — | Inconnu | Non — aucune brique de lecture n'existe | Élevé si scraping DOM de la messagerie tentée | Douteux sans étude DataDome dédiée | Non | Non tant que la lecture n'est pas validée séparément | **Oui** |

### B.3 — Synthèse honnête

Sur les 8 fonctionnalités demandées, **une seule** (réponses rapides / modèles de messages, en réalité une seule capacité vue sous deux angles) est construisible aujourd'hui avec le niveau de certitude déjà acquis sur `edit_listing` : préparer un texte dans ResellOS, ouvrir Vinted sur la bonne conversation, laisser l'utilisateur coller/adapter/envoyer lui-même. Tout le reste bute sur un mur commun : **ResellOS n'a aujourd'hui aucun accès en lecture aux messages, offres ou identités de favoris** — ni endpoint découvert, ni DOM exploré, ni décision de l'explorer. Ce n'est pas un problème d'automatisation (DataDome), c'est un problème plus en amont : la donnée elle-même est inconnue. Avant tout code sur la Communication, la vraie première étape serait une phase d'**exploration réseau/DOM dédiée** (comme celle qui a produit `wardrobeApi.ts` en juillet), strictement en lecture, pour établir si un endpoint same-origin équivalent existe pour l'inbox — sans quoi toute la Partie B reste hypothétique au-delà des modèles de messages.

---

## LIVRABLE FINAL

### 1. Architecture du suivi des annonces

```
listings (vivant)              listing_metric_snapshots (historique, append-only)
  ├─ views/favourites/price ──────► un point par synchro passive
  ├─ vinted_status                  (jamais écrit par l'import individuel — gap)
  └─ synced_at

action_log (+ action_log_entries)  ── déjà un vrai journal d'actions par listing_id

listing_recommendation_log (NOUVEAU, seule table proposée)
  └─ un point par recommandation affichée, avec résolution éventuelle

buildListingTimeline(listingId)
  = fusion triée de {snapshots, actions, recommandations passées}
  → alimente une future "fiche annonce" (n'existe pas aujourd'hui)
```

### 2. Architecture de Communication

```
Aujourd'hui : CommunicationPage.tsx = mockup pur, masqué de la nav.

Seule brique construisible avec la certitude actuelle :
  Bibliothèque de modèles (CRUD ResellOS, aucune donnée Vinted)
    → bouton "Ouvrir sur Vinted" (comme edit_listing)
    → utilisateur colle/adapte/envoie lui-même, 100% manuel

Tout le reste (offres, favoris nominatifs, messages, notifications
précises, suivi de conversation) dépend d'une phase d'exploration
réseau/DOM non encore menée — aucun endpoint de lecture inbox connu.
```

### 3. Tableau de faisabilité

Voir B.2 ci-dessus (couvre les 8 fonctionnalités demandées).

### 4. MVP bêta pour Albin

- **Suivi des annonces** : âge + dernière synchro + dernière action affichés sur chaque carte (zéro nouvelle donnée) ; `listing_recommendation_log` + historique minimal en liste dans une nouvelle fiche annonce simple.
- **Communication** : bibliothèque de modèles de messages + bouton "Ouvrir sur Vinted" pré-rempli si un modèle est sélectionné. Rien d'automatique. La page reste honnête sur ce qui n'est pas encore fait.

### 5. Ce qui doit attendre après la bêta

- Tout ce qui dépend d'un accès en lecture aux offres/messages/favoris nominatifs — nécessite une exploration réseau/DOM dédiée avant même d'envisager du code.
- Mesure d'efficacité des recommandations au-delà du simple avant/après factuel (A.6) — attendre un volume d'usage réel.
- Toute automatisation d'envoi (relances programmées, réponses automatiques) — bloquée tant que le statut DataDome des routes de messagerie n'est pas vérifié en conditions réelles.

### 6. Ordre de priorité

1. `listing_recommendation_log` + affichage dernière action/âge/synchro sur les cartes (base du suivi, réutilise tout l'existant).
2. Fiche annonce minimale avec timeline en liste.
3. Bibliothèque de modèles de messages (Communication, brique certaine).
4. Exploration réseau/DOM dédiée pour l'inbox Vinted (préalable obligatoire à tout le reste de la Communication).
5. Tout le reste de la Communication, conditionné au résultat du point 4.

### 7. Estimation d'effort

Ordre de grandeur seulement (pas de base de chiffrage fiable établie sur ce projet) :
- `listing_recommendation_log` + affichage cartes : petit (1 migration + branchement dans `computeInsights`/`useInsights` + 3 lignes d'UI).
- Fiche annonce + timeline : petit à moyen (nouveau composant, mais assemble des données déjà toutes accessibles).
- Bibliothèque de modèles : petit (CRUD simple, pas de donnée Vinted).
- Exploration réseau/DOM inbox : effort de recherche, pas de code — durée incertaine par nature (dépend de ce qui est trouvé).

### 8. Migrations nécessaires

- `listing_recommendation_log` (nouvelle table, append-only, RLS `user_id` via `listings`).
- Aucune autre migration de schéma n'est requise pour le périmètre de ce MVP. Le correctif "snapshot manquant sur import individuel" (A.4) est un changement de code, pas de schéma.

### 9. Risques

- **Suivi des annonces** : risque faible, tout repose sur des tables déjà stables (`listing_metric_snapshots`, `action_log`) — le seul risque réel est de sur-construire une fiche annonce trop riche avant validation utilisateur.
- **Communication** : risque élevé si la tentation est de "juste essayer" un endpoint de messagerie sans validation — cohérent avec la contrainte déjà posée sur `publish_listing`/`edit_listing` (jamais de simulation de clic `isTrusted`, jamais de contournement DataDome). Risque de blocage de compte réel et non théorique si cette règle est enfreinte, comme documenté pour la sauvegarde d'annonce.

### 10. Aucun commit, push ou code

Confirmé — cette session n'a produit que ce document (`AUDIT_SUIVI_COMMUNICATION.md`, non tracké git, à l'image de `DECISION_ENGINE.md`/`LOT1_SPEC.md`).
