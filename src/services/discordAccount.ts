import { supabase } from '../lib/supabase';
import type { Plan, Profile } from '../lib/types';

// Service de liaison du compte Discord (onglet Communaute > Discord).
//
// Principe directeur, identique au reste du produit : ce module ne SIMULE
// jamais un etat qui n'existe pas. Quand une brique n'est pas configuree
// (variable d'env absente, provider OAuth non active cote Supabase, worker de
// roles pas encore branche), il retourne un resultat type qui le DIT, et l'UI
// l'affiche honnetement -- jamais un faux compteur ni un faux "synchronise".

const DISCORD_INVITE_URL = import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined;
const DISCORD_GUILD_ID = import.meta.env.VITE_DISCORD_GUILD_ID as string | undefined;

export const discordInviteUrl = DISCORD_INVITE_URL ?? null;

// ---------------------------------------------------------------------------
// Activite du serveur
// ---------------------------------------------------------------------------
// Source REELLE : l'endpoint public widget.json de Discord. Il ne demande
// aucune authentification, mais n'existe que si l'administrateur a active le
// widget sur le serveur -- d'ou les trois issues distinctes ci-dessous.
//
// Aucun nombre n'est invente : sans widget accessible, on n'affiche pas de
// compteur du tout. Un faux "1 247 membres" serait de la preuve sociale
// fabriquee (interdit par le playbook design, section Anti-patterns #6).
export type GuildActivity =
  | { status: 'ok'; name: string; presenceCount: number; inviteUrl: string | null }
  | { status: 'not_configured' }
  | { status: 'widget_disabled' }
  | { status: 'error'; message: string };

interface WidgetPayload {
  name?: unknown;
  presence_count?: unknown;
  instant_invite?: unknown;
}

export async function fetchGuildActivity(signal?: AbortSignal): Promise<GuildActivity> {
  if (!DISCORD_GUILD_ID) return { status: 'not_configured' };
  try {
    const res = await fetch(`https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`, { signal });
    // 403 = widget desactive cote serveur. C'est un cas de CONFIGURATION, pas
    // une panne : le distinguer evite d'afficher "erreur" a l'utilisateur pour
    // quelque chose qu'un administrateur doit simplement activer.
    if (res.status === 403) return { status: 'widget_disabled' };
    if (!res.ok) return { status: 'error', message: `Discord a repondu ${res.status}` };
    const data = (await res.json()) as WidgetPayload;
    const presence = typeof data.presence_count === 'number' ? data.presence_count : null;
    if (presence === null) return { status: 'error', message: 'Reponse Discord inattendue' };
    return {
      status: 'ok',
      name: typeof data.name === 'string' ? data.name : 'Discord ResellOS',
      presenceCount: presence,
      inviteUrl: typeof data.instant_invite === 'string' ? data.instant_invite : DISCORD_INVITE_URL ?? null,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    return { status: 'error', message: err instanceof Error ? err.message : 'Erreur reseau' };
  }
}

// ---------------------------------------------------------------------------
// Liaison OAuth2
// ---------------------------------------------------------------------------
// `linkIdentity` rattache une identite Discord a la session EXISTANTE, sans
// creer ni remplacer le compte -- c'est bien une liaison, pas une connexion.
// Le navigateur part ensuite sur Discord : cette fonction ne "reussit" donc
// jamais de facon observable ici, elle declenche une redirection.
export type LinkStartResult = { ok: true } | { ok: false; message: string };

export async function startDiscordLink(redirectTo: string): Promise<LinkStartResult> {
  const { error } = await supabase.auth.linkIdentity({
    provider: 'discord',
    options: { redirectTo },
  });
  if (error) {
    // Cas le plus probable en l'etat : le provider Discord n'est pas active
    // dans le projet Supabase. On remonte le message tel quel plutot que de
    // le traduire en un "reessayez" qui masquerait la vraie cause.
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

// Appelee au RETOUR du flux OAuth : recopie l'identite verifiee vers le
// profil. Le client ne transmet aucun identifiant -- voir la migration.
export async function syncDiscordIdentity(): Promise<{ ok: true; profile: Profile } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('sync_discord_identity');
  if (error) return { ok: false, message: error.message };
  return { ok: true, profile: data as Profile };
}

export async function unlinkDiscordAccount(): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc('unlink_discord_account');
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Synchronisation des roles Discord selon le plan
// ---------------------------------------------------------------------------
// ETAT REEL : NON BRANCHEE. Attribuer un role sur un serveur Discord exige un
// bot avec sa propre autorisation et son token -- impossible depuis le
// navigateur, et aucune Edge Function ne le fait aujourd'hui dans ce projet.
//
// Ce module prepare le point d'appel (signature, contrat de retour, endroit
// d'ou il est declenche) pour que le branchement se resume a implementer la
// fonction serveur. Il retourne explicitement `not_configured` tant que ce
// n'est pas le cas, plutot que de laisser croire qu'un role a ete accorde.
export type RoleSyncOutcome =
  | { status: 'synced'; plan: Plan }
  | { status: 'not_linked' }
  | { status: 'not_configured' }
  | { status: 'error'; message: string };

const ROLE_SYNC_FUNCTION = import.meta.env.VITE_DISCORD_ROLE_SYNC_FUNCTION as string | undefined;

export async function requestDiscordRoleSync(profile: Profile | null): Promise<RoleSyncOutcome> {
  if (!profile?.discord_user_id) return { status: 'not_linked' };
  if (!ROLE_SYNC_FUNCTION) return { status: 'not_configured' };
  try {
    const { error } = await supabase.functions.invoke(ROLE_SYNC_FUNCTION, {
      // Aucun discord_user_id transmis : la fonction serveur le relit
      // elle-meme depuis le profil, a partir du JWT. Le client ne doit jamais
      // pouvoir designer le compte Discord a mettre a jour.
      body: { plan: profile.plan },
    });
    if (error) return { status: 'error', message: error.message };
    return { status: 'synced', plan: profile.plan };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Erreur inconnue' };
  }
}
