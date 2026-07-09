-- Refonte multi-comptes Vinted, Phase A (fondation schema, aucun changement
-- visuel). "Compte Vinted" devient l'entite centrale : vinted_accounts
-- remplace vinted_connection (une ligne max par utilisateur) et accounts
-- (0 ligne, jamais cablee - voir DATABASE.md). Une ligne vinted_accounts ne
-- peut etre creee que par detection reelle de l'extension (upsert sur
-- vinted_user_id), jamais par saisie manuelle vide.

create table vinted_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  vinted_user_id text not null,
  vinted_username text not null,
  connected boolean not null default false,
  last_synced_at timestamptz,
  last_error text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, vinted_user_id)
);

alter table vinted_accounts enable row level security;

create policy "select_own_vinted_accounts" on vinted_accounts for select
  to authenticated using (auth.uid() = user_id);
create policy "insert_own_vinted_accounts" on vinted_accounts for insert
  to authenticated with check (auth.uid() = user_id);
create policy "update_own_vinted_accounts" on vinted_accounts for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete_own_vinted_accounts" on vinted_accounts for delete
  to authenticated using (auth.uid() = user_id);

-- Migration de la ligne vinted_connection existante (garde-fou : seulement
-- si un compte Vinted a deja ete reellement detecte par l'extension).
insert into vinted_accounts (user_id, label, vinted_user_id, vinted_username, connected, last_synced_at, last_error, is_default)
select user_id, coalesce(vinted_username, 'Compte principal'), vinted_user_id, vinted_username, connected, last_synced_at, last_error, true
from vinted_connection
where vinted_user_id is not null and vinted_username is not null;

-- vinted_listings : vinted_account_id remplace user_id comme seule source
-- de propriete (voir EXTENSION.md pour la justification de cet ecart par
-- rapport a la convention auth.uid() = user_id utilisee ailleurs).
alter table vinted_listings add column vinted_account_id uuid references vinted_accounts(id) on delete cascade;

update vinted_listings vl
set vinted_account_id = va.id
from vinted_accounts va
where va.user_id = vl.user_id;

alter table vinted_listings alter column vinted_account_id set not null;
alter table vinted_listings drop constraint vinted_listings_user_id_vinted_item_id_key;
alter table vinted_listings add constraint vinted_listings_account_item_unique unique (vinted_account_id, vinted_item_id);

-- Les anciennes policies referencent user_id : a supprimer avant de pouvoir
-- droper la colonne.
drop policy "select_own_vinted_listings" on vinted_listings;
drop policy "insert_own_vinted_listings" on vinted_listings;
drop policy "update_own_vinted_listings" on vinted_listings;

alter table vinted_listings drop column user_id;

create policy "select_own_vinted_listings" on vinted_listings for select
  to authenticated using (vinted_account_id in (select id from vinted_accounts where user_id = auth.uid()));
create policy "insert_own_vinted_listings" on vinted_listings for insert
  to authenticated with check (vinted_account_id in (select id from vinted_accounts where user_id = auth.uid()));
create policy "update_own_vinted_listings" on vinted_listings for update
  to authenticated using (vinted_account_id in (select id from vinted_accounts where user_id = auth.uid()))
  with check (vinted_account_id in (select id from vinted_accounts where user_id = auth.uid()));

-- Tables remplacees : accounts (0 ligne, jamais utilisee) et
-- vinted_connection (donnees deja migrees ci-dessus).
drop table if exists vinted_connection;
drop table if exists accounts;
