-- Liste d'attente / beta privee (2026-08-30) : securise la page d'accueil
-- pour filtrer les acces et limiter les abus pendant la beta. Deux briques
-- distinctes, jamais confondues :
--
-- 1. waitlist_signups -- capture d'email SANS creation de compte (formulaire
--    landing, friction minimale). Insert public (anon+authenticated), lecture
--    reservee aux admins.
-- 2. profiles.beta_approved -- le gate REEL d'acces au dashboard. La
--    creation de compte elle-meme (AuthPage.tsx signUp()) reste inchangee et
--    ouverte -- seul ce qu'on peut faire UNE FOIS CONNECTE est bloque tant
--    que ce flag n'est pas passe a true (voir App.tsx). C'est deliberement
--    different de `banned` (qui deconnecte immediatement) : un compte en
--    attente reste connecte, juste bloque sur un ecran dedie, et se
--    debloque EN DIRECT des l'approbation (Realtime deja cable sur profiles,
--    voir AuthContext.tsx profile_sync_${user.id}) -- pas besoin de
--    reconnexion.
--
-- BACKFILL EXPLICITE ET DELIBERE : les comptes deja existants au moment de
-- cette migration (verifie : 16 en prod) passent tous a beta_approved=true.
-- Cette fonctionnalite ne doit JAMAIS bloquer retroactivement un utilisateur
-- deja actif -- seuls les COMPTES CREES APRES cette migration partent de
-- `false` (valeur par defaut de la colonne pour toute nouvelle ligne).

create table public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  -- Normalisee en minuscules cote client (WaitlistForm.tsx) avant l'insert --
  -- necessaire pour que la contrainte unique et les ON CONFLICT (uuid) des
  -- RPC ci-dessous restent fiables sans index fonctionnel supplementaire.
  email text not null unique,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  notes text
);

alter table public.waitlist_signups enable row level security;

-- N'importe qui (visiteur non connecte inclus) peut rejoindre la liste --
-- c'est le point du formulaire sur la landing. Aucune lecture publique :
-- une liste d'attente n'est pas une donnee a exposer (adresses email
-- d'autres personnes) -- seuls les admins la consultent.
create policy "anyone can join the waitlist"
  on public.waitlist_signups for insert
  to anon, authenticated
  with check (true);

create policy "admins can view the waitlist"
  on public.waitlist_signups for select
  to authenticated
  using (public.is_admin());

-- Colonne de gate reelle. default false : tout NOUVEAU compte demarre non
-- approuve -- c'est le comportement recherche par cette fonctionnalite.
alter table public.profiles
  add column beta_approved boolean not null default false;

-- Backfill : jamais retroactif sur les comptes deja actifs (voir en-tete).
update public.profiles set beta_approved = true;

-- Etend handle_new_user() (20260615105551, search_path='' deja la
-- convention de cette fonction -- chaque reference reste explicitement
-- qualifiee public.*) : si l'email du nouvel inscrit correspond a une ligne
-- waitlist_signups deja approuvee, le compte est immediatement actif -- pas
-- besoin d'une seconde action admin apres coup quand la personne s'inscrit
-- APRES avoir ete approuvee sur la liste (allowlist par email).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_preapproved boolean;
begin
  select exists (
    select 1 from public.waitlist_signups
    where lower(email) = lower(new.email) and status = 'approved'
  ) into is_preapproved;

  insert into public.profiles (id, email, full_name, plan, credits, beta_approved)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'free',
    10,
    coalesce(is_preapproved, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- RPC admin : bascule directe sur un compte DEJA EXISTANT -- meme structure
-- exacte que admin_set_user_banned (20260804120000), pour un admin qui gere
-- l'acces depuis la fiche d'un contact deja inscrit (AdminContactsTab.tsx).
create or replace function public.admin_set_user_beta_approved(p_user_id uuid, p_approved boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update profiles set beta_approved = p_approved where id = p_user_id;
end;
$$;

revoke execute on function public.admin_set_user_beta_approved(uuid, boolean) from anon;
revoke execute on function public.admin_set_user_beta_approved(uuid, boolean) from public;
grant execute on function public.admin_set_user_beta_approved(uuid, boolean) to authenticated;

-- RPC admin : approuve un EMAIL (liste blanche) -- couvre les deux ordres
-- possibles dans un seul appel : approuver AVANT l'inscription (upsert
-- waitlist_signups, handle_new_user() prendra le relais au signup reel) ET
-- approuver un email qui a DEJA un compte existant (met a jour profiles
-- directement, sans attendre une reinscription qui n'aura jamais lieu).
create or replace function public.admin_approve_waitlist_email(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  insert into waitlist_signups (email, status, approved_at, approved_by)
  values (lower(p_email), 'approved', now(), auth.uid())
  on conflict (email) do update
    set status = 'approved', approved_at = now(), approved_by = auth.uid();

  update profiles set beta_approved = true where lower(email) = lower(p_email);
end;
$$;

revoke execute on function public.admin_approve_waitlist_email(text) from anon;
revoke execute on function public.admin_approve_waitlist_email(text) from public;
grant execute on function public.admin_approve_waitlist_email(text) to authenticated;

-- RPC admin : rejette une demande -- ne touche JAMAIS profiles.beta_approved
-- (un rejet de liste d'attente ne doit jamais pouvoir REVOQUER l'acces d'un
-- compte deja actif par un autre chemin -- seul admin_set_user_beta_approved
-- ci-dessus le peut, explicitement et volontairement).
create or replace function public.admin_reject_waitlist_email(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update waitlist_signups set status = 'rejected' where lower(email) = lower(p_email);
end;
$$;

revoke execute on function public.admin_reject_waitlist_email(text) from anon;
revoke execute on function public.admin_reject_waitlist_email(text) from public;
grant execute on function public.admin_reject_waitlist_email(text) to authenticated;

-- Notification cloche (2026-08-30) : meme discipline que
-- notify_on_user_ticket_message (20260829140000) -- cible TOUS les comptes
-- role='admin' individuellement (jamais une diffusion user_id=null, qui
-- serait visible par tout le monde). target_page='admin' -- routage vers
-- l'onglet "Liste d'attente" gere cote client par le type de la notification
-- (NotificationBell.tsx/NotificationRecapModal.tsx), pas par une nouvelle
-- colonne.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('sale', 'community', 'admin_broadcast', 'ticket_reply', 'stock_alert', 'sync_success', 'sync_failed', 'waitlist_signup'));

create or replace function public.notify_on_waitlist_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row record;
begin
  for admin_row in select id from profiles where role = 'admin' loop
    insert into notifications (user_id, type, title, body, target_page)
    values (
      admin_row.id,
      'waitlist_signup',
      'Nouvelle demande d''accès',
      new.email,
      'admin'
    );
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_notify_on_waitlist_signup on public.waitlist_signups;
create trigger trg_notify_on_waitlist_signup
  after insert on public.waitlist_signups
  for each row
  execute function public.notify_on_waitlist_signup();
