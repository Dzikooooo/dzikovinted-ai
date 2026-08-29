-- Centre de notifications complet (demande produit 2026-08-29) : la table
-- notifications ne couvrait jusqu'ici que 2 des 3 types d'evenements
-- demandes ('sale' = mise a jour business, 'community'/'admin_broadcast' =
-- messagerie admin). Il manquait : les reponses de messagerie/support
-- (ticket_messages existe deja mais n'ecrivait jamais dans notifications)
-- et les alertes produit/stock (deja calculees en temps reel par
-- src/lib/insights/alerts.ts, mais jamais persistees).

-- 1. Elargit le type autorise -- constraint name confirmee en prod
-- (notifications_type_check) avant cette migration.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('sale', 'community', 'admin_broadcast', 'ticket_reply', 'stock_alert'));

-- 2. 'stock_alert' : notification PERSONNELLE (l'utilisateur constate un
-- probleme sur SON propre stock), meme regle d'ecriture que 'sale' --
-- jamais pour le compte de quelqu'un d'autre.
drop policy if exists "users can create their own sale notifications" on public.notifications;
create policy "users can create their own sale notifications"
  on public.notifications for insert
  to authenticated
  with check (type in ('sale', 'stock_alert') and user_id = auth.uid());

-- 3. 'ticket_reply' : PAS d'elargissement de policy necessaire ici -- la
-- notification est creee par un trigger SECURITY DEFINER (ci-dessous), qui
-- s'execute avec les privileges de son proprietaire et n'est donc jamais
-- soumis a la policy d'insertion "authenticated" -- exactement la meme
-- discipline que touch_ticket_on_new_message (20260727150000), qui ecrit
-- deja sur support_tickets sans policy dediee pour lui-meme. Se declenche
-- UNIQUEMENT sur une reponse admin reelle (is_admin_reply=true), elle-meme
-- deja verifiee par insert_own_ticket_messages (is_admin_reply=false or
-- is_admin()) -- ce trigger ne fait qu'ajouter un effet de bord honnete a
-- un evenement deja legitime, jamais une nouvelle porte d'entree.
create or replace function public.notify_on_admin_ticket_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket_owner uuid;
  ticket_subject text;
begin
  if new.is_admin_reply is not true then
    return null;
  end if;

  select user_id, subject into ticket_owner, ticket_subject
  from support_tickets where id = new.ticket_id;

  -- Un admin qui repond a son PROPRE ticket ne se notifie pas lui-meme.
  if ticket_owner is null or ticket_owner = new.author_id then
    return null;
  end if;

  insert into notifications (user_id, type, title, body, target_page, created_by)
  values (
    ticket_owner,
    'ticket_reply',
    'Réponse à ton ticket',
    coalesce(ticket_subject, 'Support'),
    'community',
    new.author_id
  );

  return null;
end;
$$;

drop trigger if exists trg_notify_on_admin_ticket_reply on public.ticket_messages;
create trigger trg_notify_on_admin_ticket_reply
  after insert on public.ticket_messages
  for each row
  execute function public.notify_on_admin_ticket_reply();
