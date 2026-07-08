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

- **Phase E — Multi-marketplace + extension Chrome (préparation)** : colonne `marketplace` sur `listings`, table `marketplace_connections`, interface `MarketplaceConnector` (Vinted en implémentation, autres en stub). Pas commencé.
- Décider du sort de `business_items` (53 lignes de données réelles orphelines) / `business_expenses` (vide) — voir [DATABASE.md](DATABASE.md)
- Bucket storage `listing-images` : policy publique trop permissive (liste tous les fichiers)
- Policies RLS dupliquées sur `profiles`/`listings`/`market_opportunities` (redondantes, pas dangereuses, coût perf mineur)
- Protection mots de passe compromis (HaveIBeenPwned) désactivée côté Supabase Auth — à activer depuis le dashboard
- Pattern `auth.uid()` non optimisé dans les policies RLS (`(select auth.uid())` recommandé par Supabase pour éviter la ré-évaluation par ligne) — pas urgent au volume actuel
- Migration des pages restantes (`StockPage`, `SettingsPage`, etc.) vers les classes déjà prêtes dans `src/index.css` (`.btn-neon`, `.glass-card`, `.input-dark`) plutôt que du Tailwind brut dupliqué
- `SubscriptionPage.tsx` reste une UI statique sans Stripe — pas un bug, juste un chantier à part entière si la facturation devient prioritaire

## Phase 2 — Extension Chrome — pas commencée

Vinted n'a pas d'API publique : publier/republier une annonce, gérer les messages/offres depuis ResellOS nécessite une extension Chrome qui agit dans le contexte authentifié du navigateur de l'utilisateur sur vinted.fr. Prérequis côté backend : la Phase E ci-dessus (colonne `marketplace`, table de connexions marketplace) avant de coder l'extension elle-même.

## Phase 3 — Sourcing intelligent, comptabilité fiscale — pas commencée

Étude de marché automatisée plus poussée, comptabilité fiscale adaptée au régime de vente d'occasion (TVA sur la marge, déclarations URSSAF pour les vendeurs pro).
