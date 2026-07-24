-- Trace de chaque execution de scripts/vinted-scan.ts (cron 4h OU declenchement
-- manuel "Scanner maintenant"), independante de `action_log`. `action_log` est
-- structurellement per-user (RLS `auth.uid() = user_id`) alors qu'un run cron
-- n'a aucun utilisateur a qui l'attribuer (il scanne la watchlist fusionnee de
-- tous les utilisateurs) - avant cette table, un run cron qui echouait apres
-- avoir vide `market_opportunities` ne laissait absolument aucune trace nulle
-- part : un beta-testeur voyait le meme ecran "Aucune opportunite" qu'un simple
-- manque de donnees, sans aucun moyen de savoir que quelque chose avait
-- reellement echoue (audit du parcours Scanner, 2026-07-24).
--
-- Lecture globale (comme market_opportunities/market_price_observations) :
-- "Dernier scan reussi : il y a Xh" est un signal utile pour tout utilisateur,
-- pas une donnee privee. Ecriture exclusivement via service_role (le script,
-- qui bypasse RLS) - aucune policy insert/update pour authenticated/anon.
create table scan_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running', -- 'running' | 'success' | 'error'
  opportunities_found integer,
  failed_searches integer,
  error_message text,
  triggered_by text not null default 'cron' -- 'cron' | 'manual'
);

create index scan_runs_started_at_idx on scan_runs (started_at desc);

alter table scan_runs enable row level security;

create policy "select_scan_runs" on scan_runs for select
  to authenticated using (true);
