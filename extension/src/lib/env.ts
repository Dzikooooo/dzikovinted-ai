// Memes variables que le projet principal (src/lib/supabase.ts) - valeurs dupliquees
// dans extension/.env, pas de partage de fichier .env entre les deux paquets Vite.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes - copie extension/.env.example vers extension/.env"
  );
}
