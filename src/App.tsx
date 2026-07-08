import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import type { AppPage } from './lib/types';

const AuthPage = lazy(() => import('./pages/AuthPage'));
const DashboardLayout = lazy(() => import('./pages/dashboard/DashboardLayout'));

function PageFallback() {
  return (
    <div className="min-h-screen bg-dark-400 flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-2 border-neon-500/30 border-t-neon-500 animate-spin" />
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState<AppPage>('landing');

  useEffect(() => {
    if (!loading) {
      if (user && (page === 'landing' || page === 'auth')) setPage('dashboard');
    }
  }, [user, loading, page]);

  const navigate = (p: AppPage) => {
    setPage(p);
    window.scrollTo({ top: 0 });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-400 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-neon-500/30 border-t-neon-500 animate-spin" />
          <p className="text-sm text-gray-500">Chargement...</p>
        </div>
      </div>
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

  return <LandingPage onNavigate={navigate} />;
}

export default function App() {
  return <AppContent />;
}
