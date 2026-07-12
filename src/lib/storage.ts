import { supabase } from './supabase';

// Bucket deja documente (DATABASE.md) mais jamais cree par une migration
// versionnee ni jamais utilise par du code avant ce correctif -- voir
// supabase/migrations/20260713100000_add_listing_photos_bucket.sql.
const LISTING_PHOTOS_BUCKET = 'listing-images';

async function uploadOne(userId: string, blobUrl: string): Promise<string> {
  const res = await fetch(blobUrl);
  if (!res.ok) throw new Error(`Impossible de lire la photo (${res.status})`);
  const blob = await res.blob();

  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(LISTING_PHOTOS_BUCKET)
    .upload(path, blob, { contentType: blob.type || 'image/jpeg' });
  if (error) throw new Error(`Echec de l'envoi de la photo : ${error.message}`);

  const { data } = supabase.storage.from(LISTING_PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Convertit des blob: URL (uniquement valides dans l'onglet courant) en
// URL publiques durables. Echoue explicitement plutot que de retomber
// silencieusement sur l'URL blob d'origine, qui casserait au premier
// reload -- exactement le bug que cette fonction corrige.
export async function uploadListingPhotos(userId: string, blobUrls: string[]): Promise<string[]> {
  return Promise.all(blobUrls.map((url) => uploadOne(userId, url)));
}
