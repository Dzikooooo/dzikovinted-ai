-- Espace Communaute, Lot 6 : support par tickets. Lot le plus sensible cote
-- confidentialite de tout ce chantier -- deux garanties non-negociables :
-- 1) un utilisateur ne peut jamais lire les tickets/messages d'un autre
--    utilisateur (sauf l'admin) ;
-- 2) un utilisateur ne peut jamais poster un message marque comme reponse
--    officielle de l'equipe (is_admin_reply=true) -- seul is_admin() le
--    peut, verifie dans insert_ticket_messages ci-dessous.
--
-- Journal de messages immuable (pas d'update/delete), meme discipline que
-- action_log_entries (20260714... voir DATABASE.md).
--
-- Reutilise is_admin() defini dans 20260727100000_add_community_content.sql.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  subject text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  min_plan text check (min_plan in ('free', 'pro', 'team')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  is_admin_reply boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_user_id_idx on public.support_tickets (user_id, updated_at desc);
create index if not exists ticket_messages_ticket_id_idx on public.ticket_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;

-- support_tickets : strictement prive (proprietaire + admin uniquement) --
-- jamais de lecture publique, contrairement a tout le reste de l'espace
-- Communaute.
drop policy if exists "select_own_support_tickets" on public.support_tickets;
create policy "select_own_support_tickets" on public.support_tickets
  for select to authenticated
  using (user_id = auth.uid() or is_admin());

drop policy if exists "insert_own_support_tickets" on public.support_tickets;
create policy "insert_own_support_tickets" on public.support_tickets
  for insert to authenticated
  with check (user_id = auth.uid());

-- Le proprietaire peut clore/rouvrir son propre ticket, l'admin peut
-- changer le statut de n'importe lequel (file d'attente).
drop policy if exists "update_own_support_tickets" on public.support_tickets;
create policy "update_own_support_tickets" on public.support_tickets
  for update to authenticated
  using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

drop policy if exists "delete_admin_support_tickets" on public.support_tickets;
create policy "delete_admin_support_tickets" on public.support_tickets
  for delete to authenticated
  using (is_admin());

-- ticket_messages : lecture limitee aux messages d'un ticket que
-- l'utilisateur possede (ou l'admin, pour la file d'attente).
drop policy if exists "select_own_ticket_messages" on public.ticket_messages;
create policy "select_own_ticket_messages" on public.ticket_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and (t.user_id = auth.uid() or is_admin())
    )
  );

-- Garde-fou anti-usurpation : is_admin_reply ne peut valoir true que si le
-- posteur est reellement admin -- sans quoi un utilisateur pourrait
-- inserer un message affiche comme "Reponse de l'equipe" dans son propre
-- ticket. Egalement : on ne peut poster que sur un ticket qu'on possede
-- (ou en tant qu'admin), jamais sur celui d'un tiers.
drop policy if exists "insert_own_ticket_messages" on public.ticket_messages;
create policy "insert_own_ticket_messages" on public.ticket_messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (is_admin_reply = false or is_admin())
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and (t.user_id = auth.uid() or is_admin())
    )
  );

-- Pas de policy update/delete sur ticket_messages : journal immuable, meme
-- discipline que action_log_entries.

-- Touche updated_at du ticket a chaque nouveau message -- permet de trier
-- la file d'attente admin par activite recente plutot que par date de
-- creation. SECURITY DEFINER : evite de dupliquer la meme condition de
-- propriete que la policy update_own_support_tickets dans un second
-- endroit qui devrait rester synchronise indefiniment.
create or replace function public.touch_ticket_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update support_tickets set updated_at = now() where id = new.ticket_id;
  return null;
end;
$$;

drop trigger if exists trg_touch_ticket_on_new_message on public.ticket_messages;
create trigger trg_touch_ticket_on_new_message
  after insert on public.ticket_messages
  for each row
  execute function public.touch_ticket_on_new_message();
