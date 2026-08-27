import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  clearDiscordOAuthParamsFromLocation,
  fetchGuildActivity,
  readDiscordOAuthErrorFromLocation,
  requestDiscordRoleSync,
  startDiscordLink,
  syncDiscordIdentity,
  translateDiscordOAuthError,
  unlinkDiscordAccount,
  type GuildActivity,
  type RoleSyncOutcome,
} from '../services/discordAccount';

// Etat de la liaison Discord + declenchement de la synchro de role.
//
// Deux responsabilites volontairement reunies ici : elles partagent le meme
// profil et la meme notion de "compte relie", et les separer aurait impose de
// dupliquer la lecture du profil dans deux hooks.

export type DiscordLinkState = 'idle' | 'linking' | 'syncing' | 'unlinking';

export function useDiscordAccount() {
  const { profile, refreshProfile } = useAuth();
  const [activity, setActivity] = useState<GuildActivity | null>(null);
  const [state, setState] = useState<DiscordLinkState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [roleSync, setRoleSync] = useState<RoleSyncOutcome | null>(null);

  const isLinked = Boolean(profile?.discord_user_id);

  // Activite du serveur -- une seule fois au montage. AbortController pour ne
  // pas ecrire dans un composant demonte si l'utilisateur change d'onglet
  // pendant la requete.
  useEffect(() => {
    const controller = new AbortController();
    fetchGuildActivity(controller.signal)
      .then(setActivity)
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setActivity({ status: 'error', message: err instanceof Error ? err.message : 'Erreur' });
      });
    return () => controller.abort();
  }, []);

  // Retour du flux OAuth : Supabase a rattache l'identite Discord a la
  // session, mais le PROFIL ne la connait pas encore -- c'est cette recopie
  // qui la rend exploitable (roles, affichage).
  //
  // ECHEC LIVE 2026-08-27 : le retour de linkIdentity() laissait la page sur
  // "Lier mon compte Discord", sans la moindre erreur visible. Deux causes
  // distinctes, corrigees ensemble :
  //
  //   1. `user.identities` (objet React ci-dessous) vient de la session mise
  //      en cache par getSession() au demarrage de AuthContext -- PAS d'un
  //      appel reseau. Rien ne garantit qu'elle reflete une identite qui
  //      vient d'etre liee cote serveur a l'instant. On ne se fie donc plus a
  //      ce cache seul pour decider qu'il n'y a rien a faire : un appel
  //      reseau reel (supabase.auth.getUser()) tranche en dernier recours.
  //   2. Quand GoTrue echoue a lier avec l'un de ces 3 codes precis --
  //      "identity_already_exists" au premier chef -- le SDK cote client
  //      (auth-js, _initialize()) AVALE l'erreur en interne : elle n'atteint
  //      JAMAIS onAuthStateChange ni aucun evenement observable. Seule une
  //      lecture manuelle de l'URL de retour la revele (voir
  //      readDiscordOAuthErrorFromLocation, services/discordAccount.ts).
  //      "identity_already_exists" signifie ici, le plus souvent, que
  //      Discord n'a pas redemande d'autorisation (deja accordee) : l'identite
  //      existe deja cote Supabase, seule la synchro vers `profiles` manque --
  //      on retente donc sync_discord_identity() plutot que d'abandonner.
  //      Sans risque d'attribution croisee : cette RPC ne lit jamais que
  //      auth.identities filtre sur auth.uid().
  const { user } = useAuth();
  const syncAttempted = useRef(false);
  useEffect(() => {
    if (!user || !profile || isLinked || syncAttempted.current) return;
    let cancelled = false;

    async function attemptSync(): Promise<void> {
      const urlError = readDiscordOAuthErrorFromLocation();
      const cachedIdentities = (user!.identities ?? []).map((i) => i.provider);
      console.info('[DISCORD_AUTH] verification', {
        userId: user!.id,
        cachedIdentities,
        urlError,
      });

      let hasDiscordIdentity = cachedIdentities.includes('discord');

      // Le cache dit "non" : avant de conclure, un appel reseau REEL (pas
      // getSession(), qui ne fait que relire le stockage local) tranche.
      if (!hasDiscordIdentity) {
        const { data, error: getUserError } = await supabase.auth.getUser();
        const liveIdentities = (data.user?.identities ?? []).map((i) => i.provider);
        console.info('[DISCORD_AUTH] getUser (verification reseau)', {
          error: getUserError?.message ?? null,
          liveIdentities,
        });
        hasDiscordIdentity = liveIdentities.includes('discord');
      }

      if (urlError) clearDiscordOAuthParamsFromLocation();

      const shouldAttempt = hasDiscordIdentity || urlError?.errorCode === 'identity_already_exists';
      if (!shouldAttempt) {
        if (urlError) {
          console.warn('[DISCORD_AUTH] erreur OAuth non recuperable', urlError);
          setError(translateDiscordOAuthError(urlError));
        }
        return;
      }

      if (cancelled) return;
      syncAttempted.current = true;
      setState('syncing');
      console.info('[DISCORD_AUTH] sync_discord_identity: appel', {
        raison: hasDiscordIdentity ? 'identite_detectee' : 'identity_already_exists_dans_url',
      });
      const res = await syncDiscordIdentity();
      console.info('[DISCORD_AUTH] sync_discord_identity: resultat', res.ok ? { ok: true } : { ok: false, message: res.message });
      if (cancelled) return;
      if (!res.ok) setError(res.message);
      else await refreshProfile();
      setState('idle');
    }

    void attemptSync();
    return () => {
      cancelled = true;
    };
  }, [user, profile, isLinked, refreshProfile]);

  // Declenchement de la synchro de role a CHAQUE changement de plan -- c'est
  // le point d'ecoute demande. `lastSyncedPlan` evite de renvoyer la demande a
  // chaque rendu : seule une VRAIE transition de plan la declenche.
  const lastSyncedPlan = useRef<string | null>(null);
  useEffect(() => {
    if (!profile || !isLinked) return;
    if (lastSyncedPlan.current === profile.plan) return;
    lastSyncedPlan.current = profile.plan;
    requestDiscordRoleSync(profile).then(setRoleSync);
  }, [profile, isLinked]);

  const link = useCallback(async () => {
    setError(null);
    setState('linking');
    // Retour sur la page courante : l'utilisateur revient exactement la ou il
    // a clique, pas sur un dashboard generique.
    const res = await startDiscordLink(window.location.href);
    if (!res.ok) {
      setError(res.message);
      setState('idle');
    }
    // Si ok, le navigateur part sur Discord -- on reste en 'linking'.
  }, []);

  const unlink = useCallback(async () => {
    setError(null);
    setState('unlinking');
    const res = await unlinkDiscordAccount();
    if (!res.ok) setError(res.message);
    else {
      lastSyncedPlan.current = null;
      syncAttempted.current = false;
      setRoleSync(null);
      await refreshProfile();
    }
    setState('idle');
  }, [refreshProfile]);

  return { profile, isLinked, activity, state, error, roleSync, link, unlink };
}
