import { useState } from 'react';
import { User, Mail, Lock, Eye, EyeOff, Save, Key, Bell, Trash2, AlertCircle, CheckCircle, Users, Pencil, Star, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useVintedAccountFilter } from '../../contexts/VintedAccountFilterContext';
import { supabase } from '../../lib/supabase';
import AccountAvatar from '../../components/ui/AccountAvatar';
import type { SettingsTab, VintedAccount } from '../../lib/types';

interface SettingsPageProps {
  initialTab?: SettingsTab;
}

export default function SettingsPage({ initialTab }: SettingsPageProps) {
  const { profile, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? 'profile');

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [email] = useState(profile?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [secMsg, setSecMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem('dzikovinted_openai_key') || '');
  const [apiSaved, setApiSaved] = useState(false);

  const saveProfile = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', profile?.id ?? '');
    setSaving(false);
    if (error) setProfileMsg({ type: 'error', text: 'Erreur lors de la sauvegarde.' });
    else { setProfileMsg({ type: 'success', text: 'Profil mis a jour !' }); await refreshProfile(); setTimeout(() => setProfileMsg(null), 3000); }
  };

  const changePassword = async () => {
    if (newPassword.length < 6) { setSecMsg({ type: 'error', text: 'Le mot de passe doit faire au moins 6 caracteres.' }); return; }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) setSecMsg({ type: 'error', text: error.message });
    else { setSecMsg({ type: 'success', text: 'Mot de passe mis a jour !' }); setCurrentPassword(''); setNewPassword(''); setTimeout(() => setSecMsg(null), 3000); }
  };

  const saveApiKey = () => {
    if (openaiKey.trim()) {
      localStorage.setItem('dzikovinted_openai_key', openaiKey.trim());
    } else {
      localStorage.removeItem('dzikovinted_openai_key');
    }
    setApiSaved(true);
    setTimeout(() => setApiSaved(false), 2000);
  };

  const tabs = [
    { key: 'profile', label: 'Profil', icon: User },
    { key: 'security', label: 'Securite', icon: Lock },
    { key: 'accounts', label: 'Comptes Vinted', icon: Users },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'api', label: 'Cles API', icon: Key },
    { key: 'danger', label: 'Danger', icon: Trash2 },
  ] as const;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black mb-2">Parametres</h1>
        <p className="text-gray-400 text-sm">Gere ton profil et tes preferences.</p>
      </div>

      <div className="flex gap-1 mb-8 overflow-x-auto pb-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm whitespace-nowrap transition-all duration-200 flex-shrink-0 ${activeTab === key ? 'bg-neon-500/10 text-neon-500 font-medium' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <div className="bg-surface border border-white/5 rounded-2xl p-6 space-y-5">
          <h2 className="font-bold text-sm">Informations du profil</h2>
          {profileMsg && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm ${profileMsg.type === 'success' ? 'bg-neon-500/10 border-neon-500/20 text-neon-500' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              {profileMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {profileMsg.text}
            </div>
          )}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Nom complet</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-dark-400 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
              <input type="email" value={email} disabled className="w-full bg-dark-400 border border-white/5 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-500 cursor-not-allowed" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Plan</label>
            <div className="px-4 py-3 bg-dark-400 border border-white/5 rounded-xl text-sm text-neon-500 font-bold">{(profile?.plan ?? 'free').toUpperCase()}</div>
          </div>
          <button onClick={saveProfile} disabled={saving} className="flex items-center gap-2 bg-neon-500 text-black font-bold px-5 py-2.5 rounded-xl hover:bg-neon-600 transition-all text-sm disabled:opacity-60">
            <Save className="w-4 h-4" />
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="bg-surface border border-white/5 rounded-2xl p-6 space-y-5">
          <h2 className="font-bold text-sm">Changer le mot de passe</h2>
          {secMsg && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm ${secMsg.type === 'success' ? 'bg-neon-500/10 border-neon-500/20 text-neon-500' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              {secMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {secMsg.text}
            </div>
          )}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Mot de passe actuel</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
              <input type={showPass ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full bg-dark-400 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all" placeholder="********" />
              <button type="button" onClick={() => setShowPass(!showPass)} aria-label={showPass ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Nouveau mot de passe</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
              <input type={showPass ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-dark-400 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all" placeholder="********" />
            </div>
          </div>
          <button onClick={changePassword} className="flex items-center gap-2 bg-neon-500 text-black font-bold px-5 py-2.5 rounded-xl hover:bg-neon-600 transition-all text-sm">
            <Save className="w-4 h-4" />
            Mettre a jour
          </button>
        </div>
      )}

      {activeTab === 'accounts' && <AccountsManager />}

      {activeTab === 'notifications' && (
        <div className="bg-surface border border-white/5 rounded-2xl p-6 space-y-4">
          <h2 className="font-bold text-sm mb-2">Preferences de notifications</h2>
          {[
            { label: 'Resume hebdomadaire', desc: 'Recois un resume de tes annonces chaque semaine.' },
            { label: 'Nouvelles fonctionnalites', desc: 'Sois informe des mises a jour de Resell OS.' },
            { label: 'Conseils de vente', desc: 'Astuces pour vendre plus vite sur Vinted.' },
          ].map(({ label, desc }) => (
            <div key={label} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-10 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neon-500" />
              </label>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'api' && (
        <div className="bg-surface border border-white/5 rounded-2xl p-6 space-y-5">
          <h2 className="font-bold text-sm">Cles API</h2>
          <div className="bg-dark-400 border border-neon-500/20 rounded-xl p-4">
            <p className="text-xs text-neon-500/70 font-mono mb-1">OpenAI API Key</p>
            <p className="text-xs text-gray-500">Connecte ton compte OpenAI pour des analyses IA reelles. Sans cle, le mode mock est utilise (ou la cle serveur si configuree).</p>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">OpenAI API Key</label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
              <input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..." className="w-full bg-dark-400 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 font-mono focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all" />
            </div>
          </div>
          <button
            onClick={saveApiKey}
            className="flex items-center gap-2 bg-neon-500 text-black font-bold px-5 py-2.5 rounded-xl hover:bg-neon-600 transition-all text-sm"
          >
            <Save className="w-4 h-4" />
            {apiSaved ? 'Sauvegarde !' : 'Sauvegarder la cle'}
          </button>
        </div>
      )}

      {activeTab === 'danger' && (
        <div className="bg-surface border border-red-500/20 rounded-2xl p-6 space-y-5">
          <h2 className="font-bold text-sm text-red-400">Zone de danger</h2>
          <div className="border border-red-500/10 rounded-xl p-4">
            <p className="text-sm font-semibold mb-1">Supprimer mon compte</p>
            <p className="text-xs text-gray-500 mb-4">Cette action est irreversible. Toutes tes donnees seront supprimees definitivement.</p>
            <button disabled title="Bientot disponible" className="flex items-center gap-2 bg-red-500/10 text-red-400 border border-red-500/20 font-medium px-4 py-2 rounded-xl opacity-50 cursor-not-allowed text-sm">
              <Trash2 className="w-4 h-4" />
              Supprimer mon compte (bientot disponible)
            </button>
          </div>
        </div>
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
    const { count } = await supabase
      .from('vinted_listings')
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
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border text-sm bg-red-500/10 border-red-500/20 text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-16 bg-surface rounded-2xl animate-pulse" />)}
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-surface border border-white/5 rounded-2xl p-10 text-center space-y-3">
          <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mx-auto">
            <Users className="w-5 h-5 text-gray-500" />
          </div>
          <div>
            <h2 className="font-bold text-sm">Aucun compte Vinted connecté</h2>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              Connecte l'extension ResellOS depuis « Compte Vinted » pour qu'un compte apparaisse ici automatiquement.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-surface border border-white/5 rounded-2xl divide-y divide-white/5">
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
                    className="w-full max-w-xs bg-dark-400 border border-white/10 rounded-lg px-2.5 py-1 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-200 truncate">{account.label}</p>
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
                    className="p-2 rounded-lg text-gray-500 hover:text-neon-500 hover:bg-white/5 transition-colors disabled:opacity-50"
                  >
                    <Star className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => startEdit(account)}
                  title="Renommer"
                  className="p-2 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => openDeleteConfirm(account)}
                  title="Supprimer"
                  className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-600 px-1">
        Un compte n'apparaît ici qu'après une connexion réelle via l'extension Chrome, depuis « Compte Vinted ».
      </p>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md bg-surface border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-black">Supprimer ce compte ?</h2>
                <p className="text-xs text-gray-500 mt-1">{deleteTarget.label}</p>
              </div>
              <button
                onClick={() => setDeleteTarget(null)}
                aria-label="Fermer"
                className="p-1.5 rounded-lg hover:bg-white/5"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <p className="text-sm text-gray-400 mb-5">
              {deleteListingsCount === null
                ? 'Vérification des annonces synchronisées...'
                : deleteListingsCount > 0
                  ? `Cette action supprimera aussi les ${deleteListingsCount} annonce${deleteListingsCount > 1 ? 's' : ''} synchronisée${deleteListingsCount > 1 ? 's' : ''} de ce compte. Cette action est irréversible.`
                  : 'Cette action est irréversible.'}
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 bg-white/5 text-gray-300 font-medium py-2.5 rounded-xl hover:bg-white/10 transition-all text-sm"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting || deleteListingsCount === null}
                className="flex-1 bg-red-500/10 text-red-400 border border-red-500/20 font-bold py-2.5 rounded-xl hover:bg-red-500/20 transition-all text-sm disabled:opacity-50"
              >
                {deleting ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
