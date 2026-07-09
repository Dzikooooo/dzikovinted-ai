import { useCallback, useEffect, useState } from 'react';
import { Puzzle, MessageSquare, Tag, Eye, RotateCw, Bell, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { VintedConnection } from '../../lib/types';
import { isExtensionConfigured, pingExtension, pairExtension } from '../../lib/extensionBridge';

const UPCOMING = [
  { icon: MessageSquare, label: 'Messages et reponses rapides' },
  { icon: Tag, label: 'Offres et contre-offres recues' },
  { icon: RotateCw, label: 'Republication automatique des annonces' },
  { icon: Eye, label: 'Vues, favoris et visibilite en temps reel' },
  { icon: Bell, label: 'Alertes ventes, offres et annonces expirees' },
];

type ConnectionState = 'checking' | 'not-installed' | 'not-paired' | 'paired' | 'connected';

export default function VintedAccountPage() {
  const { session } = useAuth();
  const [connection, setConnection] = useState<VintedConnection | null>(null);
  const [state, setState] = useState<ConnectionState>('checking');
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConnection = useCallback(async (): Promise<VintedConnection | null> => {
    if (!session?.user.id) return null;
    const { data } = await supabase
      .from('vinted_connection')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();
    const row = (data as VintedConnection | null) ?? null;
    setConnection(row);
    return row;
  }, [session?.user.id]);

  useEffect(() => {
    if (!session?.user.id) return;

    (async () => {
      if (!isExtensionConfigured()) {
        setState('not-installed');
        return;
      }

      const [installed, existing] = await Promise.all([pingExtension(), loadConnection()]);

      if (!installed) {
        setState('not-installed');
      } else if (!existing) {
        setState('not-paired');
      } else if (existing.connected) {
        setState('connected');
      } else {
        setState('paired');
      }
    })();
  }, [session?.user.id, loadConnection]);

  const handleConnect = async () => {
    if (!session) return;
    setPairing(true);
    setError(null);

    // Redemande une session fraiche a Supabase (rafraichit si besoin) plutot
    // que d'envoyer le `session` fige dans le contexte React : si le refresh
    // token qu'il contient a deja ete consomme une fois (ex. un premier
    // appairage), le renvoyer tel quel echoue cote extension.
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session) {
      setPairing(false);
      setError('Session ResellOS invalide, reconnecte-toi et réessaie.');
      return;
    }

    const result = await pairExtension(data.session.access_token, data.session.refresh_token);
    setPairing(false);

    if (!result.ok) {
      setError(result.error ?? "L'appairage a échoué.");
      return;
    }

    const existing = await loadConnection();
    setState(existing?.connected ? 'connected' : 'paired');
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black mb-1">Compte Vinted</h1>
        <p className="text-gray-400 text-sm">
          Pilote ton compte Vinted directement depuis ResellOS.
        </p>
      </div>

      <div className="bg-surface border border-white/5 rounded-2xl p-6 text-center">
        <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Puzzle className="w-5 h-5 text-gray-500" />
        </div>

        {state === 'checking' && (
          <>
            <Loader2 className="w-4 h-4 text-gray-600 animate-spin mx-auto mb-3" />
            <p className="text-xs text-gray-500">Vérification de l'extension...</p>
          </>
        )}

        {state === 'not-installed' && (
          <>
            <h2 className="font-bold text-sm mb-1">Extension Chrome non détectée</h2>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Installe l'extension ResellOS pour Vinted, puis reviens sur cette page. Plus besoin d'ouvrir Vinted au quotidien.
            </p>
          </>
        )}

        {state === 'not-paired' && (
          <>
            <h2 className="font-bold text-sm mb-1">Extension détectée</h2>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
              Connecte l'extension à ton compte ResellOS en un clic — aucune reconnexion nécessaire.
            </p>
            <button
              onClick={handleConnect}
              disabled={pairing}
              className="bg-neon-500 text-black text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-neon-600 transition-all disabled:opacity-60"
            >
              {pairing ? 'Connexion...' : "Connecter l'extension"}
            </button>
            {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
          </>
        )}

        {state === 'paired' && (
          <>
            <h2 className="font-bold text-sm mb-1">Extension appairée</h2>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mb-3">
              Ouvre vinted.fr dans un onglet pour terminer la synchronisation de ton compte.
            </p>
            <ReconnectLink pairing={pairing} onClick={handleConnect} />
            {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
          </>
        )}

        {state === 'connected' && connection && (
          <>
            <h2 className="font-bold text-sm mb-1">
              Connecté{connection.vinted_username ? ` — ${connection.vinted_username}` : ''}
            </h2>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mb-3">
              {connection.last_synced_at
                ? `Dernière synchro : ${new Date(connection.last_synced_at).toLocaleString('fr-FR')}`
                : 'Synchronisation en cours...'}
            </p>
            <ReconnectLink pairing={pairing} onClick={handleConnect} />
            {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
          </>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-3">
          Disponible avec la synchronisation
        </h2>
        <div className="space-y-2">
          {UPCOMING.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-3 bg-surface border border-white/5 rounded-xl px-4 py-3"
            >
              <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-gray-500" />
              </div>
              <p className="text-sm text-gray-400">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Toujours disponible tant que l'extension est installée, même une fois "paired"/"connected" :
// une ligne vinted_connection en base ne garantit pas que l'extension a encore une session
// locale valide (dissociation, réinstallation, données de navigateur effacées...). Sans ce
// bouton de secours, un utilisateur dans cet état serait bloqué sans aucun moyen de ré-appairer.
function ReconnectLink({ pairing, onClick }: { pairing: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={pairing}
      className="text-xs text-gray-500 hover:text-neon-500 transition-colors underline underline-offset-2 disabled:opacity-60"
    >
      {pairing ? 'Connexion...' : "Ré-appairer l'extension"}
    </button>
  );
}
