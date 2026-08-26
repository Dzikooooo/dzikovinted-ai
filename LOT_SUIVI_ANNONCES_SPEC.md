# Spécification — MVP "Suivi des annonces"

**Statut : spécification, en attente de validation. Aucun code, aucune migration, aucun commit.**

Décision produit actée (voir `AUDIT_SUIVI_COMMUNICATION.md`) : priorité au suivi du cycle de vie (chantier A). Communication (chantier B) réduite à un futur MVP "modèles de messages + ouverture manuelle sur Vinted", pas traité ici.

---

## 1. Fiche annonce

Écran qui n'existe pas encore (confirmé par l'audit). Accessible depuis chaque carte de `ListingsManagementSection.tsx` (nouveau bouton/clic sur la carte, à côté de "Marquer vendu").

Contenu, entièrement dérivé de données déjà chargées ou déjà calculées — **aucun nouveau fetch obligatoire pour cette partie** (`listing`, `insights.scores`, `insights.listingRecommendations` sont déjà en mémoire côté `ListingsManagementSection.tsx`) :

| Champ affiché | Source |
|---|---|
| Résumé (titre, marque, taille, catégorie, photo) | `listing` (déjà chargé) |
| Âge | `daysSince(listing.created_at, now)` — déjà utilisé ailleurs (`alerts.ts`, `dataSufficiency.ts`) |
| Dernière synchronisation | `listing.synced_at` + `formatRelativeSync` (déjà utilisé) |
| Vues / favoris actuels | `listing.views` / `listing.favourites` |
| Statut | `listing.vinted_status` via `VintedStatusBadge` (composant déjà partagé) |
| Prix | `listing.price` |
| One Score | `insights.scores.get(listing.id)` → `{ score, breakdown }` (`OneScoreBar`, déjà un composant) |
| Recommandation actuelle + confiance + raison | `insights.listingRecommendations.get(listing.id)` — déjà le type `ListingRecommendationResult` complet (Lot 1) |

Rien ici ne nécessite `listing_recommendation_log` — c'est l'état **présent**, déjà entièrement disponible. Le log n'intervient que pour la timeline (partie 2) et la mesure de résultat (partie 4).

---

## 2. Timeline

### 2.1 Sources et type d'événement

| Événement | Source réelle | Table |
|---|---|---|
| Synchronisation | un point | `listing_metric_snapshots` |
| Variation de vues/favoris | delta entre deux points consécutifs | `listing_metric_snapshots` |
| Changement de prix | delta de `price` entre deux points consécutifs | `listing_metric_snapshots` |
| Modification d'annonce | `kind='edit_listing'`, `status='success'` | `action_log` (+ `action_log_entries` pour le détail des étapes) |
| Recommandation (apparition/résolution) | une ligne (ouverture) + éventuellement sa résolution | `listing_recommendation_log` (partie 3) |
| Vente | `listing.status='vendu'` + `listing.sold_date` | `listings` (pas un flux d'événements, un seul point terminal) |
| Republication tentée | `kind` in (`publish_listing`,`republish_listing`) | `action_log` |

### 2.2 Fonction de fusion

`buildListingTimeline(listingId)` — **pure**, prend en entrée les résultats déjà requêtés (snapshots, actions, log de recommandations, la ligne `listings` elle-même) et retourne `TimelineEvent[]` trié par date décroissante. Un `TimelineEvent` est une union discriminée (`type: 'snapshot' | 'price_change' | 'action' | 'recommendation_opened' | 'recommendation_resolved' | 'sale'`), chacun avec son propre payload minimal (jamais un objet fourre-tout).

Le calcul des deltas (variation vues/favoris/prix) se fait **côté client, en comparant les snapshots consécutifs** — aucune colonne "delta" stockée en base (calculable à la volée, cohérent avec le principe déjà appliqué partout dans `src/lib/insights/` : ne jamais dupliquer une donnée dérivable).

### 2.3 Densité réelle attendue

Honnêteté nécessaire dès la conception : la densité de `listing_metric_snapshots` dépend entièrement de la fréquence à laquelle l'extension visite le profil Vinted (pas de cron). Une annonce peut avoir 0, 1 ou 30 points sur sa vie — la timeline doit gérer gracieusement un historique clairsemé (voir états vides, partie 7), jamais interpoler ou deviner des points manquants.

---

## 3. Persistance des recommandations — `listing_recommendation_log`

### 3.1 Schéma exact

| Colonne | Type | Nullable | Défaut | Rôle |
|---|---|---|---|---|
| `id` | uuid | non | `gen_random_uuid()` | clé primaire |
| `user_id` | uuid | non | — | FK `auth.users(id)`, pour RLS directe (même pattern que `action_log`) |
| `listing_id` | uuid | non | — | FK `listings(id) on delete cascade` |
| `kind` | text | non | — | `RecommendationKind` : `verifier_annonce`/`considerer_republication`/`baisser_prix`/`revoir_annonce` |
| `confidence` | text | non | — | `haute`/`standard` |
| `reason` | text | non | — | texte généré, **figé au moment de l'écriture** (jamais recalculé rétroactivement) |
| `cta_type` | text | non | — | `open_vinted`/`edit_listing` (miroir de `RecommendationCta`) |
| `shown_at` | timestamptz | non | `now()` | première apparition de cet épisode |
| `last_confirmed_at` | timestamptz | non | `now()` | dernière fois que le même épisode était encore valide (heartbeat, voir 3.3) |
| `resolved_at` | timestamptz | oui | `null` | date de clôture de l'épisode |
| `resolution` | text | oui | `null` | `suivie`/`ignoree`/`expiree`/`remplacee` (voir 3.4) — non-null ssi `resolved_at` non-null |
| `resolution_action_id` | uuid | oui | `null` | FK `action_log(id) on delete set null` — renseigné seulement si `resolution='suivie'` |

### 3.2 Index

- `listing_recommendation_log_listing_id_idx` sur `(listing_id, shown_at desc)` — requête timeline (toutes les lignes d'une annonce, triées).
- `listing_recommendation_log_open_unique` — **index unique partiel** sur `(listing_id) where resolved_at is null`. C'est le mécanisme central de l'idempotence (3.3) : la base elle-même garantit qu'il ne peut jamais exister deux épisodes ouverts simultanés pour la même annonce, y compris en cas d'écriture concurrente (deux onglets ouverts).

### 3.3 RLS

Même schéma que `action_log`/`listing_metric_snapshots` : `select`/`insert`/`update` réservés à `authenticated` avec `auth.uid() = user_id`. Écrit exclusivement côté app web (`useInsights()`), jamais par l'extension.

### 3.4 Stratégie d'idempotence — éviter le doublon à chaque refresh

`computeInsights()` tourne à chaque changement de `[user, accounts, selectedAccountId]` dans `useInsights()`, potentiellement plusieurs fois par session. La règle : **une ligne "ouverte" (`resolved_at is null`) représente un épisode, identifié par `(listing_id)` seul** (garanti unique par l'index 3.2). À chaque refresh, pour chaque annonce dont la recommandation actuelle a `status='action'` :

1. Chercher la ligne ouverte existante pour ce `listing_id` (au plus une, par construction).
2. **Aucune ligne ouverte** → `INSERT` une nouvelle ligne (`shown_at = last_confirmed_at = now()`).
3. **Ligne ouverte, même `kind`** → `UPDATE` uniquement `last_confirmed_at = now()` (+ `confidence`/`reason` si les chiffres ont légèrement bougé sans changer de `kind`, ex. passé de "standard" à "haute"). **Aucune nouvelle ligne** — c'est la garantie anti-doublon.
4. **Ligne ouverte, `kind` différent** → `UPDATE` la ligne existante (`resolved_at = now()`, `resolution = 'remplacee'`), puis `INSERT` une nouvelle ligne pour le nouveau `kind`.
5. **Ligne ouverte mais la recommandation actuelle n'est plus `status='action'`** (retombée en `attendre`/`donnees_insuffisantes`) → `UPDATE` (`resolved_at = now()`, `resolution = 'expiree'`).

Seules les recommandations `status='action'` sont journalisées (pas `attendre`/`donnees_insuffisantes`/`recommandation_differee` — ce ne sont pas des "recommandations émises", ce sont des absences ou des reports déjà expliqués par le Lot 1 lui-même).

### 3.5 Marquer une recommandation comme suivie / ignorée / expirée / remplacée

- **`suivie`** : inféré automatiquement, jamais deviné. À chaque refresh (au moment où `recentActions` est déjà récupéré pour les cooldowns), si une nouvelle ligne `action_log` (`status='success'`) apparaît pour ce `listing_id` dont le `kind` correspond à celui de la ligne ouverte (`edit_listing` avec `price` dans `changedFields` → résout `baisser_prix` ; `publish_listing`/`republish_listing` → résout `considerer_republication` ; tout `edit_listing` réussi → résout `verifier_annonce`/`revoir_annonce`), alors `resolved_at = action.completed_at`, `resolution = 'suivie'`, `resolution_action_id = action.id`.
- **`remplacee`** : automatique, voir 3.4 étape 4 — un nouveau signal a supplanté l'ancien avant toute action.
- **`expiree`** : automatique, voir 3.4 étape 5 — la situation a changé sans action détectée (on ne sait pas *pourquoi*, seulement *que* le signal a disparu).
- **`ignoree`** : **seul état qui exige une action explicite de l'utilisateur** — un lien "Ignorer cette suggestion" dans la fiche annonce (partie 7), qui écrit directement `resolved_at = now()`, `resolution = 'ignoree'`. Décision volontaire : ne jamais inférer un "ignoré" depuis une simple absence d'action (on ne peut pas distinguer "l'utilisateur a vu et ignoré" de "l'utilisateur n'a jamais ouvert l'app" sans données de consultation — inventer cette distinction serait fabriquer une certitude qu'on n'a pas).

### 3.6 Où s'exécute l'écriture

**Jamais dans `src/lib/insights/`** — ce module reste une fonction pure sans accès réseau/base (invariant déjà affirmé dans `engine.ts` et respecté par tout le Lot 1). La logique de diff (étapes 3.4/3.5) est une fonction pure et testable (`diffRecommendationLog(current, existingOpenRows, recentActions) → { toInsert, toHeartbeat, toResolve }`), mais son **exécution** (lecture des lignes ouvertes, écriture Supabase) a lieu dans `useInsights()`, qui fait déjà de l'I/O.

Point d'attention réel : `useInsights()` calcule `computeInsights()` **deux fois** quand un compte précis est filtré (`scopedReport` + `fullReport`, ce dernier ne servant aujourd'hui qu'à `.narratives`). La synchronisation du log doit se brancher sur **`fullReport.listingRecommendations`** (jamais `scopedReport`), sinon les annonces des comptes non sélectionnés à l'écran ne seraient jamais journalisées.

---

## 4. Mesure du résultat

Fonction pure `measureRecommendationOutcome(logRow, snapshots)`, appelée uniquement sur une ligne `resolved`. Retourne une structure factuelle, jamais une affirmation de cause à effet :

```
{
  baseline: { views, favourites } | null   // dernier snapshot AVANT resolution_action_id.completed_at (ou avant resolved_at si expiree/ignoree — mais voir ci-dessous)
  after3d:  { views, favourites } | null   // snapshot le plus proche de +3j après l'action, s'il existe
  after7d:  { views, favourites } | null   // idem +7j
  soldAfterDays: number | null             // si listing.status='vendu' et sold_date postérieure à l'action
}
```

- **`baisser_prix`/`revoir_annonce` (résolues `suivie`)** : baseline = dernier snapshot avant l'action, comparaisons +3j/+7j si des snapshots existent dans ces fenêtres (opportuniste — pas de garantie de granularité, voir 2.3).
- **`considerer_republication` (résolue `suivie`)** : la republication crée une **nouvelle ligne `listings`** (nouveau `vinted_item_id`, lié à l'ancienne via `RepublishListingPayload.previousVintedItemId`, déjà tracé). La mesure compare les snapshots de l'**ancienne** annonce (avant) à ceux de la **nouvelle** (après) — deux `listing_id` différents, pas une continuité simple.
- **`verifier_annonce`** : pas de mesure d'engagement — mesure binaire "le défaut signalé a-t-il disparu au prochain point de données" (photo présente / catégorie renseignée), pas un avant/après de vues.
- **Recommandation `expiree`/`ignoree`** : `resolution_action_id` est `null` → **aucun événement associé**, `measureRecommendationOutcome` retourne `{ baseline: null, ... }` sans tenter de mesure. Affiché honnêtement comme "Aucune action associée à cette recommandation".
- **Vente** : `soldAfterDays = daysBetween(action.completed_at, listing.sold_date)` si applicable, affiché tel quel, sans l'attribuer à la recommandation (le fait qu'une vente ait suivi une baisse de prix quelques jours plus tard est une **corrélation observée**, jamais présentée comme "cette baisse de prix a provoqué la vente").

Chaque affichage de résultat porte systématiquement le même garde-fou textuel : *"Évolution observée après cette action — pas une preuve que l'action en est la cause."* Aucun scoring, aucun agrégat "taux de succès des recommandations" dans ce MVP — un seul utilisateur ne donne aucune base statistique valable, et cela ouvrirait la porte à une fausse impression de rigueur.

---

## 5. Réutilisation des données existantes

| Donnée | Table/module | Statut |
|---|---|---|
| Historique vues/favoris/prix/statut | `listing_metric_snapshots` | Déjà écrite à chaque sync passive, jamais lue nulle part — première vraie utilisation |
| Actions et leur résultat | `action_log` | Déjà écrite par l'Action Engine, réutilisée telle quelle |
| Détail des étapes d'une action | `action_log_entries` | Déjà écrite, réutilisée pour le détail d'un événement `action` dans la timeline |
| État courant, statut, prix, âge | `listings` | Déjà chargée par `useInsights()`/`ListingsManagementSection.tsx` |
| Libellé de compte | `vinted_accounts` | Déjà chargée (pour l'avatar de compte sur les cartes) — réutilisée si la fiche annonce affiche le compte propriétaire |
| Recommandation actuelle | `insights.listingRecommendations` (Lot 1) | Déjà calculée, réutilisée pour la partie 1 et comme entrée du diff 3.4 |

Aucune de ces sources n'est dupliquée — `listing_recommendation_log` est la **seule** donnée réellement nouvelle.

---

## 6. Traitement des gaps de synchronisation

- **`category`/`condition`/`color`/`material` jamais rafraîchis par la synchro passive** : confirmé plus précisément que dans l'audit précédent — ce n'est pas seulement "jamais écrit", c'est que `wardrobeApi.ts` (`WardrobeItem`) **n'expose même pas ces champs** dans la réponse de l'endpoint wardrobe (seuls `title`/`price`/`imageUrl`/`favourites`/`views`/`status`/`brand`/`size` y figurent). Ces champs ne sont connus que via le Générateur IA (saisie initiale) ou `recordSingleItemImport` (qui lit la page item complète, pas le wardrobe). **Traitement proposé pour ce MVP : aucun correctif de synchro** (hors périmètre, nécessiterait de changer `sync.ts`/`wardrobeApi.ts`, pas seulement d'ajouter une table) — la fiche annonce affiche simplement une mention "Dernière vérification structurelle : à l'import/création" plutôt que de laisser croire que ces champs sont tenus à jour en continu.
- **`recordSingleItemImport` sans écriture dans `listing_metric_snapshots`** : gap réel, mais correctif de code (pas de schéma) — hors périmètre de cette spec (qui porte sur la persistance des recommandations et la lecture de l'historique), à traiter séparément si validé. Effet concret en attendant : un import individuel ne crée pas de point de départ dans la timeline tant qu'une synchro passive n'a pas suivi.
- **Historique absent avant la mise en place** : aucune donnée rétroactive ne peut être fabriquée. La timeline d'une annonce existante commencera au premier `listing_metric_snapshots` déjà présent (peut remonter à juillet 2026 pour les plus anciennes annonces) — jamais un message d'erreur, mais un état "Historique disponible depuis le [date du plus ancien snapshot]" explicite en haut de la timeline.

---

## 7. UX

### 7.1 Wireframe — Fiche annonce

```
┌─────────────────────────────────────────────────┐
│ [photo]  Sweat Zippé Carhartt · #42              │
│          Carhartt · S · 25 €           [Ignorer] │
├─────────────────────────────────────────────────┤
│ En ligne depuis 34j    Synchro : il y a 22h       │
│ 👁 128 vues   ♥ 6 favoris    ● En ligne           │
│ One Score ▓▓▓▓▓▓▓▓░░ 68/100                       │
├─────────────────────────────────────────────────┤
│ RECOMMANDATION ACTUELLE                          │
│ 💡 Baisse de prix conseillée · confiance haute    │
│ "Peu de vues et de favoris après 34 jours en      │
│  ligne (2 vues, 1 favori, pour une moyenne de 12  │
│  sur ton compte) — nettement en retrait..."       │
│ [Modifier le prix]                                │
├─────────────────────────────────────────────────┤
│ [Voir l'historique complet ▾]                     │
└─────────────────────────────────────────────────┘
```

### 7.2 Wireframe — Timeline (dépliée)

```
Historique disponible depuis le 12 juillet 2026
│
● 5 août, 14:02 — 💡 Baisse de prix conseillée (confiance haute)
│  "2 vues, 1 favori pour une moyenne de 12..."
│
● 3 août, 09:15 — Synchronisation : 2 vues (−0), 1 favori (−0)
│
● 28 juil., 18:40 — ✏️ Titre et description modifiés (ResellOS → Vinted)
│  Résultat : succès
│
● 20 juil., 10:02 — Synchronisation : 2 vues (+1), 1 favori (+0)
│
● 12 juil., 08:30 — Synchronisation initiale : 1 vue, 1 favori, 25 €
```

### 7.3 États explicites

| État | Affichage |
|---|---|
| **Vide** (aucune synchro depuis la création) | "Aucun historique pour l'instant — reviens après une prochaine synchronisation." |
| **Données insuffisantes** | Reprend exactement le texte déjà produit par le Lot 1 (`ListingRecommendationResult` status `donnees_insuffisantes`) — jamais un second message inventé pour la même idée. |
| **Synchro périmée** (>48h) | Bandeau discret déjà existant ailleurs dans le produit (`DashboardHome.tsx`) — même seuil, même ton, réutilisé tel quel dans la fiche annonce. |
| **Recommandation remplacée** | Dans la timeline : ligne grisée "Recommandation remplacée par [nouvelle]" à la date de `resolved_at`, jamais supprimée de l'historique. |
| **Action en attente** (`recommandation_differee`) | Le badge déjà construit en Lot 1 ("Action déjà tentée récemment") — la fiche annonce ne fait qu'hériter du même état, pas un nouveau texte. |

---

## 8. Plan d'implémentation — 6 lots indépendants

### Lot 1 — Migration
- **Fichiers** : `supabase/migrations/<timestamp>_add_listing_recommendation_log.sql` (seul fichier).
- **Contenu** : table + 2 index + policies RLS (select/insert/update, `authenticated`, `auth.uid() = user_id`) — voir 3.1-3.3.
- **Tests** : aucun test automatisé (migration SQL pure) — vérification manuelle post-push (insert/select/update en conditions RLS réelles, comme fait pour P-02).
- **Risques** : faible — table neuve, aucune donnée existante à migrer, aucune colonne touchée ailleurs.
- **Estimation** : petit.
- **Critères d'acceptation** : la migration s'applique proprement, l'index unique partiel empêche bien un doublon de ligne ouverte (testable par deux inserts concurrents en conditions réelles).

### Lot 2 — Persistance
- **Fichiers** : `src/lib/insights/recommendationLog.ts` (nouveau, fonction pure `diffRecommendationLog`) + `src/hooks/useInsights.ts` (modifié : fetch des lignes ouvertes + appel du diff + écritures Supabase, branché sur `fullReport.listingRecommendations`).
- **Tests** : `src/lib/insights/__tests__/recommendationLog.test.ts` — couvre les 5 branches de 3.4 (nouvelle ligne, heartbeat même kind, remplacement, expiration, résolution `suivie` via `action_log` correspondant) + le cas `ignoree` non généré automatiquement.
- **Risques** : moyen — c'est le seul lot qui touche `useInsights.ts` (fichier déjà central), risque de régression sur le chargement normal des insights si mal isolé ; mitigé en gardant la logique de diff 100% pure et testée séparément de l'I/O.
- **Estimation** : petit à moyen.
- **Critères d'acceptation** : aucun doublon de ligne ouverte après plusieurs refreshs consécutifs (vérifié par requête SQL directe) ; une action `edit_listing` (prix) réelle résout bien la ligne `baisser_prix` ouverte correspondante.

### Lot 3 — Requêtes/hook
- **Fichiers** : `src/lib/timeline.ts` (nouveau, fonction pure `buildListingTimeline`) + `src/hooks/useListingTimeline.ts` (nouveau, fetch `listing_metric_snapshots`/`action_log`+`action_log_entries`/`listing_recommendation_log` pour un `listingId`, appelle la fonction pure).
- **Tests** : `src/lib/__tests__/timeline.test.ts` — tri chronologique correct, calcul des deltas entre snapshots consécutifs, gestion d'un historique clairsemé (0 ou 1 point).
- **Risques** : faible — nouveau hook isolé, aucune écriture, ne touche aucun fichier existant.
- **Estimation** : petit.
- **Critères d'acceptation** : la timeline d'une annonce réelle (testée en live) reflète exactement l'historique connu, dans le bon ordre, sans doublon ni trou silencieux.

### Lot 4 — Fiche annonce
- **Fichiers** : `src/components/listings/ListingDetailModal.tsx` (nouveau) ; `src/pages/dashboard/watchlist/ListingsManagementSection.tsx` (modifié : ouverture de la modale depuis chaque carte).
- **Tests** : aucun test automatisé nouveau (composant React, vérifié par walkthrough navigateur — convention déjà en place sur ce projet).
- **Risques** : faible — ajout pur, aucune modification de la logique métier existante des cartes.
- **Estimation** : petit à moyen.
- **Critères d'acceptation** : les 8 champs de la partie 1 s'affichent correctement pour une annonce réelle, y compris les 3 états non-`action` (attendre/données insuffisantes/différée) déjà gérés par le Lot 1.

### Lot 5 — Timeline (UI)
- **Fichiers** : `src/components/listings/ListingTimeline.tsx` (nouveau, consommé par `ListingDetailModal.tsx`).
- **Tests** : aucun (présentation pure).
- **Risques** : faible.
- **Estimation** : petit à moyen.
- **Critères d'acceptation** : les 5 états de la partie 7.3 s'affichent correctement selon le cas réel de l'annonce testée.

### Lot 6 — Mesure des résultats
- **Fichiers** : `src/lib/insights/recommendationOutcome.ts` (nouveau, `measureRecommendationOutcome`) ; affichage branché dans `ListingTimeline.tsx`/`ListingDetailModal.tsx`.
- **Tests** : `src/lib/insights/__tests__/recommendationOutcome.test.ts` — baseline/+3j/+7j corrects avec snapshots épars, cas `resolution_action_id = null` (aucune mesure tentée), cas republication (deux `listing_id`).
- **Risques** : faible — fonction pure isolée, aucune dépendance sur les lots précédents au-delà de la lecture des données déjà assemblées.
- **Estimation** : petit.
- **Critères d'acceptation** : le garde-fou "corrélation observée, pas causalité" est présent sur chaque affichage de résultat, sans exception.

---

## 9. Bêta Albin

**Ce qu'il pourra tester** : ouvrir n'importe laquelle de ses annonces depuis "Mes annonces", voir son âge/statut/score/recommandation actuelle en un coup d'œil, dérouler son historique réel (synchros, modifications, ventes), et — pour les annonces où il a suivi une recommandation — voir si les vues/favoris ont bougé dans les jours suivants.

**Questions à lui poser** :
- La fiche annonce répond-elle vraiment à "je ne sais pas quoi faire de cette annonce" mieux que la carte seule ?
- La timeline est-elle lisible avec son historique réel (souvent clairsemé au début) ?
- Le lien "Ignorer cette suggestion" est-il compris comme "je ne veux pas de cette recommandation précise" ou perçu comme "je désactive tout" (risque de confusion à vérifier explicitement) ?
- Le garde-fou "corrélation observée" est-il lu/compris, ou ignoré comme du texte légal ?

**Métriques à observer** (côté produit, pas de dashboard dédié nécessaire pour un seul utilisateur — lecture directe en base) :
- Nombre de fiches annonce ouvertes / nombre d'annonces actives.
- Répartition des résolutions (`suivie`/`ignoree`/`expiree`/`remplacee`) sur la durée de la bêta — un ratio `ignoree` très élevé signalerait des recommandations mal calibrées, pas seulement un problème d'UI.
- Densité réelle de `listing_metric_snapshots` par annonce sur la période — confirme ou infirme si la fréquence de sync passive suffit à une timeline utile.

**Ce qui doit attendre après la bêta** :
- Correction des deux gaps de synchro (partie 6) — pas bloquant pour tester le suivi, mais à traiter avant de généraliser.
- Tout agrégat statistique ("taux de succès des recommandations", tableau de bord dédié) — nécessite un volume d'usage qu'un seul testeur ne peut pas fournir.
- Cooldown éventuel après un `ignoree` (éviter de re-proposer immédiatement la même recommandation) — non inclus dans ce MVP, à évaluer selon le comportement réel observé.
