-- Credits illimites pour le compte du proprietaire du produit, via un role
-- serveur plutot qu'une condition fragile cote frontend. Meme verrouillage
-- que plan/credits (20260711090000_lock_billing_columns.sql) : authenticated
-- n'a deja aucun droit UPDATE sur profiles hors full_name, role en herite
-- automatiquement -- aucun GRANT supplementaire necessaire.

ALTER TABLE public.profiles
  ADD COLUMN role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));

-- Bootstrap : profiles.email est peuplee par le trigger de signup existant
-- (handle_new_user, 20260615080503) -- WHERE email = ... est fiable.
-- Email confirme par l'utilisateur le 2026-07-13 comme etant son compte
-- ResellOS reel (distinct de son email de contact) -- applique manuellement
-- en prod via `supabase db query --linked` puisque cette migration avait
-- deja ete poussee avec un email different (0 ligne modifiee, sans erreur).
UPDATE public.profiles SET role = 'admin' WHERE lower(email) = lower('moncul@gmail.com');

-- Horodatage de la derniere edition manuelle d'une annonce depuis
-- ResellOS (modale "Modifier l'annonce", StockPage.tsx) -- affiche comme
-- historique simple ("Modifie le ..."), pas de table de versions separee.
ALTER TABLE public.listings
  ADD COLUMN last_edited_at timestamptz NULL;
