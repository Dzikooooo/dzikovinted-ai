import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { MessageTemplate } from '../lib/types';

export interface MessageTemplateInput {
  name: string;
  body: string;
}

// CRUD des modeles de message (chantier Communication, reprise 2026-08-08)
// -- meme convention que useWatchlist.ts : chaque mutation retourne un
// booleen de succes reel, jamais suppose.
export function useMessageTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadTemplates() {
    if (!user) return;
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('message_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (loadError) {
      console.error(loadError);
      setError('Impossible de charger tes modèles de message. Réessaie plus tard.');
    } else {
      setError(null);
    }
    setTemplates((data ?? []) as MessageTemplate[]);
    setLoading(false);
  }

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function createTemplate(input: MessageTemplateInput): Promise<boolean> {
    if (!user) return false;
    const { error: insertError } = await supabase.from('message_templates').insert({
      user_id: user.id,
      name: input.name,
      body: input.body,
    });
    if (insertError) {
      console.error(insertError);
      setError('Impossible de créer ce modèle. Réessaie plus tard.');
      return false;
    }
    await loadTemplates();
    return true;
  }

  async function updateTemplate(id: string, patch: Partial<MessageTemplateInput>): Promise<boolean> {
    const { error: updateError } = await supabase
      .from('message_templates')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (updateError) {
      console.error(updateError);
      setError('Impossible de modifier ce modèle. Réessaie plus tard.');
      return false;
    }
    await loadTemplates();
    return true;
  }

  async function deleteTemplate(id: string): Promise<boolean> {
    const { error: deleteError } = await supabase.from('message_templates').delete().eq('id', id);
    if (deleteError) {
      console.error(deleteError);
      setError('Impossible de supprimer ce modèle. Réessaie plus tard.');
      return false;
    }
    await loadTemplates();
    return true;
  }

  return { templates, loading, error, createTemplate, updateTemplate, deleteTemplate };
}
