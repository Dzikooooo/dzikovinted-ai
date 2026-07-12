-- Les photos uploadees dans le Generateur restaient des blob: URLs (jamais
-- envoyees vers un stockage durable) et etaient enregistrees telles quelles
-- dans listings.image_urls -- elles cassent des que l'onglet d'origine se
-- ferme (nouvelle session, reload).
--
-- DATABASE.md documentait deja un bucket `listing-images` ("photos des
-- annonces") avec un souci de securite connu (policy permettant de lister
-- tous les fichiers, signale par `supabase db advisors`, jamais corrige) --
-- mais aucune migration versionnee ne l'avait jamais cree, et zero ligne de
-- code n'y ecrivait (grep confirme sur tout src/) : cree hors du flux
-- `db push` (meme piege que documente en tete de DATABASE.md), jamais
-- reellement utilise. On reutilise ce bucket existant (idempotent via
-- `on conflict do nothing`) plutot que d'en creer un second, redondant.
-- La policy de listing publique pre-existante n'est pas touchee ici (nom
-- inconnu, prudence plutot que DROP a l'aveugle) -- reste un TODO distinct,
-- deja tracke dans DATABASE.md.

insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', true)
on conflict (id) do nothing;

-- Chemin attendu : {user_id}/{uuid}.jpg -- le premier segment du chemin
-- sert de scope proprietaire, meme convention que RLS sur les autres
-- tables (auth.uid() = user_id).

create policy "listing_images_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'listing-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "listing_images_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'listing-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "listing_images_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'listing-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Lecture publique necessaire : les URLs sont utilisees directement en
-- <img src> partout dans l'app ET relayees telles quelles a l'extension
-- pour prefiller le formulaire de publication Vinted (le content script
-- n'a pas de session Supabase authentifiee pour aller chercher une URL
-- signee).
create policy "listing_images_public_read"
on storage.objects for select to public
using (bucket_id = 'listing-images');
