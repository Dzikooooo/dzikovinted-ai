// Classification des echecs de rafraichissement de session (2026-08-26).
//
// SIGNALE EN BETA : "AuthApiError: Invalid Refresh Token: Already Used".
// Supabase fait TOURNER le refresh_token a chaque usage reussi ; reutiliser
// un token deja consomme rend cette erreur. Elle est DEFINITIVE : aucune
// nouvelle tentative avec le meme token ne reussira jamais.
//
// LE PROBLEME QUE CE MODULE CORRIGE N'EST PAS SEULEMENT CELUI-LA. Jusqu'ici,
// session.ts effacait la session sur N'IMPORTE QUEL echec de refreshSession()
// -- y compris une simple coupure reseau ou un 503 passager. Une beta-testeuse
// dans le metro perdait donc son appairage pour une raison qui aurait disparu
// toute seule dix secondes plus tard, et devait tout re-appairer.
//
// D'ou deux traitements distincts :
//
//   DEFINITIF  -> le refresh_token est mort. Effacer la session et demander
//                 une reconnexion propre est la SEULE issue.
//   TRANSITOIRE -> on ne sait rien du token. Garder la session et echouer
//                 cette tentative-ci ; la suivante repartira du meme token,
//                 qui est probablement encore bon.
//
// En cas de doute (erreur non reconnue, sans statut HTTP), on classe en
// TRANSITOIRE : garder une session peut-etre morte coute une tentative
// echouee de plus, alors qu'effacer une session vivante coute un
// re-appairage complet a l'utilisateur. L'asymetrie est nette.

export type RefreshFailureKind = 'definitive' | 'transient';

// Messages renvoyes par GoTrue pour un refresh_token qui ne sera plus jamais
// accepte. Compares en minuscules, sur le message brut.
const DEFINITIVE_MESSAGE_PATTERNS: RegExp[] = [
  /invalid refresh token/i,
  /already used/i,
  /refresh[_ ]token[_ ]not[_ ]found/i,
  /invalid_grant/i,
  /token has expired or is invalid/i,
  /session[_ ]not[_ ]found/i,
];

// 400 = invalid_grant cote GoTrue (le cas "Already Used"), 401/403 = jeton
// refuse. Un 5xx ou un 429 ne dit RIEN sur la validite du token : c'est le
// serveur qui va mal, pas la session.
const DEFINITIVE_STATUSES = new Set([400, 401, 403, 422]);

export interface RefreshFailureInput {
  message?: string | null;
  status?: number | null;
}

export function classifyRefreshFailure(error: RefreshFailureInput | null | undefined): RefreshFailureKind {
  if (!error) return 'transient';

  const message = error.message ?? '';
  if (DEFINITIVE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) return 'definitive';

  const status = typeof error.status === 'number' ? error.status : null;
  if (status !== null && DEFINITIVE_STATUSES.has(status)) return 'definitive';

  return 'transient';
}

// Ecrit tel quel dans le statut remonte au popup. Volontairement une chaine
// STABLE et reconnaissable : popupErrorMessages.ts la traduit en message
// client, et le popup ne doit jamais afficher le texte brut de GoTrue.
export const SESSION_REVOKED_ERROR = 'session_revoked: refresh token invalide, reconnexion necessaire';
