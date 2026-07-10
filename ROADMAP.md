# Roadmap

## Phase 1 — Scanner + UI de base — ✅ terminée

- Scraper Vinted réel (Playwright, contourne l'absence d'API publique) branché sur un cron GitHub Actions toutes les 4h
- Moteur de prix basé sur la médiane des annonces comparables (eBay essayé, bloque systématiquement le scraping automatisé)
- UI pour `expenses`/`accounts` (existaient en base sans écran)

## Audit technique complet — juillet 2026 — ✅ terminé (phases A à D)

Revue approfondie avant d'attaquer l'extension Chrome. Détail dans l'historique git, résumé :

- **Phase A (sécurité)** : 2 failles critiques corrigées — écriture publique non protégée sur `market_opportunities`, RPC crédits exploitables par n'importe qui non connecté. Voir [DATABASE.md](DATABASE.md).
- **Phase B (bugs produit)** : suppression de `NewItemPage` (cul-de-sac cassé créant des brouillons orphelins) et `Market.tsx` (chiffres 100% inventés, doublon d'`Opportunities.tsx`).
- **Phase C (design system)** : couleurs de marque unifiées (reliquat vert du rebranding DzikoVinted → ResellOS éliminé), migration vers les tokens Tailwind (`neon-*`, `dark-*`, `surface`), titre/favicon corrigés, colonne `is_favorite` manquante ajoutée (cassait silencieusement le compteur de favoris).
- **Phase D (structure du code)** : plus aucun `any` dans `src/`, composants dupliqués (`StatCard`) extraits, `GeneratorPage.tsx`/`LandingPage.tsx` découpés (697/700 lignes → sous-composants focalisés).

### Reste de l'audit — pas encore fait

- **Phase E — révisée deux fois** : l'idée initiale (colonne `marketplace` générique, table `marketplace_connections`, interface `MarketplaceConnector`) a été abandonnée au profit d'une conception Vinted-only cohérente avec la portée confirmée du projet. Une deuxième idée (étendre la table `accounts` existante) a aussi été abandonnée à l'implémentation : `accounts` s'est révélée être un carnet d'étiquettes hérité de BusinessOS, jamais câblé nulle part — mauvais point d'ancrage pour une identité Vinted réelle. **Décision finale, implémentée** : nouvelle table dédiée `vinted_accounts`, entité centrale du produit, voir [EXTENSION.md](EXTENSION.md) §5.
- Décider du sort de `business_items` (53 lignes de données réelles orphelines) / `business_expenses` (vide) — voir [DATABASE.md](DATABASE.md)
- Bucket storage `listing-images` : policy publique trop permissive (liste tous les fichiers)
- Policies RLS dupliquées sur `profiles`/`listings`/`market_opportunities` (redondantes, pas dangereuses, coût perf mineur)
- Protection mots de passe compromis (HaveIBeenPwned) désactivée côté Supabase Auth — à activer depuis le dashboard
- Pattern `auth.uid()` non optimisé dans les policies RLS (`(select auth.uid())` recommandé par Supabase pour éviter la ré-évaluation par ligne) — pas urgent au volume actuel
- Migration des pages restantes (`StockPage`, `SettingsPage`, etc.) vers les classes déjà prêtes dans `src/index.css` (`.btn-neon`, `.glass-card`, `.input-dark`) plutôt que du Tailwind brut dupliqué
- `SubscriptionPage.tsx` reste une UI statique sans Stripe — pas un bug, juste un chantier à part entière si la facturation devient prioritaire

## Phase 2 — Extension Chrome — Phase 1 (mono-compte) terminée, refonte multi-comptes en cours

Vinted n'a pas d'API publique : publier/republier une annonce, gérer les messages/offres depuis ResellOS nécessite une extension Chrome qui agit dans le contexte authentifié du navigateur de l'utilisateur sur vinted.fr. Architecture complète (composants, appairage, modèle de données, phasage MVP/2.1/2.2, sécurité) dans [EXTENSION.md](EXTENSION.md).

- **Étape 1.1 (scaffold + appairage)** : ✅ codée et validée en conditions réelles. Deux bugs réels trouvés et corrigés en test live — détail dans EXTENSION.md §3.
- **Étape 1.2 (détection de compte Vinted)** : ✅ codée et validée avec un compte réel, y compris un test négatif (pas de fausse détection sur le profil d'un autre utilisateur).
- **Étape 1.3 (synchronisation des annonces)** : ✅ codée et validée initialement — 20 annonces réelles synchronisées, données vérifiées (titre/prix/vues/favoris), pas de duplication sur re-synchronisation. **Synchronisation incomplète découverte et corrigée le 2026-07-09** (remontée par l'utilisateur en validant la Phase B) : la lecture DOM ne captait que le premier lot chargé par le défilement infini de Vinted, et aucun statut réel n'était distingué. Remplacée par l'API `wardrobe/items` paginée de Vinted lui-même, avec statuts réels et miroir complet (suppressions détectées) — détail dans EXTENSION.md §5.

### Refonte multi-comptes Vinted (demande explicite de l'utilisateur, "Compte Vinted" devient l'entité centrale du produit)

- **Phase A (fondation schéma)** : ✅ `vinted_accounts` remplace `vinted_connection` (limitée à un seul compte) et `accounts` (carnet d'étiquettes mort, supprimé). Migration testée sans perte de données (1 compte + 20 annonces migrés), aucune régression visible sur le flux existant. Détail complet, y compris les décisions de RLS, dans EXTENSION.md §5.
- **Phase B (interface multi-comptes)** : ✅ codée et **validée en conditions réelles avec deux comptes** (`alexisdzk`, `matleshop`) — sélecteur de compte premium dans la sidebar (`AccountSwitcher`, panneau `.glass-card`, recherche au-delà de 6 comptes), gestion complète dans Paramètres > Comptes Vinted (renommage inline, définir par défaut via la RPC `set_default_vinted_account`, suppression avec confirmation), avatars à initiales colorées déterministes (`AccountAvatar`), état de filtre partagé (`VintedAccountFilterContext`, persisté en `localStorage`). Dashboard, page Compte Vinted et Stock fonctionnent dans les deux modes (vue globale agrégée vs vue filtrée par compte).
- **Stock fiabilisé par compte (2026-07-09)** : ✅ miroir complet et account-first (compteurs en ligne/réservées/ventes en cours/ventes finalisées, valeur du stock, filtres par statut, synchronisation à la demande sans nouvelle permission Chrome). Taxonomie de statut stable (`online`/`reserved`/`sold_pending`/`sold_completed`/`draft`/`hidden`/`deleted`/`unknown`), suppression douce (annonces disparues marquées `deleted`, jamais effacées). Validé en conditions réelles sur les deux comptes de test après un vrai debug live (token d'appairage expiré, puis content scripts orphelins sur des onglets Vinted restés ouverts pendant les rechargements d'extension — piège opérationnel documenté dans EXTENSION.md §5).
- **Fusion `listings` ↔ `vinted_listings` (2026-07-09)** : ✅ demande explicite de l'utilisateur pour supprimer la séparation entre Stock ResellOS et annonces Vinted synchronisées — `listings` devient l'unique source de vérité (une annonce Vinted synchronisée EST la même ligne que l'article ResellOS). Fusion automatique pour le nouveau uniquement (les brouillons Générateur pré-existants, jamais publiés, restent séparés faute d'identifiant commun — lien manuel différé). Auto-comptabilité sur vente détectée (`status='vendu'`, `sold_price` pré-rempli, jamais d'écrasement d'une saisie manuelle). CA/bénéfice/ROI calculés uniquement sur les lignes au prix d'achat connu (jamais de chiffre fabriqué). `StockPage.tsx` redevient une vue unique (l'onglet "Vinted" séparé, introduit une itération plus tôt, est retiré). `AccountingPage`/`StatsPage`/`DashboardHome` rattachés au compte Vinted actif. Validé en conditions réelles : migration sans perte (alexisdzk 44, matleshop 15 lignes), resynchronisation vérifiée idempotente (aucun doublon), auto-comptabilité vérifiée sur les ventes détectées. `vinted_listings` renommée `vinted_listings_deprecated_20260709` (pas droppée, filet de sécurité temporaire).
- **Reste hors scope** : lien manuel entre un brouillon Générateur pré-existant et son annonce Vinted réelle une fois publiée ; `vinted_account_id` sur `expenses` (nullable, dépenses globales possibles) ; futures tables Messages/Offres/Favoris/Notifications conçues account-first dès le départ.

## Roadmap produit à 8 phases (communiquée par l'utilisateur, 2026-07-09)

⚠️ Numérotation distincte des sections "Phase 1/2/3" ci-dessus (qui suivent l'historique technique du projet) et du phasage interne de [EXTENSION.md](EXTENSION.md) §10 (capacités d'écriture de l'extension). Celle-ci est la trajectoire produit voulue par l'utilisateur pour transformer ResellOS en copilote du revendeur Vinted :

1. **Lecture** — ✅ terminée : extension, synchro, multi-comptes, Dashboard/Stock/Comptabilité/Statistiques, `listings` comme source unique de vérité, synchro ventes/statuts.
2. **Intelligence métier** — ✅ terminée (2026-07-09) : moteur `src/lib/insights/` (scores, recommandations, alertes, priorités du jour, narrations Dashboard), table d'historique `listing_metric_snapshots` pour les signaux de tendance. Détail architecture dans [ARCHITECTURE.md](ARCHITECTURE.md) §4.5, schéma dans [DATABASE.md](DATABASE.md). Hors scope explicite de cette phase, documenté volontairement plutôt que caché : pas de centre d'alertes dédié (les alertes remontent via Dashboard + badges Stock uniquement) ; signaux de tendance inertes tant que l'historique de snapshots est insuffisant ; aucune action d'écriture sur Vinted.
3. **Écriture sur Vinted** — **groundwork terminé le 2026-07-10, première action réelle codée le 2026-07-10.** L'utilisateur a d'abord demandé un **Action Engine** : couche d'abstraction unique par laquelle passent toutes les actions (publier, republier, modifier une annonce/un prix/des photos, répondre à un message, accepter une offre, contre-offrir, supprimer, mettre en pause, réactiver), avec un cycle identique pour chacune (vérifications → préparation → validation utilisateur explicite → exécution via l'extension → résultat → resynchronisation → historique) et un **registre de handlers**, pas un fichier par action. Livré : `src/lib/actions/` (moteur générique, tests Vitest complets), canal `RUN_ACTION` (app → extension) + port `action-progress` (progression en direct), table `action_log` (historique complet : qui/quoi/quand/quel compte/quelle annonce/résultat/durée) qui remplace la conception `sync_jobs` jamais implémentée. Détail architecture dans [ARCHITECTURE.md](ARCHITECTURE.md) §4.6, canal extension dans [EXTENSION.md](EXTENSION.md) §5/§6.0. Sous-phases (chacune ajoute une entrée `ActionDefinition` au registre existant, jamais une nouvelle architecture) :
   - 3.1 **Publication** — ✅ codée le 2026-07-10 (`publish_listing` : sélecteurs DOM vérifiés en direct sur `vinted.fr/items/new`, écran de confirmation + progression en direct, gestion de 6 scénarios d'erreur, resynchronisation de `listings` sur succès). Vérifiée par typecheck/lint/build/test des deux paquets (app + extension). **Non encore validée en conditions réelles** — aucune annonce n'a encore été réellement publiée sur Vinted, voir protocole de test live ci-dessous
   - 3.2 **Modification** — pas commencée
   - 3.3 **Republication** — pas commencée, suivra exactement le pattern de 3.1
   - 3.4 **Messages** — pas commencée
   - 3.5 **Offres** — pas commencée
   - 3.6 **Notifications** — pas commencée
   - 3.7 **Automatisations assistées** — pas commencée

   **Protocole de test live de `publish_listing` (à faire avant tout usage en production)** : (a) vérifier que le pipeline s'exécute jusqu'au remplissage complet du formulaire et à l'activation du bouton "Ajouter" sur un compte Vinted réel, **sans jamais cliquer dessus** — valide résolution de catégorie/attributs/import photo en conditions réelles ; (b) **uniquement après accord explicite séparé de l'utilisateur à ce moment précis**, premier clic réel sur "Ajouter" avec une annonce de test que l'utilisateur accepte de publier (et potentiellement supprimer ensuite) sur son compte Vinted réel.
4. **Republication** — pas commencée : moteur de republication piloté par les recommandations produites en Phase 2 (ex. "12 annonces prioritaires à republier"), validation utilisateur puis exécution par l'extension, via l'Action Engine (Phase 3).
5. **Messages** — pas commencée : conversations Vinted visibles dans ResellOS, réponses proposées, jamais envoyées automatiquement.
6. **Offres** — pas commencée : recevoir/accepter/refuser/contre-proposer, toujours validé par l'utilisateur.
7. **Notifications** — pas commencée : nouveau favori/offre/message/vente/réservation, perte de visibilité, annonce inactive, republication recommandée.
8. **Automatisations assistées** — pas commencée : détection + proposition d'action, jamais d'action silencieuse.

## Phase 3 — Sourcing intelligent, comptabilité fiscale — pas commencée

Étude de marché automatisée plus poussée, comptabilité fiscale adaptée au régime de vente d'occasion (TVA sur la marge, déclarations URSSAF pour les vendeurs pro).
