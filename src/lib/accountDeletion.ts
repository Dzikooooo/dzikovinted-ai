import { supabase } from './supabase';

// Audit DCP (2026-08-29) : la politique de confidentialite (LegalPage.tsx,
// section 5/6) promet une suppression de compte reelle -- jusqu'ici seul un
// bouton desactive existait (SettingsPage.tsx). Meme convention d'appel
// qu'ailleurs (billing.ts/scanMarket.ts) : supabase.functions.invoke() +
// extraction du message d'erreur JSON reel plutot qu'un message HTTP
// generique.

export type DeleteAccountResult = { ok: true } | { ok: false; error: string };

const GENERIC_DELETE_ERROR = 'Impossible de supprimer ton compte, réessaie plus tard ou contacte le support.';
const SESSION_EXPIRED_ERROR = 'Ta session a expiré, reconnecte-toi.';

// authenticateur brut de supabase/functions/delete-account/index.ts renvoie
// ces deux textes anglais pour 401 -- jamais destines a l'affichage direct.
const AUTH_ERROR_MESSAGES = new Set(['Unauthorized', 'Missing authorization header']);

async function extractErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json();
        if (typeof body?.error === 'string' && body.error.length > 0) {
          return AUTH_ERROR_MESSAGES.has(body.error) ? SESSION_EXPIRED_ERROR : body.error;
        }
      } catch {
        // corps non-JSON ou deja consomme -- retombe sur le fallback
      }
      return fallback;
    }
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export async function deleteAccount(): Promise<DeleteAccountResult> {
  const { error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) {
    return { ok: false, error: await extractErrorMessage(error, GENERIC_DELETE_ERROR) };
  }
  return { ok: true };
}

// Panneau admin (AdminUsersPage.tsx) : meme fonction Edge, ciblee sur un
// AUTRE compte -- l'autorisation reelle (appelant admin) est verifiee cote
// serveur (supabase/functions/delete-account/index.ts), jamais seulement
// par l'affichage conditionnel du bouton ici.
export async function adminDeleteAccount(targetUserId: string): Promise<DeleteAccountResult> {
  const { error } = await supabase.functions.invoke('delete-account', { body: { target_user_id: targetUserId } });
  if (error) {
    return { ok: false, error: await extractErrorMessage(error, GENERIC_DELETE_ERROR) };
  }
  return { ok: true };
}
