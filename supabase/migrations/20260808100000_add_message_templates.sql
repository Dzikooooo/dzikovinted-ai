-- Modeles de message (chantier Communication, reprise 2026-08-08, voir
-- AUDIT_SUIVI_COMMUNICATION.md) -- perimetre volontairement etroit :
-- l'utilisateur ecrit et possede son propre texte, ResellOS ne fait que le
-- stocker et resoudre des variables ({titre}/{prix}/...) a l'affichage,
-- jamais d'envoi automatique (aucune table conversation/message Vinted,
-- aucun lien vers un acheteur precis -- l'API wardrobe Vinted ne retourne
-- qu'un compteur de favoris, jamais une identite, voir l'audit). Meme
-- convention RLS que opportunity_favourites (proprete pure utilisateur,
-- auth.uid() = user_id, CRUD complet).

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table message_templates enable row level security;

create policy "users can read own message templates" on message_templates
  for select to authenticated using (auth.uid() = user_id);

create policy "users can insert own message templates" on message_templates
  for insert to authenticated with check (auth.uid() = user_id);

create policy "users can update own message templates" on message_templates
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users can delete own message templates" on message_templates
  for delete to authenticated using (auth.uid() = user_id);
