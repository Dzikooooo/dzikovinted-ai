import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Zap,
  LayoutDashboard,
  Sparkles,
  History,
  Wallet,
  BarChart2,
  CreditCard,
  Settings,
  LogOut,
  ChevronRight,
  X,
  Menu,
  Plus,
  Search,
  Puzzle,
  Receipt,
  Activity,
  Eye
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { VintedAccountFilterProvider } from '../../contexts/VintedAccountFilterContext';
import AccountAvatar from '../../components/ui/AccountAvatar';
import AccountSwitcher from '../../components/ui/AccountSwitcher';
import { isExtensionConfigured, pairExtension, pingExtension } from '../../lib/extensionBridge';
import type { DashboardPage, AppPage, SettingsTab } from '../../lib/types';

const DashboardHome = lazy(() => import('./DashboardHome'));
const GeneratorPage = lazy(() => import('./GeneratorPage'));
const StockPage = lazy(() => import('./StockPage'));
const ExpensesPage = lazy(() => import('./ExpensesPage'));
const AccountingPage = lazy(() => import('./AccountingPage'));
const VintedAccountPage = lazy(() => import('./VintedAccountPage'));
const ActionsPage = lazy(() => import('./ActionsPage'));
const StatsPage = lazy(() => import('./StatsPage'));
const SubscriptionPage = lazy(() => import('./SubscriptionPage'));
const SettingsPage = lazy(() => import('./SettingsPage'));
const Opportunities = lazy(() => import('./Opportunities'));
const WatchlistPage = lazy(() => import('./WatchlistPage'));

function PageFallback() {
  return (
    <div className="flex items-center justify-center h-full py-24">
      <div className="w-8 h-8 rounded-full border-2 border-neon-500/30 border-t-neon-500 animate-spin" />
    </div>
  );
}

interface DashboardLayoutProps {
  onNavigate: (page: AppPage) => void;
}

const navItems: { page: DashboardPage; icon: React.ElementType; label: string }[] = [
  { page: 'home', icon: LayoutDashboard, label: 'Dashboard' },
  { page: 'generator', icon: Sparkles, label: 'Générateur IA' },
  { page: 'opportunities', icon: Search, label: 'Opportunités' },
  { page: 'watchlist', icon: Eye, label: 'Watchlist' },
  { page: 'stock', icon: History, label: 'Stock' },
  { page: 'vinted-account', icon: Puzzle, label: 'Compte Vinted' },
  { page: 'actions', icon: Activity, label: 'Centre des Actions' },
  { page: 'accounting', icon: Receipt, label: 'Comptabilite' },
  { page: 'expenses', icon: Wallet, label: 'Depenses' },
  { page: 'stats', icon: BarChart2, label: 'Statistiques' },
  { page: 'subscription', icon: CreditCard, label: 'Abonnement' },
  { page: 'settings', icon: Settings, label: 'Paramètres' },
];

export default function DashboardLayout({ onNavigate }: DashboardLayoutProps) {
  const [activePage, setActivePage] = useState<DashboardPage>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>(undefined);
  const [actionsInitialSelectedId, setActionsInitialSelectedId] = useState<string | undefined>(undefined);
  const { profile, session, signOut } = useAuth();

  // Ré-appairage silencieux et automatique (bug réel du 2026-07-13 :
  // l'appairage n'était jusqu'ici jamais rafraîchi que par l'extension
  // elle-même, sans filet si son propre cycle de rafraîchissement échouait
  // une seule fois - voir manifest.config.ts). Se déclenche à chaque fois
  // que la session Supabase de l'app change (connexion initiale, ou tout
  // rafraîchissement automatique du token par le SDK, déjà fiable côté
  // web) - tant que l'utilisateur garde ResellOS ouvert dans un onglet de
  // temps en temps, l'extension reste réappairée sans aucune action
  // manuelle. Best-effort et silencieux : aucune erreur affichée si
  // l'extension n'est pas installée ou pas encore détectable, ce n'est pas
  // le rôle de ce composant de le signaler (VintedAccountPage.tsx le fait déjà).
  useEffect(() => {
    if (!session?.access_token || !session.refresh_token) return;
    if (!isExtensionConfigured()) return;

    let cancelled = false;
    (async () => {
      const installed = await pingExtension();
      if (cancelled || !installed) return;
      const result = await pairExtension(session.access_token, session.refresh_token);
      if (!result.ok) {
        console.warn('Ré-appairage automatique de l\'extension échoué :', result.error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, session?.refresh_token]);

  const handleViewAction = (actionId: string) => {
    setActionsInitialSelectedId(actionId);
    setActivePage('actions');
  };

  const handleSignOut = async () => {
    await signOut();
    onNavigate('landing');
  };

  const handleManageAccounts = () => {
    setSettingsInitialTab('accounts');
    setActivePage('settings');
    setSidebarOpen(false);
  };

  const planColors: Record<string, string> = {
    free: 'text-gray-400',
    pro: 'text-neon-500',
    team: 'text-blue-400',
  };
  
  const planBadge = (profile?.plan ?? 'free').toUpperCase();
  
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b border-white/5">
        <button onClick={() => onNavigate('landing')} className="flex items-center gap-2">
          <div className="w-8 h-8 bg-neon-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-black" />
          </div>
          <span className="text-lg font-black">
            <span className="text-white">Resell</span>
            <span className="text-neon-500">OS</span>
          </span>
        </button>
      </div>

      {/* Account switcher */}
      <AccountSwitcher onManageAccounts={handleManageAccounts} />

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(({ page, icon: Icon, label }) => {
          const isActive = activePage === page;

          return (
            <button
              key={page}
              onClick={() => {
                setActivePage(page);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group ${
                isActive
                  ? 'bg-neon-500/10 text-neon-500 font-medium'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              <Icon
                className={`w-4 h-4 flex-shrink-0 ${
                  isActive ? 'text-neon-500' : 'text-gray-500 group-hover:text-gray-300'
                }`}
              />

              {label}

              {isActive && (
                <ChevronRight className="w-3.5 h-3.5 ml-auto text-neon-500" />
              )}
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-white/5">
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/3 mb-2">
          <AccountAvatar label={profile?.full_name || profile?.email || 'U'} brand />

          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-200 truncate">
              {profile?.full_name || profile?.email}
            </p>
            <p className={`text-[10px] font-bold ${planColors[profile?.plan ?? 'free']}`}>
              {planBadge}
            </p>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/5 transition-all duration-200"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
    </div>
  );

  return (
    <VintedAccountFilterProvider>
      <div className="flex h-screen bg-dark-400 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-col w-60 bg-dark-400 border-r border-white/5 flex-shrink-0">
          <SidebarContent />
        </aside>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />

            <aside className="relative z-10 w-64 bg-[#0D0D0D] border-r border-white/5 flex flex-col">
              <button
                onClick={() => setSidebarOpen(false)}
                aria-label="Fermer le menu"
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/5"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>

              <SidebarContent />
            </aside>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Topbar */}
          <header className="flex items-center justify-between px-4 sm:px-6 h-16 border-b border-white/5 flex-shrink-0 bg-dark-400">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Ouvrir le menu"
                className="lg:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <Menu className="w-5 h-5 text-gray-400" />
              </button>

              <div>
                <h2 className="text-sm font-semibold capitalize">
                  {navItems.find((i) => i.page === activePage)?.label}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setActivePage('generator')}
                className="hidden sm:flex items-center gap-2 bg-neon-500 text-black text-sm font-bold px-4 py-2 rounded-xl hover:bg-neon-600 transition-all"
              >
                <Plus className="w-4 h-4" />
                Nouvel article
              </button>

              <AccountAvatar label={profile?.full_name || profile?.email || 'U'} brand />
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto bg-dark-400">
            <Suspense fallback={<PageFallback />}>
              {activePage === 'home' && <DashboardHome onNavigate={setActivePage} />}
              {activePage === 'generator' && <GeneratorPage />}
              {activePage === 'opportunities' && <Opportunities onViewAction={handleViewAction} />}
              {activePage === 'watchlist' && <WatchlistPage />}
              {activePage === 'stock' && <StockPage onViewAction={handleViewAction} />}
              {activePage === 'vinted-account' && <VintedAccountPage />}
              {activePage === 'actions' && <ActionsPage initialSelectedActionId={actionsInitialSelectedId} />}
              {activePage === 'accounting' && <AccountingPage />}
              {activePage === 'expenses' && <ExpensesPage />}
              {activePage === 'stats' && <StatsPage />}
              {activePage === 'subscription' && <SubscriptionPage />}
              {activePage === 'settings' && <SettingsPage initialTab={settingsInitialTab} />}
            </Suspense>
          </main>
        </div>
      </div>
    </VintedAccountFilterProvider>
  );
}