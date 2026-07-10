-- Journal d'actions du "Action Engine" (Phase 3, préparation) : chaque action
-- d'écriture Vinted (republier, éditer, répondre, accepter une offre, ...)
-- passe par ce moteur générique unique - voir src/lib/actions/ et
-- ARCHITECTURE.md §4.6. Cette table remplace la conception `sync_jobs`
-- documentée dans EXTENSION.md mais jamais implémentée : pas une file
-- d'attente interrogée par polling, mais un journal d'audit écrit une fois
-- l'action préparée (checks passés, avant confirmation utilisateur) et mis
-- à jour avec le résultat terminal une fois l'extension répondue.
--
-- RLS classique `auth.uid() = user_id` (pas de dérivation via
-- vinted_account_id) : cohérent avec l'exception déjà assumée pour `listings`
-- (voir EXTENSION.md, "RLS des tables scopées par compte") - certaines
-- actions futures pourraient être globales/sans compte Vinted précis, et le
-- déclenchement est toujours initié par l'utilisateur authentifié lui-même.

create table action_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  vinted_account_id uuid references vinted_accounts(id) on delete set null,
  listing_id uuid references listings(id) on delete set null,
  kind text not null,                -- ActionKind, voir src/lib/actions/types.ts
  status text not null default 'pending_confirmation',
    -- 'pending_confirmation' | 'success' | 'error' | 'cancelled' | 'not_implemented'
  payload jsonb not null default '{}',        -- ActionRequest.payload, tel que préparé
  preview jsonb,                                -- ActionPreview, journalisée à la préparation
  result_payload jsonb,                          -- ActionOutcome.resultPayload si succès
  error_message text,
  started_at timestamptz not null default now(), -- horodatage de prepare()
  completed_at timestamptz,                        -- horodatage de confirm()/cancel() terminé
  duration_ms integer                               -- completed_at - started_at, en millisecondes
);

create index action_log_user_id_idx on action_log (user_id, started_at desc);
create index action_log_vinted_account_id_idx on action_log (vinted_account_id);
create index action_log_listing_id_idx on action_log (listing_id);

alter table action_log enable row level security;

create policy "select_own_action_log" on action_log for select
  to authenticated using (auth.uid() = user_id);

-- Le with check valide aussi que vinted_account_id/listing_id (s'ils sont
-- fournis) appartiennent bien à l'utilisateur - cohérent avec le niveau
-- d'exigence déjà posé pour listing_metric_snapshots/vinted_accounts
-- (aucune fuite de données croisée possible).
create policy "insert_own_action_log" on action_log for insert
  to authenticated with check (
    auth.uid() = user_id
    and (vinted_account_id is null or vinted_account_id in (select id from vinted_accounts where user_id = auth.uid()))
    and (listing_id is null or listing_id in (select id from listings where user_id = auth.uid()))
  );

-- update nécessaire (pending_confirmation -> statut terminal) : écrit par
-- l'app web uniquement dans cette phase (prepare()/confirm()/cancel()) -
-- l'extension ne touche pas cette table pour RUN_ACTION, voir EXTENSION.md.
create policy "update_own_action_log" on action_log for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
