-- Centre des Actions : la progression en direct d'une action (RUN_ACTION) est
-- aujourd'hui purement ephemere (port chrome.runtime.connect, en memoire cote
-- extension ET cote hook useActionEngine.ts - voir EXTENSION.md §6.1) - rien
-- ne persiste les etapes intermediaires, seule la ligne action_log finale/
-- initiale existe. Cette migration ajoute un journal append-only par action,
-- meme discipline que listing_metric_snapshots, pour que le Centre des
-- Actions puisse rejouer l'historique complet et refleter l'etat reel meme
-- depuis un autre onglet (voir ARCHITECTURE.md, introduction de Supabase
-- Realtime cote app web).

alter table action_log add column current_step text;

create table action_log_entries (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references action_log(id) on delete cascade,
  step text,            -- ActionStep si applicable (src/lib/actions/types.ts), sinon null
  message text not null,
  at timestamptz not null default now()
);

create index action_log_entries_action_id_idx on action_log_entries (action_id, at);

alter table action_log_entries enable row level security;

create policy "select_own_action_log_entries" on action_log_entries for select
  to authenticated using (action_id in (select id from action_log where user_id = auth.uid()));

create policy "insert_own_action_log_entries" on action_log_entries for insert
  to authenticated with check (action_id in (select id from action_log where user_id = auth.uid()));

-- Pas de update/delete : c'est un journal, pas un etat (meme convention que
-- listing_metric_snapshots).
