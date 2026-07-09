# Architecture — ResellOS

Document de référence unique pour reprendre le projet sans contexte perdu. Pour le détail du schéma de base de données, voir [DATABASE.md](DATABASE.md) ; pour l'état d'avancement et l'historique des audits, voir [ROADMAP.md](ROADMAP.md) ; pour le démarrage rapide, voir [README.md](README.md). Ce document ne duplique pas ce qui est déjà détaillé ailleurs — il y renvoie.

## 1. Vue d'ensemble

ResellOS est un SaaS mono-marketplace (Vinted) pour revendeurs : génération d'annonces par IA à partir de photos, détection d'opportunités d'achat par scan de marché, gestion de stock, comptabilité de base. Vinted n'expose aucune API publique — toute automatisation réelle passe soit par du scraping headless (le scan de marché aujourd'hui), soit, à terme, par une extension Chrome agissant dans le contexte authentifié du navigateur de l'utilisateur sur vinted.fr.

C'est un **monolithe volontairement simple** : une SPA React sans router, un backend entièrement délégué à Supabase (pas de serveur applicatif à soi), un seul script Node externe au bundle pour le scraping. Le projet est encore petit — la plupart des décisions ci-dessous privilégient explicitement "pas d'abstraction avant qu'un second cas d'usage réel ne la justifie" plutôt que d'anticiper une croissance hypothétique.

## 2. Organisation des dossiers

```
src/
  main.tsx              point d'entrée : monte <AuthProvider><App /></AuthProvider>
  App.tsx                état de navigation racine (landing / auth / dashboard)
  index.css               Tailwind + classes composants prêtes à l'emploi (.btn-neon, .glass-card...)

  pages/
    LandingPage.tsx        assemble les sections de landing/
    AuthPage.tsx            login/register/mot de passe oublié, un seul composant, 3 modes
    landing/                 sections de la page publique (Navbar, Hero, Features, Pricing, Testimonials, CTABanner, Footer, ProductPreview)
    dashboard/
      DashboardLayout.tsx     shell connecté : sidebar, topbar, routage interne par état (activePage)
      DashboardHome.tsx        cockpit : métriques du jour/mois, alertes stock qui traine, raccourcis
      GeneratorPage.tsx         orchestre le flow de génération IA en 4 etapes
      generator/                 UploadStep, LoadingStep, ResultStep, EditStep — une etape = un composant
      Opportunities.tsx         résultats du scanner de marché (lecture seule, alimenté par scripts/vinted-scan.ts)
      StockPage.tsx              annonces en stock/vendues, marquer comme vendu
      ExpensesPage.tsx           dépenses liées à l'activité
      AccountingPage.tsx         CA, bénéfice, marge, ROI, TVA sur la marge, calculs URSSAF
      VintedAccountPage.tsx      placeholder honnête pour la synchronisation extension Chrome (voir §8)
      StatsPage.tsx               statistiques sur le catalogue et les ventes
      SubscriptionPage.tsx       UI de plan/abonnement, aucune intégration Stripe réelle (voir §7)
      SettingsPage.tsx            profil, mot de passe, comptes Vinted multiples, clé API, notifications, zone danger

  components/ui/          composants réutilisables sans état métier propre (StatCard, AccountAvatar, VintedStatusBadge)
  hooks/                   logique Supabase réutilisable (useExpenses, useInsights)
  contexts/                AuthContext (session/profil), VintedAccountFilterContext (compte Vinted actif)
  lib/
    supabase.ts              client Supabase (clé anon, protégé par RLS)
    aiService.ts               appelle l'edge function analyze-clothing
    types.ts                    tous les types partagés du frontend (Profile, Listing, MarketOpportunity...)
    insights/                   moteur d'intelligence métier (2026-07-09), voir §4.5
      types.ts / constants.ts / math.ts    contrats, seuils nommés, helpers purs
      context.ts                            buildContext() : agrégats précalculés une fois
      scoring.ts / recommendations.ts / alerts.ts / trends.ts / narrative.ts / priorities.ts
      engine.ts                             computeInsights() : point d'entrée unique
      __tests__/                            tests Vitest (fixtures synthétiques, aucun mock Supabase)

scripts/                  hors bundle frontend, exécuté par Node/tsx
  vinted-scan.ts             scraping Playwright + orchestration du scan
  market-price.ts             calcul du prix de marché (médiane)
  market-engine.ts            calcul profit/ROI/score à partir d'un item scrapé
  types.ts                    types partagés entre les scripts (ScrapedItem, AnalyzedItem...)
  audit-project.mjs            script d'audit schéma<->code (voir .claude/skills/project-audit/)

supabase/
  migrations/                schéma SQL versionné, source de vérité (voir DATABASE.md)
  functions/analyze-clothing/  edge function Deno : reçoit des photos, appelle Gemini, retourne une annonce structurée

.github/workflows/
  scan-market.yml            cron toutes les 4h, lance npm run scan avec la clé service_role
```

**Convention de dossier** : `components/ui/` et les sous-dossiers de `pages/` sont volontairement plats. Un composant ne rejoint `components/ui/` que lorsqu'il est réellement réutilisé à plus d'un endroit — ne pas y déplacer un composant à usage unique par anticipation. Une page dépasse ~250 lignes → c'est le signal pour la découper en sous-composants colocalisés (voir `generator/` et `landing/` comme modèle), pas pour introduire un dossier `shared/` générique.

## 3. Choix techniques

| Choix | Alternative écartée | Pourquoi |
|---|---|---|
| Vite + React 18 + TypeScript strict | Next.js | Pas de besoin de SSR/SEO poussé pour une app derrière authentification ; Vite est plus simple et plus rapide en dev pour ce périmètre |
| Pas de router (état React dans `App.tsx`/`DashboardLayout.tsx`) | react-router | Le projet n'a pas encore besoin d'URL par écran ni de deep-link. Limite assumée : pas de bouton retour navigateur, pas de lien partageable vers un écran précis. À réintroduire quand l'extension Chrome devra ouvrir ResellOS sur une annonce précise (voir ROADMAP.md Phase 2) |
| Context React (`AuthContext`) | Redux/Zustand | Un seul état global (session/profil) ne justifie pas un state manager externe |
| Supabase (Postgres + Auth + Edge Functions + Storage) | Backend custom (Node/Express) | Élimine un serveur applicatif entier à maintenir ; RLS déplace la logique d'autorisation dans la base plutôt que dans du code applicatif dupliqué |
| Tailwind CSS + tokens sémantiques (`neon-*`, `dark-*`, `surface`) | CSS Modules / styled-components | Cohérence visuelle imposée par la config plutôt que par la discipline ; voir §9 |
| Playwright (scraping) plutôt qu'API tierce | API Vinted publique, agrégateur eBay | Vinted n'a pas d'API publique ; eBay a été essayé comme source de prix de comparaison et bloque systématiquement le scraping automatisé (403) — abandonné au profit d'une médiane des prix Vinted eux-mêmes |
| Cron GitHub Actions pour le scan | Cron Supabase / serveur dédié | Gratuit, déjà dans l'écosystème du repo, suffisant pour une fréquence de 4h |
| Google Gemini pour l'analyse photo | OpenAI GPT-4 Vision | Choix historique du projet ; `SettingsPage.tsx` permet à l'utilisateur de fournir sa propre clé, mais le code/l'UI mentionnent encore "OpenAI API Key" par endroits — **incohérence connue à corriger**, l'edge function `analyze-clothing` appelle bien Gemini (voir §9) |
| Vitest (2026-07-09) | Playwright Test, pas de tests | Introduit pour le moteur d'intelligence métier (`src/lib/insights/`) : code déterministe, sans effet de bord, sans dépendance Supabase — le cas d'usage qui justifie enfin le coût d'un premier framework de tests. 23 tests unitaires (`src/lib/insights/__tests__/`), `npm run test`. Config isolée (`vitest.config.ts`, environnement `node`) pour ne pas toucher `vite.config.ts`. Le reste de l'app (UI, hooks Supabase) reste vérifié par `typecheck`/`lint`/`build` + inspection manuelle en navigateur — pas encore de tests de composants |

## 4. Flux de données

### 4.1 Authentification

```
AuthPage → AuthContext.signIn/signUp → supabase.auth.*
  → met à jour user/session de façon synchrone dès la réponse
  → fetchProfile(userId) avec retry (le trigger handle_new_user() peut créer
    le profil avec un léger délai après l'inscription)
  → onAuthStateChange (listener asynchrone) prend le relais pour les
    changements de session ultérieurs (refresh token, déconnexion depuis un
    autre onglet...)
```

Point d'attention historique : compter uniquement sur le listener asynchrone créait une course avec la navigation post-login (l'utilisateur était renvoyé vers l'écran de connexion juste après une authentification pourtant réussie). D'où la mise à jour synchrone en plus du listener — ne pas la retirer sans comprendre ce piège.

### 4.2 Génération d'annonce par IA

```
UploadStep (photos, style, retouche) → GeneratorPage (état du flow)
  → LoadingStep → lib/aiService.ts::analyzeWithAI()
    → convertit les blobs en base64
    → POST supabase/functions/v1/analyze-clothing (JWT utilisateur en Authorization)
      → edge function : vérifie l'utilisateur, appelle Gemini avec les photos
      → retourne un GeneratedListing structuré (titre, description, prix, mots-clés...)
  → ResultStep (aperçu) → EditStep (ajustements manuels)
  → insert dans `listings` (status: 'draft' ou 'en_stock' selon l'action de l'utilisateur)
```

La clé Gemini peut être celle de l'utilisateur (passée dans le body, jamais stockée côté serveur) ou celle du serveur par défaut (`GEMINI_API_KEY` en variable d'environnement de l'edge function).

### 4.3 Scan de marché (hors app, asynchrone)

```
GitHub Actions (cron 4h) OU npm run scan (local)
  → scripts/vinted-scan.ts (Playwright, clé service_role — bypass RLS)
    → lit `watchlist` (recherches à surveiller)
    → scrape 2 pages de résultats Vinted par recherche
    → market-price.ts : prix de marché = médiane des annonces trouvées
    → market-engine.ts : calcule profit, ROI, score
    → ré-écrit entièrement `market_opportunities`
  → Opportunities.tsx (lecture seule côté app, clé anon) affiche le résultat
  → DashboardHome.tsx compte les opportunités des dernières 24h pour le cockpit
```

Ce flux ne passe jamais par le frontend applicatif — c'est un job batch complètement découplé de la session utilisateur.

### 4.4 Stock et comptabilité

```
listings (status: draft → en_stock → vendu ; vinted_status: online/reserved/
          sold_pending/sold_completed/draft/hidden/deleted/unknown/null)
  → StockPage : vue unique, marque un item comme vendu manuellement (sold_price,
    fees, sold_date), ou automatiquement quand la synchro detecte vinted_status
    passe a sold_completed
  → AccountingPage / DashboardHome / StatsPage : dérivent CA, bénéfice, marge,
    ROI, TVA sur la marge, URSSAF à partir de listings + expenses, filtrés par
    compte Vinted actif (VintedAccountFilterContext)
```

Aucune de ces pages ne fait de calcul côté base (pas de vue SQL ni de RPC) — tout est recalculé côté client à partir des lignes brutes à chaque chargement. Acceptable au volume actuel (un utilisateur = quelques centaines de lignes maximum), à revisiter si la volumétrie grossit.

**`listings` et `vinted_listings` ont fusionné (2026-07-09)**, sur demande explicite de l'utilisateur ("une annonce Vinted doit représenter le même objet que celui présent dans mon Stock ResellOS"). `listings` est l'unique source de vérité : une annonce découverte par la synchro Vinted devient directement une ligne `listings` (prix d'achat inconnu tant qu'il n'est pas saisi), une vente détectée met à jour `status`/`sold_price`/`sold_date` automatiquement (sans jamais écraser une valeur déjà saisie manuellement). `StockPage.tsx` est redevenue une vue unique (l'onglet "Vinted" séparé, introduit une itération plus tôt, a été retiré — il recréait la même séparation logique que l'utilisateur venait de demander de supprimer). CA/bénéfice/ROI ne sont calculés que sur les lignes au prix d'achat connu, pour ne jamais fabriquer un chiffre à partir d'une donnée manquante. Détail complet (règles de propriété des champs, auto-comptabilité, migration) dans [EXTENSION.md](EXTENSION.md) §5.

### 4.5 Moteur d'intelligence métier (`src/lib/insights/`, 2026-07-09)

Couche d'analyse au-dessus de `listings` : scores, recommandations, alertes, priorités du jour et narrations texte pour le Dashboard. C'est la "Phase 2" de la roadmap produit à 8 phases communiquée par l'utilisateur (lecture/analyse — à distinguer du phasage interne de `EXTENSION.md` §10 qui numérote les capacités d'écriture de l'extension). Les phases suivantes (republication, messages, offres — Phases 3+) consommeront les recommandations produites ici, d'où le soin porté à l'extensibilité.

```
listings + vinted_accounts + listing_metric_snapshots (chargés par useInsights.ts)
  → context.ts::buildContext()      agrégats précalculés une seule fois :
                                       moyennes ROI/vues/favoris par marque/catégorie/compte,
                                       calculées UNIQUEMENT à partir de ventes réelles complètes
                                       (prix d'achat + prix de vente connus), null si échantillon
                                       trop petit (< MIN_SAMPLE_SIZE_FOR_COMPARISON) — jamais de
                                       moyenne fabriquée à partir de données insuffisantes
  → scoring.ts::computeScores()      score 0-100 par annonce, additif et transparent (base 50 +
                                       deltas nommés : vues/favoris vs médiane active, âge, ROI,
                                       performance marque/catégorie relative) — même philosophie
                                       que scripts/market-engine.ts::calculateScore(), appliquée
                                       à l'inventaire possédé plutôt qu'aux opportunités d'achat
  → recommendations.ts / alerts.ts    registres de règles : chaque règle est une fonction pure
                                       nommée (listing, ctx) => Résultat | null, collectées dans
                                       un tableau et exécutées génériquement — ajouter une règle
                                       n'implique de toucher à aucune règle existante (pas de
                                       if/else monolithique)
  → trends.ts                        signaux basés sur l'historique (listing_metric_snapshots) ;
                                       ne produit rien tant que l'historique est insuffisant
                                       (< 2 instantanés espacés de MIN_TREND_INTERVAL_DAYS)
  → narrative.ts                      phrases texte générées par interpolation de gabarits sur
                                       les agrégats réels — aucun appel LLM, donc aucun risque
                                       d'invention (voir §7 pour l'unique usage de Gemini)
  → priorities.ts                     fusionne alertes + recommandations en un top 5 classé
  → engine.ts::computeInsights()      orchestrateur pur, point d'entrée unique
→ hooks/useInsights.ts                 pont Supabase : fetch listings/comptes/snapshots (scopé
                                       par VintedAccountFilterContext), appelle computeInsights()
                                       deux fois (dataset complet pour narrations/comparaisons
                                       inter-comptes, dataset filtré pour scores/recommandations/
                                       alertes/priorités affichés à l'écran)
→ DashboardHome.tsx ("Copilote")       narrations + priorités du jour cliquables
→ StockPage.tsx                        badge de recommandation + barre "Score IA X/100" par carte
```

Aucun appel Supabase à l'intérieur de `src/lib/insights/` — uniquement des fonctions pures testées par Vitest (voir §3), ce qui garde la séparation données/recommandations explicitement demandée par l'utilisateur.

## 5. Interactions avec Supabase

Détail complet des tables, policies RLS et RPC dans [DATABASE.md](DATABASE.md). Résumé de qui accède à quoi :

| Client | Clé utilisée | Accès |
|---|---|---|
| Frontend (`src/lib/supabase.ts`) | `VITE_SUPABASE_ANON_KEY` | Toutes les opérations CRUD sur les données de l'utilisateur connecté, filtrées par RLS (`auth.uid() = user_id`) |
| Edge function `analyze-clothing` | `SUPABASE_ANON_KEY` + JWT utilisateur transmis | Vérifie l'identité de l'appelant avant tout traitement, pas d'accès élevé |
| `scripts/vinted-scan.ts` | `SUPABASE_SERVICE_ROLE_KEY` | Bypass RLS — nécessaire car le scan tourne hors session utilisateur (cron), lit `watchlist` et écrit `market_opportunities` pour tous les utilisateurs |
| Trigger `handle_new_user()` | interne Postgres | Crée automatiquement une ligne `profiles` à l'inscription (`auth.users` → `profiles`) |

**Règle impérative** : tout changement de schéma passe par une migration versionnée (`supabase/migrations/`) + `npx supabase db push`, jamais par une modification directe dans le SQL Editor du dashboard. Une dérive de ce type s'est déjà produite (policies RLS non versionnées trouvées en prod, dont une faille de sécurité réelle) — voir DATABASE.md pour le détail et la procédure de vérification (`supabase db query --linked`, `supabase db advisors --linked`).

## 6. Fonctionnalités existantes

Fonctionnel de bout en bout, avec de vraies données (pas de mock) :

- **Authentification** : inscription, connexion, mot de passe oublié, session persistante
- **Génération d'annonce par IA** : photo → titre/description/prix/mots-clés/catégorie Vinted via Gemini
- **Scanner d'opportunités** : scan Vinted automatisé (cron 4h), calcul profit/ROI/score, affichage trié
- **Stock** : vue unifiée (fusion `listings`/`vinted_listings`, 2026-07-09) — suivi des annonces (brouillon/en stock/vendu), marquage de vente manuel ou automatique sur détection Vinted, marge/ROI quand le prix d'achat est connu, statuts Vinted réels (en ligne/réservé/vente en cours/vendu/brouillon/masqué) filtrés par compte actif, synchronisation à la demande — voir [EXTENSION.md](EXTENSION.md) §5
- **Dépenses** : ajout/suppression de dépenses catégorisées, total mensuel
- **Comptabilité** : CA, bénéfice, marge, ROI, TVA sur la marge, calcul URSSAF (basé sur `listings`, pas encore rattaché aux comptes Vinted — voir §4.4)
- **Statistiques** : vue d'ensemble du catalogue et des ventes
- **Comptes Vinted multiples** : entité centrale `vinted_accounts`, un compte par détection réelle de l'extension. Sélecteur premium, gestion (renommage/défaut/suppression), Dashboard et Stock en vue globale ou par compte — voir [EXTENSION.md](EXTENSION.md) §5
- **Paramètres** : profil, mot de passe, clé API personnelle, préférences de notification

## 7. Fonctionnalités prévues (non fonctionnelles aujourd'hui)

Ces écrans/éléments existent dans l'UI avec un état honnête ("bientôt disponible", vide, désactivé) plutôt qu'avec de fausses données — ne jamais les faire *paraître* fonctionnels sans l'être réellement :

- **Compte Vinted (`VintedAccountPage.tsx`, `StockPage.tsx`)** : la connexion et la synchronisation des annonces (statut, marque, taille, vues, favoris) sont réelles depuis l'extension Chrome (voir [EXTENSION.md](EXTENSION.md)). Restent à venir : messages, offres, republication automatique, alertes (voir §8)
- **Abonnement (`SubscriptionPage.tsx`)** : UI de plans statique, aucune intégration Stripe. Table `subscriptions` déjà en base (scaffolding), pas encore branchée
- **Suppression de compte (`SettingsPage.tsx`, zone danger)** : bouton désactivé volontairement ("bientôt disponible") — aucune logique de suppression de compte n'existe côté backend, le bouton a été trouvé sans handler lors de l'audit de juillet 2026 et corrigé pour ne pas être une action destructive factice
- **Multi-marketplace** : mentionné en roadmap sur la landing page ("Bientôt"), aucun code d'abstraction marketplace n'existe et ce n'est pas prévu tant que Vinted reste la seule marketplace gérée (voir §3, ligne Playwright, et [EXTENSION.md](EXTENSION.md) §5 pour pourquoi cette abstraction est explicitement écartée pour l'instant)
- **Incohérence connue** : `SettingsPage.tsx` référence encore "OpenAI API Key" dans l'UI alors que l'edge function appelle Gemini — reliquat d'un changement de fournisseur IA jamais nettoyé côté libellés, à corriger

## 8. Points d'extension pour l'extension Chrome

Vinted n'ayant pas d'API publique, toute action qui nécessite d'agir *dans* le compte Vinted de l'utilisateur (publier, republier, répondre à un message, accepter une offre) ne peut pas se faire depuis le backend seul — elle nécessite une extension agissant dans le contexte authentifié du navigateur sur vinted.fr.

**Conception complète dans [EXTENSION.md](EXTENSION.md)** : composants (background/content scripts/popup), appairage à chaud avec la session Supabase déjà ouverte dans l'app web (l'utilisateur ne se reconnecte pas une seconde fois), modèle de données (`vinted_accounts` comme entité centrale + file `sync_jobs` à venir, sans abstraction multi-marketplace générique — voir §5 de EXTENSION.md), phasage MVP, et garde-fous de sécurité/conformité.

**Déjà réel côté UI**, détaillé dans EXTENSION.md §5 et §11 :
- `VintedAccountPage.tsx`, `StockPage.tsx` : connexion et miroir des annonces réels, par compte
- `SettingsPage.tsx` (onglet Comptes Vinted) : gestion complète (renommage, compte par défaut, suppression) des comptes réellement détectés par l'extension
- `market_opportunities.vinted_url` : chaque opportunité a déjà l'URL Vinted de l'annonce

## 9. Conventions de développement

- **TypeScript strict, zéro `any`** — vérifié par `npm run typecheck`. Si un type externe est incertain (réponse Supabase, payload d'edge function), le typer explicitement plutôt que d'échapper avec `any` ou `unknown` non affiné
- **Pas de commentaire qui répète le code** — un commentaire n'a de valeur que s'il explique un *pourquoi* non évident (contrainte cachée, contournement d'un bug précis, comportement surprenant). Voir les exemples dans `AuthContext.tsx` (course de navigation) ou `aiService.ts`
- **Design system** : toujours consommer les tokens Tailwind (`bg-neon-500`, `bg-surface`, `text-dark-400`...) définis dans `tailwind.config.js`, jamais de valeur hex arbitraire (`bg-[#FFC400]`). `src/index.css` contient des classes composants prêtes (`.btn-neon`, `.glass-card`, `.input-dark`) qui utilisent déjà ces tokens — à privilégier pour tout nouveau composant plutôt que de réimplémenter le style en Tailwind brut (chantier de migration pas terminé sur les pages existantes, voir ROADMAP.md)
- **Contenu honnête plutôt que factice** : une fonctionnalité pas encore branchée doit apparaître clairement comme telle (état vide, "bientôt disponible", bouton désactivé) — jamais de fausses données, de bouton sans handler, ou de badge qui laisse croire à une action réelle. Règle issue directement d'un bug corrigé lors de l'audit de juillet 2026 (bouton de suppression de compte sans handler, voir §7)
- **Accessibilité** : tout bouton icône-seul (sans texte visible) doit avoir un `aria-label` décrivant l'action. Norme appliquée rétroactivement à tout le projet lors de l'audit de juillet 2026
- **Un composant rejoint `components/ui/` seulement s'il est réutilisé** à plus d'un endroit (voir §2) — pas d'extraction anticipée
- **Migrations Supabase toujours versionnées**, jamais de modification directe en base via le dashboard (voir §5 et DATABASE.md)
- **Scripts de vérification avant tout commit significatif** : `npm run typecheck`, `npm run lint`, `npm run build`, et `npm run audit` (schéma + code mort, voir `.claude/skills/project-audit/`) — pas de suite de tests automatisés à ce jour, donc ces vérifications statiques + un passage manuel en navigateur (Claude Preview ou équivalent) sont le seul filet de sécurité actuel
- **Commits** : messages en français, détaillés, groupés par unité de travail cohérente plutôt qu'un commit par fichier

## 10. Prochaines étapes recommandées

Par ordre de priorité réaliste (voir aussi le détail complet dans [ROADMAP.md](ROADMAP.md)) :

1. **Décider du sort de `business_items`/`business_expenses`** — tables orphelines, la première contient 53 lignes de données réelles jamais migrées. Bloquant moralement avant de considérer le schéma "propre"
2. **Corriger l'incohérence "OpenAI API Key" vs Gemini** dans `SettingsPage.tsx` (§7) — petit fix, confusion utilisateur réelle
3. **Implémenter le MVP de l'extension Chrome** — appairage, republication, sync vues/favoris — voir le phasage détaillé dans [EXTENSION.md](EXTENSION.md) §10
4. **Introduire un framework de tests minimal** (Vitest pour la logique pure de `scripts/market-engine.ts`/`market-price.ts` serait le point de départ le plus rentable — logique déterministe, facile à tester, déjà à l'origine d'au moins un bug de calcul corrigé manuellement)
5. **Terminer la migration vers les classes `.btn-neon`/`.glass-card`/`.input-dark`** sur les pages qui réimplémentent encore leur style en Tailwind brut
6. **Traiter les items de sécurité/perf restants documentés dans DATABASE.md** : policy storage `listing-images` trop permissive, protection mots de passe compromis désactivée, policies RLS dupliquées, pattern `auth.uid()` non optimisé
7. **Router applicatif (`react-router`)** — seulement quand l'extension Chrome ou un besoin de deep-link concret l'exige (§3), pas avant
