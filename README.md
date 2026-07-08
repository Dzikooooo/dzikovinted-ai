# Resell OS

L'OS du revendeur Vinted : scanner d'opportunités d'achat, génération d'annonce par IA, gestion de stock, comptabilité de base.

Vinted n'a pas d'API publique — toute automatisation réelle (scan de marché, future publication d'annonces) passe par du scraping Playwright headless ou, à terme, une extension Chrome. Voir [ROADMAP.md](ROADMAP.md).

## Stack

- **Frontend** : Vite + React 18 + TypeScript (strict) + Tailwind CSS
- **Backend** : Supabase (Postgres + Auth + Edge Functions + Storage)
- **IA** : Google Gemini, appelé depuis une edge function Supabase (`supabase/functions/analyze-clothing`)
- **Scraping** : Playwright, tourne en local ou via cron GitHub Actions (`.github/workflows/scan-market.yml`)

Pas de router (navigation par état React, voir [ARCHITECTURE.md](ARCHITECTURE.md)), pas de state manager externe (Context suffit à cette taille), pas de framework de tests pour l'instant.

## Démarrage

```bash
npm install
cp .env.example .env   # renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev
```

Les clés Supabase (URL + clé publique anon) se trouvent dans le dashboard Supabase du projet, Settings > API. La clé anon est publique par design (protégée par RLS côté base), sûre à committer dans un `.env.example` mais pas les vraies valeurs de prod.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de dev Vite |
| `npm run build` | Build de production |
| `npm run lint` | ESLint |
| `npm run typecheck` | Vérification TypeScript sans émission |
| `npm run scan` | Lance le scraper Vinted (`scripts/vinted-scan.ts`), écrit dans `market_opportunities` |
| `npm run audit` | typecheck + audit schéma/code + code mort (voir `.claude/skills/project-audit/`) |

## Base de données

Migrations SQL versionnées dans `supabase/migrations/`. Pour appliquer une migration en prod :

```bash
npx supabase link --project-ref <ref-du-projet>
npx supabase db push
```

Voir [DATABASE.md](DATABASE.md) pour le détail des tables, des policies RLS, et un piège connu sur l'historique de migration de la CLI.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — structure du code, décisions de conception
- [DATABASE.md](DATABASE.md) — schéma, RLS, migrations
- [ROADMAP.md](ROADMAP.md) — état d'avancement et prochaines étapes
- [EXTENSION.md](EXTENSION.md) — architecture de l'extension Chrome (conçue, pas encore implémentée)
