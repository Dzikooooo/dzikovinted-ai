# Extension Chrome — Architecture

Document de conception de l'extension Chrome ResellOS. Voir [ARCHITECTURE.md](ARCHITECTURE.md) §8 pour comment ce document s'articule avec le reste du projet, et [ROADMAP.md](ROADMAP.md) Phase 2 pour le séquençage global.

**État d'implémentation** : la Phase 1 complète (1.1 appairage, 1.2 détection du compte, 1.3 synchronisation des annonces) est codée **et validée en conditions réelles** (extension chargée non empaquetée, navigateur Chrome connecté, compte Vinted réel, 20 annonces réelles synchronisées avec succès). La refonte multi-comptes est ensuite lancée : **Phase A (fondation schéma `vinted_accounts`) faite et validée**, sans régression visible. Phases B (interface multi-comptes) et C (rattachement des données métier — Stock, Comptabilité, Statistiques, Générateur, Dépenses...) à venir — voir `ROADMAP.md`. Plusieurs décisions ci-dessous ont été révisées par rapport à la conception initiale, certaines après vérification directe du schéma existant, une après un bug réel découvert en test live (§3) — marquées explicitement.

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

Pour les tables strictement rattachées à un seul compte Vinted (`vinted_listings`, futures `vinted_messages`/`vinted_offers`/`vinted_notifications`), **pas de `user_id` dupliqué** : la RLS dérive la propriété uniquement via `vinted_account_id` :

```sql
using (vinted_account_id in (select id from vinted_accounts where user_id = auth.uid()))
```

Écart assumé par rapport à la convention utilisée partout ailleurs dans le schéma (`auth.uid() = user_id` direct) — justifié par l'exigence explicite de l'utilisateur ("aucune fuite de données possible") : avec `user_id` dupliqué en plus de `vinted_account_id`, rien n'empêcherait techniquement qu'une ligne ait un `user_id` correct mais un `vinted_account_id` appartenant à un autre utilisateur. En supprimant `user_id` de ces tables, `vinted_account_id` devient l'unique source de vérité de propriété.

**`expenses` reste une exception assumée** (décision produit) : garde son `user_id` (dépenses globales possibles, ex. abonnement logiciel) et reçoit un `vinted_account_id` **nullable** (dépense optionnellement rattachée à un compte précis) — sujet de la Phase C, pas encore implémenté.

### `vinted_listings` (implémentée, étape 1.3 puis migrée en Phase A)

Les annonces synchronisées depuis Vinted ne vont **pas** dans la table `listings` existante : `listings` modélise des annonces *créées dans ResellOS* (générées par IA, avec prix d'achat/frais/statut de vente — des champs qu'une annonce Vinted brute scrapée n'a pas). `vinted_listings` est un miroir en lecture seule de ce qui est réellement en ligne sur Vinted (`vinted_account_id`, `vinted_item_id`, `title`, `price`, `image_url`, `vinted_url`, `status` fixé à `'actif'` pour ce MVP, `favourites`, `views`), réécrit (upsert sur `(vinted_account_id, vinted_item_id)`) à chaque visite du profil. Validé avec 20 annonces réelles migrées sans perte lors du passage à `vinted_account_id`, aucun doublon après plusieurs synchronisations successives.

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

- `VintedAccountPage.tsx` : le placeholder « Extension Chrome non connectée » est remplacé par un vrai statut lu depuis `vinted_accounts` (le compte par défaut, Phase A), plus le bouton d'appairage (§3) et la liste des `vinted_listings` synchronisées (titre, prix, vues, favoris) — **fait, étapes 1.1/1.2/1.3 + Phase A**
- `src/lib/extensionBridge.ts` (nouveau) : encapsule `chrome.runtime.sendMessage` vers l'extension (PING/PAIR) depuis l'app web — **fait, étape 1.1**
- `DashboardHome.tsx` : le bloc "Synchronisation Vinted" reflète l'état réel (connecté/pseudo/nombre d'annonces/dernière synchro) une fois `vinted_accounts.connected = true` — **fait, étape 1.3 + Phase A**
- `SettingsPage.tsx` (onglet "Comptes Vinted") : l'ancien `useAccounts`/table `accounts` (carnet d'étiquettes mort) est supprimé — remplacé par un état honnête "gestion complète bientôt disponible" en attendant la Phase B (sélection/renommage/multi-comptes) — **fait, Phase A**
- `StockPage.tsx`, `AccountingPage.tsx`, `StatsPage.tsx`, `GeneratorPage.tsx`, `ExpensesPage.tsx` : pas encore rattachés à `vinted_account_id` — Phase C de la refonte multi-comptes, pas dans ce document
- `StockPage.tsx` (bouton « Republier », à ajouter) : créera un `sync_job` plutôt que d'appeler Supabase directement — Phase 2
- Aucun changement à `scripts/vinted-scan.ts` ni au cron GitHub Actions (§6.4)

## 12. Risques et inconnues ouvertes

- **Détection anti-bot Vinted côté extension** : une session authentifiée automatisée n'est pas nécessairement moins détectable qu'un scraping anonyme — hypothèse à valider en pratique dès le MVP, pas garantie par design
- **Publication sur le Chrome Web Store** : revue manuelle par Google, délai incertain, et les permissions `host_permissions`/`externally_connectable` de cette conception seront scrutées — prévoir une justification claire de chaque permission dans la fiche du store
- **Fragilité aux changements de DOM Vinted** : déjà un risque connu pour le scan existant (§9), qui s'étend maintenant aux actions d'écriture (republication) — une casse silencieuse y est plus grave qu'un scan qui retourne juste moins de résultats
- **Fréquence des `chrome.alarms`** à calibrer en pratique : trop fréquent = usage ressource/risque de détection, trop rare = latence perçue entre un clic dans ResellOS et son exécution réelle sur Vinted
