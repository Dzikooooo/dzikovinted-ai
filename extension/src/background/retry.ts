// Backoff exponentiel local pour les ecritures Supabase depuis le background.
// Pas une file persistee (voir EXTENSION.md / le plan Phase 1 : sync_jobs est
// differe a la Phase 2, quand une vraie action d'ecriture aura besoin d'un
// declencheur durable). Ici, juste reessayer une operation qui peut echouer
// pour une raison transitoire (reseau, cold-start du service worker).

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
