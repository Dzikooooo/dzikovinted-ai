import { lazy, Suspense, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Sparkles,
  CreditCard,
  Settings,
  LogOut,
  ChevronRight,
  X,
  Menu,
  Plus,
  Puzzle,
  Receipt,
  Activity,
  Eye,
  Users,
  ShieldAlert,
  MessageSquare
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useIsAdmin } from '../../hooks/useIsAdmin';
import { VintedAccountFilterProvider } from '../../contexts/VintedAccountFilterContext';
import AccountAvatar from '../../components/ui/AccountAvatar';
import AccountSwitcher from '../../components/ui/AccountSwitcher';
import { Wordmark } from '../../components/ui/Wordmark';
import { DzikoAiBubble } from '../../components/ui/DzikoAiBubble';
import { NotificationRecapModal } from '../../components/notifications/NotificationRecapModal';
import { NotificationBell } from '../../components/notifications/NotificationBell';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { isExtensionConfigured, pairExtension, getExtensionStatus } from '../../lib/extensionBridge';
import { supabase } from '../../lib/supabase';
import { runSkuRepair } from '../../lib/sku';
import type { DashboardPage, AppPage, SettingsTab } from '../../lib/types';
import { devLog, devWarn } from '../../lib/devLog';

const DashboardHome = lazy(() => import('./DashboardHome'));
const GeneratorPage = lazy(() => import('./GeneratorPage'));
const CommunicationPage = lazy(() => import('./CommunicationPage'));
const AccountingPage = lazy(() => import('./AccountingPage'));
const VintedAccountPage = lazy(() => import('./VintedAccountPage'));
const ActionsPage = lazy(() => import('./ActionsPage'));
const SubscriptionPage = lazy(() => import('./SubscriptionPage'));
const SettingsPage = lazy(() => import('./SettingsPage'));
const WatchlistPage = lazy(() => import('./WatchlistPage'));
const CommunityPage = lazy(() => import('./CommunityPage'));
const AdminUsersPage = lazy(() => import('./AdminUsersPage'));

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

// "explicatif" par categorie (demande produit 2026-07-29) : une phrase
// courte qui dit ce que fait chaque page, visible directement dans la
// sidebar -- pas seulement une fois la page ouverte (le PageHeader de
// chaque page porte deja sa propre description, celle-ci sert a decider
// AVANT de cliquer).
// Ordre revu (demande produit 2026-08-31) : le Dashboard (vue d'ensemble)
// prime desormais sur la simple liaison de compte -- Compte Vinted descend
// d'un cran plutot que de rester la toute premiere entree.
const navItems: { page: DashboardPage; icon: React.ElementType; label: string; description: string }[] = [
  { page: 'home', icon: LayoutDashboard, label: 'Dashboard', description: 'Vue d\'ensemble de ton activité' },
  { page: 'vinted-account', icon: Puzzle, label: 'Compte Vinted', description: 'Connexion de l\'extension' },
  { page: 'community', icon: Users, label: 'Communauté', description: 'Nouveautés, roadmap, échanges' },
  { page: 'generator', icon: Sparkles, label: 'Générateur IA', description: 'Photo -> annonce en quelques secondes' },
  { page: 'watchlist', icon: Eye, label: 'Mes annonces', description: 'Modifier, supprimer, surveiller le marché' },
  // Reactivee dans la nav (reprise du chantier Communication, 2026-08-08) :
  // CommunicationPage.tsx n'est plus un mockup -- modeles de message reels
  // + preparation de texte a partir d'une annonce reelle + lien "Ouvrir sur
  // Vinted", envoi toujours manuel (voir le commentaire d'en-tete du
  // fichier pour le perimetre exact et pourquoi aucune automatisation).
  { page: 'communication', icon: MessageSquare, label: 'Communication', description: 'Modèles de message, prêts à envoyer' },
  { page: 'actions', icon: Activity, label: 'Niches', description: 'Opportunités détectées et historique des actions' },
  { page: 'accounting', icon: Receipt, label: 'Comptabilité', description: 'Chiffre d\'affaires, marge, stats' },
  { page: 'subscription', icon: CreditCard, label: 'Abonnement', description: 'Ton plan, factures, résiliation' },
  { page: 'settings', icon: Settings, label: 'Paramètres', description: 'Profil, sécurité, comptes' },
];

// Onglet admin-only (demande produit 2026-08-04) : ajoute a la fin de la
// nav, jamais visible pour un compte "client" -- filtre au rendu plutot
// que baked dans navItems, pour garder ce tableau purement declaratif.
const ADMIN_NAV_ITEM = { page: 'admin' as DashboardPage, icon: ShieldAlert, label: 'Administration', description: 'Comptes, blocage, notifications' };

// Feature flag (revue pre-commit du 2026-08-04) : dziko-assistant (edge
// function) n'a encore jamais ete deployee ni testee en conditions reelles
// depuis ce repo -- desactivee par defaut tant que VITE_DZIKO_AI_ENABLED
// n'est pas explicitement mis a 'true' sur le deploiement, pour eviter
// qu'un utilisateur beta ne tombe sur une bulle de chat qui echoue
// silencieusement faute de fonction deployee ou de cle API configuree.
const DZIKO_AI_ENABLED = import.meta.env.VITE_DZIKO_AI_ENABLED === 'true';

export default function DashboardLayout({ onNavigate }: DashboardLayoutProps) {
  // Deep-link leger depuis la page publique "A propos" (bouton "Changelog --
  // Espace Communaute", BlogPage.tsx) -- lecture seule dans l'initializer
  // (StrictMode l'appelle deux fois en dev), nettoyage a part dans l'effet
  // ci-dessous. Corrige un bug reel (retour utilisateur 2026-08-04) : ce
  // lien renvoyait au Dashboard generique au lieu de l'espace Communaute
  // demande.
  const [activePage, setActivePage] = useState<DashboardPage>(
    () => (sessionStorage.getItem('resellos:dashboardPage') as DashboardPage | null) ?? 'home'
  );

  useEffect(() => {
    sessionStorage.removeItem('resellos:dashboardPage');
  }, []);
  // Vrai uniquement pendant une analyse Generateur en cours ou un resultat
  // genere pas encore sauvegarde (voir GeneratorPage.tsx) -- un credit est
  // deja reserve cote serveur des le lancement de l'analyse ; quitter cet
  // ecran sans avertissement le perdrait silencieusement, sans annonce
  // creee ni trace nulle part (bug confirme le 2026-07-24, audit du
  // parcours Generateur). navigateToPage() confirme avant de partir.
  const [generatorBusy, setGeneratorBusy] = useState(false);
  // Remplace l'ancien window.confirm() natif (audit RC, 2026-08-05). Meme
  // regle de declenchement que l'ancien confirmLeaveGenerator() (quitter le
  // Generateur pendant generatorBusy), mais differe desormais l'action elle-
  // meme (changer de page, se deconnecter, ouvrir Parametres...) plutot que
  // de bloquer sur un confirm() synchrone -- une seule action en attente a
  // la fois, guardLeaveGenerator() ecrase toujours la precedente plutot que
  // de les empiler, donc aucune confirmation en attente ne peut rester
  // bloquee sur une action perimee si l'utilisateur clique plusieurs
  // commandes avant de repondre a la modale.
  const [pendingLeaveGeneratorAction, setPendingLeaveGeneratorAction] = useState<(() => void) | null>(null);
  const guardLeaveGenerator = (action: () => void) => {
    if (!generatorBusy) {
      action();
      return;
    }
    setPendingLeaveGeneratorAction(() => action);
  };
  const navigateToPage = (page: DashboardPage) => {
    if (page === 'generator') {
      setActivePage(page);
      return;
    }
    guardLeaveGenerator(() => setActivePage(page));
  };
  const confirmLeaveGenerator = () => {
    const action = pendingLeaveGeneratorAction;
    setPendingLeaveGeneratorAction(null);
    action?.();
  };
  const cancelLeaveGenerator = () => setPendingLeaveGeneratorAction(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>(undefined);
  const [actionsInitialSelectedId, setActionsInitialSelectedId] = useState<string | undefined>(undefined);
  const { profile, session, signOut } = useAuth();
  const isAdmin = useIsAdmin();
  const visibleNavItems = isAdmin ? [...navItems, ADMIN_NAV_ITEM] : navItems;

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
  //
  // BUG REEL corrige le 2026-07-13 : la premiere version envoyait
  // `session.access_token`/`refresh_token` directement depuis l'etat React
  // (useAuth()) -- un instantane qui peut retarder sur la session Supabase
  // reelle. Si son access_token etait deja expire au moment du declenchement
  // (onglet reste ouvert un moment), supabase.auth.getUser(accessToken) cote
  // extension (pairing.ts::pair()) echouait a chaque tentative, de facon
  // parfaitement reproductible -- exactement le pattern deja documente et
  // deja evite par handleConnect() ci-dessous (VintedAccountPage.tsx a la
  // meme regle), que cette premiere version n'appliquait pas. Corrige en
  // redemandant une session fraiche a Supabase juste avant l'appairage,
  // au lieu de faire confiance a l'etat React fige.
  //
  // BUG REEL corrige le 2026-08-05 (P-04) : cet effet appairait
  // inconditionnellement l'extension au compte de CET onglet, meme quand
  // l'extension etait deja appairee a un AUTRE user_id (poste partage,
  // changement de compte) -- il gagnait systematiquement la course contre
  // l'ecran de mismatch de VintedAccountPage.tsx, qui n'avait donc jamais
  // le temps de s'afficher avant d'etre silencieusement corrige. Un
  // changement de compte de l'extension passait ainsi inapercu. Corrige en
  // interrogeant d'abord getExtensionStatus() : si l'extension est deja
  // appairee a un user_id different de la session actuelle, cet effet
  // n'y touche plus -- VintedAccountPage.tsx affiche alors le mismatch et
  // attend une action explicite (bouton "Ré-appairer à ce compte").
  useEffect(() => {
    if (!session) return;
    if (!isExtensionConfigured()) {
      devWarn('[ResellOS][pairing] Ré-appairage automatique ignoré : VITE_RESELLOS_EXTENSION_ID absent de cette build.');
      return;
    }

    let cancelled = false;
    (async () => {
      const status = await getExtensionStatus();
      if (cancelled) return;
      if (!status) {
        devLog('[ResellOS][pairing] Ré-appairage automatique ignoré : extension non détectée (status indisponible).');
        return;
      }
      if (status.paired && status.pairedUserId && status.pairedUserId !== session.user.id) {
        devWarn(
          '[ResellOS][pairing] Ré-appairage automatique ignoré : extension déjà appairée à un autre compte ResellOS -- ' +
            "VintedAccountPage affichera le mismatch, aucune action automatique."
        );
        return;
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;
      if (sessionError || !data.session) {
        devWarn('[ResellOS][pairing] Ré-appairage automatique ignoré : session Supabase fraîche indisponible.', sessionError?.message);
        return;
      }

      const result = await pairExtension(data.session.access_token, data.session.refresh_token);
      if (cancelled) return;
      if (!result.ok) {
        devWarn('[ResellOS][pairing] Ré-appairage automatique échoué :', result.error);
      } else {
        devLog('[ResellOS][pairing] Ré-appairage automatique réussi.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  // Auto-reparation SKU au demarrage (2026-07-27, chantier separe -- voir
  // la conversation) : une fois par session (memes conditions de
  // declenchement que le re-appairage ci-dessus, effet independant --
  // aucun rapport fonctionnel entre les deux). Best-effort strict, jamais
  // bloquant, uniquement journalise -- aucune UI, aucune notification.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void runSkuRepair(supabase, session.user.id).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        devWarn('[ResellOS][sku] Auto-reparation SKU (demarrage) : appel RPC echoue, ignore (best-effort).');
      } else {
        devLog('[ResellOS][sku] Auto-reparation SKU (demarrage)', result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const handleViewAction = (actionId: string) => {
    setActionsInitialSelectedId(actionId);
    navigateToPage('actions');
  };

  const handleSignOut = () => {
    guardLeaveGenerator(() => {
      void signOut().then(() => onNavigate('landing'));
    });
  };

  const handleManageAccounts = () => {
    guardLeaveGenerator(() => {
      setSettingsInitialTab('accounts');
      setActivePage('settings');
      setSidebarOpen(false);
    });
  };

  const planColors: Record<string, string> = {
    free: 'text-gray-500',
    pro: 'text-neon-500',
    team: 'text-yellow-400',
  };
  
  const planBadge = (profile?.plan ?? 'free').toUpperCase();
  
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b border-gray-200">
        <button onClick={() => guardLeaveGenerator(() => onNavigate('landing'))} className="flex items-center gap-1">
          <Wordmark size="md" />
        </button>
      </div>

      {/* Account switcher */}
      <AccountSwitcher onManageAccounts={handleManageAccounts} />

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleNavItems.map(({ page, icon: Icon, label, description }) => {
          const isActive = activePage === page;

          return (
            <button
              key={page}
              onClick={() => {
                navigateToPage(page);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200 group ${
                isActive
                  ? 'bg-neon-500/10 text-neon-500 font-medium shadow-[0_0_16px_rgba(124,92,255,0.08)]'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              <Icon
                className={`w-4 h-4 flex-shrink-0 ${
                  isActive ? 'text-neon-500' : 'text-gray-500 group-hover:text-gray-700'
                }`}
              />

              <span className="flex-1 min-w-0 text-left">
                <span className="block truncate">{label}</span>
                <span className={`block text-[10px] font-normal truncate ${isActive ? 'text-neon-500/70' : 'text-gray-500'}`}>
                  {description}
                </span>
              </span>

              {isActive && (
                <ChevronRight className="w-3.5 h-3.5 ml-auto text-neon-500 flex-shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-gray-200">
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50 mb-2">
          <AccountAvatar label={profile?.full_name || profile?.email || 'U'} brand />

          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-800 truncate">
              {profile?.full_name || profile?.email}
            </p>
            <p className={`text-[10px] font-bold ${planColors[profile?.plan ?? 'free']}`}>
              {planBadge}
            </p>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-red-700 hover:bg-red-500/5 transition-all duration-200"
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
        <aside className="hidden lg:flex flex-col w-60 bg-dark-400 border-r border-gray-200 flex-shrink-0">
          <SidebarContent />
        </aside>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />

            <aside className="relative z-10 w-64 bg-dark-400 border-r border-gray-200 flex flex-col">
              <button
                onClick={() => setSidebarOpen(false)}
                aria-label="Fermer le menu"
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>

              <SidebarContent />
            </aside>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Topbar */}
          <header className="flex items-center justify-between px-4 sm:px-6 h-16 border-b border-gray-200 flex-shrink-0 bg-dark-400">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Ouvrir le menu"
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Menu className="w-5 h-5 text-gray-500" />
              </button>

              <div>
                <h2 className="text-sm font-semibold capitalize">
                  {visibleNavItems.find((i) => i.page === activePage)?.label}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setActivePage('generator')}
                className="hidden sm:flex items-center gap-2 bg-neon-600 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-neon-700 transition-all"
              >
                <Plus className="w-4 h-4" />
                Nouvel article
              </button>

              <NotificationBell onNavigate={navigateToPage} />

              <AccountAvatar label={profile?.full_name || profile?.email || 'U'} brand />
            </div>
          </header>

          {/* Page content -- page-enter (index.css) rejoue un fondu bref a
              chaque changement d'onglet (audit RC, 2026-08-05), key={activePage}
              pour ne le rejouer que sur un vrai changement de page, jamais sur
              un re-render de la meme page. */}
          {/* Hierarchie de surfaces (2026-08-24) : la coque (sidebar +
              header) reste BLANCHE, seule la zone de contenu passe sur un
              gris quasi blanc (dark-200 = #F7F8F9). Les cartes, elles,
              restent en blanc pur (bg-surface) : c'est ce seul ecart d'un
              demi-ton qui les fait se detacher. Avant ce changement, canvas
              ET cartes etaient tous les deux #FFFFFF -- les pages internes
              paraissaient completement plates, les cartes n'existant que par
              leur filet de bordure. Le blanc reste dominant : rien ici ne
              transforme le dashboard en interface grise. */}
          <main className="flex-1 overflow-y-auto bg-dark-200">
            <div key={activePage} className="page-enter">
              <Suspense fallback={<PageFallback />}>
                {activePage === 'home' && <DashboardHome onNavigate={navigateToPage} />}
                {activePage === 'generator' && (
                  <GeneratorPage onNavigate={navigateToPage} onBusyChange={setGeneratorBusy} />
                )}
                {activePage === 'watchlist' && <WatchlistPage onNavigate={navigateToPage} onViewAction={handleViewAction} />}
                {activePage === 'communication' && <CommunicationPage />}
                {activePage === 'vinted-account' && <VintedAccountPage />}
                {activePage === 'actions' && <ActionsPage initialSelectedActionId={actionsInitialSelectedId} />}
                {activePage === 'accounting' && <AccountingPage />}
                {activePage === 'community' && <CommunityPage />}
                {activePage === 'subscription' && <SubscriptionPage />}
                {activePage === 'settings' && <SettingsPage initialTab={settingsInitialTab} />}
                {activePage === 'admin' && isAdmin && <AdminUsersPage />}
              </Suspense>
            </div>
          </main>
        </div>
      </div>

      <NotificationRecapModal onNavigate={navigateToPage} />
      {DZIKO_AI_ENABLED && <DzikoAiBubble />}

      {pendingLeaveGeneratorAction && (
        <Modal onClose={cancelLeaveGenerator} size="sm">
          <h2 className="text-lg font-black mb-2">Quitter le Générateur ?</h2>
          <p className="text-sm text-gray-500 mb-6">
            Une génération est en cours ou son résultat n'est pas encore enregistré. Le crédit est déjà utilisé et sera
            perdu si tu continues — le résultat ne sera pas conservé, il faudra tout recommencer si tu reviens sur cet
            écran.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button fullWidth onClick={cancelLeaveGenerator}>
              Continuer la génération
            </Button>
            <Button variant="secondary" fullWidth onClick={confirmLeaveGenerator}>
              Quitter quand même
            </Button>
          </div>
        </Modal>
      )}
    </VintedAccountFilterProvider>
  );
}