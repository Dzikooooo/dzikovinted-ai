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
- **Étape 1.3 (synchronisation des annonces)** : ✅ codée et validée — 20 annonces réelles synchronisées, données vérifiées (titre/prix/vues/favoris), pas de duplication sur re-synchronisation.

### Refonte multi-comptes Vinted (demande explicite de l'utilisateur, "Compte Vinted" devient l'entité centrale du produit)

- **Phase A (fondation schéma)** : ✅ `vinted_accounts` remplace `vinted_connection` (limitée à un seul compte) et `accounts` (carnet d'étiquettes mort, supprimé). Migration testée sans perte de données (1 compte + 20 annonces migrés), aucune régression visible sur le flux existant. Détail complet, y compris les décisions de RLS, dans EXTENSION.md §5.
- **Phase B (interface multi-comptes)** : pas commencée — sélecteur de compte, gestion/renommage dans Paramètres, Dashboard global vs par compte.
- **Phase C (rattachement des données métier)** : pas commencée — `vinted_account_id` sur `listings`, `expenses` (nullable, dépenses globales possibles), mise à jour de Stock/Comptabilité/Statistiques/Générateur/Scanner, et futures tables Messages/Offres/Favoris/Notifications conçues account-first dès le départ.
- **Limite de test connue** : un seul compte Vinted réel disponible pour les tests (`alexisdzk`) — valider un vrai deuxième compte (Phase B) nécessitera une connexion à un second compte Vinted dans le navigateur de test.

## Phase 3 — Sourcing intelligent, comptabilité fiscale — pas commencée

Étude de marché automatisée plus poussée, comptabilité fiscale adaptée au régime de vente d'occasion (TVA sur la marge, déclarations URSSAF pour les vendeurs pro).
