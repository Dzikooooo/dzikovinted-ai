import { useState } from 'react';
import { User, Mail, Lock, Eye, EyeOff, Save, Key, Bell, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

export default function SettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications' | 'api' | 'danger'>('profile');

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
          <button key={key} onClick={() => setActiveTab(key)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm whitespace-nowrap transition-all duration-200 flex-shrink-0 ${activeTab === key ? 'bg-[#FFC400]/10 text-[#39FF14] font-medium' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <div className="bg-[#181818] border border-white/5 rounded-2xl p-6 space-y-5">
          <h2 className="font-bold text-sm">Informations du profil</h2>
          {profileMsg && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm ${profileMsg.type === 'success' ? 'bg-[#39FF14]/10 border-[#39FF14]/20 text-[#39FF14]' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              {profileMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {profileMsg.text}
            </div>
          )}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Nom complet</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-[#0A0A0A] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-[#39FF14]/40 transition-all" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
              <input type="email" value={email} disabled className="w-full bg-[#0A0A0A] border border-white/5 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-500 cursor-not-allowed" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Plan</label>
            <div className="px-4 py-3 bg-[#0A0A0A] border border-white/5 rounded-xl text-sm text-[#39FF14] font-bold">{(profile?.plan ?? 'free').toUpperCase()}</div>
          </div>
          <button onClick={saveProfile} disabled={saving} className="flex items-center gap-2 bg-[#39FF14] text-black font-bold px-5 py-2.5 rounded-xl hover:bg-[#50ff30] transition-all text-sm disabled:opacity-60">
            <Save className="w-4 h-4" />
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="bg-[#181818] border border-white/5 rounded-2xl p-6 space-y-5">
          <h2 className="font-bold text-sm">Changer le mot de passe</h2>
          {secMsg && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm ${secMsg.type === 'success' ? 'bg-[#39FF14]/10 border-[#39FF14]/20 text-[#39FF14]' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              {secMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {secMsg.text}
            </div>
          )}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Mot de passe actuel</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
              <input type={showPass ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full bg-[#0A0A0A] border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-gray-200 focus:outline-none focus:border-[#39FF14]/40 transition-all" placeholder="********" />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Nouveau mot de passe</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
              <input type={showPass ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-[#0A0A0A] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-[#39FF14]/40 transition-all" placeholder="********" />
            </div>
          </div>
          <button onClick={changePassword} className="flex items-center gap-2 bg-[#39FF14] text-black font-bold px-5 py-2.5 rounded-xl hover:bg-[#50ff30] transition-all text-sm">
            <Save className="w-4 h-4" />
            Mettre a jour
          </button>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="bg-[#181818] border border-white/5 rounded-2xl p-6 space-y-4">
          <h2 className="font-bold text-sm mb-2">Preferences de notifications</h2>
          {[
            { label: 'Resume hebdomadaire', desc: 'Recois un resume de tes annonces chaque semaine.' },
            { label: 'Nouvelles fonctionnalites', desc: 'Sois informe des mises a jour DzikoVinted.' },
            { label: 'Conseils de vente', desc: 'Astuces pour vendre plus vite sur Vinted.' },
          ].map(({ label, desc }) => (
            <div key={label} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-10 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#39FF14]" />
              </label>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'api' && (
        <div className="bg-[#181818] border border-white/5 rounded-2xl p-6 space-y-5">
          <h2 className="font-bold text-sm">Cles API</h2>
          <div className="bg-[#0A0A0A] border border-[#39FF14]/20 rounded-xl p-4">
            <p className="text-xs text-[#39FF14]/70 font-mono mb-1">OpenAI API Key</p>
            <p className="text-xs text-gray-500">Connecte ton compte OpenAI pour des analyses IA reelles. Sans cle, le mode mock est utilise (ou la cle serveur si configuree).</p>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">OpenAI API Key</label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
              <input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..." className="w-full bg-[#0A0A0A] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 font-mono focus:outline-none focus:border-[#39FF14]/40 transition-all" />
            </div>
          </div>
          <button
            onClick={saveApiKey}
            className="flex items-center gap-2 bg-[#39FF14] text-black font-bold px-5 py-2.5 rounded-xl hover:bg-[#50ff30] transition-all text-sm"
          >
            <Save className="w-4 h-4" />
            {apiSaved ? 'Sauvegarde !' : 'Sauvegarder la cle'}
          </button>
        </div>
      )}

      {activeTab === 'danger' && (
        <div className="bg-[#181818] border border-red-500/20 rounded-2xl p-6 space-y-5">
          <h2 className="font-bold text-sm text-red-400">Zone de danger</h2>
          <div className="border border-red-500/10 rounded-xl p-4">
            <p className="text-sm font-semibold mb-1">Supprimer mon compte</p>
            <p className="text-xs text-gray-500 mb-4">Cette action est irreversible. Toutes tes donnees seront supprimees definitivement.</p>
            <button className="flex items-center gap-2 bg-red-500/10 text-red-400 border border-red-500/20 font-medium px-4 py-2 rounded-xl hover:bg-red-500/20 transition-all text-sm">
              <Trash2 className="w-4 h-4" />
              Supprimer mon compte
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
