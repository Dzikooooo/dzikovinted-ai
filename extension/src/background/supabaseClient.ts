import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/env";

// Un service worker Manifest V3 n'est pas persistant (Chrome le decharge apres
// ~30s d'inactivite). autoRefreshToken: true repose sur un setTimeout interne
// qui ne survivrait pas a cette suspension. On desactive donc le refresh
// automatique et on rafraichit a la demande via supabase.auth.getSession()
// (qui rafraichit en interne si le token est expire) au debut de chaque
// traitement de message - voir pairing.ts.
const chromeStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const result = await chrome.storage.local.get(key);
    return (result[key] as string | undefined) ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await chrome.storage.local.set({ [key]: value });
  },
  removeItem: async (key: string): Promise<void> => {
    await chrome.storage.local.remove(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: chromeStorageAdapter,
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Client a portee de requete, authentifie par un header Authorization
// explicite plutot que par la gestion de session ambiante de GoTrueClient.
// Meme pattern que supabase/functions/analyze-clothing/index.ts. Utilise
// pour les ecritures qui doivent reussir independamment de la fiabilite de
// setSession() dans ce contexte service worker (voir pairing.ts).
export function supabaseWithToken(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
