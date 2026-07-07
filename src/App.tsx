import { useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import DashboardLayout from './pages/dashboard/DashboardLayout';
import type { AppPage } from './lib/types';
import { useState } from 'react';


function AppContent() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState<AppPage>('landing');

  useEffect(() => {
    if (!loading) {
      if (user && (page === 'landing' || page === 'auth')) setPage('dashboard');
    }
  }, [user, loading]);

  const navigate = (p: AppPage) => {
    setPage(p);
    window.scrollTo({ top: 0 });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-[#FFC400]/30 border-t-[#FFC400] animate-spin" />
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
    return <DashboardLayout onNavigate={navigate} />;
  }

  if (page === 'auth') {
    if (user) {
      navigate('dashboard');
      return null;
    }
    return <AuthPage onNavigate={navigate} />;
  }

  return <LandingPage onNavigate={navigate} />;
}

export default function App() {
  return <AppContent />;
}
