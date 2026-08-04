-- Candidatures "rejoindre les coulisses / l'equipe" depuis la page A propos
-- publique (section "Les coulisses du developpement"). Meme discipline que
-- newsletter_subscribers (20260729100000) : capture reelle des maintenant,
-- traitement manuel par email cote Dziko, pas d'automatisation de reponse.
create table if not exists team_applications (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  created_at timestamptz not null default now()
);

alter table team_applications enable row level security;

-- Formulaire public (page non authentifiee) -- ecriture seule, jamais de
-- lecture cote client (pas de fuite des candidatures).
create policy "anyone can submit a team application"
  on team_applications for insert
  to anon, authenticated
  with check (true);
