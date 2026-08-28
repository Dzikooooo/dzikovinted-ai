-- Garde-fou generique anti-abus pour les Edge Functions sans systeme de
-- credits (scan-market, dziko-assistant) -- audit du 2026-08-28 : les deux
-- endpoints pouvaient etre appeles sans aucune limite par un utilisateur
-- authentifie, au risque d'epuiser le quota Gemini partage (deja au niveau
-- gratuit, voir project_gemini_production_audit) ou de spammer le workflow
-- GitHub Actions de scan-market. Volontairement PAS le systeme de credits
-- (reserve_credit/consume_credit_reservation) : ces deux fonctionnalites ne
-- sont pas facturees et ne doivent pas le devenir par effet de bord -- un
-- simple cooldown par utilisateur suffit a l'objectif (proteger la
-- ressource partagee), sans changer le modele economique.
--
-- Table generique (scope text) plutot qu'une table par endpoint : le meme
-- mecanisme sera reutilisable pour toute future Edge Function qui en aurait
-- besoin, sans nouvelle migration.
create table rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  last_request_at timestamptz not null default now(),
  primary key (user_id, scope)
);

alter table rate_limits enable row level security;

-- Aucune policy : cette table n'est jamais lue/ecrite directement par un
-- client (anon/authenticated), uniquement via try_consume_rate_limit()
-- ci-dessous, appelee par un client service_role depuis l'Edge Function
-- elle-meme -- meme discipline que credit_reservations (RLS activee,
-- REVOKE explicite, aucune policy).
revoke all on rate_limits from public, anon, authenticated;

-- Verifie ET enregistre l'appel en une seule instruction atomique : la
-- clause WHERE dans ON CONFLICT ... DO UPDATE ne s'applique (et donc ne
-- retourne une ligne via RETURNING) que si le cooldown est ecoule. Un
-- premier appel pour un (user_id, scope) donne n'a pas de conflit, s'insere
-- normalement et est donc toujours autorise. Concurrence gérée nativement
-- par le verrou de ligne pose par l'upsert -- pas de lecture-puis-ecriture
-- separee qui laisserait une fenetre de course.
create or replace function try_consume_rate_limit(p_user_id uuid, p_scope text, p_cooldown_seconds int)
returns boolean
language sql
security definer
set search_path = public
as $$
  insert into rate_limits (user_id, scope, last_request_at)
  values (p_user_id, p_scope, now())
  on conflict (user_id, scope) do update
    set last_request_at = now()
    where rate_limits.last_request_at <= now() - make_interval(secs => p_cooldown_seconds)
  returning true;
$$;

-- Comme reserve_credit/consume_credit_reservation (migration
-- 20260804130000) : jamais appelable directement par un utilisateur, meme
-- en connaissant la signature -- uniquement depuis une Edge Function via le
-- client service_role.
revoke all on function try_consume_rate_limit(uuid, text, int) from public, anon, authenticated;
grant execute on function try_consume_rate_limit(uuid, text, int) to service_role;
