import { useEffect, useState } from 'react';
import { Ban, CheckCircle2, RotateCcw, Send, Settings2, ShieldAlert, Trash2, Users, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { adminDeleteAccount } from '../../lib/accountDeletion';
import type { BetaCommercialOffer, CreditsMode, DashboardPage, Profile, ProgramStatus } from '../../lib/types';
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

// Categorie admin-only (demande produit 2026-08-04, etendue 2026-08-29 avec
// renommage + suppression de compte) : liste reelle des comptes inscrits
// (profiles.select ouvert aux admins depuis la migration 20260804120000),
// blocage/deblocage/retour au plan Free/renommage via des RPC SECURITY
// DEFINER dediees -- jamais un update direct sur profiles, qui reste
// verrouille pour authenticated (P0.1, 2026-07-11). Suppression de compte
// via la meme fonction Edge que l'auto-suppression (SettingsPage.tsx),
// ciblee sur un autre utilisateur -- voir accountDeletion.ts::
// adminDeleteAccount pour le detail. Reserve a useIsAdmin() --
// DashboardLayout ne montre l'onglet qu'aux admins, ce composant se
// re-garde lui-meme au cas ou -- la vraie frontiere de securite reste
// cote serveur (is_admin() SECURITY DEFINER + verification explicite dans
// chaque RPC/la fonction Edge, jamais seulement ce garde-fou client).
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

  // Programme Beta ResellOS (Lot 5, 2026-08-10) : fiche detail d'un compte,
  // sections volontairement independantes (Identite/Programme/Credits/
  // Avantage commercial) -- aucune des RPC ci-dessous n'en declenche une
  // autre. Identite ajoutee le 2026-08-29 (demande produit : renommer un
  // compte depuis le panneau admin -- update_own_profile restant limite a
  // auth.uid() = id, voir admin_set_user_full_name).
  const [detailTarget, setDetailTarget] = useState<Profile | null>(null);
  const [detailWorking, setDetailWorking] = useState<'name' | 'program' | 'credits' | 'offer' | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [offer, setOffer] = useState<BetaCommercialOffer | null>(null);
  const [offerLoading, setOfferLoading] = useState(false);
  const [offerTrialDays, setOfferTrialDays] = useState('30');
  const [offerCouponId, setOfferCouponId] = useState('');

  // Suppression de compte (demande produit 2026-08-29) : irreversible, la
  // meme fonction Edge que l'auto-suppression (SettingsPage.tsx) mais ciblee
  // sur un AUTRE compte -- voir accountDeletion.ts::adminDeleteAccount et
  // supabase/functions/delete-account/index.ts pour la verification cote
  // serveur. Modale de confirmation dediee, meme discipline que
  // banConfirmTarget mais jamais reutilisee pour elle : bloquer est
  // reversible, supprimer ne l'est pas.
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const loadOffer = async (userId: string) => {
    setOfferLoading(true);
    const { data, error: loadError } = await supabase
      .from('beta_commercial_offers')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (loadError) console.error(loadError);
    setOffer((data ?? null) as BetaCommercialOffer | null);
    setOfferTrialDays(data ? String((data as BetaCommercialOffer).trial_period_days) : '30');
    setOfferCouponId(data ? (data as BetaCommercialOffer).stripe_coupon_id ?? '' : '');
    setOfferLoading(false);
  };

  const openDetail = (p: Profile) => {
    setDetailTarget(p);
    setDetailError(null);
    setRenameValue(p.full_name || '');
    void loadOffer(p.id);
  };

  const saveFullName = async (p: Profile) => {
    if (!renameValue.trim()) {
      setDetailError('Le nom ne peut pas être vide.');
      return;
    }
    setDetailWorking('name');
    setDetailError(null);
    const { error: rpcError } = await supabase.rpc('admin_set_user_full_name', {
      p_user_id: p.id,
      p_full_name: renameValue.trim(),
    });
    setDetailWorking(null);
    if (rpcError) {
      console.error(rpcError);
      setDetailError('Impossible de renommer ce compte. Réessaie plus tard.');
      return;
    }
    setDetailTarget({ ...p, full_name: renameValue.trim() });
    await load();
  };

  // Etiquette seule -- n'accorde jamais de credits illimites. Voir
  // 20260810100000_add_beta_program_status.sql.
  const setProgramStatus = async (p: Profile, status: ProgramStatus) => {
    setDetailWorking('program');
    setDetailError(null);
    const { error: rpcError } = await supabase.rpc('admin_set_user_program_status', {
      p_user_id: p.id,
      p_program_status: status,
    });
    setDetailWorking(null);
    if (rpcError) {
      console.error(rpcError);
      setDetailError('Impossible de modifier le statut programme. Réessaie plus tard.');
      return;
    }
    setDetailTarget({ ...p, program_status: status });
    await load();
  };

  // Seul chemin qui influence analyze-clothing -- ne modifie jamais
  // profiles.credits (le solde reel). Voir _shared/credits.ts.
  const setCreditsMode = async (p: Profile, mode: CreditsMode) => {
    setDetailWorking('credits');
    setDetailError(null);
    const { error: rpcError } = await supabase.rpc('admin_set_user_credits_mode', {
      p_user_id: p.id,
      p_credits_mode: mode,
    });
    setDetailWorking(null);
    if (rpcError) {
      console.error(rpcError);
      setDetailError('Impossible de modifier le mode crédits. Réessaie plus tard.');
      return;
    }
    setDetailTarget({ ...p, credits_mode: mode });
    await load();
  };

  const prepareOffer = async (p: Profile) => {
    const trialDays = Number(offerTrialDays);
    if (!Number.isFinite(trialDays) || trialDays < 0) {
      setDetailError('Le nombre de jours d\'essai doit être un nombre positif ou nul.');
      return;
    }
    setDetailWorking('offer');
    setDetailError(null);
    const { error: rpcError } = await supabase.rpc('admin_prepare_commercial_offer', {
      p_user_id: p.id,
      p_trial_period_days: trialDays,
      p_stripe_coupon_id: offerCouponId.trim() || null,
    });
    setDetailWorking(null);
    if (rpcError) {
      console.error(rpcError);
      setDetailError("Impossible de préparer l'offre. Réessaie plus tard.");
      return;
    }
    await loadOffer(p.id);
  };

  const expireOffer = async (p: Profile) => {
    setDetailWorking('offer');
    setDetailError(null);
    const { error: rpcError } = await supabase.rpc('admin_expire_commercial_offer', {
      p_user_id: p.id,
    });
    setDetailWorking(null);
    if (rpcError) {
      console.error(rpcError);
      setDetailError("Impossible d'annuler l'offre. Réessaie plus tard.");
      return;
    }
    await loadOffer(p.id);
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

  const confirmDelete = async (p: Profile) => {
    setDeleting(true);
    setDeleteError(null);
    const result = await adminDeleteAccount(p.id);
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    setDeleteConfirmTarget(null);
    await load();
  };

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
          <div className="bg-surface border border-gray-200 rounded-2xl divide-y divide-gray-200">
            {filtered.map((p) => (
              <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                <AccountAvatar label={p.full_name || p.email} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-800 truncate">{p.full_name || p.email}</p>
                    <Badge label={p.plan.toUpperCase()} tone={p.plan === 'free' ? 'neutral' : p.plan === 'pro' ? 'brand' : 'positive'} />
                    {p.role === 'admin' && <Badge label="Admin" tone="attention" />}
                    {p.banned && <Badge label="Bloqué" tone="negative" />}
                    {p.program_status === 'beta_tester' && <Badge label="Bêta-testeur" tone="brand" />}
                    {p.credits_mode === 'unlimited' && <Badge label="Crédits illimités" tone="positive" />}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{p.email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Settings2 className="w-3.5 h-3.5" />}
                    onClick={() => openDetail(p)}
                  >
                    Gérer
                  </Button>
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
                  {p.id !== myProfile?.id && (
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                      onClick={() => { setDeleteConfirmTarget(p); setDeleteError(null); }}
                    >
                      Supprimer
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-surface border border-gray-200 rounded-2xl p-6 max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-neon-500" />
          <h2 className="font-bold text-sm">Envoyer une notification</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={() => setTarget('all')}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
              target === 'all' ? 'bg-neon-500/10 text-neon-500 border-neon-500/30' : 'bg-dark-400 text-gray-500 border-gray-200 hover:border-gray-200'
            }`}
          >
            Envoyer à tout le monde
          </button>
          {target && target !== 'all' && (
            <span className="text-xs text-gray-500">
              Destinataire : <span className="text-gray-800 font-semibold">{target.full_name || target.email}</span>{' '}
              <button onClick={() => setTarget(null)} className="text-gray-500 hover:text-gray-500 underline ml-1">retirer</button>
            </span>
          )}
          {!target && <span className="text-xs text-gray-500">Ou clique "Notifier" sur un compte ci-dessus pour le cibler.</span>}
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={notifTitle}
            onChange={(e) => setNotifTitle(e.target.value)}
            placeholder="Titre de la notification"
            className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
          />
          <textarea
            value={notifBody}
            onChange={(e) => setNotifBody(e.target.value)}
            placeholder="Message (optionnel)"
            rows={3}
            className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 resize-y"
          />
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">
              Rediriger vers
            </label>
            <select
              value={notifPage}
              onChange={(e) => setNotifPage(e.target.value as DashboardPage)}
              className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
            >
              {TARGET_PAGES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {sendError && <p className="text-sm text-red-700">{sendError}</p>}
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
              className="p-1.5 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-4 bg-dark-400 border border-gray-200 rounded-xl p-3">
            <AccountAvatar label={banConfirmTarget.full_name || banConfirmTarget.email} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-800 truncate">
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

          <p className="text-sm text-gray-500 mb-5">
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

      {deleteConfirmTarget && (
        <Modal onClose={() => (deleting ? null : setDeleteConfirmTarget(null))} size="md">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-black">Supprimer ce compte ?</h2>
            <button
              onClick={() => setDeleteConfirmTarget(null)}
              disabled={deleting}
              aria-label="Fermer"
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-4 bg-dark-400 border border-gray-200 rounded-xl p-3">
            <AccountAvatar label={deleteConfirmTarget.full_name || deleteConfirmTarget.email} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">
                {deleteConfirmTarget.full_name || deleteConfirmTarget.email}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{deleteConfirmTarget.email}</p>
            </div>
          </div>

          <p className="text-sm text-gray-500 mb-5">
            Action définitive et irréversible. Le compte, ses annonces, son historique et sa comptabilité sont
            supprimés pour toujours -- contrairement à un blocage, il n'y a aucun retour en arrière possible.
          </p>

          {deleteError && <p className="text-sm text-red-700 mb-4">{deleteError}</p>}

          <div className="flex items-center gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDeleteConfirmTarget(null)} disabled={deleting}>
              Annuler
            </Button>
            <Button variant="danger" fullWidth loading={deleting} onClick={() => confirmDelete(deleteConfirmTarget)}>
              Supprimer définitivement
            </Button>
          </div>
        </Modal>
      )}

      {detailTarget && (
        <Modal onClose={() => setDetailTarget(null)} size="md">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-black">Gérer ce compte</h2>
            <button
              onClick={() => setDetailTarget(null)}
              aria-label="Fermer"
              className="p-1.5 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-5 bg-dark-400 border border-gray-200 rounded-xl p-3">
            <AccountAvatar label={detailTarget.full_name || detailTarget.email} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">
                {detailTarget.full_name || detailTarget.email}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{detailTarget.email}</p>
            </div>
          </div>

          {detailError && <p className="text-sm text-red-700 mb-4">{detailError}</p>}

          {/* Section IDENTITE : seul le nom est modifiable (full_name), via
              admin_set_user_full_name -- jamais un update direct (RLS reste
              limitee a auth.uid() = id pour authenticated). Independante des
              sections suivantes. */}
          <div className="mb-5">
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-2">Identité</p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-dark-400 border border-gray-200 rounded-xl p-3">
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Nom complet"
                className="flex-1 bg-surface border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40"
              />
              <Button
                variant="secondary"
                size="sm"
                loading={detailWorking === 'name'}
                disabled={renameValue.trim() === (detailTarget.full_name || '')}
                onClick={() => saveFullName(detailTarget)}
              >
                Renommer
              </Button>
            </div>
          </div>

          {/* Section 1/3 -- PROGRAMME : simple etiquette, n'accorde aucun
              privilege. Reste independante des deux sections ci-dessous. */}
          <div className="mb-5">
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-2">Programme</p>
            <div className="flex items-center justify-between bg-dark-400 border border-gray-200 rounded-xl p-3">
              <div>
                <p className="text-sm text-gray-700">
                  Statut : <span className="font-semibold text-gray-900">{detailTarget.program_status === 'beta_tester' ? 'Bêta-testeur' : 'Standard'}</span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Étiquette seule — n'active aucun avantage.</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={detailWorking === 'program'}
                onClick={() => setProgramStatus(detailTarget, detailTarget.program_status === 'beta_tester' ? 'standard' : 'beta_tester')}
              >
                {detailTarget.program_status === 'beta_tester' ? 'Repasser en Standard' : 'Passer en Bêta-testeur'}
              </Button>
            </div>
          </div>

          {/* Section 2/3 -- CREDITS : seul champ lu par analyze-clothing.
              Le solde reel (credits) reste affiche tel quel, jamais modifie. */}
          <div className="mb-5">
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-2">Crédits</p>
            <div className="flex items-center justify-between bg-dark-400 border border-gray-200 rounded-xl p-3">
              <div>
                <p className="text-sm text-gray-700">
                  Mode : <span className="font-semibold text-gray-900">{detailTarget.credits_mode === 'unlimited' ? 'Illimités' : 'Standard'}</span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Solde réel : {detailTarget.credits} crédit{detailTarget.credits > 1 ? 's' : ''} (pour référence, jamais modifié par ce mode).</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={detailWorking === 'credits'}
                onClick={() => setCreditsMode(detailTarget, detailTarget.credits_mode === 'unlimited' ? 'standard' : 'unlimited')}
              >
                {detailTarget.credits_mode === 'unlimited' ? 'Repasser en Standard' : 'Passer en Illimités'}
              </Button>
            </div>
          </div>

          {/* Section 3/3 -- AVANTAGE COMMERCIAL : notion de facturation
              Stripe, independante des deux sections ci-dessus. */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-2">Avantage commercial</p>
            <div className="bg-dark-400 border border-gray-200 rounded-xl p-3 space-y-3">
              {offerLoading ? (
                <Skeleton shape="block" className="h-10" />
              ) : offer ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Offre :{' '}
                      <Badge
                        label={offer.status === 'pending' ? 'En attente' : offer.status === 'applied' ? 'Appliquée' : 'Expirée'}
                        tone={offer.status === 'applied' ? 'positive' : offer.status === 'pending' ? 'attention' : 'neutral'}
                      />
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {offer.trial_period_days} jour{offer.trial_period_days > 1 ? 's' : ''} d'essai
                      {offer.stripe_coupon_id ? ` + coupon ${offer.stripe_coupon_id}` : ''}
                    </p>
                  </div>
                  {offer.status === 'pending' && (
                    <Button variant="secondary" size="sm" loading={detailWorking === 'offer'} onClick={() => expireOffer(detailTarget)}>
                      Annuler l'offre
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Aucune offre préparée pour ce compte.</p>
              )}

              {(!offer || offer.status === 'expired') && !offerLoading && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 pt-2 border-t border-gray-200">
                  <div className="flex-1">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-1">Jours d'essai</label>
                    <input
                      type="number"
                      min={0}
                      value={offerTrialDays}
                      onChange={(e) => setOfferTrialDays(e.target.value)}
                      className="w-full bg-surface border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-1">Coupon Stripe (optionnel)</label>
                    <input
                      type="text"
                      value={offerCouponId}
                      onChange={(e) => setOfferCouponId(e.target.value)}
                      placeholder="ex. BETA50"
                      className="w-full bg-surface border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40"
                    />
                  </div>
                  <Button size="sm" loading={detailWorking === 'offer'} onClick={() => prepareOffer(detailTarget)}>
                    Préparer l'offre
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
