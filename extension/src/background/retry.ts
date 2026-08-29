// Backoff exponentiel local pour les ecritures Supabase depuis le background.
// Pas une file persistee - le Action Engine (Phase 3, voir EXTENSION.md §5
// "Action Engine et action_log") gere l'historique/le suivi d'une action,
// ce module se contente de reessayer une operation qui peut echouer pour une
// raison transitoire (reseau, cold-start du service worker).

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { attempts = 3, baseDelayMs = 500 } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// Bug live diagnostique 2026-08-29 : popup bloque indefiniment sur
// "Verification du statut", meme apres deconnexion/reconnexion sur l'app
// web et rechargement de l'extension. Cause racine : AUCUN appel
// supabase-js dans ce service worker n'a jamais eu de timeout -- ni
// refreshSession() (session.ts), ni getUser()/le select vinted_accounts
// (pairing.ts). `fetch` n'a pas de delai par defaut ; une requete qui
// pend (reseau instable, service worker reveille dans un etat bancal)
// bloque le await pour toujours. Pire pour refreshSession() precisement :
// session.ts::getValidAccessToken() memorise l'appel en cours dans
// `inFlightRefresh` (verrou en memoire anti-doublons, voir son
// commentaire) -- si CET appel pend indefiniment, `inFlightRefresh` ne se
// remet JAMAIS a null (le `finally` qui le fait n'est atteint qu'une fois
// la promesse resolue), et TOUTE future verification de statut retombe
// sur cette meme promesse morte, y compris apres un re-appairage reussi
// (ecrire une nouvelle session en storage n'annule pas un fetch deja en
// vol). Seul un vrai rechargement du service worker (pas juste rouvrir le
// popup) repartait a zero -- et si la condition qui bloquait le reseau
// persistait, le nouveau service worker se re-bloquait aussitot,
// donnant l'impression que "rien ne marche, meme apres rechargement".
//
// withTimeout() degrade un pend infini en un REJET normal apres `ms` --
// gere ensuite par le code appelant exactement comme n'importe quel autre
// echec reseau (classifyRefreshFailure() classe deja un message inconnu
// en "transitoire" par defaut, la session n'est donc jamais effacee a
// tort sur un simple timeout).
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} : delai depasse (${ms}ms)`);
    this.name = "TimeoutError";
  }
}

// PromiseLike, pas Promise : le builder Supabase (.from().select()...) est
// thenable (awaitable) mais pas une instance de Promise au sens strict --
// Promise.race l'accepte tel quel, un parametre type Promise<T> le
// refuserait a la compilation.
//
// clearTimeout() dans le .finally() : sans lui (bug reel trouve en ecrivant
// le test de ce fichier), le minuteur reste arme meme apres que `promise`
// ait gagne la course -- il finit par se declencher plus tard et rejeter sa
// propre promesse interne, que plus personne n'observe (Promise.race
// n'annule jamais les perdants). Node le detecte comme une rejection non
// geree ("PromiseRejectionHandledWarning"), un vrai symptome de fuite, pas
// un faux positif du test.
export function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
