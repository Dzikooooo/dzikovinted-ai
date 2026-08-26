import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchGuildActivity,
  requestDiscordRoleSync,
  startDiscordLink,
  syncDiscordIdentity,
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
  // qui la rend exploitable (roles, affichage). On ne la declenche que si une
  // identite Discord existe reellement dans la session ET que le profil ne la
  // porte pas encore : sans cette double condition, la RPC serait appelee a
  // chaque montage et leverait une erreur inutile.
  const { user } = useAuth();
  const syncAttempted = useRef(false);
  useEffect(() => {
    if (!user || !profile || isLinked || syncAttempted.current) return;
    const hasDiscordIdentity = (user.identities ?? []).some((i) => i.provider === 'discord');
    if (!hasDiscordIdentity) return;
    syncAttempted.current = true;
    setState('syncing');
    syncDiscordIdentity()
      .then(async (res) => {
        if (!res.ok) setError(res.message);
        else await refreshProfile();
      })
      .finally(() => setState('idle'));
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
