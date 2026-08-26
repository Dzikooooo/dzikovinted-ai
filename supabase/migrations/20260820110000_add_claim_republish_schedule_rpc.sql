-- ROUND 4 -- claim atomique d'un job republish_schedules avant execution
-- reelle (voir l'audit valide : "alarm -> executeClaimedSchedule -> claim
-- RPC atomique -> reconstruction payload -> runAction existant -> resultat
-- terminal Supabase"). Meme idiome deja etabli dans ce schema pour un besoin
-- identique (reservation atomique anti-course, voir
-- reserve_checkout_slot/release_checkout_reservation,
-- 20260809100000_stripe_race_conditions_and_realtime.sql) : un seul UPDATE
-- conditionnel, jamais un SELECT puis une decision cote application --
-- Postgres serialise reellement les appels concurrents sur la meme ligne via
-- le verrouillage de ligne implicite de cet UPDATE, garantissant qu'au plus
-- UN appelant peut faire passer un meme schedule de 'scheduled' a 'running',
-- quel que soit le nombre de declencheurs qui tentent le claim au meme
-- instant (alarme precise + sweep periodique, voir republishScheduler.ts).
--
-- attempt_count = attempt_count + 1 : PostgREST/le client JS ne peut pas
-- exprimer un increment SQL relatif dans un .update() (uniquement des
-- valeurs litterales) -- une RPC est necessaire pour ca de toute facon, pas
-- seulement pour l'atomicite du WHERE.
--
-- SECURITY DEFINER contourne RLS -- `and user_id = auth.uid()` est donc
-- ajoute EXPLICITEMENT dans le WHERE (contrairement a reserve_checkout_slot,
-- qui n'a pas besoin de cette clause car son seul appelant reel est une Edge
-- Function deja scopee) : cette fonction est appelee directement par
-- l'extension avec le JWT utilisateur (anon key + JWT, jamais service_role,
-- voir supabaseClient.ts::supabaseWithToken) -- sans cette clause, un appel
-- avec un schedule_id qui n'appartient pas a l'appelant pourrait en theorie
-- reussir malgre RLS. Coherent avec la discipline "user_id = auth.uid()"
-- deja appliquee partout ailleurs dans ce schema.

create or replace function public.claim_republish_schedule(p_schedule_id uuid, p_locked_by text)
returns table (claimed boolean, listing_id uuid, vinted_account_id uuid, package_size text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id uuid;
  v_vinted_account_id uuid;
  v_package_size text;
  v_claimed boolean := false;
begin
  update public.republish_schedules
  set status = 'running',
      started_at = now(),
      locked_at = now(),
      locked_by = p_locked_by,
      attempt_count = attempt_count + 1,
      updated_at = now()
  where id = p_schedule_id
    and status = 'scheduled'
    and user_id = auth.uid()
  returning republish_schedules.listing_id, republish_schedules.vinted_account_id, republish_schedules.package_size
    into v_listing_id, v_vinted_account_id, v_package_size;

  if found then
    v_claimed := true;
  end if;

  return query select v_claimed, v_listing_id, v_vinted_account_id, v_package_size;
end;
$$;

revoke execute on function public.claim_republish_schedule(uuid, text) from anon;
revoke execute on function public.claim_republish_schedule(uuid, text) from public;
grant execute on function public.claim_republish_schedule(uuid, text) to authenticated;
