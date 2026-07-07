create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model text not null,
  category text not null,
  priority int not null default 1,
  active boolean not null default true,
  min_profit numeric not null default 20,
  min_roi numeric not null default 50,
  created_at timestamptz default now()
);

do $$
begin
  alter table watchlist add constraint watchlist_brand_model_key unique (brand, model);
exception when duplicate_table or duplicate_object then
  null;
end $$;

create table if not exists market_opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brand text,
  category text,
  image text,
  price_found numeric,
  market_price numeric,
  profit numeric,
  roi numeric,
  score numeric,
  confidence numeric,
  price_source text,
  vinted_url text unique,
  status text default 'live',
  created_at timestamptz default now()
);

alter table watchlist enable row level security;
alter table market_opportunities enable row level security;

create policy "authenticated can read watchlist" on watchlist
  for select to authenticated using (true);
create policy "authenticated can read opportunities" on market_opportunities
  for select to authenticated using (true);

insert into watchlist (brand, model, category, priority, min_profit, min_roi) values
  ('Nike', 'Shox TL', 'Sneakers', 3, 40, 80),
  ('Salomon', 'XT-6', 'Sneakers', 3, 40, 80),
  ('New Balance', '2002R', 'Sneakers', 2, 30, 60),
  ('Adidas', 'Samba', 'Sneakers', 2, 25, 50),
  ('Carhartt', 'Detroit', 'Jackets', 3, 50, 60),
  ('The North Face', 'Nuptse', 'Jackets', 2, 40, 60),
  ('Stussy', 'Zip Hoodie', 'Sweat', 2, 25, 50)
on conflict (brand, model) do nothing;