import { useCallback, useEffect, useState } from 'react';
import {
  Puzzle,
  UserPlus,
  ExternalLink,
  Loader2,
  RefreshCw,
  Check,
  Trash2,
  ArrowRightLeft,
  Package,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useVintedAccountFilter } from '../../contexts/VintedAccountFilterContext';
import { supabase } from '../../lib/supabase';
import {
  getConfiguredExtensionId,
  isExtensionConfigured,
  getExtensionStatus,
  pairExtension,
  unpairExtension,
  syncVintedAccount,
  type SyncStep,
} from '../../lib/extensionBridge';
import { describeSyncResult } from '../../lib/syncResultMessage';
import { VINTED_INK, VINTED_TEAL } from '../../lib/brandColors';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import AccountAvatar from '../../components/ui/AccountAvatar';
import { PageHeader } from '../../components/ui/PageHeader';
import { CopyBtn } from '../../components/ui/CopyBtn';
import { Modal } from '../../components/ui/Modal';
import { formatRelativeSync } from '../../lib/formatRelativeTime';
import { devLog, devWarn } from '../../lib/devLog';
import type { VintedAccount } from '../../lib/types';

// Page dediee exclusivement a la connexion de l'extension -- jamais un second
// endroit pour consulter les annonces (deja dans "Mes annonces"). L'etat de
// l'extension (installee/appairee) est independant du compte Vinted
// selectionne : l'appairage n'est pas specifique a un compte, seule la
// detection ulterieure sur vinted.fr cree/relie un compte (EXTENSION.md §5).
//
// Refonte 2026-08-26 : trois blocs empiles ("Etapes de connexion", "En un coup
// d'oeil", puis le bandeau interrupteur) disaient la MEME chose sous trois
// formes -- une checklist, une grille de 4 stats, un toggle. Fusionnes en un
// seul en-tete portant l'etat ET les deux actions reelles. Les comptes passent
// d'une liste en lignes a une grille de cartes portant leurs vraies donnees.
//
// 'not-configured' distingue un vrai probleme de deploiement
// (VITE_RESELLOS_EXTENSION_ID absent de cette build) de 'not-installed' (id
// connu, mais l'extension ne repond pas) -- bug reel diagnostique le
// 2026-07-13, les deux affichaient le meme message trompeur.
type ExtensionState = 'checking' | 'not-configured' | 'not-installed' | 'ready';

export default function VintedAccountPage() {
  const { session, user } = useAuth();
  const { accounts, loading: accountsLoading, selectedAccountId, selectedAccount, selectAccount, refresh } =
    useVintedAccountFilter();
  const [extensionState, setExtensionState] = useState<ExtensionState>('checking');
  // 'paired' = l'extension a une session ResellOS locale valide -- DISTINCT de
  // vinted_accounts.connected (vraie session Vinted detectee, par compte).
  const [paired, setPaired] = useState(false);
  // P-04 : l'extension peut rester appairee a un autre user_id ResellOS (poste
  // partage) -- sans le detecter, les prochaines synchros ecriraient les
  // donnees Vinted de CET utilisateur sous le compte de l'AUTRE.
  const [pairedToOtherUser, setPairedToOtherUser] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkExtensionStatus = useCallback(async () => {
    if (!isExtensionConfigured()) {
      devWarn(
        '[ResellOS][pairing] VITE_RESELLOS_EXTENSION_ID absent de cette build -- ' +
          "l'app ne peut adresser aucun message a l'extension (voir extension/README.md §appairage)."
      );
      setExtensionState('not-configured');
      return;
    }
    devLog('[ResellOS][pairing] ID attendu :', getConfiguredExtensionId());
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
    // Redemande une session fraiche : si le refresh token fige dans le
    // contexte React a deja ete consomme une fois, le renvoyer tel quel
    // echoue cote extension.
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
  const extensionConnected = extensionState === 'ready' && paired && !pairedToOtherUser;
  const primaryAccount =
    selectedAccountId !== 'all' && selectedAccount
      ? selectedAccount
      : (accounts.find((a) => a.is_default) ?? accounts[0] ?? null);
  // "Synchronisation automatique" = extension appairee ET vraie session Vinted
  // detectee -- exactement la condition qui declenche recordListings() cote
  // extension (EXTENSION.md §6.3), jamais un etat invente.
  const autoSyncActive = extensionConnected && accounts.some((a) => a.connected);
  const lastSyncedAt = accounts.reduce<string | null>(
    (latest, a) => (!latest || (a.last_synced_at && a.last_synced_at > latest) ? a.last_synced_at : latest),
    null
  );

  // Compteur d'annonces PAR COMPTE : chaque carte affiche le sien. Une requete
  // par compte plutot qu'un agregat groupe -- PostgREST n'en fait pas sans vue
  // dediee, et un utilisateur a une poignee de comptes Vinted au plus.
  const [listingCounts, setListingCounts] = useState<Record<string, number>>({});
  const loadListingCounts = useCallback(async () => {
    if (accounts.length === 0) {
      setListingCounts({});
      return;
    }
    const entries = await Promise.all(
      accounts.map(async (a) => {
        const { count } = await supabase
          .from('listings')
          .select('*', { count: 'exact', head: true })
          .eq('vinted_account_id', a.id);
        return [a.id, count ?? 0] as const;
      })
    );
    setListingCounts(Object.fromEntries(entries));
  }, [accounts]);

  useEffect(() => {
    void loadListingCounts();
  }, [loadListingCounts]);

  // Synchronisation manuelle -- MEME canal que "Mes annonces"
  // (syncVintedAccount + describeSyncResult partage) : deux boutons
  // "Synchroniser" qui n'annonceraient pas la meme chose pour un meme
  // resultat seraient pires que pas de bouton du tout.
  const [syncing, setSyncing] = useState(false);
  const [syncPhase, setSyncPhase] = useState<SyncStep | null>(null);
  const [syncHint, setSyncHint] = useState<string | null>(null);
  const [syncTone, setSyncTone] = useState<'success' | 'warning' | 'error' | null>(null);

  const handleSyncNow = () => {
    if (syncing || !primaryAccount) return; // protection anti double-clic
    setSyncing(true);
    setSyncPhase('connecting');
    setSyncHint(null);
    setSyncTone(null);
    void syncVintedAccount(primaryAccount.vinted_user_id, primaryAccount.vinted_username, {
      onProgress: (step) => setSyncPhase(step),
    }).then(async (result) => {
      setSyncing(false);
      setSyncPhase(null);
      const { tone, message } = describeSyncResult(result);
      setSyncTone(tone);
      setSyncHint(message);
      // Une synchro partielle a quand meme pu ecrire des annonces sures --
      // rafraichir des que ok:true, jamais sur un echec pur.
      if (result.ok) {
        await refresh();
        await loadListingCounts();
      }
    });
  };

  // Retrait d'un compte : DESTRUCTIF -- la ligne vinted_accounts part, et les
  // annonces rattachees avec elle. Jamais en un clic : meme garde-fou que
  // SettingsPage.tsx, qui annonce le nombre d'annonces concernees avant de
  // demander confirmation.
  const [removeTarget, setRemoveTarget] = useState<VintedAccount | null>(null);
  const [removing, setRemoving] = useState(false);

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    const { error: removeError } = await supabase.from('vinted_accounts').delete().eq('id', removeTarget.id);
    setRemoving(false);
    setRemoveTarget(null);
    if (removeError) setError('Le retrait du compte a échoué.');
    else {
      await refresh();
      await loadListingCounts();
    }
  };

  const syncToneClass =
    syncTone === 'success' ? 'text-green-600' : syncTone === 'warning' ? 'text-amber-600' : 'text-red-600';

  const syncPhaseLabel =
    syncPhase === 'connecting' ? 'Connexion à Vinted…' : syncPhase === 'fetching' ? 'Lecture des annonces…' : 'Enregistrement…';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title="Compte Vinted" description="Connecte ou déconnecte l'extension ResellOS pour Vinted." />

      {(extensionState === 'checking' || (extensionState === 'ready' && accountsLoading)) && (
        <div className="bg-surface border border-gray-200 rounded-2xl p-6 text-center">
          <Loader2 className="w-4 h-4 text-gray-500 animate-spin mx-auto mb-3" />
          <p className="text-xs text-gray-500">Vérification de l'extension...</p>
        </div>
      )}

      {extensionState === 'not-configured' && (
        <div className="bg-surface border border-red-500/20 rounded-2xl p-6 text-center">
          <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Puzzle className="w-5 h-5 text-red-500" />
          </div>
          <h2 className="font-bold text-sm mb-1 text-red-600">Configuration manquante</h2>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Cette version de l'app ne connaît l'identifiant d'aucune extension (VITE_RESELLOS_EXTENSION_ID absent de la
            configuration de build). L'appairage est impossible tant que cette variable n'est pas définie — ce n'est pas
            un problème d'installation côté extension.
          </p>
        </div>
      )}

      {extensionState === 'not-installed' && (
        <div className="bg-surface border border-gray-200 rounded-2xl p-6 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Puzzle className="w-5 h-5 text-gray-500" />
          </div>
          <h2 className="font-bold text-sm mb-1">Extension Chrome non détectée</h2>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Installe l'extension ResellOS pour Vinted, puis reviens sur cette page.
          </p>
          <div className="max-w-sm mx-auto mt-4 bg-surface-alt border border-gray-200 rounded-xl p-3 text-left">
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1.5">ID d'extension attendu</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 text-xs text-gray-700 font-mono break-all">
                {getConfiguredExtensionId() ?? '—'}
              </code>
              {getConfiguredExtensionId() && <CopyBtn text={getConfiguredExtensionId()!} small />}
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              Déjà installée ? Compare avec l'ID affiché sur <code className="text-gray-500">chrome://extensions</code> —
              un ID différent produit exactement le même message (Chrome ne fait pas la distinction).
            </p>
          </div>
        </div>
      )}

      {extensionState === 'ready' && !accountsLoading && pairedToOtherUser && (
        <div className="bg-surface border border-amber-500/30 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Puzzle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-sm text-amber-700">Extension appairée à un autre compte</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              L'extension est actuellement liée à un autre compte ResellOS sur ce navigateur — si tu la laisses ainsi,
              tes prochaines synchros Vinted seraient enregistrées sur ce mauvais compte.
            </p>
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          </div>
          <button
            onClick={handleConnect}
            disabled={working}
            className="flex-shrink-0 bg-amber-500/10 border border-amber-500/30 text-amber-700 text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-amber-500/15 transition-colors disabled:opacity-60"
          >
            {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Ré-appairer à ce compte'}
          </button>
        </div>
      )}

      {/* ===================== EN-TETE UNIFIE =====================
          Remplace la checklist + la grille "en un coup d'oeil" + le bandeau
          interrupteur. Un seul endroit dit l'etat, et porte les deux actions
          reelles : synchroniser, (de)connecter. */}
      {extensionState === 'ready' && !accountsLoading && !pairedToOtherUser && (
        <div className="bg-surface border border-gray-200 rounded-2xl p-5 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
                    extensionConnected ? 'bg-green-500/10 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${extensionConnected ? 'bg-green-500' : 'bg-gray-400'}`}
                    aria-hidden="true"
                  />
                  {extensionConnected ? 'Extension opérationnelle' : 'Extension déconnectée'}
                </span>

                {extensionConnected && (
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                      autoSyncActive ? 'text-gray-700' : 'text-gray-500'
                    }`}
                  >
                    {autoSyncActive && <Check className="w-3.5 h-3.5 text-green-600" />}
                    {autoSyncActive ? 'Synchronisation automatique active' : 'Synchronisation automatique en attente'}
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-500 mt-2">
                {!extensionConnected
                  ? "Connecte l'extension pour démarrer la synchronisation de ton compte Vinted."
                  : hasAnyAccount
                    ? `Dernière synchronisation : ${formatRelativeSync(lastSyncedAt)}`
                    : "Aucun compte Vinted détecté pour l'instant — ouvre ton profil Vinted dans un onglet."}
              </p>

              {syncPhase && <p className="text-xs text-gray-500 mt-1.5">{syncPhaseLabel}</p>}
              {syncHint && !syncPhase && <p className={`text-xs mt-1.5 ${syncToneClass}`}>{syncHint}</p>}
              {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {extensionConnected && (
                <button
                  onClick={handleSyncNow}
                  disabled={syncing || !primaryAccount}
                  title={!primaryAccount ? 'Aucun compte Vinted à synchroniser' : undefined}
                  className="inline-flex items-center justify-center gap-2 bg-neon-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-neon-700 transition-colors disabled:opacity-50"
                >
                  {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Synchroniser maintenant
                </button>
              )}
              <button
                onClick={extensionConnected ? handleDisconnect : handleConnect}
                disabled={working}
                className="inline-flex items-center justify-center gap-2 border border-gray-200 text-gray-600 text-sm font-semibold px-4 py-2.5 rounded-xl hover:border-gray-300 hover:text-gray-900 transition-colors disabled:opacity-60"
              >
                {working && <Loader2 className="w-4 h-4 animate-spin" />}
                {extensionConnected ? 'Déconnecter' : 'Connecter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== GRILLE DES COMPTES ===================== */}
      {extensionState === 'ready' && !accountsLoading && paired && !pairedToOtherUser && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => {
            const isSelected = selectedAccountId === account.id;
            const count = listingCounts[account.id];
            return (
              <div
                key={account.id}
                className={`bg-surface border rounded-2xl p-5 transition-colors ${
                  isSelected ? 'border-neon-500 ring-2 ring-neon-500/20' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <AccountAvatar label={account.label} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-900 truncate">{account.label}</p>
                    {/* Pastille en teal Vinted : c'est un compte VINTED qu'elle
                        qualifie, pas un etat ResellOS. Le teal reste un APLAT
                        de fond -- le libelle est en gris fonce, car #09B1BA
                        sur blanc n'atteint que 2.62:1 et echouerait le
                        contraste (voir lib/brandColors.ts). */}
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full mt-1.5 text-gray-700"
                      style={{ backgroundColor: `${VINTED_TEAL}1F` }}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${account.connected ? '' : 'bg-gray-400'}`}
                        style={account.connected ? { backgroundColor: VINTED_TEAL } : undefined}
                        aria-hidden="true"
                      />
                      {account.connected ? 'Actif' : 'Session expirée'}
                    </span>
                  </div>
                </div>

                <dl className="mt-4 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-gray-500 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5" /> Annonces importées
                    </dt>
                    {/* '—' tant que le compteur n'est pas revenu : jamais 0 par
                        defaut, qui se lirait comme "ce compte n'a rien". */}
                    <dd className="font-bold text-gray-900 tabular-nums">{count === undefined ? '—' : count}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-gray-500">Dernière synchro</dt>
                    <dd className="font-semibold text-gray-700">{formatRelativeSync(account.last_synced_at)}</dd>
                  </div>
                </dl>

                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={() => selectAccount(account.id)}
                    disabled={isSelected}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 border border-gray-200 text-gray-700 text-xs font-semibold px-3 py-2 rounded-lg hover:border-gray-300 hover:text-gray-900 transition-colors disabled:opacity-50"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    {isSelected ? 'Compte actif' : 'Basculer'}
                  </button>
                  <button
                    onClick={() => setRemoveTarget(account)}
                    aria-label={`Retirer le compte ${account.label}`}
                    className="inline-flex items-center justify-center border border-gray-200 text-gray-500 px-3 py-2 rounded-lg hover:border-red-300 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Carte dediee a l'ajout -- meme gabarit que les autres pour que la
              grille reste reguliere, en pointilles pour rester secondaire. */}
          <div className="bg-surface border border-gray-200 border-dashed rounded-2xl p-5 flex flex-col">
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-gray-500" />
            </div>
            <p className="text-sm font-bold text-gray-900 mt-3">Ajouter un compte Vinted</p>
            <p className="text-xs text-gray-500 mt-1 flex-1">
              Connecte-toi à un autre compte dans ce navigateur, puis ouvre ta page de profil Vinted. Le compte est
              détecté et ajouté ici automatiquement.
            </p>
            {/* Fond VINTED_INK et non VINTED_TEAL : du blanc sur #09B1BA ne
                mesure que 2.62:1 (echec AA), sur #007782 il mesure 5.30:1. */}
            <a
              href="https://www.vinted.fr"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center justify-center gap-2 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-opacity hover:opacity-90"
              style={{ backgroundColor: VINTED_INK }}
            >
              Ouvrir Vinted <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      {removeTarget && (
        <Modal onClose={() => setRemoveTarget(null)} size="sm">
          <h2 className="font-bold text-gray-900">Retirer ce compte Vinted ?</h2>
          <p className="text-sm text-gray-600 mt-3">
            <span className="font-bold text-gray-900">{removeTarget.label}</span> sera retiré de ResellOS.
          </p>
          {/* Le nombre REEL d'annonces perdues est annonce AVANT confirmation :
              sans lui, l'utilisateur ne peut pas mesurer ce qu'il declenche. */}
          <p className="text-sm text-gray-600 mt-2">
            {listingCounts[removeTarget.id] === undefined
              ? 'Les annonces importées pour ce compte seront supprimées de ResellOS.'
              : `${listingCounts[removeTarget.id]} annonce(s) importée(s) seront supprimées de ResellOS.`}{' '}
            Tes annonces sur Vinted ne sont pas touchées.
          </p>
          <div className="flex gap-2 mt-6">
            <button
              onClick={() => setRemoveTarget(null)}
              className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:border-gray-300 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={confirmRemove}
              disabled={removing}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-red-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-60"
            >
              {removing && <Loader2 className="w-4 h-4 animate-spin" />}
              Retirer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
