import type { ListingAudit } from './types';
import { supabase } from './supabase';

// Pricer Pro -- appelle supabase/functions/audit-listing (2026-08-29). Meme
// pattern que analyzeWithAI() (aiService.ts) : fetch() direct avec le token
// de session en Authorization, jamais supabase.functions.invoke() (deja la
// convention etablie pour les fonctions Gemini+credits de ce repo). Propage
// toujours le message d'erreur reel (credits epuises, annonce introuvable,
// erreur Gemini precise...), jamais un fallback generique qui le masquerait.
export async function auditListing(listingId: string, geminiKey?: string): Promise<ListingAudit> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Audit indisponible : aucune session utilisateur active.');
  }

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/functions/v1/audit-listing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        listing_id: listingId,
        gemini_key: geminiKey || undefined,
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      throw new Error(errBody.error || `Edge function error: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }

    return data.audit as ListingAudit;
  } catch (err) {
    console.error('audit-listing call failed:', err);
    throw err instanceof Error ? err : new Error('Audit indisponible : erreur inconnue.');
  }
}
