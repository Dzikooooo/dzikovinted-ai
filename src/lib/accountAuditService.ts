import type { AccountAudit } from './types';
import { supabase } from './supabase';

// Audit du compte Vinted (2026-08-30) -- meme pattern que analyzeWithAI()
// (aiService.ts) : fetch() direct avec le token de session en Authorization,
// jamais supabase.functions.invoke() (convention deja etablie pour les
// fonctions Gemini+credits de ce repo). Propage toujours le message d'erreur
// reel, jamais un fallback generique qui le masquerait.
// vintedAccountId : id du compte Vinted SELECTIONNE cote UI (undefined/'all'
// = tous les comptes) -- l'audit doit rester scope au compte affiche a
// l'ecran (demande explicite 2026-08-30), jamais tout le catalogue par
// defaut des qu'un compte precis est choisi.
export async function auditAccount(vintedAccountId?: string, geminiKey?: string): Promise<AccountAudit> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Audit indisponible : aucune session utilisateur active.');
  }

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/functions/v1/audit-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        vinted_account_id: vintedAccountId && vintedAccountId !== 'all' ? vintedAccountId : undefined,
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

    return data.audit as AccountAudit;
  } catch (err) {
    console.error('audit-account call failed:', err);
    throw err instanceof Error ? err : new Error('Audit indisponible : erreur inconnue.');
  }
}
