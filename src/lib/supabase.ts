import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Garde explicite (P-01, audit pre-beta 2026-08-03) : sans elle, createClient()
// levait une exception au chargement du module -- avant meme que React ne
// monte -- produisant un ecran noir total sans aucun message des qu'une
// variable d'env Supabase manque au build (ex. oubliee dans le scope
// Production de Vercel). On ecrit directement dans le DOM ici car React n'a
// pas encore demarre a ce stade du chargement.
if (!supabaseUrl || !supabaseAnonKey) {
  const message = "Configuration manquante : variables d'environnement Supabase absentes de ce build.";
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#fff;font-family:system-ui,sans-serif;padding:24px;text-align:center;">
      <div style="max-width:420px;">
        <p style="font-weight:700;font-size:18px;margin-bottom:8px;">Erreur de configuration</p>
        <p style="font-size:14px;color:#9ca3af;line-height:1.5;">${message}</p>
      </div>
    </div>
  `;
  throw new Error(message);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
