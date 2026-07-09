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

- **Phase E — révisée** : l'idée initiale (colonne `marketplace` générique, table `marketplace_connections`, interface `MarketplaceConnector`) a été abandonnée au profit d'une conception Vinted-only cohérente avec la portée confirmée du projet — voir [EXTENSION.md](EXTENSION.md) pour l'architecture retenue (extension de `accounts`, file `sync_jobs`, pas d'abstraction multi-marketplace).
- Décider du sort de `business_items` (53 lignes de données réelles orphelines) / `business_expenses` (vide) — voir [DATABASE.md](DATABASE.md)
- Bucket storage `listing-images` : policy publique trop permissive (liste tous les fichiers)
- Policies RLS dupliquées sur `profiles`/`listings`/`market_opportunities` (redondantes, pas dangereuses, coût perf mineur)
- Protection mots de passe compromis (HaveIBeenPwned) désactivée côté Supabase Auth — à activer depuis le dashboard
- Pattern `auth.uid()` non optimisé dans les policies RLS (`(select auth.uid())` recommandé par Supabase pour éviter la ré-évaluation par ligne) — pas urgent au volume actuel
- Migration des pages restantes (`StockPage`, `SettingsPage`, etc.) vers les classes déjà prêtes dans `src/index.css` (`.btn-neon`, `.glass-card`, `.input-dark`) plutôt que du Tailwind brut dupliqué
- `SubscriptionPage.tsx` reste une UI statique sans Stripe — pas un bug, juste un chantier à part entière si la facturation devient prioritaire

## Phase 2 — Extension Chrome — étape 1.1 validée en direct

Vinted n'a pas d'API publique : publier/republier une annonce, gérer les messages/offres depuis ResellOS nécessite une extension Chrome qui agit dans le contexte authentifié du navigateur de l'utilisateur sur vinted.fr. Architecture complète (composants, appairage, modèle de données, phasage MVP/2.1/2.2, sécurité) dans [EXTENSION.md](EXTENSION.md).

- **Étape 1.1 (scaffold + appairage)** : ✅ codée et validée en conditions réelles (navigateur Chrome connecté, extension chargée non empaquetée, cycle appairage/dissociation/ré-appairage rejoué avec succès). Deux bugs réels trouvés et corrigés en test live — détail dans EXTENSION.md §3.
- **Étape 1.2 (détection de compte Vinted)** et **1.3 (sync des annonces)** : pas commencées — nécessitent d'observer le DOM réel de vinted.fr connecté avant d'écrire les sélecteurs des content scripts.

## Phase 3 — Sourcing intelligent, comptabilité fiscale — pas commencée

Étude de marché automatisée plus poussée, comptabilité fiscale adaptée au régime de vente d'occasion (TVA sur la marge, déclarations URSSAF pour les vendeurs pro).
