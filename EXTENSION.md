# Extension Chrome — Architecture

Document de conception de l'extension Chrome ResellOS. Voir [ARCHITECTURE.md](ARCHITECTURE.md) §8 pour comment ce document s'articule avec le reste du projet, et [ROADMAP.md](ROADMAP.md) Phase 2 pour le séquençage global.

**État d'implémentation** : la Phase 1 complète (1.1 appairage, 1.2 détection du compte, 1.3 synchronisation des annonces) est codée **et validée en conditions réelles**. La refonte multi-comptes est ensuite lancée : **Phase A (fondation schéma `vinted_accounts`) faite et validée**, sans régression visible. **Phase B (interface multi-comptes) faite et validée en conditions réelles** avec deux comptes réels (`alexisdzk`, `matleshop`) : sélecteur de compte premium (`AccountSwitcher`), gestion complète dans Paramètres (renommage, compte par défaut via RPC, suppression), Dashboard et page Compte Vinted en double mode (vue globale/filtrée). Pendant cette validation, l'utilisateur a découvert que la synchronisation des annonces (étape 1.3) était incomplète et mal étiquetée depuis le début — **corrigé le 2026-07-09**. **`listings` et `vinted_listings` fusionnées (2026-07-09)** : sur demande explicite de l'utilisateur, une annonce Vinted synchronisée EST désormais la même ligne que l'article ResellOS correspondant (plus deux tables séparées) — voir §5 `listings`. `StockPage.tsx` devient une vue unifiée (fin des onglets "Vinted"/"ResellOS" introduits une itération plus tôt, redevenus inutiles une fois les données fusionnées), avec taxonomie de statut Vinted stable, suppression douce, auto-comptabilité sur vente détectée, CA/bénéfice honnêtement calculés uniquement quand le prix d'achat est connu, synchronisation à la demande sans nouvelle permission Chrome — voir §5 et §6.2. Le rapprochement manuel des brouillons pré-existants (créés au Générateur avant publication réelle sur Vinted) reste hors scope, différé à une amélioration future — voir `ROADMAP.md`. **Moteur d'intelligence métier — "Phase 2" produit (2026-07-09)** : nouveau module `src/lib/insights/` (scores, recommandations, alertes, priorités, narrations) calculé en fonctions pures à partir de `listings` réel, jamais d'appel LLM ni de donnée fabriquée — voir §5 `listing_metric_snapshots` et ARCHITECTURE.md §4.5. Plusieurs décisions ci-dessous ont été révisées par rapport à la conception initiale, certaines après vérification directe du schéma existant, d'autres après des bugs réels découverts en test live (§3, §5) — marquées explicitement.

**Sélecteurs DOM Vinted (étapes 1.2/1.3)** : découverts en direct le 2026-07-09 en naviguant sur `https://www.vinted.fr/member/<id>` avec un compte réel (voir `extension/src/content/selectors.ts` pour le détail exact, code = source de vérité). Points notables : la présence de `[data-testid="closet-seller-filters-active"]` distingue "c'est mon propre profil" de "je regarde le profil de quelqu'un d'autre" — testé positivement sur son propre profil et négativement sur le profil d'un autre utilisateur (`clementk61`), aucune détection erronée. Sur cette page précise, `--description-title`/`--description-subtitle` affichent les stats vendeur (vues/favoris) plutôt que le titre de l'annonce — le vrai titre vient de l'attribut `title` du lien overlay.

## 1. Rôle et périmètre

Vinted n'a pas d'API publique. Tout ce qui nécessite d'agir *dans* le compte Vinted d'un utilisateur (republier une annonce, lire ses messages, répondre à une offre) ne peut pas se faire depuis un serveur — il faut agir dans le contexte authentifié du navigateur de l'utilisateur sur vinted.fr. C'est le seul rôle de l'extension : **un pont entre la session Vinted réelle de l'utilisateur et les données Supabase de ResellOS**, pas une seconde application avec sa propre logique métier.

Principe directeur (déjà posé lors de la refonte UX du dashboard) : **l'utilisateur ne doit jamais ressentir qu'il utilise deux outils.** Concrètement, ça implique qu'une action déclenchée dans ResellOS (« republier cet article ») doit s'exécuter réellement sur Vinted sans que l'utilisateur ait besoin de retrouver l'annonce lui-même — voir §6.

Ce que l'extension **ne fait pas** : elle n'a pas de logique métier propre (pas de calcul de prix, pas de règles de scoring — ça reste dans `scripts/market-engine.ts` et l'app web), et elle ne contourne aucune protection anti-bot de Vinted (voir §8).

## 2. Vue d'ensemble des composants

Manifest V3 (obligatoire, V2 est déprécié). Quatre surfaces de code :

```
┌─────────────────────┐         ┌──────────────────────────┐
│   App web ResellOS   │ appairage (1x)│  Extension Chrome         │
│  (VintedAccountPage)  │─────────────▶│                            │
└─────────────────────┘  chrome.runtime │  ┌──────────────────────┐ │
                          .sendMessage   │  │ Background            │ │
                          (externally_   │  │ (service worker MV3)  │ │
                          connectable)   │  │ - session Supabase    │ │
                                         │  │ - polling sync_jobs   │ │
                                         │  │ - orchestration onglets│ │
                                         │  └──────────┬───────────┘ │
                                         │             │ messages     │
                                         │  ┌──────────▼───────────┐ │
                                         │  │ Content scripts        │ │
                                         │  │ injectés sur vinted.fr │ │
                                         │  └────────────────────────┘ │
                                         │  ┌────────────────────────┐ │
                                         │  │ Popup + Options (React) │ │
                                         │  └────────────────────────┘ │
                                         └──────────────┬─────────────┘
                                                          │ REST (clé anon + JWT utilisateur, RLS)
                                                          ▼
                                                    Supabase (même projet que l'app web)
```

- **Background (service worker)** — le seul composant qui parle à Supabase. Détient la session (via `chrome.storage.local`), interroge périodiquement `sync_jobs` (§5), orchestre l'ouverture d'onglets vinted.fr quand une action doit s'exécuter.
- **Content scripts** — injectés uniquement sur `*.vinted.fr/*`. Lisent/manipulent le DOM (déjà le cas pour `scripts/vinted-scan.ts` en scraping anonyme — ici avec une vraie session). Ne parlent jamais directement à Supabase, ils passent par `chrome.runtime.sendMessage` vers le background.
- **Popup** — statut de connexion, dernière synchro, actions rapides. Petite app React, cohérente avec le design system de l'app principale (tokens `neon-*`/`dark-*`).
- **Options** — préférences (fréquence de sync, autoriser l'ouverture d'onglets en arrière-plan ou non — voir §8).

## 3. Authentification et appairage

Deux options existaient : (a) un compte séparé, connecté indépendamment dans le popup, ou (b) un appairage à chaud avec la session déjà ouverte dans l'app web. **(b) est retenu** — se reconnecter une seconde fois dans l'extension contredirait frontalement le principe du §1.

Flow d'appairage (déclenché depuis `VintedAccountPage.tsx`, bouton « Connecter l'extension ») :

1. La page web vérifie que l'extension est installée : `chrome.runtime.sendMessage(EXTENSION_ID, { type: 'PING' })`, avec un `try/catch`/timeout court (l'API échoue silencieusement si l'extension n'est pas installée).
2. Si l'extension répond, la page web envoie `{ type: 'PAIR', access_token, refresh_token }` (session Supabase courante de l'utilisateur, déjà en mémoire côté `AuthContext`).
3. `manifest.json` restreint `externally_connectable.matches` au domaine de prod de ResellOS uniquement (+ `localhost` seulement dans un build de dev jamais publié sur le Chrome Web Store).
4. Le background valide le token (`supabase.auth.getUser(accessToken)`) puis stocke `{access_token, refresh_token, expires_at, user_id}` dans `chrome.storage.local` sous une clé dédiée à ResellOS.
5. Après le premier échange, l'extension gère **son propre rafraîchissement de session**, explicitement (`supabase.auth.refreshSession({refresh_token})` quand le token stocké approche l'expiration) — elle ne dépend plus de l'onglet ResellOS ouvert. Le `refresh_token` Supabase reste valide indépendamment du client qui l'utilise.
6. Le background écrit une ligne dans `vinted_connection` (voir §5) — l'app web voit la connexion confirmée au prochain chargement, sans polling nécessaire côté web (RLS + lecture normale de la table). Important : l'appairage (extension ↔ ResellOS) et la détection d'une session Vinted réelle (`connected = true`, étape 1.2) sont deux états distincts — l'appairage seul ne met pas `connected` à `true`.

**Révision importante, découverte en test live (étape 1.1)** : la conception initiale prévoyait d'utiliser `supabase.auth.setSession()`/`getSession()` (gestion de session « ambiante » du SDK) côté extension, avec `supabase.auth.signOut()` pour la dissociation. Deux problèmes réels rencontrés :
- `signOut()` sans option explicite révoque la session **côté serveur** en portée `global` par défaut — un « Se dissocier » dans l'extension invalidait alors le refresh token de la session, ce qui pouvait finir par casser aussi la session de l'app web (les deux partagent la même session d'origine, voir point 2 ci-dessus). Une session de test a été « empoisonnée » ainsi pendant le développement, résolue uniquement par une reconnexion complète côté web.
- `setSession()` s'est montré peu fiable dans le contexte service worker MV3 (module ré-instancié à chaque réveil), échouant par intermittence avec `Auth session missing!` même avec des tokens valides et non expirés — cause précise non confirmée (soupçon : initialisation interne du client pas totalement réglée avant l'appel), mais reproductible.

**Décision retenue** : l'extension ne gère plus de session ambiante GoTrue. `pair()` valide le token via l'appel stateless `getUser(accessToken)`, écrit dans Supabase via un client à portée de requête (`createClient` avec un header `Authorization: Bearer <token>` explicite — même pattern que `supabase/functions/analyze-clothing/index.ts`), puis persiste `{access_token, refresh_token, expires_at}` elle-même dans `chrome.storage.local`. `unpair()` se contente d'effacer cette clé locale — **aucun appel à `signOut()`**, donc aucun risque de toucher à la session de l'app web. Voir `extension/src/background/pairing.ts` et `extension/src/background/supabaseClient.ts` (fonction `supabaseWithToken`).

Risque assumé : les tokens transitent une fois par le contexte de la page web (`externally_connectable` est exposé à tout script tournant sur cette page). Acceptable tant que l'app ResellOS elle-même n'a pas de faille XSS — mais c'est une raison de plus de ne jamais introduire de rendu HTML non échappé dans le dashboard.

## 4. Communication interne

| De | Vers | Mécanisme | Contenu |
|---|---|---|---|
| App web | Background | `chrome.runtime.sendMessage` (`externally_connectable`) | Appairage initial uniquement (§3) |
| Content script | Background | `chrome.runtime.sendMessage` | Résultat d'une lecture DOM (vues/favoris, statut d'une annonce), confirmation d'une action exécutée |
| Background | Content script | `chrome.tabs.sendMessage` | Ordre d'exécuter une action précise (« republie l'annonce à cette URL ») |
| Popup / Options | Background | `chrome.runtime.sendMessage` | Lecture du statut courant, changement de préférences |
| Background | Supabase | REST (`@supabase/supabase-js`) | Toute lecture/écriture de données (§5) |

Aucun composant autre que le background ne détient de session Supabase — centraliser évite la duplication de logique de refresh et simplifie l'audit de ce qui a accès aux données.

## 5. Modèle de données

**Refonte multi-comptes (2026-07-09)** : ce projet reste volontairement Vinted-only (pas de multi-marketplace), mais un même utilisateur ResellOS peut désormais gérer **plusieurs comptes Vinted** (principal, secondaire, boutique, test...). Le "Compte Vinted" est l'entité centrale du produit — voir `ARCHITECTURE.md` et `ROADMAP.md` pour le contexte produit complet. Historique de cette section : une première version envisageait d'étendre `accounts` (carnet d'étiquettes hérité de BusinessOS, 0 ligne, jamais câblé — écarté), puis une table `vinted_connection` à une ligne par utilisateur (implémentée à l'étape 1.1, mais limitée à un seul compte Vinted par utilisateur). **`vinted_accounts` remplace `vinted_connection`** depuis la Phase A de la refonte multi-comptes.

### `vinted_accounts` — entité centrale (implémentée)

```sql
create table vinted_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  vinted_user_id text not null,
  vinted_username text not null,
  connected boolean not null default false,
  last_synced_at timestamptz,
  last_error text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, vinted_user_id)
);

alter table vinted_accounts enable row level security;
create policy "select_own_vinted_accounts" on vinted_accounts for select
  to authenticated using (auth.uid() = user_id);
create policy "insert_own_vinted_accounts" on vinted_accounts for insert
  to authenticated with check (auth.uid() = user_id);
create policy "update_own_vinted_accounts" on vinted_accounts for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete_own_vinted_accounts" on vinted_accounts for delete
  to authenticated using (auth.uid() = user_id);
```

**Règle de conception non négociable** : une ligne `vinted_accounts` ne peut être créée que par une **détection réelle** de l'extension (upsert sur `(user_id, vinted_user_id)` au moment où le content script détecte un compte connecté) — jamais par saisie manuelle vide. Ça garantit qu'il ne peut exister aucun compte "fantôme" non rattaché à une identité Vinted réelle, condition explicite de l'utilisateur pour "aucune confusion possible entre deux comptes". `label` (renommable par l'utilisateur, Phase B) n'est jamais écrasé par une détection ultérieure — seuls `connected`/`vinted_username`/`last_synced_at`/`last_error` sont mis à jour sur une ligne existante. `is_default` est positionné automatiquement sur le premier compte détecté pour un utilisateur.

### RLS des tables scopées par compte — écart volontaire par rapport à la convention `auth.uid() = user_id`

Pour les tables strictement rattachées à un seul compte Vinted (futures `vinted_messages`/`vinted_offers`/`vinted_notifications`), **pas de `user_id` dupliqué** : la RLS dérive la propriété uniquement via `vinted_account_id` :

```sql
using (vinted_account_id in (select id from vinted_accounts where user_id = auth.uid()))
```

Écart assumé par rapport à la convention utilisée partout ailleurs dans le schéma (`auth.uid() = user_id` direct) — justifié par l'exigence explicite de l'utilisateur ("aucune fuite de données possible") : avec `user_id` dupliqué en plus de `vinted_account_id`, rien n'empêcherait techniquement qu'une ligne ait un `user_id` correct mais un `vinted_account_id` appartenant à un autre utilisateur. En supprimant `user_id` de ces tables, `vinted_account_id` devient l'unique source de vérité de propriété.

**`listings` (depuis la fusion du 2026-07-09) et `expenses` restent des exceptions assumées** : `listings` garde `user_id` en RLS classique (`auth.uid() = user_id`) plutôt que de dériver via `vinted_account_id`, pour une raison structurelle et pas seulement historique — toutes les lignes de `listings` n'ont pas de compte Vinted (un brouillon créé au Générateur, jamais publié, a `vinted_account_id = null` par construction). Dériver la propriété uniquement via `vinted_account_id` serait donc impossible pour ces lignes. `user_id` reste par ailleurs fiable et indépendant : l'extension le lit directement depuis le JWT de la session appairée (`getValidAccessToken()`), jamais dérivé de `vinted_account_id` — pas de risque de fuite croisée. `expenses` garde `user_id` pour la même raison produit (dépenses globales possibles, ex. abonnement logiciel) et reçoit un `vinted_account_id` **nullable** — pas encore implémenté (Phase C future).

### `listings` — fusion avec l'ancienne `vinted_listings` (2026-07-09)

**`listings` et `vinted_listings` ont fusionné.** Jusqu'ici, `listings` modélisait des annonces *créées dans ResellOS* (générées par IA, avec prix d'achat/frais/statut de vente) et `vinted_listings` était un miroir séparé de ce qui était réellement en ligne sur Vinted — deux tables sans aucun lien, demande explicite de l'utilisateur de supprimer cette séparation ("une annonce Vinted doit représenter le même objet que celui présent dans mon Stock ResellOS"). `listings` est désormais l'**unique source de vérité** : elle porte à la fois les champs ResellOS historiques (`purchase_price`, `sold_price`, `fees`, `status`) et les champs Vinted (`vinted_account_id`, `vinted_item_id`, `vinted_url`, `vinted_status`, `brand`, `size`, `favourites`, `views`, `synced_at`).

**Deux axes de statut distincts coexistent sur la même ligne** :
- `status` (`draft`/`en_stock`/`vendu`) — statut *workflow* ResellOS, propriété de l'utilisateur.
- `vinted_status` (nullable : `online`/`reserved`/`sold_pending`/`sold_completed`/`draft`/`hidden`/`deleted`/`unknown`) — état réel observé sur Vinted, propriété de la synchro. `null` = jamais lié à un compte Vinted (brouillon pur Générateur, jamais publié).

**Règle de propriété des champs à la resynchronisation** (évite que la synchro écrase le travail de l'utilisateur) :
- Toujours rafraîchis par chaque synchro : `price`, `vinted_status`, `favourites`, `views`, `synced_at`, `vinted_url`.
- Fixés uniquement à la création de la ligne, jamais réécrits ensuite : `title`, `brand`, `size`, `image_urls`, `purchase_price`.

**Fusion automatique pour le nouveau uniquement** (décision produit explicite) : toute annonce découverte par la synchro Vinted qui n'a pas de ligne `listings` correspondante devient une nouvelle ligne unifiée (`purchase_price: null`, information réellement inconnue). Les brouillons déjà créés au Générateur, jamais publiés sur Vinted, restent séparés tant qu'aucun lien n'existe — Vinted n'a pas d'API de publication, impossible de les rapprocher automatiquement sans identifiant commun. Un lien manuel ("Associer à une annonce Vinted existante") reste une amélioration future, pas construite.

**Auto-comptabilité** (décision produit explicite) : quand `vinted_status` passe à `sold_completed` pour une ligne déjà liée, `recordListings()` (`extension/src/background/sync.ts`) met à jour automatiquement `status = 'vendu'`, `sold_date` = date de détection, et `sold_price` = dernier prix Vinted connu — **uniquement si `sold_price` est encore `null`**, jamais d'écrasement d'une valeur saisie manuellement.

**Suppression douce** : chaque scan complet est traité comme un miroir — upsert/update des lignes présentes, puis `vinted_status = 'deleted'` (jamais de `DELETE` physique, préserve l'historique) sur toute ligne liée absente du scan et pas déjà `'deleted'`. Tout code lisant `listings` pour un usage Vinted doit filtrer les lignes supprimées avec `.or('vinted_status.neq.deleted,vinted_status.is.null')` — **pas** un simple `.neq('vinted_status','deleted')`, qui exclurait à tort les lignes jamais liées (`vinted_status` null, cf. sémantique NULL de PostgREST/SQL).

**Migration de données (2026-07-09)** : chaque ligne `vinted_listings` a été reprise dans `listings` (`user_id` dérivé via `vinted_accounts`, `purchase_price` laissé `null`, `status` dérivé de l'ancien statut Vinted). Colonne texte `listings.account` supprimée (morte, jamais lue par aucun code, remplacée par la vraie FK `vinted_account_id`). `vinted_listings` **renommée** `vinted_listings_deprecated_20260709` plutôt que supprimée définitivement — filet de sécurité le temps de valider en conditions réelles, à dropper pour de bon dans une migration ultérieure.

**Historique (avant la fusion) — bug de synchronisation incomplète trouvé et corrigé** : l'implémentation initiale (étape 1.3) lisait le DOM une seule fois au chargement de la page — sans jamais déclencher le défilement infini de Vinted, ni gérer le changement d'onglet Actifs/Vendus, ni écrire de statut réel. Résultat vérifié en conditions réelles : alexisdzk (40 annonces actives réelles) n'en synchronisait que 20 ; matleshop ne synchronisait que les annonces visibles au chargement, toutes mal étiquetées. **Correction** : en observant le trafic réseau du propre frontend de Vinted pendant un défilement, l'extension utilise l'API REST same-origin que Vinted appelle lui-même : `GET https://www.vinted.fr/api/v2/wardrobe/{vinted_user_id}/items?page=N&per_page=50&order=relevance` (`extension/src/content/wardrobeApi.ts`) — pas un contournement anti-bot, exactement la requête émise par la page Vinted elle-même au scroll. Pagination jusqu'à épuisement complet via `pagination.total_pages`/`total_entries` (aucune limite arbitraire). Chaque annonce porte des booléens Vinted (`is_draft`, `is_closed`, `is_reserved`, `is_hidden`, `is_processing`) normalisés en `vinted_status` (`sold_pending`/`is_processing` jamais observé à `true` en conditions réelles, conservé au cas où). `brand`/`size` sont des champs texte simples côté API Vinted, `size` peut être une chaîne vide (traitée comme `null`).

Validé en conditions réelles sur les deux comptes de test, avant et après la fusion : alexisdzk 40 online + 1 reserved + 3 sold_completed = 44 ; matleshop 4 online + 10 sold_completed = 14 (+ 1 ligne de test simulée `deleted`, non destructive) — comptes exacts confirmés par l'utilisateur. Resynchronisation vérifiée idempotente après la fusion (aucun doublon créé), auto-comptabilité vérifiée (statut `vendu` correctement propagé sur les ventes détectées).

### Synchronisation à la demande depuis `StockPage.tsx` (2026-07-09)

L'extension n'a **aucune permission `tabs`/`scripting`** aujourd'hui (`chrome.tabs` est prévu pour la republication en Phase 2, §6.1, mais pas encore implémenté) : elle ne peut ni lister les onglets ouverts, ni savoir quel compte Vinted y est connecté, ni ouvrir un onglet elle-même. Le bouton "Synchroniser maintenant" ne demande donc rien à l'extension directement — il ouvre un onglet via `window.open('https://www.vinted.fr/member/' + vinted_user_id, 'resellos_vinted_sync')` (nom de fenêtre fixe : les clics suivants réutilisent le même onglet). Le content script déjà en place détecte et synchronise automatiquement dès que la page charge. ResellOS interroge ensuite `vinted_accounts.last_synced_at` toutes les 3s pendant ~30s pour savoir si une synchro a eu lieu ; sinon, affiche une invite à vérifier que le bon compte est connecté sur Vinted. La protection contre le mauvais compte est structurelle, pas un contrôle actif : le marqueur `closet-seller-filters-active` n'apparaît que si le compte réellement connecté correspond au profil visité — sinon aucune détection n'est envoyée, donc aucune écriture, dans aucun compte.

**Piège opérationnel découvert en test live (2026-07-09)** : recharger l'extension (`chrome://extensions` → ↻) ne suffit pas pour un onglet Vinted déjà ouvert — son content script reste "orphelin", lié à l'ancienne instance de l'extension, et échoue silencieusement avec des erreurs `chrome-extension://invalid/... net::ERR_FAILED` en boucle dans la console de la page (pas dans celle du service worker, ce qui rend le diagnostic non évident). Aucune détection n'est alors jamais envoyée, sans erreur visible côté popup/service worker. **Correctif : fermer complètement l'onglet Vinted et en rouvrir un neuf après chaque rechargement de l'extension** — un simple F5 ne suffit pas toujours à réinjecter proprement le content script. À anticiper pour tout test manuel futur de l'extension.

### `listing_metric_snapshots` — historique pour le moteur d'intelligence métier (implémentée, 2026-07-09)

```sql
create table listing_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  views integer,
  favourites integer,
  price numeric,
  vinted_status text,
  captured_at timestamptz not null default now()
);
```

Journal append-only (jamais de `update`/`delete`) : chaque colonne "vivante" de `listings` (`views`, `favourites`, `price`, `vinted_status`) est écrasée à chaque synchro sans garder de trace — impossible de calculer honnêtement une tendance ("cette annonce a perdu en visibilité", "évolution dans le temps") sans un historique réel. `recordListings()` (`extension/src/background/sync.ts`) écrit un instantané pour chaque annonce synchronisée (nouvelle ou mise à jour), y compris la toute première visite — sert de point de départ aux comparaisons futures. Tant que l'historique d'une annonce est insuffisant (moins de 2 instantanés, ou moins de `MIN_TREND_INTERVAL_DAYS` entre eux), le moteur ne produit **aucun** signal de tendance pour elle plutôt que d'en fabriquer un — voir `src/lib/insights/trends.ts`.

### Nouvelle table `sync_jobs` (Phase 2+, pas encore implémentée)

File d'attente d'actions déclenchées côté web, exécutées par l'extension quand un onglet Vinted est disponible.

```sql
create table sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  type text not null,              -- 'republish' | 'sync_stats' | 'sync_inbox' (phase 2.1+)
  payload jsonb not null default '{}',
  status text not null default 'pending',  -- 'pending' | 'done' | 'failed'
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table sync_jobs enable row level security;
create policy "sync_jobs_owner" on sync_jobs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Pas de `service_role` requis : chaque job est créé par l'utilisateur pour lui-même (insert depuis l'app web), et l'extension le lit/met à jour authentifiée comme ce même utilisateur. Conséquence directe du choix d'appairage du §3 — aucun privilège élevé à distribuer.

## 6. Flux par fonctionnalité

### 6.1 Republication d'une annonce (MVP, §10)

```
StockPage.tsx (bouton « Republier ») → insert sync_jobs { type: 'republish', payload: { vinted_url } }
Background (réveillé par chrome.alarms, §7) → lit les sync_jobs pending de l'utilisateur
  → si aucun onglet vinted.fr ouvert : chrome.tabs.create({ url: vinted_url, active: false })
  → chrome.tabs.sendMessage au content script : { action: 'republish' }
  → content script clique le bouton « Réserver en avant » / renouvellement natif de Vinted
  → confirme au background → update sync_jobs.status = 'done', vinted_connection.last_synced_at = now()
  → ferme l'onglet si il a été ouvert pour l'occasion
```

### 6.2 Vues / favoris en temps réel (MVP, §10)

Périodiquement (alarm, §7), le background demande au content script (si un onglet Vinted est ouvert, sinon en ouvre un discret) de lire les compteurs vues/favoris de la page « Mes annonces » de l'utilisateur, puis met à jour `listings` avec les valeurs trouvées. Remplace l'attente d'un scan externe pour cette donnée précise — c'est une lecture, pas une action, donc plus simple et moins risqué que la republication.

### 6.3 Messages / offres (Phase 2.1, pas MVP)

Lecture seule d'abord (synchroniser la liste des messages/offres non lus vers une future table `vinted_messages`, affichée dans `VintedAccountPage.tsx`). Une réponse ou une acceptation d'offre reste **toujours déclenchée explicitement par l'utilisateur** dans ResellOS (crée un `sync_job` de type `reply_message`/`accept_offer`) — jamais d'automatisation silencieuse sur une action qui engage l'utilisateur vis-à-vis d'un acheteur (voir §8).

### 6.4 Scan de marché via session réelle (Phase 2.2, pas MVP)

`scripts/vinted-scan.ts` (Playwright, session anonyme, cron GitHub Actions) continue de tourner tel quel — ne pas le retirer. Une session authentifiée verrait potentiellement des données différentes (favoris personnels, recommandations) et serait moins susceptible d'être bridée par un anti-bot, mais faire cohabiter un scan « à la demande » (extension, un seul utilisateur) avec un scan planifié (cron, tous les utilisateurs) est un vrai sujet de conception à part entière — à traiter seulement une fois le MVP (§10) stable, pas en même temps.

## 7. Cycle de vie MV3 : pourquoi pas de Realtime Supabase

Un service worker Manifest V3 n'est **pas persistant** — Chrome le décharge après ~30 secondes d'inactivité. Une connexion websocket Supabase Realtime ouverte dans le background serait coupée en permanence, avec une logique de reconnexion à réinventer pour un gain marginal.

**Choix retenu : `chrome.alarms`**, qui réveille le service worker à intervalle régulier (ex. toutes les 10-15 minutes, configurable dans Options) même s'il a été déchargé entre-temps. À chaque réveil : lecture des `sync_jobs` pending + éventuel sync vues/favoris (§6.2). C'est du polling, pas du temps réel — assumé, cohérent avec la fréquence déjà en place pour le scan cron (4h) et largement suffisant pour republier une annonce ou rafraîchir des compteurs.

## 8. Sécurité, conformité, contrôle utilisateur

- **Jamais de contournement anti-bot.** Si Vinted présente un CAPTCHA ou bloque la session, le content script le détecte et remonte un état clair (« action requise sur Vinted ») plutôt que de tenter un bypass. C'est une limite dure, pas une optimisation à faire plus tard.
- **Lecture automatique, écriture toujours sur déclenchement explicite.** Synchroniser des compteurs (§6.2) peut tourner en tâche de fond silencieusement. Republier, répondre à un message, accepter une offre : toujours initié par un clic utilisateur dans ResellOS (crée un `sync_job`), jamais décidé par l'extension elle-même.
- **Onglets ouverts en arrière-plan** (`chrome.tabs.create({ active: false })`, §6.1) : comportement potentiellement surprenant pour l'utilisateur s'il ne s'y attend pas. Doit être une préférence explicite dans Options (« autoriser l'extension à ouvrir Vinted en arrière-plan pour exécuter mes actions » — activé par défaut mais visible et désactivable), pas un comportement caché.
- **Rate limiting côté extension** : espacer les actions automatiques (pas de rafale de republications, pas de scan de compteurs plus fréquent que nécessaire) pour rester à une fréquence d'usage humain plausible plutôt que de ressembler à un bot agressif.
- **Permissions minimales** dans `manifest.json` : `host_permissions` limité à `*://*.vinted.fr/*`, pas de `<all_urls>`. `externally_connectable` limité au domaine de prod ResellOS (§3).

## 9. Stack technique et structure de dossier proposée

Réutilise l'écosystème Vite déjà en place plutôt que d'introduire un nouvel outillage. `@crxjs/vite-plugin` gère le manifest MV3 et le rechargement à chaud en dev.

```
extension/
  package.json              paquet indépendant (pas de workspace/monorepo tooling pour l'instant)
  vite.config.ts
  manifest.config.ts         manifest MV3 généré via crxjs
  src/
    background/               [réalisé, étape 1.1]
      index.ts                  point d'entrée service worker : routeur de messages (externes + internes)
      supabaseClient.ts          storage adapter chrome.storage.local + supabaseWithToken() (client a portee de requete)
      pairing.ts                  pair/unpair/getStatus, gestion de session self-managed (voir §3)
      logger.ts                    logger leve + ring buffer persiste (50 dernieres entrees)
      retry.ts                      backoff exponentiel
    content/                   [pas encore fait, etape 1.2]
      vinted-listing.ts          republication, lecture vues/favoris (§6.1, §6.2)
      vinted-inbox.ts             messages/offres — phase 2.1, pas au MVP
      selectors.ts                 data-testid Vinted centralisés dans ce fichier (voir note ci-dessous)
    popup/                     [réalisé, étape 1.1]
      Popup.tsx                    statut connexion, journal (React, styles inline)
    options/                   [pas encore fait]
      Options.tsx                   préférences (§8)
    lib/                       [réalisé, étape 1.1]
      messages.ts                    contrat de messages partagé (types + type guards)
      env.ts                          lecture des variables Vite
```

**Duplication de types assumée** entre `src/lib/types.ts` et `extension/src/types.ts` : le projet n'a pas d'outillage monorepo (workspaces/Turborepo) et la surface commune est petite. Introduire un package partagé serait prématuré — à faire seulement si la duplication devient une vraie source de bugs.

**`selectors.ts` centralisé** : Vinted peut changer son DOM/ses `data-testid` sans préavis — c'est déjà arrivé pour `scripts/vinted-scan.ts`. Regrouper tous les sélecteurs DOM dans un seul fichier par surface de code (extension vs script Node, qui restent deux environnements d'exécution distincts et ne peuvent pas littéralement partager le même fichier) limite la casse à un seul endroit à corriger de chaque côté.

## 10. Phasage

**MVP (Phase 2.0)** — le seul objectif est de prouver que le pont fonctionne, avec le risque le plus faible possible :
1. Appairage (§3) + statut de connexion réel dans `VintedAccountPage.tsx` (remplace le placeholder actuel)
2. Republication d'une annonce (§6.1) — une seule action d'écriture, bien délimitée, valeur perçue immédiate
3. Sync vues/favoris (§6.2) — lecture seule, alimente `StatsPage.tsx` avec de vraies données plutôt que les compteurs actuels dérivés uniquement de `listings`

**Phase 2.1** — messages et offres (§6.3), en lecture seule d'abord, puis réponse/acceptation sur déclenchement explicite.

**Phase 2.2** — scan de marché via session authentifiée (§6.4), seulement une fois le MVP stable en production.

Ne pas paralléliser ces phases — chacune dépend de la précédente pour la confiance dans le mécanisme d'appairage et la file `sync_jobs`.

## 11. Ce que ça change dans le code existant

- `VintedAccountPage.tsx` : le placeholder « Extension Chrome non connectée » est remplacé par un vrai statut lu depuis `vinted_accounts`, plus le bouton d'appairage (§3) et la liste des annonces synchronisées (`listings` filtrée par `vinted_account_id`, depuis la fusion du 2026-07-09) — **fait, étapes 1.1/1.2/1.3 + Phase A + fusion**
- `src/lib/extensionBridge.ts` (nouveau) : encapsule `chrome.runtime.sendMessage` vers l'extension (PING/PAIR) depuis l'app web — **fait, étape 1.1**
- `DashboardHome.tsx` : le bloc "Synchronisation Vinted" reflète l'état réel (connecté/pseudo/nombre d'annonces/dernière synchro), et la requête `listings` principale respecte désormais le compte sélectionné — **fait, étape 1.3 + Phase A + fusion**
- `SettingsPage.tsx` (onglet "Comptes Vinted") : l'ancien `useAccounts`/table `accounts` (carnet d'étiquettes mort) est supprimé — remplacé en Phase A par un état honnête "gestion complète bientôt disponible", puis par la gestion complète en Phase B (liste, renommage inline, compte par défaut via `set_default_vinted_account`, suppression avec confirmation) — **fait, Phase A puis B**
- `AccountSwitcher.tsx`/`AccountAvatar.tsx`/`VintedAccountFilterContext.tsx` (nouveaux, `src/components/ui/` et `src/contexts/`) : sélecteur de compte dans la sidebar, avatars à initiales colorées déterministes par compte, état de filtre partagé (`selectedAccountId: string | 'all'`) persisté en `localStorage` — **fait, Phase B**
- `StockPage.tsx`, `AccountingPage.tsx`, `StatsPage.tsx` : rattachés à `vinted_account_id` via `useVintedAccountFilter()` — **fait, fusion du 2026-07-09**. `GeneratorPage.tsx`/`ExpensesPage.tsx` restent hors scope (le Générateur ne demande pas de compte à la création, `expenses` attend toujours son `vinted_account_id` nullable — amélioration future)
- `StockPage.tsx` (bouton « Republier », à ajouter) : créera un `sync_job` plutôt que d'appeler Supabase directement — Phase 2
- Aucun changement à `scripts/vinted-scan.ts` ni au cron GitHub Actions (§6.4)

## 12. Risques et inconnues ouvertes

- **Détection anti-bot Vinted côté extension** : une session authentifiée automatisée n'est pas nécessairement moins détectable qu'un scraping anonyme — hypothèse à valider en pratique dès le MVP, pas garantie par design
- **Publication sur le Chrome Web Store** : revue manuelle par Google, délai incertain, et les permissions `host_permissions`/`externally_connectable` de cette conception seront scrutées — prévoir une justification claire de chaque permission dans la fiche du store
- **Fragilité aux changements de DOM Vinted** : déjà un risque connu pour le scan existant (§9), qui s'étend maintenant aux actions d'écriture (republication) — une casse silencieuse y est plus grave qu'un scan qui retourne juste moins de résultats
- **Fréquence des `chrome.alarms`** à calibrer en pratique : trop fréquent = usage ressource/risque de détection, trop rare = latence perçue entre un clic dans ResellOS et son exécution réelle sur Vinted
