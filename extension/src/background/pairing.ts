import { supabase, supabaseWithToken } from "./supabaseClient";
import { logger } from "./logger";
import { withRetry } from "./retry";
import type { StatusResponse } from "../lib/messages";

// Gestion de session explicite et self-managed plutot que de compter sur
// supabase.auth.setSession()/getSession() (gestion "ambiante" de
// GoTrueClient). Constate en test live : setSession() echoue par
// intermittence avec "Auth session missing!" dans ce contexte service worker
// MV3 (module re-instancie a chaque reveil, storage adapter async), meme
// avec des tokens valides et non expires - un comportement non fiable et
// difficile a diagnostiquer sans acces direct aux DevTools du service
// worker. On stocke donc nous-memes {access_token, refresh_token,
// expires_at} sous une cle dediee, et on valide/rafraichit explicitement
// plutot que de dependre de l'etat interne du client.

const SESSION_KEY = "resellos_extension_session";

interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch secondes
  user_id: string;
}

async function readStoredSession(): Promise<StoredSession | null> {
  const result = await chrome.storage.local.get(SESSION_KEY);
  return (result[SESSION_KEY] as StoredSession | undefined) ?? null;
}

async function writeStoredSession(session: StoredSession): Promise<void> {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
}

async function clearStoredSession(): Promise<void> {
  await chrome.storage.local.remove(SESSION_KEY);
}

function decodeJwtExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(json) as { exp?: number };
    return typeof parsed.exp === "number" ? parsed.exp : null;
  } catch {
    return null;
  }
}

// Access token valide (rafraichi si besoin), ou null si aucune session
// stockee / rafraichissement impossible (l'utilisateur doit re-appairer).
async function getValidAccessToken(): Promise<{ accessToken: string; userId: string } | null> {
  const stored = await readStoredSession();
  if (!stored) return null;

  const now = Math.floor(Date.now() / 1000);
  if (stored.expires_at > now + 30) {
    return { accessToken: stored.access_token, userId: stored.user_id };
  }

  logger.debug("Token expire, rafraichissement");
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: stored.refresh_token });
  if (error || !data.session) {
    logger.warn("Rafraichissement du token echoue", error?.message);
    await clearStoredSession();
    return null;
  }

  const expiresAt = data.session.expires_at ?? now + 3600;
  await writeStoredSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: expiresAt,
    user_id: data.session.user.id,
  });
  return { accessToken: data.session.access_token, userId: data.session.user.id };
}

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
