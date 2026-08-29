-- Audit DCP (2026-08-29) : la politique de confidentialite (LegalPage.tsx,
-- section 5) promet que la suppression de compte efface les donnees
-- personnelles de la base -- mais aucune fonctionnalite reelle n'existe
-- (bouton desactive "bientot disponible", SettingsPage.tsx). Avant de
-- brancher un vrai delete-account (Edge Function, `auth.admin.deleteUser`),
-- il faut que la base elle-meme supporte une suppression propre : un
-- `DELETE FROM auth.users` cascade automatiquement `profiles` (deja
-- `ON DELETE CASCADE` depuis le schema d'origine) et la plupart des tables
-- liees a l'utilisateur -- MAIS 12 contraintes decouvertes ici n'ont AUCUNE
-- action de suppression (`NO ACTION`, verifie via pg_constraint en
-- production), ce qui ferait echouer la suppression avec une violation de
-- cle etrangere des qu'un utilisateur a la moindre ligne dans l'une de ces
-- tables (action_log en particulier : quasiment CHAQUE utilisateur actif en
-- a, voir engine.ts).
--
-- CASCADE pour tout ce qui est strictement personnel (l'utilisateur est
-- proprietaire exclusif de la ligne). SET NULL uniquement pour
-- notifications.created_by : une notification diffusee (ex. annonce
-- systeme) ne doit pas disparaitre pour TOUS ses destinataires simplement
-- parce que l'admin qui l'a creee supprime ensuite son propre compte --
-- seule l'attribution doit sauter, colonne deja nullable.
--
-- Compromis assume et documente plutot que cache : ticket_messages.author_id
-- passe en CASCADE comme le reste -- si un ADMIN supprime un jour son propre
-- compte, ses reponses dans les tickets d'AUTRES utilisateurs disparaitraient
-- avec lui (pas seulement son propre ticket). Cas marginal (aucun
-- revendeur classique n'est admin) et une vraie politique SET NULL
-- demanderait de rendre la colonne nullable + verifier l'affichage cote UI
-- d'un auteur absent -- hors perimetre de cette correction, a traiter si le
-- cas se presente reellement.

alter table public.action_log
  drop constraint action_log_user_id_fkey,
  add constraint action_log_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.listing_recommendation_log
  drop constraint listing_recommendation_log_user_id_fkey,
  add constraint listing_recommendation_log_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.republish_schedules
  drop constraint republish_schedules_user_id_fkey,
  add constraint republish_schedules_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.community_content
  drop constraint community_content_author_id_fkey,
  add constraint community_content_author_id_fkey foreign key (author_id) references public.profiles(id) on delete cascade;

alter table public.roadmap_items
  drop constraint roadmap_items_author_id_fkey,
  add constraint roadmap_items_author_id_fkey foreign key (author_id) references public.profiles(id) on delete cascade;

alter table public.polls
  drop constraint polls_author_id_fkey,
  add constraint polls_author_id_fkey foreign key (author_id) references public.profiles(id) on delete cascade;

alter table public.poll_votes
  drop constraint poll_votes_user_id_fkey,
  add constraint poll_votes_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.suggestions
  drop constraint suggestions_author_id_fkey,
  add constraint suggestions_author_id_fkey foreign key (author_id) references public.profiles(id) on delete cascade;

alter table public.suggestion_votes
  drop constraint suggestion_votes_user_id_fkey,
  add constraint suggestion_votes_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.support_tickets
  drop constraint support_tickets_user_id_fkey,
  add constraint support_tickets_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.ticket_messages
  drop constraint ticket_messages_author_id_fkey,
  add constraint ticket_messages_author_id_fkey foreign key (author_id) references public.profiles(id) on delete cascade;

alter table public.notifications
  drop constraint notifications_created_by_fkey,
  add constraint notifications_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
