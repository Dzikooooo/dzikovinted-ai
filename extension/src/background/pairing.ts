import { supabase, supabaseWithToken } from "./supabaseClient";
import { logger } from "./logger";
import { withRetry } from "./retry";
import { getValidAccessToken, writeStoredSession, clearStoredSession, decodeJwtExpiry } from "./session";
import type { StatusResponse } from "../lib/messages";

// Recoit la session Supabase deja ouverte dans l'app web (voir EXTENSION.md §3) -
// jamais de nouvelle authentification demandee a l'utilisateur ici.
export async function pair(accessToken: string, refreshToken: string): Promise<void> {
  // Validation stateless du token (n'utilise pas la session ambiante).
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    logger.error("Validation du token echouee", userError?.message);
    throw new Error(userError?.message ?? "Token invalide ou expire - reconnecte-toi sur ResellOS et reessaie.");
  }

  const userId = userData.user.id;

  // Ligne vinted_connection creee/mise a jour, mais connected reste tel quel -
  // l'appairage avec ResellOS et la detection d'une session Vinted reelle sont
  // deux etats distincts (voir etape 1.2 du plan). On ne force pas connected a
  // false a chaque appairage pour ne pas ecraser un etat deja detecte par une
  // synchro precedente.
  const client = supabaseWithToken(accessToken);
  await withRetry(async () => {
    const { error: upsertError } = await client
      .from("vinted_connection")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
    if (upsertError) {
      logger.error("upsert vinted_connection a echoue", upsertError.message);
      throw upsertError;
    }
  });

  const expiresAt = decodeJwtExpiry(accessToken) ?? Math.floor(Date.now() / 1000) + 3600;
  await writeStoredSession({ access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt, user_id: userId });

  logger.info("Appairage reussi");
}

export async function unpair(): Promise<void> {
  // Efface uniquement notre session stockee localement - aucun appel a
  // supabase.auth.signOut() necessaire puisqu'on ne gere plus de session
  // ambiante cote GoTrueClient. Ne touche jamais au refresh token cote
  // serveur, donc ne peut jamais affecter la session de l'app web.
  await clearStoredSession();
  logger.info("Extension dissociee");
}

export async function getStatus(): Promise<StatusResponse> {
  const valid = await getValidAccessToken();
  if (!valid) {
    return { paired: false, vintedConnected: false, lastSyncedAt: null, lastError: null };
  }

  const client = supabaseWithToken(valid.accessToken);
  const { data: row, error: rowError } = await client
    .from("vinted_connection")
    .select("connected, last_synced_at, last_error")
    .eq("user_id", valid.userId)
    .maybeSingle();

  if (rowError) {
    logger.warn("Lecture de vinted_connection impossible", rowError.message);
    return { paired: true, vintedConnected: false, lastSyncedAt: null, lastError: rowError.message };
  }

  return {
    paired: true,
    vintedConnected: row?.connected ?? false,
    lastSyncedAt: row?.last_synced_at ?? null,
    lastError: row?.last_error ?? null,
  };
}
