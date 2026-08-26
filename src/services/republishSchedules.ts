// Mission "ROUND 2 -- PERSISTANCE APP DE republish_schedules" (2026-08-20) :
// seule couche qui parle a la table `republish_schedules` (voir la migration
// `20260820100000_add_republish_schedules.sql`, deja appliquee et validee en
// prod). Isole ici plutot que directement dans ListingsManagementSection.tsx
// -- meme discipline que src/lib/extensionBridge.ts pour l'extension : un
// point unique qui connait la forme exacte des requetes Supabase, jamais
// duplique cote UI.
//
// Hors perimetre du round 2 : aucun `chrome.alarms`, aucun scheduler reel,
// aucun claim scheduled->running, aucun retry, aucune Edge Function, aucun
// Realtime -- uniquement CRUD sur les lignes ACTIVES (scheduled/running).
//
// Mission "ROUND 5 -- RESULTAT D'UNE REPUBLICATION PROGRAMMEE" (2026-08-23) :
// l'extension ecrit desormais de vrais statuts terminaux (succeeded/failed +
// result_vinted_url/error_message, voir scheduledRepublishExecutor.ts), mais
// l'app ne lisait QUE scheduled/running -- une republication executee la nuit
// disparaissait donc de l'UI sans laisser la moindre trace, succes comme
// ECHEC SILENCIEUX. Ce round ajoute la lecture des resultats recents
// (listRecentRepublishOutcomes) et les colonnes correspondantes. Toujours
// aucune Edge Function, aucun Realtime, aucune migration : les colonnes
// existent deja dans la migration d'origine.

import { supabase } from '../lib/supabase';
import { localDateTimeToISO } from '../lib/republishSchedule';

export type RepublishScheduleStatus = 'scheduled' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface RepublishScheduleRow {
  id: string;
  listing_id: string;
  vinted_account_id: string;
  scheduled_for: string; // ISO (timestamptz), tel que renvoye par Postgres
  package_size: string;
  status: RepublishScheduleStatus;
}

// Une ligne TERMINEE (succeeded/failed) avec de quoi expliquer ce qui s'est
// passe. Type distinct de RepublishScheduleRow : les champs de resultat ne
// sont jamais renseignes sur une ligne active, les melanger inviterait a
// afficher un resultat qui n'existe pas encore.
export interface RepublishOutcomeRow extends RepublishScheduleRow {
  status: 'succeeded' | 'failed';
  result_vinted_url: string | null;
  error_message: string | null;
  completed_at: string | null; // ISO
}

const REPUBLISH_SCHEDULES_TABLE = 'republish_schedules';
// Colonnes necessaires a l'affichage d'une programmation ACTIVE -- jamais
// `select('*')`.
const SCHEDULE_COLUMNS = 'id, listing_id, vinted_account_id, scheduled_for, package_size, status';
// Colonnes supplementaires necessaires pour EXPLIQUER un resultat terminal.
// locked_at/locked_by/attempt_count/started_at restent hors UI (diagnostic
// interne uniquement, aucun consommateur ici).
const OUTCOME_COLUMNS = `${SCHEDULE_COLUMNS}, result_vinted_url, error_message, completed_at`;

const TERMINAL_STATUSES: RepublishScheduleStatus[] = ['succeeded', 'failed'];
// Fenetre de recence : un resultat plus vieux que ca n'a plus d'interet a
// etre pousse sur la carte (l'utilisateur a forcement revu son annonce
// depuis). Volontairement genereuse -- une programmation du vendredi soir
// doit rester visible si l'utilisateur ne rouvre ResellOS que le lundi.
const OUTCOME_LOOKBACK_DAYS = 7;

// 'scheduled' ET 'running' : meme perimetre que l'index unique partiel
// `republish_schedules_one_active_per_listing` -- une annonce dont le job
// est deja en cours d'execution doit continuer a bloquer une seconde
// programmation, meme si aucun executeur ne peut encore faire passer une
// ligne a 'running' ce round (le statut existe deja en base, verifie tel
// quel des maintenant).
const ACTIVE_STATUSES: RepublishScheduleStatus[] = ['scheduled', 'running'];

export type ScheduleActionErrorCode = 'conflict' | 'error';

export interface ScheduleActionError {
  ok: false;
  code: ScheduleActionErrorCode;
  message: string;
}

export interface ScheduleActionSuccess<T> {
  ok: true;
  data: T;
}

export type ScheduleActionResult<T> = ScheduleActionSuccess<T> | ScheduleActionError;

// Code d'erreur Postgres reel pour une violation de contrainte unique (voir
// la migration -- republish_schedules_one_active_per_listing) : jamais
// laisser fuiter le message SQL brut a l'utilisateur, toujours traduit ici,
// une seule fois, jamais reimplemente cote UI.
const UNIQUE_VIOLATION_CODE = '23505';
const CONFLICT_MESSAGE =
  "Cette annonce a déjà une programmation active. Annule-la avant d'en créer une nouvelle, ou modifie-la directement.";

function toActionError(error: { code?: string; message: string }): ScheduleActionError {
  if (error.code === UNIQUE_VIOLATION_CODE) {
    return { ok: false, code: 'conflict', message: CONFLICT_MESSAGE };
  }
  return { ok: false, code: 'error', message: error.message };
}

// Charge les programmations ACTIVES de l'utilisateur courant (RLS scope deja
// a auth.uid() = user_id -- jamais besoin de filtrer par userId ici) --
// l'appelant les indexe par listing_id pour l'affichage carte par carte.
export async function listActiveRepublishSchedules(): Promise<ScheduleActionResult<RepublishScheduleRow[]>> {
  const { data, error } = await supabase.from(REPUBLISH_SCHEDULES_TABLE).select(SCHEDULE_COLUMNS).in('status', ACTIVE_STATUSES);
  if (error) return toActionError(error);
  return { ok: true, data: (data ?? []) as RepublishScheduleRow[] };
}

// Charge les programmations TERMINEES recentes (succeeded/failed) de
// l'utilisateur courant -- RLS deja scope a auth.uid() = user_id, jamais de
// filtre userId ici (meme convention que listActiveRepublishSchedules).
//
// `cancelled` est volontairement EXCLU : une annulation est une action
// deliberee de l'utilisateur, il n'a pas besoin qu'on la lui rappelle.
//
// Trie du plus recent au plus ancien : l'appelant n'indexe qu'un resultat
// par annonce (le dernier), une annonce republiee plusieurs fois ne doit pas
// afficher un vieux resultat par-dessus le nouveau.
export async function listRecentRepublishOutcomes(
  now: Date = new Date()
): Promise<ScheduleActionResult<RepublishOutcomeRow[]>> {
  const since = new Date(now.getTime() - OUTCOME_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from(REPUBLISH_SCHEDULES_TABLE)
    .select(OUTCOME_COLUMNS)
    .in('status', TERMINAL_STATUSES)
    .gte('completed_at', since)
    .order('completed_at', { ascending: false });
  if (error) return toActionError(error);
  return { ok: true, data: (data ?? []) as RepublishOutcomeRow[] };
}

export interface CreateRepublishScheduleInput {
  // Mission "ROUND 2 -- BUG RLS user_id manquant" (2026-08-20) : CAUSE
  // CONFIRMEE en direct ET reproduite sur la base reelle (npx supabase db
  // query --linked, session simulee role authenticated + auth.uid() reel) :
  // "new row violates row-level security policy" venait de ce champ absent
  // du payload d'insert -- user_id restait donc NULL (aucun `default
  // auth.uid()` sur cette colonne, contrairement a d'autres tables du
  // schema), et `auth.uid() = NULL` n'est jamais vrai dans
  // insert_own_republish_schedules.with_check. listing_id/vinted_account_id
  // etaient corrects et appartenaient bien au meme auth.uid() (verifie
  // separement) -- jamais le probleme. Reproduit ET corrige avec le MEME
  // triplet reel (insert sans user_id -> 42501 ; meme insert avec user_id ->
  // succes), rollback dans les deux cas, aucune donnee modifiee. Fourni
  // explicitement par l'appelant (jamais re-derive via supabase.auth.getUser()
  // ici) -- meme convention que useActionEngine.ts::insertHistoryRow, qui
  // recoit deja row.userId resolu par l'appelant plutot que de le
  // re-interroger lui-meme.
  userId: string;
  listingId: string;
  vintedAccountId: string;
  date: string; // YYYY-MM-DD, heure locale utilisateur
  time: string; // HH:mm, heure locale utilisateur
  packageSize: string;
}

// Ne verifie jamais elle-meme la validite date/heure (deja fait cote UI,
// isScheduleValid) -- se contente de convertir en timestamptz reel
// (localDateTimeToISO, voir son en-tete pour la garantie fuseau horaire) et
// d'inserer. Le conflit (deuxieme programmation active sur la meme annonce)
// est detecte par Postgres lui-meme (23505), jamais reverifie cote client
// avant coup (une verification client serait de toute facon sujette a une
// course avec un autre onglet -- l'index unique reste la seule source de
// verite fiable).
export async function createRepublishSchedule(input: CreateRepublishScheduleInput): Promise<ScheduleActionResult<RepublishScheduleRow>> {
  const scheduled_for = localDateTimeToISO(input.date, input.time);
  const { data, error } = await supabase
    .from(REPUBLISH_SCHEDULES_TABLE)
    .insert({
      user_id: input.userId,
      listing_id: input.listingId,
      vinted_account_id: input.vintedAccountId,
      scheduled_for,
      package_size: input.packageSize,
      status: 'scheduled',
    })
    .select(SCHEDULE_COLUMNS)
    .single();
  if (error) return toActionError(error);
  return { ok: true, data: data as RepublishScheduleRow };
}

export interface UpdateRepublishScheduleInput {
  date: string;
  time: string;
  packageSize: string;
}

// Met a jour la MEME ligne (id fourni par l'appelant -- celui de la ligne
// active deja chargee pour cette annonce) -- ne cree jamais une seconde
// ligne, "Modifier" n'appelle jamais createRepublishSchedule.
export async function updateRepublishSchedule(
  id: string,
  input: UpdateRepublishScheduleInput
): Promise<ScheduleActionResult<RepublishScheduleRow>> {
  const scheduled_for = localDateTimeToISO(input.date, input.time);
  const { data, error } = await supabase
    .from(REPUBLISH_SCHEDULES_TABLE)
    .update({ scheduled_for, package_size: input.packageSize })
    .eq('id', id)
    .select(SCHEDULE_COLUMNS)
    .single();
  if (error) return toActionError(error);
  return { ok: true, data: data as RepublishScheduleRow };
}

// UPDATE status='cancelled', jamais un DELETE -- meme convention que
// action_log/listing_recommendation_log (aucune policy delete cote base,
// voir la migration), garde une trace de ce qui a ete annule.
export async function cancelRepublishSchedule(id: string): Promise<ScheduleActionResult<void>> {
  const { error } = await supabase.from(REPUBLISH_SCHEDULES_TABLE).update({ status: 'cancelled' }).eq('id', id);
  if (error) return toActionError(error);
  return { ok: true, data: undefined };
}
