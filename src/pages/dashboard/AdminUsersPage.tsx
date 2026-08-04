import { useEffect, useState } from 'react';
import { Ban, CheckCircle2, RotateCcw, Send, ShieldAlert, Users, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { DashboardPage, Profile } from '../../lib/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import AccountAvatar from '../../components/ui/AccountAvatar';

const TARGET_PAGES: { value: DashboardPage; label: string }[] = [
  { value: 'home', label: 'Dashboard' },
  { value: 'watchlist', label: 'Mes annonces' },
  { value: 'community', label: 'Communauté' },
  { value: 'accounting', label: 'Comptabilité' },
  { value: 'subscription', label: 'Abonnement' },
];

// Categorie admin-only (demande produit 2026-08-04) : liste reelle des
// comptes inscrits (profiles.select ouvert aux admins depuis la migration
// 20260804120000), blocage/deblocage et retour au plan Free via des RPC
// SECURITY DEFINER dediees -- jamais un update direct sur profiles, qui
// reste verrouille pour authenticated (P0.1, 2026-07-11). Reserve a
// useIsAdmin() -- DashboardLayout ne montre l'onglet qu'aux admins, ce
// composant se re-garde lui-meme au cas ou.
export default function AdminUsersPage() {
  const { profile: myProfile, user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [workingId, setWorkingId] = useState<string | null>(null);
  // P0-3 (2026-08-04) : bloquer/debloquer suspend reellement l'acces d'un
  // utilisateur reel a ResellOS -- jusqu'ici un simple clic sur la ligne,
  // sans confirmation ni rappel de qui est vise. banConfirmTarget porte le
  // compte en attente de confirmation ; toggleBan() elle-meme reste
  // inchangee (meme RPC, meme etat de chargement workingId), seul le point
  // d'entree change (ouvre la modale au lieu d'agir immediatement).
  const [banConfirmTarget, setBanConfirmTarget] = useState<Profile | null>(null);

  const [target, setTarget] = useState<Profile | 'all' | null>(null);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [notifPage, setNotifPage] = useState<DashboardPage>('home');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (loadError) {
      console.error(loadError);
      setError('Impossible de charger la liste des comptes. Réessaie plus tard.');
    } else {
      setError(null);
    }
    setProfiles((data ?? []) as Profile[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = profiles.filter((p) => {
    const q = search.toLowerCase();
    return !q || p.full_name?.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
  });

  const toggleBan = async (target: Profile) => {
    setWorkingId(target.id);
    const { error: rpcError } = await supabase.rpc('admin_set_user_banned', {
      p_user_id: target.id,
      p_banned: !target.banned,
    });
    setWorkingId(null);
    setBanConfirmTarget(null);
    if (rpcError) {
      console.error(rpcError);
      setError("Impossible de modifier ce compte. Réessaie plus tard.");
      return;
    }
    await load();
  };

  const downgradeToFree = async (target: Profile) => {
    setWorkingId(target.id);
    const { error: rpcError } = await supabase.rpc('admin_set_user_plan', {
      p_user_id: target.id,
      p_plan: 'free',
    });
    setWorkingId(null);
    if (rpcError) {
      console.error(rpcError);
      setError('Impossible de changer ce plan. Réessaie plus tard.');
      return;
    }
    await load();
  };

  const sendNotification = async () => {
    if (!user || !target || !notifTitle.trim()) return;
    setSending(true);
    setSendError(null);
    const { error: insertError } = await supabase.from('notifications').insert({
      user_id: target === 'all' ? null : target.id,
      type: 'admin_broadcast',
      title: notifTitle.trim(),
      body: notifBody.trim() || null,
      target_page: notifPage,
      created_by: user.id,
    });
    setSending(false);
    if (insertError) {
      console.error(insertError);
      setSendError("Impossible d'envoyer cette notification. Réessaie plus tard.");
      return;
    }
    setSent(true);
    setNotifTitle('');
    setNotifBody('');
    setTarget(null);
    setTimeout(() => setSent(false), 3000);
  };

  if (myProfile && myProfile.role !== 'admin') {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto text-center">
        <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-5 h-5 text-red-400" />
        </div>
        <p className="text-sm text-gray-400">Cette page est réservée aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Administration"
        description={`${profiles.length} compte${profiles.length > 1 ? 's' : ''} inscrit${profiles.length > 1 ? 's' : ''} sur ResellOS.`}
      />

      {error && <ErrorBanner message={error} className="mb-6" />}

      <div className="mb-8">
        <SectionLabel className="mb-4">Comptes inscrits</SectionLabel>
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un compte par nom ou email..."
          className="mb-4"
        />

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} shape="block" className="h-16" />)}
          </div>
        ) : (
          <div className="bg-surface border border-white/5 rounded-2xl divide-y divide-white/5">
            {filtered.map((p) => (
              <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                <AccountAvatar label={p.full_name || p.email} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-200 truncate">{p.full_name || p.email}</p>
                    <Badge label={p.plan.toUpperCase()} tone={p.plan === 'free' ? 'neutral' : p.plan === 'pro' ? 'brand' : 'positive'} />
                    {p.role === 'admin' && <Badge label="Admin" tone="attention" />}
                    {p.banned && <Badge label="Bloqué" tone="negative" />}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{p.email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Send className="w-3.5 h-3.5" />}
                    onClick={() => { setTarget(p); setSent(false); setSendError(null); }}
                  >
                    Notifier
                  </Button>
                  {p.plan !== 'free' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<RotateCcw className="w-3.5 h-3.5" />}
                      loading={workingId === p.id}
                      onClick={() => downgradeToFree(p)}
                    >
                      Repasser en Free
                    </Button>
                  )}
                  {p.id !== myProfile?.id && (
                    <Button
                      variant={p.banned ? 'secondary' : 'danger'}
                      size="sm"
                      icon={p.banned ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                      onClick={() => setBanConfirmTarget(p)}
                    >
                      {p.banned ? 'Débloquer' : 'Bloquer'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-surface border border-white/5 rounded-2xl p-6 max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-neon-500" />
          <h2 className="font-bold text-sm">Envoyer une notification</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={() => setTarget('all')}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
              target === 'all' ? 'bg-neon-500/10 text-neon-500 border-neon-500/30' : 'bg-dark-400 text-gray-400 border-white/10 hover:border-white/20'
            }`}
          >
            Envoyer à tout le monde
          </button>
          {target && target !== 'all' && (
            <span className="text-xs text-gray-400">
              Destinataire : <span className="text-gray-200 font-semibold">{target.full_name || target.email}</span>{' '}
              <button onClick={() => setTarget(null)} className="text-gray-600 hover:text-gray-400 underline ml-1">retirer</button>
            </span>
          )}
          {!target && <span className="text-xs text-gray-600">Ou clique "Notifier" sur un compte ci-dessus pour le cibler.</span>}
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={notifTitle}
            onChange={(e) => setNotifTitle(e.target.value)}
            placeholder="Titre de la notification"
            className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
          />
          <textarea
            value={notifBody}
            onChange={(e) => setNotifBody(e.target.value)}
            placeholder="Message (optionnel)"
            rows={3}
            className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 resize-y"
          />
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">
              Rediriger vers
            </label>
            <select
              value={notifPage}
              onChange={(e) => setNotifPage(e.target.value as DashboardPage)}
              className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
            >
              {TARGET_PAGES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {sendError && <p className="text-sm text-red-400">{sendError}</p>}
          {sent && <p className="text-sm text-neon-500">Notification envoyée.</p>}

          <Button
            fullWidth
            icon={<Send className="w-4 h-4" />}
            loading={sending}
            disabled={!target || !notifTitle.trim()}
            onClick={sendNotification}
          >
            Envoyer
          </Button>
        </div>
      </div>

      {banConfirmTarget && (
        <Modal onClose={() => setBanConfirmTarget(null)} size="md">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-black">
              {banConfirmTarget.banned ? 'Débloquer ce compte ?' : 'Bloquer ce compte ?'}
            </h2>
            <button
              onClick={() => setBanConfirmTarget(null)}
              aria-label="Fermer"
              className="p-1.5 rounded-lg hover:bg-white/5"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-4 bg-dark-400 border border-white/10 rounded-xl p-3">
            <AccountAvatar label={banConfirmTarget.full_name || banConfirmTarget.email} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-200 truncate">
                  {banConfirmTarget.full_name || banConfirmTarget.email}
                </p>
                <Badge
                  label={banConfirmTarget.plan.toUpperCase()}
                  tone={banConfirmTarget.plan === 'free' ? 'neutral' : banConfirmTarget.plan === 'pro' ? 'brand' : 'positive'}
                />
                {banConfirmTarget.role === 'admin' && <Badge label="Admin" tone="attention" />}
              </div>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{banConfirmTarget.email}</p>
            </div>
          </div>

          <p className="text-sm text-gray-400 mb-5">
            {banConfirmTarget.banned
              ? 'Ce compte pourra à nouveau se connecter à ResellOS et retrouvera un accès normal immédiatement.'
              : 'Ce compte ne pourra plus se connecter à ResellOS tant qu\'il n\'est pas débloqué. Ses données (annonces, historique, comptabilité) ne sont pas supprimées.'}
          </p>

          <div className="flex items-center gap-3">
            <Button variant="secondary" fullWidth onClick={() => setBanConfirmTarget(null)} disabled={workingId === banConfirmTarget.id}>
              Annuler
            </Button>
            <Button
              variant={banConfirmTarget.banned ? 'secondary' : 'danger'}
              fullWidth
              loading={workingId === banConfirmTarget.id}
              onClick={() => toggleBan(banConfirmTarget)}
            >
              {banConfirmTarget.banned ? 'Débloquer' : 'Bloquer'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
