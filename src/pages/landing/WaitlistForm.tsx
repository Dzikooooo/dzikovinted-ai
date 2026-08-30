import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface WaitlistFormProps {
  className?: string;
  buttonLabel?: string;
}

// Liste d'attente / beta privee (2026-08-30) -- capture d'email SANS
// creation de compte (insert public sur waitlist_signups, voir migration
// 20260830110000_add_waitlist_beta_gating.sql). Remplace le CTA "S'inscrire"
// comme point d'entree PRINCIPAL de la landing -- la creation de compte
// classique (AuthPage, mode register) reste atteignable via un lien
// secondaire pour quelqu'un deja approuve, jamais retiree.
export function WaitlistForm({ className = '', buttonLabel = "Rejoindre la liste d'attente" }: WaitlistFormProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setStatus('loading');
    setError(null);

    const { error: insertError } = await supabase.from('waitlist_signups').insert({ email: trimmed });

    if (insertError) {
      // 23505 = contrainte unique sur email -- deja inscrit(e), jamais
      // presente comme une erreur : c'est exactement l'etat qu'on veut lui
      // montrer (il/elle est bien sur la liste).
      if (insertError.code === '23505') {
        setStatus('done');
        return;
      }
      console.error(insertError);
      setError("Impossible d'enregistrer ta demande. Réessaie plus tard.");
      setStatus('error');
      return;
    }
    setStatus('done');
  };

  if (status === 'done') {
    return (
      <div className={`flex items-center gap-2 justify-center text-sm font-semibold text-green-700 ${className}`}>
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        Tu es sur la liste — on te préviendra dès que ton accès est ouvert.
      </div>
    );
  }

  return (
    <div className={className}>
      <form onSubmit={submit} className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ton@email.com"
          aria-label="Adresse e-mail"
          className="flex-1 sm:w-72 px-5 py-4 rounded-2xl border border-gray-200 bg-white text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-neon-500/30 focus:border-neon-500/40"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="bg-neon-600 hover:bg-neon-700 text-white font-bold text-base px-8 py-4 rounded-2xl transition-colors disabled:opacity-60 inline-flex items-center gap-2 justify-center flex-shrink-0"
        >
          {status === 'loading' ? 'Envoi...' : buttonLabel}
          {status !== 'loading' && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
        </button>
      </form>
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
    </div>
  );
}
