import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Meme nom que src/lib/storage.ts::LISTING_PHOTOS_BUCKET -- le bucket
// s'appelle "listing-images" cote Supabase malgre le nom de variable.
const LISTING_PHOTOS_BUCKET = "listing-images";

export interface DeleteAccountDeps {
  supabaseAdmin: SupabaseClient;
}

export type DeleteAccountResult = { ok: true } | { ok: false; status: number; error: string };

// Best-effort sur le stockage : une photo orpheline dans le bucket est un
// probleme mineur (l'utilisateur supprime n'a plus de JWT valide pour y
// acceder de toute facon), pas une raison de bloquer la suppression du
// compte lui-meme -- qui EST l'engagement RGPD reel (LegalPage.tsx, sections
// 5 et 6). Un echec ici est logue, jamais remonte comme un echec global.
async function deleteStoragePhotos(supabaseAdmin: SupabaseClient, userId: string): Promise<void> {
  const { data: files, error: listError } = await supabaseAdmin.storage.from(LISTING_PHOTOS_BUCKET).list(userId);
  if (listError) {
    console.error("[delete-account] echec listage photos, suppression du compte non bloquee", listError);
    return;
  }
  if (!files || files.length === 0) return;

  const paths = files.map((f) => `${userId}/${f.name}`);
  const { error: removeError } = await supabaseAdmin.storage.from(LISTING_PHOTOS_BUCKET).remove(paths);
  if (removeError) {
    console.error("[delete-account] echec suppression photos, suppression du compte non bloquee", removeError);
  }
}

// Point d'entree unique : `auth.admin.deleteUser` supprime la ligne
// auth.users, qui cascade `profiles` (deja ON DELETE CASCADE depuis le
// schema d'origine) puis toutes les tables liees a l'utilisateur -- voir
// migration 20260829100000_fix_user_data_cascade_for_account_deletion.sql,
// qui corrige les 12 contraintes qui bloquaient silencieusement cette
// cascade jusqu'ici. Le stockage (photos) n'est pas couvert par une
// cascade Postgres, gere separement ci-dessus, AVANT, en best-effort.
export async function deleteUserAccount(deps: DeleteAccountDeps, userId: string): Promise<DeleteAccountResult> {
  await deleteStoragePhotos(deps.supabaseAdmin, userId);

  const { error } = await deps.supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[delete-account] echec suppression du compte", error);
    return { ok: false, status: 500, error: "Erreur serveur, réessaie plus tard ou contacte le support." };
  }

  return { ok: true };
}
