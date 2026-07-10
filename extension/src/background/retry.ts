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
