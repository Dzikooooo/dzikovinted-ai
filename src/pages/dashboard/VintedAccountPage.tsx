import { useCallback, useEffect, useState } from 'react';
import { Puzzle, MessageSquare, Tag, RotateCw, Bell, Loader2, Eye, Heart } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { VintedAccount, VintedListing } from '../../lib/types';
import { isExtensionConfigured, pingExtension, pairExtension } from '../../lib/extensionBridge';

const UPCOMING = [
  { icon: MessageSquare, label: 'Messages et reponses rapides' },
  { icon: Tag, label: 'Offres et contre-offres recues' },
  { icon: RotateCw, label: 'Republication automatique des annonces' },
  { icon: Bell, label: 'Alertes ventes, offres et annonces expirees' },
];

// Phase A de la refonte multi-comptes : un seul compte affiche ici (le
// compte par defaut). La selection/gestion multi-comptes arrive en Phase B.
// Une ligne vinted_accounts ne peut exister que si un compte Vinted reel a
// deja ete detecte par l'extension (voir EXTENSION.md) - il n'y a donc plus
// de distinction "appaire mais pas encore detecte" a afficher separement :
// l'appairage lui-meme n'a plus d'effet visible en base.
type ConnectionState = 'checking' | 'not-installed' | 'not-connected' | 'connected';

export default function VintedAccountPage() {
  const { session } = useAuth();
  const [account, setAccount] = useState<VintedAccount | null>(null);
  const [listings, setListings] = useState<VintedListing[]>([]);
  const [state, setState] = useState<ConnectionState>('checking');
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAccount = useCallback(async (): Promise<VintedAccount | null> => {
    if (!session?.user.id) return null;
    const { data } = await supabase
      .from('vinted_accounts')
      .select('*')
      .eq('user_id', session.user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const row = (data as VintedAccount | null) ?? null;
    setAccount(row);
    return row;
  }, [session?.user.id]);

  const loadListings = useCallback(async (accountId: string): Promise<void> => {
    const { data } = await supabase
      .from('vinted_listings')
      .select('*')
      .eq('vinted_account_id', accountId)
      .order('synced_at', { ascending: false });
    setListings((data as VintedListing[] | null) ?? []);
  }, []);

  useEffect(() => {
    if (!session?.user.id) return;

    (async () => {
      if (!isExtensionConfigured()) {
        setState('not-installed');
        return;
      }

      const [installed, existing] = await Promise.all([pingExtension(), loadAccount()]);

      if (!installed) {
        setState('not-installed');
      } else if (existing?.connected) {
        setState('connected');
        void loadListings(existing.id);
      } else {
        setState('not-connected');
      }
    })();
  }, [session?.user.id, loadAccount, loadListings]);

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

    const existing = await loadAccount();
    if (existing?.connected) {
      setState('connected');
      void loadListings(existing.id);
    } else {
      setState('not-connected');
    }
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

        {state === 'not-connected' && (
          <>
            <h2 className="font-bold text-sm mb-1">Extension détectée</h2>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
              Connecte l'extension à ton compte ResellOS, puis ouvre ton profil Vinted dans un onglet pour synchroniser ton compte.
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

        {state === 'connected' && account && (
          <>
            <h2 className="font-bold text-sm mb-1">
              Connecté — {account.label}
            </h2>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mb-3">
              {account.last_synced_at
                ? `Dernière synchro : ${new Date(account.last_synced_at).toLocaleString('fr-FR')}`
                : 'Synchronisation en cours...'}
            </p>
            <ReconnectLink pairing={pairing} onClick={handleConnect} />
            {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
          </>
        )}
      </div>

      {state === 'connected' && (
        <div className="mt-6">
          <h2 className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-3">
            Annonces synchronisées {listings.length > 0 && `(${listings.length})`}
          </h2>
          {listings.length === 0 ? (
            <div className="bg-surface border border-white/5 border-dashed rounded-2xl p-8 text-center">
              <p className="text-sm text-gray-500">
                Aucune annonce synchronisée pour l'instant. Ouvre ton profil Vinted dans un onglet pour lancer la synchronisation.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {listings.map((listing) => (
                <div
                  key={listing.id}
                  className="flex items-center gap-3 bg-surface border border-white/5 rounded-xl px-4 py-3"
                >
                  {listing.image_url ? (
                    <img src={listing.image_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-white/5 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-200 truncate">{listing.title}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-500">
                      {listing.views !== null && (
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" /> {listing.views}
                        </span>
                      )}
                      {listing.favourites !== null && (
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3" /> {listing.favourites}
                        </span>
                      )}
                    </div>
                  </div>
                  {listing.price !== null && (
                    <p className="text-sm font-bold text-neon-500 flex-shrink-0">{listing.price.toFixed(2)} €</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

// Toujours disponible, même une fois "connected" : une ligne vinted_accounts
// en base ne garantit pas que l'extension a encore une session locale valide
// (dissociation, réinstallation, données de navigateur effacées...). Sans ce
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
