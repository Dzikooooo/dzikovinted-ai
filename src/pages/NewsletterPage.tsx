import { useState, type FormEvent } from 'react';
import { Mail, CheckCircle2 } from 'lucide-react';
import type { AppPage } from '../lib/types';
import { Navbar } from './landing/Navbar';
import { Footer } from './landing/Footer';
import { supabase } from '../lib/supabase';

interface NewsletterPageProps {
  onNavigate: (page: AppPage) => void;
}

export default function NewsletterPage({ onNavigate }: NewsletterPageProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.from('newsletter_subscribers').insert({ email });
    setLoading(false);
    if (error) {
      if (error.code === '23505') {
        setDone(true);
      } else {
        setError("Impossible d'enregistrer ton email pour le moment. Réessaie plus tard.");
      }
      return;
    }
    setDone(true);
  };

  return (
    <div className="min-h-screen bg-dark-400 text-white flex flex-col">
      <Navbar onNavigate={onNavigate} currentPage="newsletter" />
      <main className="flex-1 pt-32 pb-24 px-4 sm:px-6">
        <div className="max-w-md mx-auto text-center">
          <div className="w-14 h-14 bg-neon-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Mail className="w-6 h-6 text-neon-500" />
          </div>
          <h1 className="text-4xl font-black tracking-tight mb-4">Newsletter</h1>
          <p className="text-lg text-zinc-400 mb-10">
            Nouveautés produit, conseils de revente et actualités Vinted, directement par email.
            Pas de spam — écris-nous à tout moment pour te désinscrire.
          </p>

          {done ? (
            <div className="bg-surface border border-neon-500/20 rounded-2xl p-8 flex flex-col items-center gap-4">
              <CheckCircle2 className="w-8 h-8 text-neon-500" />
              <div>
                <p className="font-semibold">Inscription confirmée</p>
                <p className="text-sm text-gray-500 mt-1">Tu recevras nos prochaines actualités à {email}.</p>
              </div>
              <button
                onClick={() => {
                  sessionStorage.setItem('resellos:authMode', 'register');
                  onNavigate('auth');
                }}
                className="w-full bg-neon-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-neon-700 transition-all mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-400"
              >
                Créer mon compte gratuitement
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
              <label htmlFor="newsletter-email" className="sr-only">Ton adresse email</label>
              <input
                id="newsletter-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                placeholder="ton@email.com"
                className="flex-1 bg-surface border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-neon-500/50 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-neon-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-neon-700 transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-400"
              >
                {loading ? 'Inscription...' : "S'inscrire"}
              </button>
            </form>
          )}
          {error && <p className="text-sm text-red-400 mt-4">{error}</p>}
        </div>
      </main>
      <Footer onNavigate={onNavigate} />
    </div>
  );
}
