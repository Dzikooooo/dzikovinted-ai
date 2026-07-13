import { supabase } from "./supabaseClient";
import { logger } from "./logger";

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
//
// Extrait de pairing.ts a l'etape 1.2 : sync.ts (detection compte/annonces)
// a aussi besoin d'un token valide, deuxieme consommateur reel qui justifie
// ce module partage.

const SESSION_KEY = "resellos_extension_session";

interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch secondes
  user_id: string;
}

export async function readStoredSession(): Promise<StoredSession | null> {
  const result = await chrome.storage.local.get(SESSION_KEY);
  return (result[SESSION_KEY] as StoredSession | undefined) ?? null;
}

export async function writeStoredSession(session: StoredSession): Promise<void> {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
}

export async function clearStoredSession(): Promise<void> {
  await chrome.storage.local.remove(SESSION_KEY);
}

export function decodeJwtExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(json) as { exp?: number };
    return typeof parsed.exp === "number" ? parsed.exp : null;
  } catch {
    return null;
  }
}

// Deduplique les rafraichissements concurrents au sein d'un meme reveil du
// service worker : Supabase fait tourner (rotate) le refresh_token a chaque
// utilisation reussie, donc deux appels a refreshSession() avec le MEME
// refresh_token stocke se marchent dessus - le premier reussit et ecrit un
// nouveau refresh_token, le second echoue avec une erreur "deja utilise" et
// effacait jusqu'ici la session fraichement ecrite par le premier (bug reel
// diagnostique le 2026-07-13, cause probable de pertes d'appairage
// intermittentes constatees en usage reel). Ce verrou en memoire ne couvre
// que la duree de vie du module (un reveil MV3) - insuffisant a lui seul,
// complete par le re-appairage automatique cote app (DashboardLayout.tsx)
// qui reecrit une session fraiche a chaque rafraichissement du token web,
// independamment de ce cycle.
let inFlightRefresh: Promise<{ accessToken: string; userId: string } | null> | null = null;

// Access token valide (rafraichi si besoin), ou null si aucune session
// stockee / rafraichissement impossible (l'utilisateur doit re-appairer).
// Journalisation detaillee (demande utilisateur, 2026-07-13) : distingue
// explicitement "aucune session en storage" (jamais appaire, ou efface) de
// "session presente mais expiree" (rafraichissement en cours) - deux causes
// tres differentes d'un meme symptome cote UI ("non appaire").
export async function getValidAccessToken(): Promise<{ accessToken: string; userId: string } | null> {
  const stored = await readStoredSession();
  if (!stored) {
    logger.debug("getValidAccessToken: aucune session trouvee dans chrome.storage.local (jamais appaire, ou efface)");
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const secondsUntilExpiry = stored.expires_at - now;
  if (stored.expires_at > now + 30) {
    logger.debug("getValidAccessToken: session valide en storage", { userId: stored.user_id, secondsUntilExpiry });
    return { accessToken: stored.access_token, userId: stored.user_id };
  }

  logger.debug("getValidAccessToken: session en storage mais expiree ou proche expiration", {
    userId: stored.user_id,
    secondsUntilExpiry,
  });

  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      logger.debug("getValidAccessToken: appel refreshSession()", { userId: stored.user_id });
      const { data, error } = await supabase.auth.refreshSession({ refresh_token: stored.refresh_token });
      if (error || !data.session) {
        logger.warn("getValidAccessToken: refreshSession() a echoue, session effacee - re-appairage necessaire", {
          userId: stored.user_id,
          errorMessage: error?.message ?? null,
          errorStatus: error?.status ?? null,
        });
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
      logger.debug("getValidAccessToken: refreshSession() reussi, nouvelle session ecrite", {
        userId: data.session.user.id,
      });
      return { accessToken: data.session.access_token, userId: data.session.user.id };
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}
