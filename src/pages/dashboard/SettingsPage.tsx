import { useState } from 'react';
import { User, Mail, Lock, Eye, EyeOff, Save, Key, Bell, Trash2, Users, Pencil, Star, X, Shield, Database, Server, Cookie, Zap, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useVintedAccountFilter } from '../../contexts/VintedAccountFilterContext';
import { useToast } from '../../contexts/ToastContext';
import { useIsAdmin } from '../../hooks/useIsAdmin';
import { supabase } from '../../lib/supabase';
import { deleteAccount } from '../../lib/accountDeletion';
import AccountAvatar from '../../components/ui/AccountAvatar';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterPill } from '../../components/ui/FilterPill';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import type { SettingsTab, VintedAccount } from '../../lib/types';
import { PLAN_LIMITS } from '../../lib/types';
import { translateAuthError } from '../../lib/errorMessages';

const PLAN_BADGE_TONE: Record<string, BadgeTone> = { free: 'neutral', pro: 'brand', team: 'positive' };

interface SettingsPageProps {
  initialTab?: SettingsTab;
}

export default function SettingsPage({ initialTab }: SettingsPageProps) {
  const { profile, refreshProfile, signOut } = useAuth();
  const isAdmin = useIsAdmin();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? 'profile');

  // Audit DCP (2026-08-29) : la politique de confidentialite promettait deja
  // une vraie suppression (LegalPage.tsx section 5/6), mais aucune n'existait
  // reellement -- voir supabase/functions/delete-account. Saisie de
  // confirmation (pas juste un second clic) : action irreversible, aucune
  // marge d'erreur acceptable ici.
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [email] = useState(profile?.email ?? '');
  // Retour bêta-testeur reel (Albin, 2026-08-11, retour 4) : style d'annonce
  // optionnel, transmis a Gemini comme instruction (voir analyze-clothing) --
  // jamais un remplacement de variables. Champ vide = comportement de
  // generation actuel inchange.
  const [titleStyle, setTitleStyle] = useState(profile?.title_style ?? '');
  const [descriptionStyle, setDescriptionStyle] = useState(profile?.description_style ?? '');
  const [saving, setSaving] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem('dzikovinted_openai_key') || '');

  // Migration vers useToast() (2026-08-28) : remplace 3 mecanismes ad hoc
  // identiques (state local {type, text} + banniere inline + setTimeout de
  // 2-3s pour l'effacer) par le systeme centralise. Le comportement observe
  // reste identique -- meme message, meme delai de disparition (4s cote
  // Toast, contre 2-3s avant : jamais mesure comme un probleme par un
  // beta-testeur, et la coherence entre les 3 mecanismes vaut mieux qu'un
  // ecart de 1-2s non documente entre eux).
  const saveProfile = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        title_style: titleStyle.trim() || null,
        description_style: descriptionStyle.trim() || null,
      })
      .eq('id', profile?.id ?? '');
    setSaving(false);
    if (error) showToast('Erreur lors de la sauvegarde.', 'error');
    else {
      showToast('Profil mis à jour !', 'success');
      await refreshProfile();
    }
  };

  const changePassword = async () => {
    if (newPassword.length < 6) {
      showToast('Le mot de passe doit faire au moins 6 caractères.', 'error');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) showToast(translateAuthError(error.message), 'error');
    else {
      showToast('Mot de passe mis à jour !', 'success');
      setNewPassword('');
    }
  };

  const saveApiKey = () => {
    if (openaiKey.trim()) {
      localStorage.setItem('dzikovinted_openai_key', openaiKey.trim());
    } else {
      localStorage.removeItem('dzikovinted_openai_key');
    }
    showToast('Clé API enregistrée.', 'success');
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    setDeleteAccountError(null);
    const result = await deleteAccount();
    if (!result.ok) {
      setDeletingAccount(false);
      setDeleteAccountError(result.error);
      return;
    }
    // Pas de navigation explicite : App.tsx re-rend automatiquement vers
    // la landing page des que user devient null (voir son garde-fou
    // `if (!user) { ... }`), meme mecanisme que tout autre signOut().
    await signOut();
  };

  const tabs = [
    { key: 'profile', label: 'Profil', icon: User },
    { key: 'security', label: 'Sécurité', icon: Lock },
    { key: 'accounts', label: 'Comptes Vinted', icon: Users },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'api', label: 'Clés API', icon: Key },
    { key: 'privacy', label: 'Confidentialité', icon: Shield },
    { key: 'danger', label: 'Danger', icon: Trash2 },
  ] as const;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title="Paramètres" description="Gère ton profil et tes préférences." />

      <div className="flex gap-1 mb-8 overflow-x-auto pb-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <FilterPill
            key={key}
            label={label}
            active={activeTab === key}
            onClick={() => setActiveTab(key)}
            icon={<Icon className="w-3.5 h-3.5" />}
          />
        ))}
      </div>

      {activeTab === 'profile' && (
        <div className="max-w-2xl space-y-5">
          {/* Carte d'identite -- avatar, badges de statut et anciennete
              (audit personnel utilisateur, 2026-08-04 : "il manque un petit
              cote compte premium") -- toutes les valeurs viennent du profil
              reel, aucun chiffre invente. */}
          <div className="bg-gradient-to-br from-neon-500/10 via-surface to-surface border border-gray-200 rounded-2xl p-6 flex items-center gap-5">
            <AccountAvatar label={profile?.full_name || profile?.email || '?'} size="lg" brand />
            <div className="flex-1 min-w-0">
              <p className="font-black text-lg text-gray-900 truncate">{profile?.full_name || profile?.email?.split('@')[0]}</p>
              <p className="text-sm text-gray-500 truncate">{profile?.email}</p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <Badge label={(profile?.plan ?? 'free').toUpperCase()} tone={PLAN_BADGE_TONE[profile?.plan ?? 'free']} />
                {isAdmin && <Badge label="Admin" tone="attention" />}
                {profile?.created_at && (
                  <span className="text-[10px] font-mono text-gray-500">
                    Membre depuis {new Date(profile.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
            <div className="hidden sm:flex flex-col items-end flex-shrink-0">
              <div className="flex items-center gap-1.5 text-neon-500">
                <Zap className="w-3.5 h-3.5" />
                <span className="text-sm font-bold">
                  {isAdmin ? 'Illimité' : `${profile?.credits ?? 0} / ${PLAN_LIMITS[profile?.plan ?? 'free'] ?? '∞'}`}
                </span>
              </div>
              <p className="text-[10px] text-gray-500">crédits ce mois</p>
            </div>
          </div>

          <Card padding="lg" className="space-y-5">
          <h2 className="font-bold text-sm">Informations du profil</h2>
          <Input
            label="Nom complet"
            type="text"
            icon={<User className="w-4 h-4" />}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Input label="Email" type="email" icon={<Mail className="w-4 h-4" />} value={email} disabled />
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Plan</label>
            <div className="px-4 py-3 bg-dark-400 border border-gray-200 rounded-xl text-sm text-neon-500 font-bold">{(profile?.plan ?? 'free').toUpperCase()}</div>
          </div>
          <div className="pt-5 border-t border-gray-200 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-neon-500" />
              <h3 className="font-bold text-sm">Style d'annonce IA (optionnel)</h3>
            </div>
            <p className="text-xs text-gray-500 -mt-2">
              Décris comment tu aimes rédiger tes titres et descriptions. Le Générateur IA en tient compte tout en gardant les infos réelles détectées sur la photo et l'optimisation Vinted. Laisse vide pour garder le comportement par défaut.
            </p>
            <Textarea
              label="Style de titre souhaité"
              value={titleStyle}
              onChange={(e) => setTitleStyle(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Ex : titre court, direct, sans emoji."
            />
            <Textarea
              label="Style de description souhaité"
              value={descriptionStyle}
              onChange={(e) => setDescriptionStyle(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Ex : toujours mentionner la coupe et le tissu, ton chaleureux."
            />
          </div>
          <Button icon={<Save className="w-4 h-4" />} loading={saving} onClick={saveProfile}>
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
          </Card>
        </div>
      )}

      {activeTab === 'security' && (
        <Card padding="lg" className="max-w-2xl space-y-5">
          <h2 className="font-bold text-sm">Changer le mot de passe</h2>
          <Input
            label="Nouveau mot de passe"
            type={showPass ? 'text' : 'password'}
            icon={<Lock className="w-4 h-4" />}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="********"
            trailingElement={
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                aria-label={showPass ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                className="text-gray-500 hover:text-gray-500"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />
          {/* Verification du mot de passe actuel : retiree pour la beta (decision
              explicite du 2026-07-24, Option A) -- le champ existait mais
              changePassword() ne le lisait jamais, un element trompeur plutot
              qu'une vraie protection. Chantier de reauthentification reelle
              (signInWithPassword avant updateUser) reporte apres la premiere
              beta, voir memoire du projet. */}
          <Button icon={<Save className="w-4 h-4" />} onClick={changePassword}>
            Mettre à jour
          </Button>
        </Card>
      )}

      {activeTab === 'accounts' && <AccountsManager />}

      {activeTab === 'notifications' && (
        <Card padding="lg" className="max-w-2xl space-y-4">
          <h2 className="font-bold text-sm mb-2">Préférences de notifications</h2>
          {/* defaultChecked retire (Design Freeze, Lot 8) : rien ne branche
              ces toggles a un vrai etat cote serveur -- les afficher coches
              par defaut laissait croire a une preference deja active et
              sauvegardee, qui n'existe pas. Neutres/off jusqu'a ce qu'un
              vrai systeme de preferences soit construit. */}
          {[
            { label: 'Résumé hebdomadaire', desc: 'Reçois un résumé de tes annonces chaque semaine.' },
            { label: 'Nouvelles fonctionnalités', desc: 'Sois informé des mises à jour de Resell OS.' },
            { label: 'Conseils de vente', desc: 'Astuces pour vendre plus vite sur Vinted.' },
          ].map(({ label, desc }) => (
            <div key={label} className="flex items-center justify-between py-3 border-b border-gray-200 last:border-0">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-10 h-5 bg-gray-100 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neon-500" />
              </label>
            </div>
          ))}
        </Card>
      )}

      {activeTab === 'api' && (
        <Card padding="lg" className="max-w-2xl space-y-5">
          <h2 className="font-bold text-sm">Clés API</h2>
          <div className="bg-dark-400 border border-neon-500/20 rounded-xl p-4">
            <p className="text-xs text-neon-500/70 font-mono mb-1">Clé API Gemini</p>
            <p className="text-xs text-gray-500">Connecte ta propre clé Gemini pour tes analyses IA. Sans clé personnelle, ResellOS utilise sa clé par défaut, soumise aux mêmes limites d'utilisation.</p>
          </div>
          <Input
            label="Clé API Gemini"
            type="password"
            icon={<Key className="w-4 h-4" />}
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder="Colle ta clé ici"
            className="font-mono"
          />
          <Button icon={<Save className="w-4 h-4" />} onClick={saveApiKey}>
            Sauvegarder la clé
          </Button>
        </Card>
      )}

      {activeTab === 'privacy' && (
        <div className="max-w-2xl space-y-4">
          {[
            { icon: Database, title: 'Tes données', desc: "Email, profil, annonces synchronisées et historique d'actions — hébergés chez Supabase, protégés par des règles d'accès (RLS) : toi seul peux y accéder." },
            { icon: Server, title: 'Analyse IA', desc: "Les photos envoyées au Générateur passent par l'API Google Gemini, uniquement le temps de l'analyse. Jamais revendues ni utilisées à d'autres fins." },
            { icon: Cookie, title: 'Aucun tracking publicitaire', desc: "Le stockage local du navigateur sert uniquement à garder ta session connectée. Pas de cookie publicitaire, pas de revente à des tiers." },
          ].map(({ icon: Icon, title, desc }) => (
            <Card key={title} padding="md" className="flex items-start gap-4">
              <div className="w-9 h-9 bg-neon-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-neon-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{title}</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{desc}</p>
              </div>
            </Card>
          ))}
          <div className="flex items-center gap-3 bg-surface/50 border border-gray-200 rounded-xl px-5 py-4">
            <p className="text-xs text-gray-500">
              Suppression, export ou question sur tes données ?{' '}
              <a href="mailto:resellosapp@gmail.com" className="text-neon-500 hover:underline">resellosapp@gmail.com</a>
            </p>
          </div>
        </div>
      )}

      {activeTab === 'danger' && (
        <Card padding="lg" tone="danger" className="max-w-2xl space-y-5">
          <h2 className="font-bold text-sm text-red-700">Zone de danger</h2>
          <div className="border border-red-500/10 rounded-xl p-4">
            <p className="text-sm font-semibold mb-1">Supprimer mon compte</p>
            <p className="text-xs text-gray-500 mb-4">
              Cette action est irréversible. Ton profil, tes annonces, tes comptes Vinted connectés et ton historique sont supprimés définitivement.
            </p>
            <Button
              variant="danger"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={() => {
                setDeleteAccountConfirmText('');
                setDeleteAccountError(null);
                setShowDeleteAccountModal(true);
              }}
            >
              Supprimer mon compte
            </Button>
          </div>
        </Card>
      )}

      {showDeleteAccountModal && (
        <Modal onClose={() => !deletingAccount && setShowDeleteAccountModal(false)} size="sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-black text-red-700">Supprimer définitivement ton compte ?</h2>
            {!deletingAccount && (
              <button
                onClick={() => setShowDeleteAccountModal(false)}
                aria-label="Fermer"
                className="p-1.5 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            )}
          </div>

          <p className="text-sm text-gray-500 mb-4">
            Cette action est irréversible : profil, annonces, comptes Vinted connectés, historique et photos sont
            supprimés de la base. Tape <span className="font-mono font-bold text-gray-800">SUPPRIMER</span> pour confirmer.
          </p>

          {deleteAccountError && <ErrorBanner message={deleteAccountError} className="mb-4" />}

          <Input
            id="delete-account-confirm"
            label="Confirmation"
            value={deleteAccountConfirmText}
            onChange={(e) => setDeleteAccountConfirmText(e.target.value)}
            placeholder="SUPPRIMER"
            disabled={deletingAccount}
            className="font-mono mb-5"
          />

          <div className="flex items-center gap-3">
            <Button variant="secondary" fullWidth disabled={deletingAccount} onClick={() => setShowDeleteAccountModal(false)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              fullWidth
              loading={deletingAccount}
              disabled={deleteAccountConfirmText !== 'SUPPRIMER'}
              onClick={handleDeleteAccount}
            >
              {deletingAccount ? 'Suppression...' : 'Supprimer définitivement'}
            </Button>
          </div>
        </Modal>
      )}

    </div>
  );
}

function AccountsManager() {
  const { accounts, loading, refresh } = useVintedAccountFilter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VintedAccount | null>(null);
  const [deleteListingsCount, setDeleteListingsCount] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = (account: VintedAccount) => {
    setEditingId(account.id);
    setEditValue(account.label);
  };

  const commitRename = async (account: VintedAccount) => {
    const label = editValue.trim();
    if (!label || label === account.label) {
      setEditingId(null);
      return;
    }
    setSavingId(account.id);
    const { error: updateError } = await supabase.from('vinted_accounts').update({ label }).eq('id', account.id);
    setSavingId(null);
    setEditingId(null);
    if (updateError) setError('Le renommage a échoué.');
    else await refresh();
  };

  const setDefault = async (account: VintedAccount) => {
    setSavingId(account.id);
    const { error: rpcError } = await supabase.rpc('set_default_vinted_account', { target_account_id: account.id });
    setSavingId(null);
    if (rpcError) setError('Impossible de définir ce compte par défaut.');
    else await refresh();
  };

  const openDeleteConfirm = async (account: VintedAccount) => {
    setDeleteTarget(account);
    setDeleteListingsCount(null);
    // `vinted_listings` a ete fusionnee dans `listings` (migration
    // 20260709190000, renommee vinted_listings_deprecated_20260709) --
    // interroger l'ancien nom de table echouait silencieusement ici,
    // affichant toujours "0 annonce" quel que soit le vrai nombre.
    const { count } = await supabase
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('vinted_account_id', account.id);
    setDeleteListingsCount(count ?? 0);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error: deleteError } = await supabase.from('vinted_accounts').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (deleteError) setError('La suppression a échoué.');
    else await refresh();
  };

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} shape="block" className="h-16" />)}
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun compte Vinted connecté"
          description="Connecte l'extension ResellOS depuis « Compte Vinted » pour qu'un compte apparaisse ici automatiquement."
        />
      ) : (
        <Card padding="none" className="divide-y divide-gray-200">
          {accounts.map((account) => (
            <div key={account.id} className="flex items-center gap-3 p-4">
              <AccountAvatar label={account.label} size="md" />

              <div className="flex-1 min-w-0">
                {editingId === account.id ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => commitRename(account)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(account);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="w-full max-w-xs bg-dark-400 border border-gray-200 rounded-lg px-2.5 py-1 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-800 truncate">{account.label}</p>
                    {account.is_default && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-neon-500 bg-neon-500/10 px-1.5 py-0.5 rounded-md flex-shrink-0">
                        <Star className="w-2.5 h-2.5 fill-neon-500" /> Défaut
                      </span>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${account.connected ? 'bg-neon-500' : 'bg-gray-600'}`} />
                  {account.connected ? 'Connecté' : 'Déconnecté'}
                  {' · '}
                  {account.last_synced_at
                    ? `Synchro : ${new Date(account.last_synced_at).toLocaleString('fr-FR')}`
                    : 'Jamais synchronisé'}
                </p>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {!account.is_default && (
                  <button
                    onClick={() => setDefault(account)}
                    disabled={savingId === account.id}
                    title="Définir par défaut"
                    className="p-2 rounded-lg text-gray-500 hover:text-neon-500 hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    <Star className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => startEdit(account)}
                  title="Renommer"
                  className="p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => openDeleteConfirm(account)}
                  title="Supprimer"
                  className="p-2 rounded-lg text-gray-500 hover:text-red-700 hover:bg-red-500/5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <p className="text-xs text-gray-500 px-1">
        Un compte n'apparaît ici qu'après une connexion réelle via l'extension Chrome, depuis « Compte Vinted ».
      </p>

      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)} size="md">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-black">Supprimer ce compte ?</h2>
              <p className="text-xs text-gray-500 mt-1">{deleteTarget.label}</p>
            </div>
            <button
              onClick={() => setDeleteTarget(null)}
              aria-label="Fermer"
              className="p-1.5 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <p className="text-sm text-gray-500 mb-5">
            {deleteListingsCount === null
              ? 'Vérification des annonces synchronisées...'
              : deleteListingsCount > 0
                ? `${deleteListingsCount} annonce${deleteListingsCount > 1 ? 's' : ''} synchronisée${deleteListingsCount > 1 ? 's' : ''} depuis ce compte resteront dans Mes annonces, simplement détachées de ce compte Vinted. Cette action est irréversible.`
                : 'Cette action est irréversible.'}
          </p>

          <div className="flex items-center gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDeleteTarget(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              fullWidth
              loading={deleting}
              disabled={deleteListingsCount === null}
              onClick={confirmDelete}
            >
              {deleting ? 'Suppression...' : 'Supprimer'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
