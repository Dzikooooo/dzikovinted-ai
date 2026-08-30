import { supabase } from './supabase';

export interface ApproveWaitlistEmailResult {
  email_sent: boolean;
  reason?: 'resend_not_configured' | 'send_failed';
}

// Approuve une demande de liste d'attente ET envoie l'email de confirmation
// (2026-08-30, voir supabase/functions/approve-waitlist-email/index.ts) --
// remplace l'appel RPC direct admin_approve_waitlist_email seul. Meme
// pattern fetch() que aiService.ts/accountAuditService.ts (jamais
// supabase.functions.invoke(), convention deja etablie pour ce repo).
// L'approbation elle-meme reste l'action critique de la fonction Edge :
// meme si l'email echoue (Resend pas encore configure, erreur d'envoi...),
// cet appel resout normalement -- email_sent indique juste si le mail est
// reellement parti, jamais une raison d'annuler l'approbation deja actee.
export async function approveWaitlistEmail(email: string): Promise<ApproveWaitlistEmailResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Action indisponible : aucune session utilisateur active.');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const response = await fetch(`${supabaseUrl}/functions/v1/approve-waitlist-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ email }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.error) {
    throw new Error(data.error || `Edge function error: ${response.status}`);
  }

  return { email_sent: !!data.email_sent, reason: data.reason };
}
