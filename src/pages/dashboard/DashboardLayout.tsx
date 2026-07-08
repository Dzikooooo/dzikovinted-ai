import { useState } from 'react';
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
  Receipt
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { DashboardPage, AppPage } from '../../lib/types';
import DashboardHome from './DashboardHome';
import GeneratorPage from './GeneratorPage';
import StockPage from './StockPage';
import ExpensesPage from './ExpensesPage';
import AccountingPage from './AccountingPage';
import VintedAccountPage from './VintedAccountPage';
import StatsPage from './StatsPage';
import SubscriptionPage from './SubscriptionPage';
import SettingsPage from './SettingsPage';
import Opportunities from './Opportunities';

interface DashboardLayoutProps {
  onNavigate: (page: AppPage) => void;
}

const navItems: { page: DashboardPage; icon: React.ElementType; label: string }[] = [
  { page: 'home', icon: LayoutDashboard, label: 'Dashboard' },
  { page: 'generator', icon: Sparkles, label: 'Générateur IA' },
  { page: 'opportunities', icon: Search, label: 'Opportunités' },
  { page: 'stock', icon: History, label: 'Stock' },
  { page: 'vinted-account', icon: Puzzle, label: 'Compte Vinted' },
  { page: 'accounting', icon: Receipt, label: 'Comptabilite' },
  { page: 'expenses', icon: Wallet, label: 'Depenses' },
  { page: 'stats', icon: BarChart2, label: 'Statistiques' },
  { page: 'subscription', icon: CreditCard, label: 'Abonnement' },
  { page: 'settings', icon: Settings, label: 'Paramètres' },
];

export default function DashboardLayout({ onNavigate }: DashboardLayoutProps) {
  const [activePage, setActivePage] = useState<DashboardPage>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    onNavigate('landing');
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
          <div className="w-8 h-8 rounded-full bg-neon-500/10 flex items-center justify-center text-xs font-bold text-neon-500 flex-shrink-0">
            {(profile?.full_name || profile?.email || 'U').charAt(0).toUpperCase()}
          </div>

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

            <div className="w-8 h-8 rounded-full bg-neon-500/10 flex items-center justify-center text-xs font-bold text-neon-500">
              {(profile?.full_name || profile?.email || 'U').charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-dark-400">
          {activePage === 'home' && <DashboardHome onNavigate={setActivePage} />}
          {activePage === 'generator' && <GeneratorPage />}
          {activePage === 'opportunities' && <Opportunities />}
          {activePage === 'stock' && <StockPage />}
          {activePage === 'vinted-account' && <VintedAccountPage />}
          {activePage === 'accounting' && <AccountingPage />}
          {activePage === 'expenses' && <ExpensesPage />}
          {activePage === 'stats' && <StatsPage />}
          {activePage === 'subscription' && <SubscriptionPage />}
          {activePage === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}