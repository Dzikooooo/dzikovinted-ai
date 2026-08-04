import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import { SplashScreen } from './components/ui/SplashScreen';
import { Logo } from './components/ui/Logo';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import type { AppPage } from './lib/types';

// Duree minimale de l'ecran de demarrage -- evite un flash si la session
// se resout tres vite (connexion deja en cache), tout en restant discret
// (demande produit 2026-08-04 : un vrai "moment de marque" a chaque
// ouverture/lancement/refresh, pas juste un spinner nu).
const SPLASH_MIN_MS = 900;

const AuthPage = lazy(() => import('./pages/AuthPage'));
const DashboardLayout = lazy(() => import('./pages/dashboard/DashboardLayout'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const BlogPage = lazy(() => import('./pages/BlogPage'));
const NewsletterPage = lazy(() => import('./pages/NewsletterPage'));
const LegalPage = lazy(() => import('./pages/LegalPage'));

function PageFallback() {
  return (
    <div className="min-h-screen bg-dark-400 flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-2 border-neon-500/30 border-t-neon-500 animate-spin" />
    </div>
  );
}

function AppContent() {
  const { user, loading, passwordRecovery, bannedNotice, clearBannedNotice } = useAuth();
  const [page, setPage] = useState<AppPage>('landing');
  const [splashMinDone, setSplashMinDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSplashMinDone(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);
  // Ne redirige un utilisateur deja connecte vers le dashboard qu'une seule
  // fois, au chargement initial -- sinon cet effet se redeclenche a chaque
  // changement de page et annule toute navigation explicite ulterieure vers
  // la landing (ex. logo ResellOS depuis le dashboard, cf. bug remonte le
  // 2026-07-31 : la landing s'affichait une fraction de seconde puis
  // revenait aussitot au dashboard).
  const initialRedirectDone = useRef(false);

  useEffect(() => {
    if (loading) return;
    // Priorite absolue : un lien de reinitialisation vient d'etre ouvert
    // (evenement Supabase PASSWORD_RECOVERY) -- meme si une session valide
    // existe deja, on ne doit jamais envoyer directement au dashboard sans
    // passer par l'ecran de definition du nouveau mot de passe (parcours
    // valide le 2026-07-24).
    if (passwordRecovery) {
      if (page !== 'reset-password') setPage('reset-password');
      return;
    }
    if (initialRedirectDone.current) return;
    initialRedirectDone.current = true;
    if (user && (page === 'landing' || page === 'auth')) setPage('dashboard');
  }, [user, loading, page, passwordRecovery]);

  const navigate = (p: AppPage) => {
    setPage(p);
    window.scrollTo({ top: 0 });
  };

  if (bannedNotice) {
    return (
      <div className="min-h-screen bg-dark-400 text-white flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center">
          <Logo variant="square" size={44} className="mx-auto mb-6" />
          <h1 className="text-xl font-black mb-3">Compte suspendu</h1>
          <p className="text-sm text-gray-400 leading-relaxed mb-6">
            L'accès à ce compte a été suspendu. Si tu penses qu'il s'agit d'une erreur, contacte-nous à{' '}
            <a href="mailto:resellosapp@gmail.com" className="text-neon-500 hover:underline">resellosapp@gmail.com</a>.
          </p>
          <button
            onClick={clearBannedNotice}
            className="bg-neon-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-neon-700 transition-all"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  if (loading || !splashMinDone) {
    return <SplashScreen />;
  }

  if (page === 'reset-password') {
    return (
      <Suspense fallback={<PageFallback />}>
        <ResetPasswordPage onNavigate={navigate} />
      </Suspense>
    );
  }

  if (page === 'dashboard') {
    if (!user) {
      navigate('auth');
      return null;
    }
    return (
      <Suspense fallback={<PageFallback />}>
        <DashboardLayout onNavigate={navigate} />
      </Suspense>
    );
  }

  if (page === 'auth') {
    if (user) {
      navigate('dashboard');
      return null;
    }
    return (
      <Suspense fallback={<PageFallback />}>
        <AuthPage onNavigate={navigate} />
      </Suspense>
    );
  }

  if (page === 'blog') {
    return (
      <Suspense fallback={<PageFallback />}>
        <BlogPage onNavigate={navigate} />
      </Suspense>
    );
  }

  if (page === 'newsletter') {
    return (
      <Suspense fallback={<PageFallback />}>
        <NewsletterPage onNavigate={navigate} />
      </Suspense>
    );
  }

  if (page === 'cgu' || page === 'confidentialite') {
    return (
      <Suspense fallback={<PageFallback />}>
        <LegalPage kind={page} onNavigate={navigate} />
      </Suspense>
    );
  }

  return <LandingPage onNavigate={navigate} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
