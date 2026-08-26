import { useState, type FormEvent } from 'react';
import { Mail, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';

// Meme table/logique que src/pages/NewsletterPage.tsx (landing publique) --
// version compacte pour un utilisateur deja connecte, pre-remplie avec son
// email de compte plutot que de le lui redemander.
export function NewsletterTab() {
  const { profile } = useAuth();
  const [email, setEmail] = useState(profile?.email ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.from('newsletter_subscribers').insert({ email });
    setLoading(false);
    if (error && error.code !== '23505') {
      setError("Impossible d'enregistrer ton email pour le moment. Réessaie plus tard.");
      return;
    }
    setDone(true);
  };

  return (
    <div className="bg-surface border border-gray-200 rounded-2xl p-8 text-center max-w-lg mx-auto">
      <div className="w-14 h-14 bg-neon-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Mail className="w-6 h-6 text-neon-500" />
      </div>
      <h3 className="font-bold text-lg mb-2">Newsletter</h3>
      <p className="text-sm text-gray-500 mb-6">
        Nouveautés produit, conseils de revente et actualités Vinted, directement par email. Pas de spam.
      </p>

      {done ? (
        <div className="flex flex-col items-center gap-2 text-neon-500">
          <CheckCircle2 className="w-6 h-6" />
          <p className="text-sm font-semibold">Inscription confirmée pour {email}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ton@email.com"
            className="flex-1 bg-dark-400 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-neon-500/50"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-neon-600 text-white font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-neon-700 transition-all disabled:opacity-50"
          >
            {loading ? 'Inscription...' : "S'inscrire"}
          </button>
        </form>
      )}
      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
    </div>
  );
}
