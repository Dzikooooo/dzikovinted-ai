-- Etat de connexion de l'extension Chrome pour un utilisateur : une ligne par
-- utilisateur, distincte de la table `accounts` (qui est un simple carnet
-- d'etiquettes utilisateur herite de l'ancien module BusinessOS, jamais
-- referencee ailleurs dans le schema - voir EXTENSION.md pour le detail de
-- cette decision). `connected` reflete une vraie session Vinted detectee par
-- le content script (etape 1.2), pas seulement l'appairage extension <-> app
-- web (etape 1.1) : les deux sont des etats distincts.

create table if not exists vinted_connection (
  user_id uuid primary key references auth.users(id) on delete cascade,
  connected boolean not null default false,
  vinted_user_id text,
  vinted_username text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table vinted_connection enable row level security;

drop policy if exists "select_own_vinted_connection" on vinted_connection;
drop policy if exists "insert_own_vinted_connection" on vinted_connection;
drop policy if exists "update_own_vinted_connection" on vinted_connection;

create policy "select_own_vinted_connection" on vinted_connection for select
  to authenticated using (auth.uid() = user_id);
create policy "insert_own_vinted_connection" on vinted_connection for insert
  to authenticated with check (auth.uid() = user_id);
create policy "update_own_vinted_connection" on vinted_connection for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
