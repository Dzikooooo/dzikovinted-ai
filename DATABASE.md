# Base de données

Postgres via Supabase. Schéma versionné dans `supabase/migrations/`, appliqué via `npx supabase db push` (voir [README.md](README.md)).

## ⚠️ Piège connu : dérive schéma réel ↔ migrations versionnées

Plusieurs changements de schéma en prod (des policies RLS notamment) ont été appliqués hors du flux `supabase db push` — probablement collés directement dans le SQL Editor du dashboard — et n'apparaissaient donc dans aucune migration du repo. Deux conséquences rencontrées en juillet 2026 :

1. **L'historique de migration de la CLI était désynchronisé.** `supabase db push` essayait de rejouer une migration déjà appliquée en prod (colonnes/tables `if not exists`, donc inoffensif) jusqu'à tomber sur un `create policy` sans garde, qui plantait tout le push. Fix : `supabase migration repair --status applied <version>` pour resynchroniser l'historique avant de repush.
2. **Des policies RLS non versionnées ont été trouvées en auditant la prod** (`supabase db query --linked "SELECT * FROM pg_policies WHERE ..."`) qui n'existaient dans aucun fichier de migration — dont une policy `ALL` pour le rôle `anon` sur `market_opportunities` (n'importe qui pouvait écrire/supprimer sans être connecté). Voir plus bas.

**Leçon : ne jamais modifier le schéma de prod directement dans le dashboard.** Toujours passer par une migration versionnée + `db push`, même pour un changement d'une ligne. Si un doute existe sur l'état réel de la prod, vérifier avec `npx supabase db query --linked "..."` (lecture seule, sûr) plutôt que de faire confiance aux fichiers de migration seuls.

## Tables

| Table | Rôle | RLS |
|---|---|---|
| `profiles` | Profil utilisateur (plan, crédits) | `auth.uid() = id`, CRUD complet |
| `listings` | Annonces générées/en stock/vendues. **Fusionnée avec l'ancienne `vinted_listings` (2026-07-09)** : source de vérité unique pour un article, qu'il vienne du Générateur ou d'une synchro Vinted. Colonnes Vinted ajoutées : `vinted_account_id` (nullable — `null` = brouillon jamais publié), `vinted_item_id`, `vinted_url`, `vinted_status` (`online`/`reserved`/`sold_pending`/`sold_completed`/`draft`/`hidden`/`deleted`/`unknown`, distinct de `status` qui reste le statut workflow ResellOS), `brand`, `size`, `favourites`, `views`, `synced_at`. Index partiel unique `(vinted_account_id, vinted_item_id) where vinted_item_id is not null`. Colonne texte morte `account` supprimée. `vinted_status = 'deleted'` est une suppression douce — toute lecture doit exclure ces lignes avec `.or('vinted_status.neq.deleted,vinted_status.is.null')` (pas un simple `.neq`, qui exclurait aussi les lignes jamais liées à Vinted). Voir `EXTENSION.md` §5 pour les règles de propriété des champs (quels champs la synchro peut réécrire) et l'auto-comptabilité sur vente détectée | `auth.uid() = user_id`, CRUD complet |
| `usage` | Compteur d'analyses IA par mois, alimenté par le RPC `increment_usage` | `auth.uid() = user_id`, CRUD complet |
| `subscriptions` | Scaffolding pour un futur abonnement Stripe — **pas encore utilisée**, `SubscriptionPage.tsx` n'a aucune intégration Stripe réelle | `auth.uid() = user_id`, CRUD complet |
| `expenses` | Dépenses de l'activité (emballage, port...) | `auth.uid() = user_id`, CRUD complet |
| `vinted_accounts` | **Entité centrale** (2026-07-09) : les comptes Vinted réels de l'utilisateur, un par compte détecté par l'extension (principal, secondaire, boutique...). Remplace `accounts` (carnet d'étiquettes mort, supprimé) et `vinted_connection` (limité à un seul compte, supprimée). Une ligne ne peut être créée que par détection réelle de l'extension, jamais manuellement — voir `EXTENSION.md` §5. Index partiel `unique (user_id) where is_default` (Phase B) : un seul compte par défaut par utilisateur, changé via la RPC `set_default_vinted_account` | `auth.uid() = user_id`, CRUD complet |
| `vinted_listings_deprecated_20260709` | **Dépréciée** (2026-07-09) : ancienne table miroir des annonces Vinted, renommée (pas droppée) après la fusion de ses données dans `listings`. Filet de sécurité temporaire, à supprimer pour de bon une fois la fusion confirmée stable en conditions réelles | RLS d'origine conservée telle quelle |
| `listing_metric_snapshots` | **Historique pour le moteur d'intelligence métier** (2026-07-09) : journal append-only (`views`/`favourites`/`price`/`vinted_status` + `captured_at`), un instantané par annonce à chaque synchro. Permet de calculer des tendances réelles (perte de visibilité) sans jamais en fabriquer une faute d'historique suffisant — voir `EXTENSION.md` §5 et `src/lib/insights/trends.ts` | `auth.uid() = user_id` via `listing_id in (select id from listings where user_id = auth.uid())`, select+insert seulement (pas de update/delete, c'est un journal) |
| `watchlist` | Recherches Vinted à scanner (brand/model/seuils profit-roi) | Lecture authenticated + anon, écriture `service_role` only |
| `market_opportunities` | Résultats du scanner, ré-écrite en entier à chaque `npm run scan` | Lecture authenticated + anon, écriture `service_role` only |
| `business_items` | **Orpheline.** Reliquat de l'ancien module BusinessOS (supprimé du code avant l'audit de juillet 2026) — **contient encore 53 lignes de données réelles**, jamais migrées vers `listings`/`expenses`. À trancher : migrer les données puis dropper, ou dropper directement si sans valeur. | RLS activé, CRUD complet — mais plus aucun code n'y touche |
| `business_expenses` | Orpheline elle aussi, vide (0 ligne) | RLS activé, CRUD complet, inutilisée |

## RPC (fonctions SECURITY DEFINER)

| Fonction | Rôle | Accès |
|---|---|---|
| `increment_usage(p_user_id, p_month)` | Incrémente le compteur d'analyses du mois | `authenticated` uniquement, vérifie `auth.uid() = p_user_id` en interne |
| `decrement_credit(p_user_id)` | Décrémente les crédits IA restants | `authenticated` uniquement, vérifie `auth.uid() = p_user_id` en interne |
| `set_default_vinted_account(target_account_id)` | **Phase B multi-comptes** (2026-07-09) : bascule le compte Vinted par défaut de l'utilisateur de façon atomique (désactive l'ancien, active le nouveau dans la même transaction). Un index partiel `unique (user_id) where is_default` sur `vinted_accounts` garantit qu'un seul compte par défaut peut exister même en cas d'appel concurrent. | `authenticated` uniquement, vérifie que le compte cible appartient à `auth.uid()` en interne |
| `handle_new_user()` | Trigger sur `auth.users`, crée le profil à l'inscription | Trigger uniquement, aucun accès RPC direct |

`decrement_credit`/`increment_usage` étaient à l'origine appelables par le rôle `anon` **sans aucune vérification d'identité** — n'importe qui, non connecté, pouvait vider les crédits de n'importe quel utilisateur en boucle en devinant/énumérant des UUID. Corrigé en juillet 2026 (migration `20260708143000_secure_credit_rpcs.sql`) : accès restreint à `authenticated`, vérification `auth.uid() = p_user_id` ajoutée dans le corps des deux fonctions, `search_path` fixé (bonne pratique Postgres pour les fonctions `SECURITY DEFINER`).

## Storage

Bucket `listing-images` (photos des annonces). Une policy publique permet actuellement de **lister** tous les fichiers du bucket (pas juste d'y accéder par URL connue), signalé par `supabase db advisors` — pas corrigé à ce jour, à revoir si des photos ne devraient pas être énumérables publiquement.

## Vérifier l'état réel de la prod

```bash
npx supabase link --project-ref <ref>
npx supabase db query --linked "SELECT * FROM pg_policies WHERE tablename = '...';"
npx supabase db advisors --linked --type all   # audit securite/perf integre Supabase
```

`db advisors` a été la source de la plupart des trouvailles de sécurité de juillet 2026 (RLS manquantes, fonctions sans `search_path`, policies dupliquées, bucket storage trop permissif). À relancer périodiquement, surtout après tout ajout de table ou de RPC.
