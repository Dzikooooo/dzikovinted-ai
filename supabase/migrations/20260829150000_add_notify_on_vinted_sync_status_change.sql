-- Pilier "Stock Vinted (synchronisation et statuts)" (2026-08-29, suite
-- Pricer Pro) : notifie la cloche a chaque changement REEL de
-- listings.vinted_sync_status vers 'sync_success' ou 'sync_failed'.
--
-- Ce champ n'a que deux ecrivains dans tout le repo, tous deux des actions
-- DELIBEREES sur UNE annonce a la fois (jamais un lot) :
--   1. ListingsManagementSection.tsx (web app) -- 'sync_pending' avant un
--      edit_listing (push ResellOS -> Vinted), puis 'sync_success'/
--      'sync_failed' selon le resultat reel de l'action.
--   2. recordSingleItemImport() (extension/src/background/sync.ts) --
--      'sync_success' sur une reconciliation manuelle "Mettre a jour dans
--      ResellOS" d'un item precis.
-- La synchro passive en masse ("Synchroniser maintenant", recordListings()
-- meme fichier) n'ecrit JAMAIS cette colonne (verifie : elle ne fait que la
-- LIRE pour decider si le prix Vinted doit ecraser un brouillon local en
-- attente, voir migration 20260715090000_add_vinted_sync_status.sql pour la
-- semantique complete) -- ce trigger ne peut donc jamais se declencher en
-- rafale pendant un import de stock, uniquement sur ces deux actions
-- explicites et unitaires. Meme discipline SECURITY DEFINER que
-- notify_on_admin_ticket_reply/notify_on_user_ticket_message (20260829130000/
-- 20260829140000) : effet de bord honnete sur une ecriture deja legitime
-- (owner-scopee par update_own_listings), jamais une nouvelle porte d'entree.
--
-- Deux NOUVEAUX types ('sync_success'/'sync_failed'), pas une reutilisation
-- de 'stock_alert' : NOTIFICATION_TYPE_STYLE (notificationTypeStyle.ts) fixe
-- l'icone/couleur PAR type, et 'stock_alert' porte deja une icone
-- d'avertissement (AlertTriangle, orange) pour l'alerte "stock dormant" --
-- l'afficher aussi sur une notification de SUCCES aurait ete trompeur (une
-- cloche verte "réussi" avec une icone de warning). Aucune policy d'insertion
-- a elargir (voir note ci-dessus, meme raison que ticket_reply) : seule la
-- contrainte type doit accepter ces deux nouvelles valeurs.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('sale', 'community', 'admin_broadcast', 'ticket_reply', 'stock_alert', 'sync_success', 'sync_failed'));
--
-- `when` (et non un simple `if` dans le corps) : ne se declenche QUE sur un
-- changement REEL de valeur, jamais pour une ecriture qui laisse le champ
-- inchange (ex. une synchro passive qui touche `synced_at`/`favourites` sans
-- toucher ce champ). Passer de sync_pending a sync_failed, relancer (repasse
-- par sync_pending), puis un nouveau sync_failed redeclenche bien une
-- notification a chaque ECHEC/SUCCES distinct -- c'est le comportement
-- demande ("etre averti ... pour pouvoir relancer ou corriger").
create or replace function public.notify_on_vinted_sync_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.vinted_sync_status = 'sync_success' then
    insert into notifications (user_id, type, title, body, target_page)
    values (
      new.user_id,
      'sync_success',
      'Synchronisation Vinted réussie',
      coalesce(new.title, 'Cette annonce') || ' est à jour sur Vinted.',
      'watchlist'
    );
  elsif new.vinted_sync_status = 'sync_failed' then
    insert into notifications (user_id, type, title, body, target_page)
    values (
      new.user_id,
      'sync_failed',
      'Échec de synchronisation Vinted',
      coalesce(new.title, 'Cette annonce') || ' n''a pas pu être mise à jour sur Vinted. Réessaie depuis Mes annonces.',
      'watchlist'
    );
  end if;

  return null;
end;
$$;

drop trigger if exists trg_notify_on_vinted_sync_status_change on public.listings;
create trigger trg_notify_on_vinted_sync_status_change
  after update of vinted_sync_status on public.listings
  for each row
  when (new.vinted_sync_status is distinct from old.vinted_sync_status)
  execute function public.notify_on_vinted_sync_status_change();
