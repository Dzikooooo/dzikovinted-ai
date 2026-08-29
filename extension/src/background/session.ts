import { supabase } from "./supabaseClient";
import { logger } from "./logger";
import { classifyRefreshFailure } from "./authErrors";
import { withTimeout, TimeoutError } from "./retry";

// Bug live 2026-08-29 (popup bloque sur "Verification du statut", voir
// retry.ts::withTimeout) : refreshSession() n'avait aucun delai maximum.
const REFRESH_SESSION_TIMEOUT_MS = 10000;

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

// Drapeau de session revoquee (2026-08-26). Il ne suffit pas d'effacer la
// session : le popup afficherait alors "non appaire", indistinguable d'une
// extension jamais appairee. Ce drapeau lui permet de dire la VRAIE cause --
// "ta session a expire, reconnecte-toi" -- au lieu de laisser deviner.
//
// Stocke plutot que diffuse par message : le popup est le plus souvent FERME
// au moment ou le rafraichissement echoue (le service worker travaille en
// arriere-plan). Un chrome.runtime.sendMessage n'aurait aucun destinataire et
// serait perdu ; un drapeau en storage attend la prochaine ouverture.
const SESSION_REVOKED_KEY = "resellos_session_revoked";

export async function markSessionRevoked(): Promise<void> {
  await chrome.storage.local.set({ [SESSION_REVOKED_KEY]: true });
  // Best-effort : si un popup est ouvert a cet instant, il se met a jour
  // immediatement au lieu d'attendre son prochain sondage. L'absence de
  // destinataire est le cas NORMAL, jamais une erreur a journaliser.
  try {
    await chrome.runtime.sendMessage({ type: "SESSION_REVOKED" });
  } catch {
    /* aucun popup ouvert -- le drapeau en storage prend le relais */
  }
}

export async function isSessionRevoked(): Promise<boolean> {
  const result = await chrome.storage.local.get(SESSION_REVOKED_KEY);
  return result[SESSION_REVOKED_KEY] === true;
}

// Appele des qu'un appairage REUSSIT : sans cela le drapeau survivrait a la
// reconnexion et le popup continuerait d'annoncer une session revoquee.
export async function clearSessionRevoked(): Promise<void> {
  await chrome.storage.local.remove(SESSION_REVOKED_KEY);
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
      // withTimeout (2026-08-29) : sans lui, un fetch qui pend laissait
      // cette promesse ne JAMAIS se resoudre -- inFlightRefresh restait
      // alors bloque pour toujours (le `finally` plus bas qui le remet a
      // null n'est atteint qu'une fois cette promesse REELLEMENT reglee),
      // et toute verification de statut suivante retombait sur cette meme
      // promesse morte, meme apres un re-appairage reussi. Un timeout
      // degrade ce cas en un echec normal, classe "transitoire" par
      // classifyRefreshFailure() (voir son commentaire : un message
      // inconnu est traite par defaut comme transitoire) -- la session
      // n'est donc jamais effacee a tort sur un simple depassement de
      // delai.
      let data: { session: { access_token: string; refresh_token: string; expires_at?: number; user: { id: string } } | null };
      let error: { message: string; status?: number } | null;
      try {
        ({ data, error } = await withTimeout(
          supabase.auth.refreshSession({ refresh_token: stored.refresh_token }),
          REFRESH_SESSION_TIMEOUT_MS,
          "refreshSession"
        ));
      } catch (err) {
        if (!(err instanceof TimeoutError)) throw err;
        logger.warn("getValidAccessToken: refreshSession() a depasse le delai -- traite comme transitoire", {
          userId: stored.user_id,
          timeoutMs: REFRESH_SESSION_TIMEOUT_MS,
        });
        data = { session: null };
        error = { message: err.message };
      }
      if (error || !data.session) {
        // Deux issues tres differentes -- voir authErrors.ts. Effacer la
        // session sur un simple incident reseau faisait perdre l'appairage
        // pour une cause qui aurait disparu d'elle-meme.
        const kind = classifyRefreshFailure({ message: error?.message ?? null, status: error?.status ?? null });

        if (kind === "transient") {
          logger.warn("getValidAccessToken: refreshSession() a echoue de facon TRANSITOIRE, session CONSERVEE", {
            userId: stored.user_id,
            errorMessage: error?.message ?? null,
            errorStatus: error?.status ?? null,
          });
          return null;
        }

        logger.warn("getValidAccessToken: refresh token DEFINITIVEMENT invalide, session effacee - reconnexion necessaire", {
          userId: stored.user_id,
          errorMessage: error?.message ?? null,
          errorStatus: error?.status ?? null,
        });
        await clearStoredSession();
        await markSessionRevoked();
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
