import { supabase } from './supabase';

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export async function askDzikoAssistant(messages: AssistantChatMessage[]): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Assistant indisponible : aucune session utilisateur active.');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const response = await fetch(`${supabaseUrl}/functions/v1/dziko-assistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errBody.error || `Edge function error: ${response.status}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.reply as string;
}
