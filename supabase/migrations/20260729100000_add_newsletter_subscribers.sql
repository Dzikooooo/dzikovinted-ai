-- Newsletter : capture d'email reelle depuis la landing (page /newsletter).
-- Pas d'infra d'envoi construite dans ce chantier (voir memoire projet) --
-- cette table capture les inscriptions des maintenant pour ne pas perdre
-- de contacts en attendant.
create table if not exists newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table newsletter_subscribers enable row level security;

-- Inscription publique (page non authentifiee) -- ecriture seule, jamais de
-- lecture cote client (pas de fuite de la liste des emails).
create policy "anyone can subscribe to the newsletter"
  on newsletter_subscribers for insert
  to anon, authenticated
  with check (true);
