---
name: project-audit
description: This skill should be used when the user asks for a project audit, health check, or review of this codebase — e.g. "audit le projet", "fais un audit", "vérifie la cohérence du schéma", "cherche du code mort", "check les migrations en double", or periodically before a release. Runs the repo's mechanical audit scripts (typecheck, schema/code consistency, dead code) and synthesizes the raw output into a prioritized, human-readable report.
---

# Audit du projet ResellOS

Cette skill orchestre un audit structuré du repo autour de trois axes récurrents :
cohérence schéma Supabase <-> code frontend/scripts, code mort, doublons de
migrations SQL. Les outils mécaniques ne remplacent pas le jugement — ils
fournissent des faits bruts que tu dois relire et trier avant de les présenter.

## Étapes

1. Lance les trois commandes suivantes (elles peuvent tourner indépendamment,
   mais lis chaque sortie avant de conclure) :
   - `npm run typecheck` — erreurs TypeScript sur `src/` (frontend).
   - `npm run audit:schema` — script maison (`scripts/audit-project.mjs`) qui
     parse `supabase/migrations/*.sql` et grep `src/`+`scripts/` pour croiser :
     - tables créées dans plusieurs migrations (doublon potentiel)
     - tables utilisées dans le code (`.from("...")`) mais absentes des migrations
     - tables définies en base mais jamais référencées dans le code
     - colonnes utilisées via `.select("...")` introuvables dans le schéma déduit
     C'est une heuristique regex, pas un vrai parseur SQL — vérifie chaque
     signalement dans le fichier de migration réel avant de le rapporter comme
     un vrai problème.
   - `npm run audit:deadcode` — `ts-prune` sur `src/` et `scripts/` (config
     `tsconfig.audit.json`). Il va légitimement signaler les exports utilisés
     uniquement par le point d'entrée (`src/App.tsx` default export, etc.) —
     ce sont des faux positifs à filtrer, pas du code mort. Faux positif connu
     et confirmé sur ce repo : `AuthProvider` (`src/contexts/AuthContext.tsx`)
     est signalé comme inutilisé alors qu'il est importé dans `src/main.tsx` —
     ts-prune perd la trace quand l'import utilise une extension explicite
     (`from './contexts/AuthContext.tsx'`). Vérifie toujours par un grep manuel
     du nom exporté avant de conclure au code mort.
   - Optionnel si présent : `npm run lint`.

2. Pour chaque signalement de `audit:schema` et `audit:deadcode`, vérifie
   manuellement (Read/Grep) avant de le classer comme un vrai problème :
   - Une table "jamais référencée" peut être utilisée via une RPC Postgres, un
     trigger, ou une vue — pas seulement via `.from()`.
   - Un export "inutilisé" peut être un point d'entrée volontaire (Vite,
     `src/main.tsx`, un composant de route) ou exporté pour les tests.

3. Vérifie aussi à la main (le script ne le fait pas) :
   - Les migrations qui font `alter table` sur une table qui n'existe dans
     aucune migration antérieure (ordre cassé / migration manquante).
   - Les policies RLS : toute table avec `enable row level security` a-t-elle
     au moins une policy cohérente avec son usage réel (lecture publique,
     accès service_role only, etc.) ?

4. Signalements confirmés mais intentionnels (scaffolding pour une feature
   future — à ne pas classer comme code mort, mais pas non plus des faux
   positifs d'outil comme `AuthProvider` : l'outil a raison, c'est juste
   volontaire) :
   - Tables `subscriptions` et `accounts` (`audit:schema`, "jamais
     référencées") : préparées pour une feature abonnement/multi-compte pas
     encore branchée. Confirmé par l'utilisateur le 2026-07-07 — ne pas
     supprimer, ne pas re-signaler comme oubli.
   - Types `Plan`, `UsageRecord`, `Subscription` dans `src/lib/types.ts`
     (`audit:deadcode`, "used in module" ou inutilisés hors module) : `Plan`
     est utilisé en interne dans le fichier (`Profile.plan`, `Subscription.plan`,
     `PLAN_LIMITS`) mais jamais importé ailleurs — normal, pas un problème.
     `UsageRecord` et `Subscription` modélisent les futures tables du même nom
     et ne sont pas encore consommés par l'UI — même scaffolding que ci-dessus,
     ne pas supprimer.

5. Synthétise en un rapport court, groupé par sévérité :
   - **À corriger** : incohérences confirmées (table/colonne manquante,
     doublon de migration réel, code mort confirmé).
   - **À surveiller** : signalements plausibles mais pas confirmés, à revoir
     au prochain audit.
   - **Faux positifs écartés** : ce que tu as vérifié et jugé non problématique
     (pour éviter de le re-signaler la prochaine fois).

Ne modifie rien automatiquement — ce skill est un outil de diagnostic. Propose
les corrections et laisse l'utilisateur valider avant d'éditer schéma ou code.
