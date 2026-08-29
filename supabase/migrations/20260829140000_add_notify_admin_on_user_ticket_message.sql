-- Refonte Administration en 2 onglets (2026-08-29) : quand un ADMIN
-- repond a un ticket, notify_on_admin_ticket_reply (20260829130000) notifie
-- deja l'utilisateur. La direction inverse manquait -- quand un
-- UTILISATEUR envoie un message (nouveau ticket ou reponse), l'admin
-- n'etait alerte que par Discord (notify-ticket-discord, best-effort, hors
-- base de donnees) : aucune ligne dans notifications, donc ni cloche ni
-- notification navigateur. Symetrique de notify_on_admin_ticket_reply,
-- meme discipline (SECURITY DEFINER, effet de bord honnete sur un
-- evenement deja legitime -- insert_own_ticket_messages verifie deja que
-- l'auteur est bien le proprietaire du ticket ou un admin).
--
-- Cible TOUS les comptes role='admin' individuellement (jamais une
-- diffusion user_id=null) : une notification "nouveau message" ne doit
-- etre visible que par l'equipe, pas par tous les utilisateurs -- la RLS
-- de `notifications` rend user_id=null visible par TOUT LE MONDE
-- (select "user_id = auth.uid() or user_id is null"), inadapte ici.
create or replace function public.notify_on_user_ticket_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row record;
  ticket_subject text;
begin
  if new.is_admin_reply is not false then
    return null;
  end if;

  select subject into ticket_subject from support_tickets where id = new.ticket_id;

  for admin_row in select id from profiles where role = 'admin' and id != new.author_id loop
    insert into notifications (user_id, type, title, body, target_page, created_by)
    values (
      admin_row.id,
      'ticket_reply',
      'Nouveau message de support',
      coalesce(ticket_subject, 'Support'),
      -- 'admin', pas 'community' : le contraire exact de
      -- notify_on_admin_ticket_reply, qui cible l'utilisateur (sa page
      -- Support vit dans Communaute). L'admin, lui, gere ses messages
      -- dans Administration > Messages (voir AdminUsersPage.tsx et le
      -- deep-link resellos:adminTab pose au clic sur la notification).
      'admin',
      new.author_id
    );
  end loop;

  return null;
end;
$$;

drop trigger if exists trg_notify_on_user_ticket_message on public.ticket_messages;
create trigger trg_notify_on_user_ticket_message
  after insert on public.ticket_messages
  for each row
  execute function public.notify_on_user_ticket_message();
