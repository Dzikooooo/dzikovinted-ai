-- Retour bêta-testeur reel (Albin, 2026-08-11, retour 4) : "pour les
-- annonces ia pouvoir mettre un modele de titre et description que l'ia
-- modifie en fonction de l'annonce". NON APPLIQUEE en production dans
-- cette passe -- creee pour revue avant autorisation (voir rapport).
--
-- Architecture retenue (voir analyze-clothing/index.ts) : PAS un simple
-- remplacement de variables cote client -- ces deux champs sont transmis
-- comme instruction de style dans le prompt Gemini, qui reste seul
-- responsable de produire titre/description en conciliant donnees
-- factuelles reelles + optimisation Vinted deja en place + preference de
-- style du vendeur. Absent/vide = comportement actuel inchange a
-- l'identique (aucune instruction de style ajoutee au prompt).
--
-- Champs non sensibles (simples preferences de redaction, aucun lien avec
-- facturation/credits/programme beta) -- meme regime de grant direct que
-- profiles.full_name (20260711090000_lock_billing_columns.sql) : editable
-- par l'utilisateur lui-meme via SettingsPage.tsx, pas de RPC dediee.

alter table public.profiles add column if not exists title_style text;
alter table public.profiles add column if not exists description_style text;

-- Garde-fou de taille raisonnable (evite un texte demesure envoye a chaque
-- appel Gemini) -- 500 caracteres suffit largement a decrire un style
-- ("toujours mentionner la coupe et le tissu", "titre court, direct, sans
-- emoji"), tout en restant simple a valider cote UI (compteur de
-- caracteres possible plus tard, pas necessaire ici).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_title_style_length_check'
  ) then
    alter table public.profiles
      add constraint profiles_title_style_length_check check (title_style is null or char_length(title_style) <= 500);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_description_style_length_check'
  ) then
    alter table public.profiles
      add constraint profiles_description_style_length_check check (description_style is null or char_length(description_style) <= 500);
  end if;
end $$;

-- Grant additif (n'affecte pas le grant existant sur full_name) : ces deux
-- colonnes restent les SEULES, avec full_name, modifiables directement par
-- authenticated sur profiles -- plan/credits/program_status/credits_mode
-- etc. restent verrouilles (REVOKE de table herite, 20260711090000).
grant update (title_style, description_style) on public.profiles to authenticated;
