import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { PageHeader } from '../../components/ui/PageHeader';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { AdminContactsTab } from './admin/AdminContactsTab';
import { AdminMessagesTab } from './admin/AdminMessagesTab';
import { AdminWaitlistTab } from './admin/AdminWaitlistTab';

type AdminTab = 'contacts' | 'messages' | 'waitlist';

// Coquille de la page Administration (refonte en 2 onglets, 2026-08-29,
// "inspiree d'une interface de type application mobile") : ce composant ne
// porte plus que le garde-fou admin et le selecteur d'onglet -- tout le
// contenu reel vit dans admin/AdminContactsTab.tsx (carnet d'adresses,
// ex-AdminUsersPage.tsx) et admin/AdminMessagesTab.tsx (messagerie support,
// panneau deux-colonnes). DashboardLayout.tsx importe toujours ce fichier
// tel quel (chemin inchange), rien a mettre a jour cote routage.
//
// Deep-link "resellos:adminTab" (meme technique que resellos:blogSection/
// resellos:dashboardPage) : une notification "nouveau message" (voir
// notify_on_user_ticket_message, migration
// 20260829140000_add_notify_admin_on_user_ticket_message.sql) pose cette
// cle avant de naviguer vers 'admin' (NotificationBell.tsx/
// NotificationRecapModal.tsx) -- ouvre directement l'onglet Messages plutot
// que de laisser l'admin chercher.
export default function AdminUsersPage() {
  const { profile: myProfile } = useAuth();
  const [tab, setTab] = useState<AdminTab>(
    () => (sessionStorage.getItem('resellos:adminTab') as AdminTab | null) ?? 'contacts'
  );

  useEffect(() => {
    sessionStorage.removeItem('resellos:adminTab');
  }, []);

  // La vraie frontiere de securite reste cote serveur (is_admin() SECURITY
  // DEFINER + verification explicite dans chaque RPC/la fonction Edge,
  // jamais seulement ce garde-fou client) -- DashboardLayout ne montre
  // l'onglet nav qu'aux admins, ce composant se re-garde lui-meme au cas ou.
  if (myProfile && myProfile.role !== 'admin') {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto text-center">
        <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-5 h-5 text-red-700" />
        </div>
        <p className="text-sm text-gray-500">Cette page est réservée aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title="Administration" description="Comptes inscrits, messagerie de support et liste d'attente bêta." />

      <SegmentedControl
        className="mb-8"
        options={[
          { value: 'contacts', label: 'Contacts' },
          { value: 'messages', label: 'Messages' },
          { value: 'waitlist', label: "Liste d'attente" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'contacts' && <AdminContactsTab />}
      {tab === 'messages' && <AdminMessagesTab />}
      {tab === 'waitlist' && <AdminWaitlistTab />}
    </div>
  );
}
