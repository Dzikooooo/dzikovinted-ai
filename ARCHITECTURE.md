# Architecture

## Structure du projet

```
src/
  pages/              écrans, un fichier par route logique
    dashboard/        écrans connectés (Dashboard, Stock, Depenses, Parametres...)
      generator/       sous-etapes du generateur IA (Upload/Loading/Result/Edit)
    landing/           sections de la landing page (Navbar, Hero, Pricing...)
  components/ui/       composants reutilisables sans etat metier (StatCard, CopyBtn, FieldCard)
  hooks/               logique Supabase reutilisable (useExpenses, useAccounts)
  contexts/            AuthContext (session, profil, credits)
  lib/                 client Supabase, types partages, service IA
scripts/                scraping Vinted + moteur de prix (Node/Playwright, hors bundle frontend)
supabase/
  migrations/           schema SQL versionne
  functions/             edge functions (analyze-clothing)
```

`src/components/` et `src/pages/*/`(sous-dossiers) sont volontairement plats : le projet est encore assez petit pour qu'une hiérarchie profonde n'apporte rien. Un composant rejoint `components/ui/` uniquement quand il est réellement utilisé à plus d'un endroit — ne pas y déplacer des composants à usage unique par anticipation.

## Navigation

Pas de router. `App.tsx` gère un état `page: 'landing' | 'auth' | 'dashboard'`, et `DashboardLayout.tsx` gère un second état `activePage: DashboardPage` pour les écrans internes. Conséquence assumée : pas d'URL par écran, pas de bouton retour navigateur, pas de lien profond partageable.

C'est une vraie limite si l'extension Chrome (Phase 2, voir [ROADMAP.md](ROADMAP.md)) doit un jour ouvrir ResellOS directement sur une annonce précise — à ce moment-là, introduire `react-router` devient justifié. Ne pas l'ajouter avant d'en avoir un besoin concret.

## Authentification

`AuthContext` centralise `user`, `session`, `profile`, et les actions (`signIn`, `signUp`, `signOut`). Point d'attention historique : `signIn`/`signUp` mettent à jour `user`/`session` de façon synchrone dès la réponse Supabase, plutôt que de compter uniquement sur le listener asynchrone `onAuthStateChange` — un bug corrigé pendant l'audit de juillet 2026 faisait rebondir l'utilisateur vers l'écran de connexion juste après une authentification pourtant réussie, à cause de cette course entre navigation et mise à jour du contexte.

## Design system

`tailwind.config.js` définit deux échelles de couleurs (`neon-*` pour la marque ambre, `dark-*` pour les fonds) plus deux tokens semantiques `surface`/`surface-alt` pour les fonds de carte. Toutes les pages sont censées consommer ces tokens (`bg-neon-500`, `bg-surface`) plutôt que des valeurs hex arbitraires (`bg-[#FFC400]`) — c'était la principale source d'incohérence visuelle avant l'audit de juillet 2026 (deux couleurs de marque différentes coexistaient, reliquat du rebranding DzikoVinted → ResellOS).

`src/index.css` contient aussi un jeu de classes composants tout faites (`.btn-neon`, `.glass-card`, `.input-dark`, `.neon-glow`...) qui utilisent déjà les bonnes couleurs mais ne sont pour l'instant utilisées par **aucune** page — chaque écran réimplémente son propre style en Tailwind brut. À utiliser en priorité pour tout nouveau composant plutôt que d'en écrire un de plus.

## Génération IA

`GeneratorPage.tsx` orchestre un flow en 4 étapes (upload → loading → résultat → édition), chacune dans son propre composant sous `generator/`. L'appel IA passe par `lib/aiService.ts` → edge function Supabase `analyze-clothing` → Gemini. La clé Gemini peut être fournie par l'utilisateur (stockée dans `localStorage`, envoyée à la edge function) ou par défaut celle du serveur (`GEMINI_API_KEY` côté edge function).

## Scanner de marché

`scripts/vinted-scan.ts` (Node + Playwright, **hors** du bundle frontend) scrape la grille de résultats de recherche Vinted directement (pas d'API publique), sur 2 pages par recherche de la table `watchlist`. Le titre réel de chaque annonce est extrait du slug de son URL (le libellé affiché sur la carte n'est que la marque). Le prix de marché est calculé comme la médiane des prix trouvés pour la même recherche — pas de source externe (eBay a été essayé, bloque systématiquement les requêtes automatisées avec un 403).

Tourne en local (`npm run scan`) ou via cron GitHub Actions toutes les 4h (`.github/workflows/scan-market.yml`), écrit dans `market_opportunities` avec la clé `service_role` (voir [DATABASE.md](DATABASE.md) — cette table n'accepte plus les écritures anonymes depuis juillet 2026).

## Connecteurs marketplace (préparation)

Aucun connecteur n'est encore codé. Vinted est aujourd'hui la seule marketplace gérée, et le code ne l'abstrait pas explicitement (pas d'interface `MarketplaceConnector`). Voir [ROADMAP.md](ROADMAP.md) Phase 2/3 avant d'introduire cette abstraction — ne pas la construire avant qu'un deuxième connecteur réel (extension Chrome Vinted, puis éventuellement une autre marketplace) n'en démontre le besoin.
