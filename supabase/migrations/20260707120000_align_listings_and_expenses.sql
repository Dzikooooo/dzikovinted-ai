-- Aligne listings avec les colonnes déjà utilisées par StockPage / NewItemPage
alter table listings
  add column if not exists purchase_price numeric(10,2),
  add column if not exists purchase_date date,
  add column if not exists purchase_location text,
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'en_stock', 'vendu')),
  add column if not exists sold_price numeric(10,2),
  add column if not exists sold_date date,
  add column if not exists fees numeric(10,2) default 0,
  add column if not exists account text;

-- Reprend le meilleur de BusinessOS : dépenses catégorisées, en DB (pas localStorage)
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null,
  amount numeric(10,2) not null,
  note text,
  expense_date date default now()
);

create index if not exists expenses_user_id_idx on expenses(user_id);

alter table expenses enable row level security;

drop policy if exists "select_own_expenses" on expenses;
drop policy if exists "insert_own_expenses" on expenses;
drop policy if exists "update_own_expenses" on expenses;
drop policy if exists "delete_own_expenses" on expenses;

create policy "select_own_expenses" on expenses for select
  to authenticated using (auth.uid() = user_id);
create policy "insert_own_expenses" on expenses for insert
  to authenticated with check (auth.uid() = user_id);
create policy "update_own_expenses" on expenses for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete_own_expenses" on expenses for delete
  to authenticated using (auth.uid() = user_id);

-- Reprend le multi-comptes de BusinessOS, en DB au lieu de localStorage
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null
);

alter table accounts enable row level security;

drop policy if exists "select_own_accounts" on accounts;
drop policy if exists "insert_own_accounts" on accounts;
drop policy if exists "delete_own_accounts" on accounts;

create policy "select_own_accounts" on accounts for select
  to authenticated using (auth.uid() = user_id);
create policy "insert_own_accounts" on accounts for insert
  to authenticated with check (auth.uid() = user_id);
create policy "delete_own_accounts" on accounts for delete
  to authenticated using (auth.uid() = user_id);