import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import { SplashScreen } from './components/ui/SplashScreen';
import { Logo } from './components/ui/Logo';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { devWarn } from './lib/devLog';
import { translatePasswordRecoveryHashError } from './lib/errorMessages';
import type { AppPage } from './lib/types';

// Duree minimale de l'ecran de demarrage -- evite un flash si la session
// se resout tres vite (connexion deja en cache), tout en restant discret
// (demande produit 2026-08-04 : un vrai "moment de marque" a chaque
// ouverture/lancement/refresh, pas juste un spinner nu).
const SPLASH_MIN_MS = 900;

// Retour Stripe Checkout/Portal (Lot 5, freeze beta 2026-08-08) --
// success_url/cancel_url/return_url (create-checkout-session,
// create-portal-session) pointent tous vers le domaine racine + un query
// param, aucune route reelle n'existant dans ce SPA. Consomme une seule
// fois au montage (StrictMode-safe : setItem/replaceState sont idempotents,
// contrairement a un clear qui devrait etre a part -- voir AuthPage.tsx
// pour ce cas different) puis relaye vers Abonnement via le meme mecanisme
// de deep-link que resellos:dashboardPage (BlogPage.tsx -> Communaute).
const BILLING_RETURN_MARKERS = new Set(['success', 'cancelled', 'return']);

function consumeBillingReturnMarker(): void {
  const params = new URLSearchParams(window.location.search);
  const marker = params.get('billing');
  if (!marker || !BILLING_RETURN_MARKERS.has(marker)) return;

  sessionStorage.setItem('resellos:billingReturn', marker);
  sessionStorage.setItem('resellos:dashboardPage', 'subscription');

  params.delete('billing');
  const query = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));
}

// P1-1 (Freeze Audit correctif) : un lien de reinitialisation de mot de passe
// expire/deja utilise renvoie Supabase avec l'erreur dans le HASH de l'URL
// (#error=access_denied&error_code=otp_expired&error_description=...), jamais
// dans le query string -- et aucune session n'est creee dans ce cas, donc
// l'evenement PASSWORD_RECOVERY (AuthContext.tsx) ne se declenche jamais.
// Jusqu'ici totalement ignore (seul consumeBillingReturnMarker lisait l'URL,
// et uniquement le query string) : l'utilisateur atterrissait silencieusement
// sur la landing sans aucun message. Un lien VALIDE ne porte jamais de
// parametre `error` dans son hash (uniquement access_token/type=recovery,
// consomme par le SDK Supabase lui-meme) : cette fonction ne peut donc jamais
// interferer avec un recovery qui fonctionne. Idempotent comme
// consumeBillingReturnMarker (le hash est vide au second appel StrictMode).
function consumePasswordRecoveryHashError(): void {
  const message = translatePasswordRecoveryHashError(window.location.hash);
  if (!message) return;

  devWarn('[ResellOS][auth] lien de recuperation invalide detecte dans le hash :', window.location.hash);

  sessionStorage.setItem('resellos:authMode', 'forgot');
  sessionStorage.setItem('resellos:authNotice', message);

  window.history.replaceState({}, '', window.location.pathname + window.location.search);
}

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
  const { user, profile, loading, passwordRecovery, bannedNotice, clearBannedNotice, signOut } = useAuth();
  // Valeur elle-meme inutilisee -- useState(initializer) garantit une seule
  // execution synchrone avant le premier rendu (meme idiome que
  // readInitialAuthMode() dans AuthPage.tsx), avant que DashboardLayout ne
  // puisse jamais lire resellos:dashboardPage.
  useState(consumeBillingReturnMarker);
  // Doit s'executer avant l'initializer de `page` juste en dessous (l'ordre
  // des hooks dans un meme rendu est garanti, y compris sous StrictMode) :
  // pose resellos:authNotice en sessionStorage AVANT que `page` ne decide de
  // router directement vers l'ecran de connexion.
  useState(consumePasswordRecoveryHashError);
  // Lecture simple (jamais de suppression ici) : robuste au double-appel
  // StrictMode, contrairement a une detection qui consommerait le hash dans
  // ce meme initializer (voir consumePasswordRecoveryHashError ci-dessus).
  const [page, setPage] = useState<AppPage>(() =>
    sessionStorage.getItem('resellos:authNotice') ? 'auth' : 'landing'
  );
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
      <div className="min-h-screen bg-dark-400 text-gray-900 flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center">
          <Logo variant="square" size={44} className="mx-auto mb-6" />
          <h1 className="text-xl font-black mb-3">Compte suspendu</h1>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">
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

  // Bêta privée (2026-08-30) : un compte connecte mais pas encore approuve
  // ne voit AUCUNE page de l'app (dashboard, auth, landing...) -- ce garde
  // intercepte avant tout branchement sur `page`. Different de bannedNotice
  // ci-dessus : la session reste active (jamais de signOut force), l'ecran
  // se debloque en direct des l'approbation grace au canal Realtime deja
  // cable sur profiles (AuthContext.tsx, profile_sync_${user.id}) -- pas
  // besoin de reconnexion. role==='admin' passe toujours, meme garde-fou
  // defensif que partout ailleurs dans l'admin.
  if (user && profile && profile.role !== 'admin' && !profile.beta_approved) {
    return (
      <div className="min-h-screen bg-dark-400 text-gray-900 flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center">
          <Logo variant="square" size={44} className="mx-auto mb-6" />
          <h1 className="text-xl font-black mb-3">Tu es sur la liste d'attente</h1>
          <p className="text-sm text-gray-500 leading-relaxed mb-2">
            Ton compte <span className="text-gray-800 font-semibold">{profile.email}</span> est bien créé, mais
            l'accès au tableau de bord n'est pas encore ouvert — ResellOS est en bêta privée.
          </p>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">
            Cette page se débloquera automatiquement dès que ton accès sera validé, sans rien faire de plus.
          </p>
          <button
            onClick={() => void signOut()}
            className="bg-neon-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-neon-700 transition-all"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
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
