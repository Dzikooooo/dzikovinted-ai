import { useCallback, useEffect, useState } from 'react';
import { Puzzle, MessageSquare, Tag, RotateCw, Bell, Loader2, Eye, Heart, ArrowRight, UserPlus, ExternalLink } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useVintedAccountFilter } from '../../contexts/VintedAccountFilterContext';
import { supabase } from '../../lib/supabase';
import type { VintedListing } from '../../lib/types';
import { isExtensionConfigured, pingExtension, pairExtension } from '../../lib/extensionBridge';
import AccountAvatar from '../../components/ui/AccountAvatar';

const UPCOMING = [
  { icon: MessageSquare, label: 'Messages et reponses rapides' },
  { icon: Tag, label: 'Offres et contre-offres recues' },
  { icon: RotateCw, label: 'Republication automatique des annonces' },
  { icon: Bell, label: 'Alertes ventes, offres et annonces expirees' },
];

// L'etat de l'extension (installee/appairee) est independant du compte Vinted
// selectionne dans le switcher : l'appairage n'est pas specifique a un
// compte, seule la detection ulterieure sur vinted.fr cree/relie un compte
// (voir EXTENSION.md §5). Le mode d'affichage (aperçu global vs detail d'un
// compte) est lui pilote par le filtre partage (VintedAccountFilterContext).
type ExtensionState = 'checking' | 'not-installed' | 'ready';

export default function VintedAccountPage() {
  const { session } = useAuth();
  const { accounts, loading: accountsLoading, selectedAccountId, selectedAccount, selectAccount, refresh } = useVintedAccountFilter();
  const [listings, setListings] = useState<VintedListing[]>([]);
  const [extensionState, setExtensionState] = useState<ExtensionState>('checking');
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!isExtensionConfigured()) {
        setExtensionState('not-installed');
        return;
      }
      const installed = await pingExtension();
      setExtensionState(installed ? 'ready' : 'not-installed');
    })();
  }, []);

  const loadListings = useCallback(async (accountId: string, isStale: () => boolean): Promise<void> => {
    const { data } = await supabase
      .from('vinted_listings')
      .select('*')
      .eq('vinted_account_id', accountId)
      .order('synced_at', { ascending: false });
    if (!isStale()) setListings((data as VintedListing[] | null) ?? []);
  }, []);

  useEffect(() => {
    let ignore = false;

    if (selectedAccountId !== 'all' && selectedAccount) {
      void loadListings(selectedAccount.id, () => ignore);
    } else {
      setListings([]);
    }

    return () => {
      ignore = true;
    };
  }, [selectedAccountId, selectedAccount, loadListings]);

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

    await refresh();
  };

  const hasAnyAccount = accounts.length > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black mb-1">Compte Vinted</h1>
        <p className="text-gray-400 text-sm">
          Pilote ton compte Vinted directement depuis ResellOS.
        </p>
      </div>

      {(extensionState === 'checking' || (extensionState === 'ready' && accountsLoading)) && (
        <div className="bg-surface border border-white/5 rounded-2xl p-6 text-center">
          <Loader2 className="w-4 h-4 text-gray-600 animate-spin mx-auto mb-3" />
          <p className="text-xs text-gray-500">Vérification de l'extension...</p>
        </div>
      )}

      {extensionState === 'not-installed' && (
        <div className="bg-surface border border-white/5 rounded-2xl p-6 text-center">
          <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Puzzle className="w-5 h-5 text-gray-500" />
          </div>
          <h2 className="font-bold text-sm mb-1">Extension Chrome non détectée</h2>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Installe l'extension ResellOS pour Vinted, puis reviens sur cette page. Plus besoin d'ouvrir Vinted au quotidien.
          </p>
        </div>
      )}

      {extensionState === 'ready' && !accountsLoading && !hasAnyAccount && (
        <div className="bg-surface border border-white/5 rounded-2xl p-6 text-center">
          <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Puzzle className="w-5 h-5 text-gray-500" />
          </div>
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
        </div>
      )}

      {extensionState === 'ready' && !accountsLoading && hasAnyAccount && selectedAccountId === 'all' && (
        <div className="space-y-2">
          {accounts.map((account) => (
            <button
              key={account.id}
              onClick={() => selectAccount(account.id)}
              className="w-full flex items-center gap-3 bg-surface border border-white/5 rounded-2xl px-4 py-3.5 text-left hover:border-white/10 transition-colors group"
            >
              <AccountAvatar label={account.label} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-200 truncate">{account.label}</p>
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${account.connected ? 'bg-neon-500' : 'bg-gray-600'}`} />
                  {account.connected ? 'Connecté' : 'Déconnecté'}
                  {' · '}
                  {account.last_synced_at ? new Date(account.last_synced_at).toLocaleString('fr-FR') : 'Jamais synchronisé'}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {extensionState === 'ready' && !accountsLoading && hasAnyAccount && selectedAccountId !== 'all' && selectedAccount && (
        <>
          <div className="bg-surface border border-white/5 rounded-2xl p-6 text-center">
            <AccountAvatar label={selectedAccount.label} size="md" />
            <h2 className="font-bold text-sm mt-3 mb-1">
              {selectedAccount.connected ? 'Connecté' : 'Déconnecté'} — {selectedAccount.label}
            </h2>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mb-3">
              {selectedAccount.last_synced_at
                ? `Dernière synchro : ${new Date(selectedAccount.last_synced_at).toLocaleString('fr-FR')}`
                : 'Synchronisation en cours...'}
            </p>
            <ReconnectLink pairing={pairing} onClick={handleConnect} />
            {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
          </div>

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
        </>
      )}

      {extensionState === 'ready' && !accountsLoading && hasAnyAccount && (
        <div className="mt-6 bg-surface/50 border border-white/5 border-dashed rounded-2xl p-5 flex items-start gap-4">
          <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center flex-shrink-0">
            <UserPlus className="w-4 h-4 text-gray-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-300">Ajouter un autre compte Vinted</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Connecte-toi à un autre compte Vinted dans ce navigateur, puis ouvre ta page de profil Vinted. Le nouveau compte est détecté et ajouté automatiquement ici et dans le sélecteur — aucune action supplémentaire n'est nécessaire côté ResellOS.
            </p>
            <a
              href="https://www.vinted.fr"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-neon-500 hover:underline mt-3"
            >
              Ouvrir Vinted <ExternalLink className="w-3 h-3" />
            </a>
          </div>
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

// Toujours disponible : une ligne vinted_accounts en base ne garantit pas que
// l'extension a encore une session locale valide (dissociation,
// réinstallation, données de navigateur effacées...). Sans ce bouton de
// secours, un utilisateur dans cet état serait bloqué sans aucun moyen de
// ré-appairer.
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
