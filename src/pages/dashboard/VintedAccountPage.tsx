import { useCallback, useEffect, useState } from 'react';
import { Puzzle, Power, ArrowRight, UserPlus, ExternalLink, Loader2, CheckCircle2, Circle, User, Clock, Package } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useVintedAccountFilter } from '../../contexts/VintedAccountFilterContext';
import { supabase } from '../../lib/supabase';
import { getConfiguredExtensionId, isExtensionConfigured, getExtensionStatus, pairExtension, unpairExtension } from '../../lib/extensionBridge';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import AccountAvatar from '../../components/ui/AccountAvatar';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { CopyBtn } from '../../components/ui/CopyBtn';
import { formatRelativeSync } from '../../lib/formatRelativeTime';
import { devLog, devWarn } from '../../lib/devLog';

// Cette page est dediee exclusivement a la connexion de l'extension --
// jamais un second endroit pour consulter les annonces (deja dans
// StockPage.tsx). Recentrage demande le 2026-07-27 : la section "Annonces
// synchronisees" ici etait un doublon strict de StockPage.tsx.
//
// L'etat de l'extension (installee/appairee) est independant du compte Vinted
// selectionne dans le switcher : l'appairage n'est pas specifique a un
// compte, seule la detection ulterieure sur vinted.fr cree/relie un compte
// (voir EXTENSION.md §5). Le mode d'affichage (aperçu global vs detail d'un
// compte) est lui pilote par le filtre partage (VintedAccountFilterContext).
//
// 'not-configured' distingue un vrai probleme de deploiement (VITE_RESELLOS_
// EXTENSION_ID absent de cette build -- l'app ne sait meme pas a quel id
// s'adresser) de 'not-installed' (id connu, mais l'extension ne repond pas :
// pas installee, ou installee mais desactivee). Les deux affichaient jusqu'ici
// le meme message "extension non detectee", trompeur dans le premier cas --
// bug reel diagnostique le 2026-07-13 (voir extensionBridge.ts).
type ExtensionState = 'checking' | 'not-configured' | 'not-installed' | 'ready';

export default function VintedAccountPage() {
  const { session, user } = useAuth();
  const { accounts, loading: accountsLoading, selectedAccountId, selectedAccount, selectAccount, refresh } = useVintedAccountFilter();
  const [extensionState, setExtensionState] = useState<ExtensionState>('checking');
  // 'paired' = l'extension a une session ResellOS locale valide (chrome.storage.local,
  // voir extensionBridge.ts::getExtensionStatus) -- DISTINCT de vinted_accounts.connected
  // (etat "vraie session Vinted detectee", propre a chaque compte).
  const [paired, setPaired] = useState(false);
  // P-04 (audit pre-beta 2026-08-03) : l'extension peut rester appairee a un
  // ResellOS user_id different de celui connecte dans cet onglet (poste
  // partage, changement de compte) -- si on affichait "Connecte" sans le
  // detecter, les prochaines synchros ecriraient silencieusement les
  // donnees Vinted de CET utilisateur sous le compte de l'AUTRE.
  const [pairedToOtherUser, setPairedToOtherUser] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Compte des annonces synchronisees pour le compte selectionne -- meme
  // requete simple (count exact, head) que SettingsPage.tsx::openDeleteConfirm,
  // uniquement pour affichage (aucune logique metier ajoutee).
  const [selectedAccountListingsCount, setSelectedAccountListingsCount] = useState<number | null>(null);

  // P1-2 (Freeze Audit correctif) : extrait en fonction reutilisable pour
  // pouvoir etre appelee aussi bien au montage qu'au retour de focus sur
  // l'onglet (useRefreshOnFocus ci-dessous) -- meme cause racine que
  // VintedAccountFilterContext.tsx (aucun rafraichissement apres le montage
  // initial), meme hook partage, applique ici a l'etat local de l'extension.
  const checkExtensionStatus = useCallback(async () => {
    if (!isExtensionConfigured()) {
      devWarn(
        '[ResellOS][pairing] VITE_RESELLOS_EXTENSION_ID absent de cette build -- ' +
          "l'app ne peut adresser aucun message a l'extension (voir extension/README.md §appairage)."
      );
      setExtensionState('not-configured');
      return;
    }
    const expectedId = getConfiguredExtensionId();
    devLog('[ResellOS][pairing] ID attendu :', expectedId);
    const status = await getExtensionStatus();
    devLog('[ResellOS][pairing] getExtensionStatus ->', status);
    if (!status) {
      setExtensionState('not-installed');
      return;
    }
    setPaired(status.paired);
    setPairedToOtherUser(!!status.paired && !!status.pairedUserId && status.pairedUserId !== user?.id);
    setExtensionState('ready');
  }, [user?.id]);

  useEffect(() => {
    void checkExtensionStatus();
  }, [checkExtensionStatus]);

  useRefreshOnFocus(() => void checkExtensionStatus());

  const handleConnect = async () => {
    if (!session) return;
    setWorking(true);
    setError(null);

    // Redemande une session fraiche a Supabase (rafraichit si besoin) plutot
    // que d'envoyer le `session` fige dans le contexte React : si le refresh
    // token qu'il contient a deja ete consomme une fois (ex. un premier
    // appairage), le renvoyer tel quel echoue cote extension.
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session) {
      setWorking(false);
      setError('Session ResellOS invalide, reconnecte-toi et réessaie.');
      return;
    }

    const result = await pairExtension(data.session.access_token, data.session.refresh_token);
    setWorking(false);

    if (!result.ok) {
      setError(result.error ?? "L'appairage a échoué.");
      return;
    }

    setPaired(true);
    setPairedToOtherUser(false);
    await refresh();
  };

  const handleDisconnect = async () => {
    setWorking(true);
    setError(null);

    const result = await unpairExtension();
    setWorking(false);

    if (!result.ok) {
      setError(result.error ?? 'La déconnexion a échoué.');
      return;
    }

    setPaired(false);
    setPairedToOtherUser(false);
  };

  const hasAnyAccount = accounts.length > 0;

  useEffect(() => {
    if (!selectedAccount) {
      setSelectedAccountListingsCount(null);
      return;
    }
    let ignore = false;
    (async () => {
      const { count } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('vinted_account_id', selectedAccount.id);
      if (!ignore) setSelectedAccountListingsCount(count ?? 0);
    })();
    return () => {
      ignore = true;
    };
  }, [selectedAccount]);

  // Etapes derivees de l'etat reel du composant (pas de donnee inventee) --
  // sert a rendre la page lisible meme avant toute connexion (demande
  // produit 2026-08-02 : "meme sans connexion, je veux une vraie page").
  const checklistSteps = [
    { label: 'Extension Chrome installée', done: extensionState === 'ready' },
    { label: 'Extension appairée à ResellOS', done: extensionState === 'ready' && paired },
    { label: 'Compte Vinted synchronisé', done: hasAnyAccount },
  ];

  // Synthese "en un coup d'oeil" (demande produit 2026-08-05, test live de
  // l'extension) : aucune donnee nouvelle, uniquement une lecture combinee
  // de signaux deja calcules ci-dessus (paired/pairedToOtherUser/accounts) --
  // objectif : comprendre en une seconde si tout fonctionne, sans avoir a
  // recouper la checklist + le toggle + la liste de comptes.
  const extensionConnected = extensionState === 'ready' && paired && !pairedToOtherUser;
  // Compte a afficher : celui selectionne dans le filtre, sinon le compte
  // par defaut (vinted_accounts.is_default, deja utilise pour trier
  // `accounts` dans VintedAccountFilterContext), sinon le premier disponible.
  const primaryAccount =
    selectedAccountId !== 'all' && selectedAccount
      ? selectedAccount
      : (accounts.find((a) => a.is_default) ?? accounts[0] ?? null);
  const otherAccountsCount = selectedAccountId === 'all' ? Math.max(accounts.length - 1, 0) : 0;
  // "Synchronisation automatique" = l'extension est appairee ET une vraie
  // session Vinted est detectee sur le(s) compte(s) concerne(s) -- c'est
  // exactement la condition qui declenche recordListings() cote extension
  // (voir EXTENSION.md §6.3), jamais un etat invente.
  const autoSyncActive =
    extensionConnected &&
    hasAnyAccount &&
    (selectedAccountId === 'all' ? accounts.some((a) => a.connected) : !!selectedAccount?.connected);
  const synthesisLastSyncedAt =
    selectedAccountId === 'all'
      ? accounts.reduce<string | null>(
          (latest, a) => (!latest || (a.last_synced_at && a.last_synced_at > latest) ? a.last_synced_at : latest),
          null
        )
      : (selectedAccount?.last_synced_at ?? null);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title="Compte Vinted" description="Connecte ou déconnecte l'extension ResellOS pour Vinted." />

      {/* Checklist de connexion -- toujours visible, meme sans aucune
          connexion : donne une vraie page a regarder plutot qu'un titre suivi
          d'un message d'erreur (demande produit 2026-08-02). */}
      <div className="bg-surface border border-white/5 rounded-2xl p-5 mb-6">
        <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-4">Étapes de connexion</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {checklistSteps.map(({ label, done }) => (
            <div key={label} className="flex items-center gap-2.5">
              {done ? (
                <CheckCircle2 className="w-4 h-4 text-neon-500 flex-shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-gray-700 flex-shrink-0" />
              )}
              <span className={`text-sm ${done ? 'text-gray-200' : 'text-gray-500'}`}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Synthese "en un coup d'oeil" -- uniquement une fois l'extension et
          les comptes resolus, et jamais en meme temps que l'alerte de
          mismatch ci-dessous (qui explique deja pourquoi "Extension" ne
          peut pas etre annoncee "connectee" sans etre trompeuse). */}
      {extensionState === 'ready' && !accountsLoading && !pairedToOtherUser && (
        <div className="bg-surface border border-white/5 rounded-2xl p-5 mb-6">
          <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-4">En un coup d'œil</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Extension</p>
              <p className="text-sm font-bold flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${extensionConnected ? 'bg-neon-500' : 'bg-gray-600'}`} />
                <span className={extensionConnected ? 'text-gray-200' : 'text-gray-500'}>
                  {extensionConnected ? 'Connectée' : 'Déconnectée'}
                </span>
              </p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Compte Vinted</p>
              <p className="text-sm font-bold text-gray-200 truncate">
                {primaryAccount ? primaryAccount.label : 'Aucun compte détecté'}
                {otherAccountsCount > 0 && ` (+${otherAccountsCount})`}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Synchronisation automatique</p>
              <p className={`text-sm font-bold ${autoSyncActive ? 'text-neon-500' : 'text-gray-500'}`}>
                {autoSyncActive ? 'Active' : 'Inactive'}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Dernière synchronisation</p>
              <p className="text-sm font-bold text-gray-200">{formatRelativeSync(synthesisLastSyncedAt)}</p>
            </div>
          </div>
        </div>
      )}

      {(extensionState === 'checking' || (extensionState === 'ready' && accountsLoading)) && (
        <div className="bg-surface border border-white/5 rounded-2xl p-6 text-center">
          <Loader2 className="w-4 h-4 text-gray-600 animate-spin mx-auto mb-3" />
          <p className="text-xs text-gray-500">Vérification de l'extension...</p>
        </div>
      )}

      {extensionState === 'not-configured' && (
        <div className="bg-surface border border-red-500/20 rounded-2xl p-6 text-center">
          <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Puzzle className="w-5 h-5 text-red-400" />
          </div>
          <h2 className="font-bold text-sm mb-1 text-red-400">Configuration manquante</h2>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Cette version de l'app ne connaît l'identifiant d'aucune extension
            (VITE_RESELLOS_EXTENSION_ID absent de la configuration de build).
            L'appairage est impossible tant que cette variable n'est pas définie
            — ce n'est pas un problème d'installation côté extension.
          </p>
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

          {/* P0-5 (2026-08-04) : l'ID etait auparavant pose en texte brut au
              milieu d'une phrase -- utile pour le diagnostic (voir
              EXTENSION.md) mais illisible et pas copiable, presentation type
              "message de debug" plutot qu'un vrai etat produit. Bloc dedie,
              jamais un changement de fonctionnement (P-04 non touche ici). */}
          <div className="max-w-sm mx-auto mt-4 bg-dark-400 border border-white/10 rounded-xl p-3 text-left">
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1.5">
              ID d'extension attendu
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 text-xs text-gray-300 font-mono break-all">
                {getConfiguredExtensionId() ?? '—'}
              </code>
              {getConfiguredExtensionId() && <CopyBtn text={getConfiguredExtensionId()!} small />}
            </div>
            <p className="text-[11px] text-gray-600 mt-2">
              Déjà installée ? Compare avec l'ID affiché sur <code className="text-gray-400">chrome://extensions</code>
              {' '}— un ID différent produit exactement le même message (Chrome ne fait pas la distinction).
            </p>
          </div>
        </div>
      )}

      {extensionState === 'ready' && !accountsLoading && pairedToOtherUser && (
        <div className="bg-surface border border-amber-500/20 rounded-2xl p-6 flex items-center gap-5">
          <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Puzzle className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-sm text-amber-400">Extension appairée à un autre compte</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              L'extension est actuellement liée à un autre compte ResellOS sur ce navigateur -- si tu la laisses ainsi, tes
              prochaines synchros Vinted seraient enregistrées sur ce mauvais compte. Ré-appaire-la pour la lier à ton compte actuel.
            </p>
            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          </div>
          <button
            onClick={handleConnect}
            disabled={working}
            className="flex-shrink-0 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-amber-500/15 transition-colors disabled:opacity-60"
          >
            {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Ré-appairer à ce compte'}
          </button>
        </div>
      )}

      {extensionState === 'ready' && !accountsLoading && !pairedToOtherUser && (
        <div className="bg-surface border border-white/5 rounded-2xl p-6 flex items-center gap-5">
          <button
            onClick={paired ? handleDisconnect : handleConnect}
            disabled={working}
            aria-pressed={paired}
            className={`relative w-14 h-8 rounded-full flex-shrink-0 transition-colors disabled:opacity-60 ${
              paired ? 'bg-green-500' : 'bg-red-500/80'
            }`}
          >
            <span
              className={`absolute top-1 w-6 h-6 rounded-full bg-black flex items-center justify-center transition-transform ${
                paired ? 'translate-x-7' : 'translate-x-1'
              }`}
            >
              {working ? <Loader2 className="w-3 h-3 text-white animate-spin" /> : <Power className={`w-3 h-3 ${paired ? 'text-green-400' : 'text-red-400'}`} />}
            </span>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-sm">{paired ? 'Extension connectée' : 'Extension déconnectée'}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {paired
                ? "L'extension synchronise automatiquement tes annonces Vinted vers ResellOS."
                : "Connecte l'extension pour démarrer la synchronisation de ton compte Vinted."}
            </p>
            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          </div>
        </div>
      )}

      {extensionState === 'ready' && !accountsLoading && paired && !pairedToOtherUser && !hasAnyAccount && (
        <div className="mt-6 bg-surface border border-white/5 border-dashed rounded-2xl p-8 text-center">
          <p className="text-sm text-gray-500">
            Aucun compte Vinted détecté pour l'instant. Ouvre ton profil Vinted dans un onglet pour lancer la synchronisation.
          </p>
        </div>
      )}

      {extensionState === 'ready' && !accountsLoading && paired && hasAnyAccount && selectedAccountId === 'all' && (
        <div className="mt-6 space-y-2">
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

      {extensionState === 'ready' && !accountsLoading && paired && hasAnyAccount && selectedAccountId !== 'all' && selectedAccount && (
        <div className="mt-6">
          <div className="flex items-center gap-3 mb-4">
            <AccountAvatar label={selectedAccount.label} size="md" />
            <div>
              <h2 className="font-bold text-sm">{selectedAccount.label}</h2>
              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selectedAccount.connected ? 'bg-neon-500' : 'bg-gray-600'}`} />
                {selectedAccount.connected ? 'Connecté' : 'Déconnecté'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard icon={User} label="Pseudo Vinted" value={selectedAccount.label} />
            <StatCard
              icon={Clock}
              label="Dernière synchro"
              value={selectedAccount.last_synced_at ? new Date(selectedAccount.last_synced_at).toLocaleString('fr-FR') : 'En cours...'}
            />
            <StatCard
              icon={Package}
              label="Annonces synchronisées"
              value={selectedAccountListingsCount === null ? '—' : selectedAccountListingsCount}
              highlight
            />
          </div>
        </div>
      )}

      {extensionState === 'ready' && !accountsLoading && paired && hasAnyAccount && (
        <div className="mt-6 bg-surface/50 border border-white/5 border-dashed rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center flex-shrink-0">
            <UserPlus className="w-5 h-5 text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-gray-200">Ajouter un compte Vinted</p>
            <p className="text-sm text-gray-500 mt-1">
              Connecte-toi à un autre compte Vinted dans ce navigateur, puis ouvre ta page de profil Vinted. Le nouveau compte est détecté et ajouté automatiquement ici et dans le sélecteur — aucune action supplémentaire n'est nécessaire côté ResellOS.
            </p>
          </div>
          <a
            href="https://www.vinted.fr"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-neon-600 text-white font-bold px-6 py-3.5 rounded-xl hover:bg-neon-700 hover:shadow-[0_0_20px_rgba(124,92,255,0.3)] transition-all flex-shrink-0"
          >
            + Ajouter un compte <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      )}
    </div>
  );
}
