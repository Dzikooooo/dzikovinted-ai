// Garde-fou anti-abus generique (audit 2026-08-28) -- voir la migration
// 20260828100000_add_rate_limits.sql pour la table/RPC et le choix de ne
// PAS passer par le systeme de credits pour scan-market/dziko-assistant
// (fonctionnalites non facturees, qui doivent le rester).
//
// Meme convention que credits.ts : le client passe en parametre doit
// toujours etre le client service_role (try_consume_rate_limit est
// REVOKE pour anon/authenticated en base), cree apres verification du JWT
// utilisateur -- jamais avant.

interface SupabaseRpcClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string } | null }>;
}

export interface RateLimitScope {
  scope: string;
  cooldownSeconds: number;
}

// Un cooldown par endpoint plutot qu'une valeur unique : scan-market
// declenche un workflow GitHub Actions couteux (voir son propre
// commentaire, ~4-7 min de cycle) donc un cooldown large est sans impact
// pour un usage normal (un scan manuel de temps en temps) ; dziko-assistant
// est une conversation, un cooldown de quelques secondes suffit a bloquer
// le spam/double-clic sans genes la discussion.
export const RATE_LIMIT_SCOPES = {
  scanMarket: { scope: "scan-market", cooldownSeconds: 300 },
  dzikoAssistant: { scope: "dziko-assistant", cooldownSeconds: 4 },
} as const satisfies Record<string, RateLimitScope>;

// Retourne true si l'appel est autorise (et l'enregistre atomiquement),
// false s'il est encore en cooldown. `admin` client Supabase = service_role,
// jamais le client anon+JWT (voir try_consume_rate_limit, REVOKE public).
export async function tryConsumeRateLimit(
  admin: SupabaseRpcClient,
  userId: string,
  { scope, cooldownSeconds }: RateLimitScope
): Promise<boolean> {
  const { data, error } = await admin.rpc("try_consume_rate_limit", {
    p_user_id: userId,
    p_scope: scope,
    p_cooldown_seconds: cooldownSeconds,
  });

  if (error) {
    // Panne du garde-fou lui-meme (jamais rencontree en test) : on bloque
    // par prudence plutot que de laisser passer un appel non protege --
    // l'objectif de cette fonction est de proteger une ressource partagee,
    // pas de garantir une disponibilite a tout prix.
    console.error(`tryConsumeRateLimit(${scope}) RPC error:`, error);
    return false;
  }

  return data === true;
}

// Message pur, testable independamment de tout appel reseau -- une seule
// formulation par scope pour rester coherent cote client si ce texte est un
// jour repris ailleurs (Centre des Actions, chat).
export function rateLimitMessage(scope: RateLimitScope["scope"]): string {
  switch (scope) {
    case RATE_LIMIT_SCOPES.scanMarket.scope:
      return "Un scan a déjà été lancé récemment. Réessaie dans quelques minutes.";
    case RATE_LIMIT_SCOPES.dzikoAssistant.scope:
      return "Tu envoies tes messages un peu trop vite — patiente quelques secondes.";
    default:
      return "Merci de patienter avant de réessayer.";
  }
}
