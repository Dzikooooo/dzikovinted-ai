import { supabase, supabaseWithToken } from "./supabaseClient";
import { logger } from "./logger";
import { getValidAccessToken, writeStoredSession, clearStoredSession, decodeJwtExpiry } from "./session";
import type { StatusResponse } from "../lib/messages";

// Recoit la session Supabase deja ouverte dans l'app web (voir EXTENSION.md §3) -
// jamais de nouvelle authentification demandee a l'utilisateur ici.
//
// Journalisation detaillee (demande utilisateur, 2026-07-13) : chaque etape
// reelle du handshake est loggee individuellement (jamais le contenu des
// tokens eux-memes) pour pouvoir diagnostiquer un echec depuis le popup
// (logger.getRecent()) sans avoir besoin d'ouvrir les DevTools du service
// worker au bon moment.
export async function pair(accessToken: string, refreshToken: string): Promise<void> {
  logger.info("PAIR recu par le background", {
    hasAccessToken: !!accessToken,
    hasRefreshToken: !!refreshToken,
    accessTokenLength: accessToken?.length ?? 0,
  });

  // Validation stateless du token (n'utilise pas la session ambiante).
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  logger.debug("Reponse supabase.auth.getUser(accessToken)", {
    ok: !userError && !!userData.user,
    errorMessage: userError?.message ?? null,
    errorStatus: userError?.status ?? null,
  });

  if (userError || !userData.user) {
    logger.error("Validation du token echouee - appairage abandonne", userError?.message);
    throw new Error(userError?.message ?? "Token invalide ou expire - reconnecte-toi sur ResellOS et reessaie.");
  }

  const userId = userData.user.id;
  logger.info("Token valide, utilisateur identifie", { userId });

  // Aucune ecriture Supabase ici : l'appairage (extension <-> ResellOS) et la
  // detection d'un compte Vinted reel sont deux etats totalement distincts
  // depuis la refonte multi-comptes. Une ligne vinted_accounts ne peut etre
  // creee que par une vraie detection (voir sync.ts) - jamais par
  // l'appairage seul, pour qu'aucun compte "fantome" non rattache a une
  // identite Vinted reelle ne puisse exister.
  const expiresAt = decodeJwtExpiry(accessToken) ?? Math.floor(Date.now() / 1000) + 3600;
  await writeStoredSession({ access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt, user_id: userId });

  logger.info("Session ecrite dans chrome.storage.local", { userId, expiresAt });
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

  // Phase A : un seul compte visible dans le popup (le compte par defaut,
  // ou le premier cree). La vraie selection multi-comptes arrive en Phase B
  // - voir EXTENSION.md.
  const client = supabaseWithToken(valid.accessToken);
  const { data: row, error: rowError } = await client
    .from("vinted_accounts")
    .select("connected, last_synced_at, last_error")
    .eq("user_id", valid.userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (rowError) {
    logger.warn("Lecture de vinted_accounts impossible", rowError.message);
    return { paired: true, vintedConnected: false, lastSyncedAt: null, lastError: rowError.message };
  }

  return {
    paired: true,
    vintedConnected: row?.connected ?? false,
    lastSyncedAt: row?.last_synced_at ?? null,
    lastError: row?.last_error ?? null,
  };
}
