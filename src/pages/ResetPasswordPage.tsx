import { useState } from 'react';
import { Zap, Eye, EyeOff, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { translateAuthError } from '../lib/errorMessages';
import type { AppPage } from '../lib/types';

interface ResetPasswordPageProps {
  onNavigate: (page: AppPage) => void;
}

// Ecran dedie affiche uniquement pendant une recuperation de mot de passe
// (AuthContext.passwordRecovery === true, voir App.tsx) -- remplace
// l'ancien comportement ou le clic sur le lien recu par email renvoyait
// directement au dashboard sans jamais demander de nouveau mot de passe
// (parcours valide le 2026-07-24).
export default function ResetPasswordPage({ onNavigate }: ResetPasswordPageProps) {
  const { clearPasswordRecovery, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(translateAuthError(updateError.message));
      return;
    }

    // La session de recuperation est deja une session authentifiee valide --
    // pas besoin de forcer une reconnexion, on retourne directement au
    // dashboard (decision validee le 2026-07-24).
    clearPasswordRecovery();
    onNavigate('dashboard');
  };

  return (
    <div className="min-h-screen bg-dark-400 flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,196,0,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,196,0,0.025) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[500px] bg-neon-500/4 rounded-full blur-[160px]" />

      <div className="relative z-10 w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-neon-500 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-black" />
          </div>
          <span className="text-xl font-black">Resell<span className="text-neon-500">OS</span></span>
        </div>

        <div className="bg-surface border border-white/8 rounded-2xl p-8">
          <h1 className="text-2xl font-black mb-1">Nouveau mot de passe</h1>
          <p className="text-sm text-gray-500 mb-8">Choisis un nouveau mot de passe pour ton compte.</p>

          {error && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-6">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-gray-500 block mb-2">Nouveau mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-dark-400 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-gray-500 block mb-2">Confirmer le mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-dark-400 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-neon-500 text-black font-bold py-3.5 rounded-xl hover:bg-neon-600 transition-all duration-200 hover:shadow-[0_0_30px_rgba(255,196,0,0.3)] disabled:opacity-50 disabled:cursor-not-allowed text-sm mt-2"
            >
              {loading ? 'Chargement...' : 'Définir le mot de passe'}
            </button>
          </form>

          <div className="border-t border-white/5 mt-6 pt-6 text-center">
            <p className="text-sm text-gray-500">
              Le lien a expiré ou ne fonctionne pas ?{' '}
              <button
                onClick={async () => {
                  // Termine explicitement la session de recuperation avant de
                  // repartir -- sinon `user` reste non-null et l'utilisateur
                  // serait aussitot renvoye au dashboard par la redirection
                  // automatique de App.tsx au lieu d'atteindre l'ecran de
                  // connexion/mot de passe oublie.
                  clearPasswordRecovery();
                  await signOut();
                  onNavigate('auth');
                }}
                className="text-neon-500 hover:underline font-medium"
              >
                Redemander un lien
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
