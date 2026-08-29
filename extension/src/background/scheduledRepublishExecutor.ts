// Mission "ROUND 4 -- EXECUTION REELLE D'UNE REPUBLICATION PROGRAMMEE"
// (2026-08-20) : transforme un job republish_schedules DU (detecte par
// republishScheduler.ts) en une VRAIE republication Vinted, en reutilisant
// integralement le moteur deja valide en live -- runAction.ts/
// handlePublishListing.ts/republishTransaction.ts restent ICI STRICTEMENT
// INCHANGES (voir l'audit prealable, valide explicitement) : ce fichier est
// un NOUVEL APPELANT de runAction(), jamais un second moteur.
//
// Chaine : executeClaimedSchedule(scheduleId)
//   -> claimSchedule() [RPC atomique claim_republish_schedule -- voir
//      supabase/migrations/20260820110000_add_claim_republish_schedule_rpc.sql]
//   -> buildScheduledRepublishPayload() [relit listings + vinted_accounts,
//      reconstruit EXACTEMENT ce que buildRepublishPayload() (app,
//      ListingsManagementSection.tsx) construit pour une republication
//      manuelle]
//   -> runAction(request, ...) [INCHANGE, reutilise tel quel]
//   -> finalizeScheduleOutcome() [mappe RunActionOutcome -> statut terminal
//      republish_schedules]

import { getValidAccessToken } from "./session";
import { supabaseWithToken } from "./supabaseClient";
import { logger } from "./logger";
import { errorMessage } from "../lib/errorMessage";
import { runAction } from "./runAction";
import { formatTitleWithSku } from "../lib/sku";
import { parseMaterials } from "../content/materials";
import type { PublishListingPayload, PublishStep, RunActionOutcome, RunActionRequest } from "../lib/messages";

const PACKAGE_SIZES = ["small", "medium", "large"] as const;
type PackageSize = (typeof PACKAGE_SIZES)[number];

function isPackageSize(value: string): value is PackageSize {
  return (PACKAGE_SIZES as readonly string[]).includes(value);
}

// Defense supplementaire UNIQUEMENT (voir l'audit, §3) -- ne remplace jamais
// le claim atomique cote base (seule autorite reelle, survit a un
// redemarrage du service worker, ce qu'un Set en memoire ne fait jamais).
// Evite seulement un aller-retour Supabase inutile si l'alarme precise et le
// sweep se chevauchent dans le MEME reveil du service worker, avant que le
// premier claim n'ait eu le temps de committer.
const scheduleIdsInFlight = new Set<string>();

export async function executeClaimedSchedule(scheduleId: string): Promise<void> {
  if (scheduleIdsInFlight.has(scheduleId)) {
    logger.debug("REPUBLISH_SCHEDULER_EXECUTION_SKIPPED_IN_FLIGHT", { scheduleId });
    return;
  }
  scheduleIdsInFlight.add(scheduleId);
  try {
    await runScheduledExecution(scheduleId);
  } finally {
    scheduleIdsInFlight.delete(scheduleId);
  }
}

interface ClaimResult {
  claimed: boolean;
  listingId: string | null;
  vintedAccountId: string | null;
  packageSize: string | null;
}

interface ClaimRpcRow {
  claimed: boolean;
  listing_id: string | null;
  vinted_account_id: string | null;
  package_size: string | null;
}

// RPC atomique (voir la migration) : WHERE id=$1 AND status='scheduled' AND
// user_id=auth.uid() -- Postgres verrouille la ligne pendant l'evaluation de
// cette clause, garantissant qu'au plus UN appelant concurrent (alarme
// precise, sweep, ou les deux dans des reveils differents du service worker)
// peut reussir a faire passer ce job a 'running'. C'est cette contrainte,
// jamais le Set en memoire ci-dessus, qui garantit "une seule execution".
async function claimSchedule(client: ReturnType<typeof supabaseWithToken>, scheduleId: string, lockedBy: string): Promise<ClaimResult> {
  const { data, error } = await client.rpc("claim_republish_schedule", { p_schedule_id: scheduleId, p_locked_by: lockedBy });
  if (error) {
    logger.warn("REPUBLISH_SCHEDULER_CLAIM_RPC_FAILED", { scheduleId, error: errorMessage(error) });
    return { claimed: false, listingId: null, vintedAccountId: null, packageSize: null };
  }
  const rows = (data ?? []) as ClaimRpcRow[];
  const row = rows[0];
  if (!row || !row.claimed) {
    return { claimed: false, listingId: null, vintedAccountId: null, packageSize: null };
  }
  return { claimed: true, listingId: row.listing_id, vintedAccountId: row.vinted_account_id, packageSize: row.package_size };
}

interface ListingRow {
  title: string;
  sku: number | null;
  description: string | null;
  price: number;
  category: string | null;
  brand: string | null;
  size: string | null;
  condition: string | null;
  color: string | null;
  material: string | null;
  image_urls: string[];
  vinted_item_id: string | null;
}

interface VintedAccountRow {
  vinted_username: string;
}

type PayloadBuildResult =
  | { ok: true; payload: PublishListingPayload & { previousVintedItemId: string } }
  | { ok: false; error: string };

// Reconstruit EXACTEMENT le meme payload que buildPublishPayload()/
// buildRepublishPayload() (src/pages/dashboard/watchlist/ListingsManagementSection.tsx,
// app) construisent aujourd'hui pour une republication manuelle -- seule
// difference : lu directement depuis Supabase (RLS utilisateur, meme client
// que sync.ts) plutot que depuis le state React de l'app, qui n'existe pas
// en execution planifiee. `packageSize` vient du schedule (choix humain
// fige a la programmation, voir round 1) ; tout le reste est relu FRAIS
// depuis `listings`/`vinted_accounts` au moment de l'execution (jamais fige
// a la programmation) -- une annonce peut legitimement avoir change entre
// la programmation et l'heure prevue.
async function buildScheduledRepublishPayload(
  client: ReturnType<typeof supabaseWithToken>,
  listingId: string,
  vintedAccountId: string,
  packageSize: string
): Promise<PayloadBuildResult> {
  const { data: listing, error: listingError } = await client
    .from("listings")
    .select("title, sku, description, price, category, brand, size, condition, color, material, image_urls, vinted_item_id")
    .eq("id", listingId)
    .maybeSingle();
  if (listingError) return { ok: false, error: `Lecture de l'annonce échouée : ${errorMessage(listingError)}` };
  if (!listing) return { ok: false, error: "Annonce introuvable (supprimée depuis la programmation ?)" };
  const row = listing as ListingRow;
  if (!row.vinted_item_id) {
    return { ok: false, error: "Annonce sans identifiant Vinted -- republication impossible" };
  }

  const { data: account, error: accountError } = await client
    .from("vinted_accounts")
    .select("vinted_username")
    .eq("id", vintedAccountId)
    .maybeSingle();
  if (accountError) return { ok: false, error: `Lecture du compte Vinted échouée : ${errorMessage(accountError)}` };
  if (!account) return { ok: false, error: "Compte Vinted introuvable (retiré depuis la programmation ?)" };
  const accountRow = account as VintedAccountRow;

  if (!isPackageSize(packageSize)) {
    return { ok: false, error: `Taille de colis invalide en base : "${packageSize}"` };
  }

  return {
    ok: true,
    payload: {
      title: formatTitleWithSku(row.title, row.sku),
      description: row.description ?? "",
      price: row.price,
      category: row.category ?? "",
      brand: row.brand || null,
      size: row.size || null,
      condition: row.condition ?? "",
      color: row.color || null,
      material: row.material || null,
      materials: parseMaterials(row.material),
      imageUrls: row.image_urls,
      packageSize,
      expectedVintedUsername: accountRow.vinted_username,
      previousVintedItemId: row.vinted_item_id,
    },
  };
}

const SCHEDULER_KEEPALIVE_PROBE_KEY = "resellos_scheduler_keepalive_probe";

// Mission "ROUND 4 -- KEEPALIVE AUTONOME" (2026-08-20) : l'execution
// programmee doit fonctionner avec l'app ResellOS entierement fermee.
// sendKeepaliveHeartbeat (runAction.ts) poste sur activeProgressPort, qui
// n'existe que si l'app a connecte le port de progression (voir
// background/index.ts::ACTION_PROGRESS_PORT_NAME) -- toujours null en
// execution planifiee, donc un no-op silencieux qui ne protege rien contre
// la suspension du service worker MV3 (~30s d'inactivite). runAction() lui
// -meme (INCHANGE) appelle deja onKeepalive() toutes les 20s PENDANT
// l'execution du handler et coupe deja ce minuteur inconditionnellement en
// finally -- ce round fournit uniquement un onKeepalive DIFFERENT, base sur
// un vrai appel chrome.* (chrome.storage.local.get), qui reinitialise
// reellement le minuteur d'inactivite sans dependre d'aucun port. Aucun
// nouveau setInterval introduit ici : le scheduling periodique reste
// entierement celui, deja existant et deja teste, de runAction.ts -- "aucun
// setInterval permanent global, uniquement pendant un job reellement
// running" est donc garanti par du code INCHANGE, pas reimplemente.
function tickScheduledKeepalive(scheduleId: string): void {
  chrome.storage.local
    .get(SCHEDULER_KEEPALIVE_PROBE_KEY)
    .then(() => {
      logger.debug("REPUBLISH_SCHEDULER_KEEPALIVE_TICK", { scheduleId });
    })
    .catch((err) => {
      logger.debug("REPUBLISH_SCHEDULER_KEEPALIVE_TICK_FAILED", { scheduleId, error: errorMessage(err) });
    });
}

interface TerminalFields {
  resultVintedItemId?: string | null;
  resultVintedUrl?: string | null;
  errorMessage?: string | null;
}

async function writeTerminalStatus(
  client: ReturnType<typeof supabaseWithToken>,
  scheduleId: string,
  status: "succeeded" | "failed",
  fields: TerminalFields
): Promise<void> {
  const { error } = await client
    .from("republish_schedules")
    .update({
      status,
      completed_at: new Date().toISOString(),
      result_vinted_item_id: fields.resultVintedItemId ?? null,
      result_vinted_url: fields.resultVintedUrl ?? null,
      error_message: fields.errorMessage ?? null,
    })
    .eq("id", scheduleId);
  if (error) {
    logger.error("REPUBLISH_SCHEDULER_FINALIZE_WRITE_FAILED", { scheduleId, status, error: errorMessage(error) });
    return;
  }
  logger.info(status === "succeeded" ? "REPUBLISH_SCHEDULER_JOB_SUCCEEDED" : "REPUBLISH_SCHEDULER_JOB_FAILED", { scheduleId, status, ...fields });
}

// Mission "ROUND 4" (correction explicite demandee avant implementation) :
// cleanupRequired n'est JAMAIS un succes complet. Definition d'une
// republication reussie : nouvelle annonce creee ET ancienne annonce
// supprimee, suppression VERIFIEE (voir republishTransaction.ts). Un
// outcome.status:"success" avec resultPayload.cleanupRequired:true garde
// donc les identifiants de la nouvelle annonce (elle existe reellement sur
// Vinted -- jamais perdus) mais passe le schedule en 'failed', avec
// error_message documentant le residu (cleanupError si disponible, message
// explicite sinon). Le CHECK SQL n'est PAS etendu avec un statut
// 'cleanup_required' distinct (demande explicite de ne pas y toucher
// maintenant).
async function finalizeScheduleOutcome(client: ReturnType<typeof supabaseWithToken>, scheduleId: string, outcome: RunActionOutcome): Promise<void> {
  if (outcome.status === "success") {
    const resultPayload = (outcome.resultPayload ?? {}) as Record<string, unknown>;
    const vintedItemId = typeof resultPayload.vintedItemId === "string" ? resultPayload.vintedItemId : null;
    const vintedUrl = typeof resultPayload.vintedUrl === "string" ? resultPayload.vintedUrl : null;
    const cleanupRequired = resultPayload.cleanupRequired === true;

    if (!cleanupRequired) {
      await writeTerminalStatus(client, scheduleId, "succeeded", { resultVintedItemId: vintedItemId, resultVintedUrl: vintedUrl });
      return;
    }

    const cleanupError = typeof resultPayload.cleanupError === "string" ? resultPayload.cleanupError : null;
    await writeTerminalStatus(client, scheduleId, "failed", {
      resultVintedItemId: vintedItemId,
      resultVintedUrl: vintedUrl,
      errorMessage: cleanupError ?? "Nouvelle annonce créée mais suppression de l'ancienne non confirmée.",
    });
    return;
  }

  const errorMessageText = outcome.status === "error" ? outcome.errorMessage : "Action non implémentée côté extension";
  await writeTerminalStatus(client, scheduleId, "failed", { errorMessage: errorMessageText });
}

async function runScheduledExecution(scheduleId: string): Promise<void> {
  // Point de cycle de vie demande explicitement (2026-08-27), INCONDITIONNEL
  // -- avant meme la verification de session. Complete SCHEDULE_ALARM_FIRED
  // (republishScheduler.ts) : ce log prouve que l'alarme a bien mene jusqu'a
  // une TENTATIVE d'execution reelle, distincte d'un simple constat "job du"
  // qui n'aurait jamais declenche executeClaimedSchedule() (ex. filtre
  // scheduleIdsInFlight, job deja plus 'scheduled' entre-temps).
  logger.info("SCHEDULE_EXECUTION_START", { scheduleId, startedAt: new Date().toISOString() });

  const valid = await getValidAccessToken();
  if (!valid) {
    logger.debug("REPUBLISH_SCHEDULER_EXECUTE_NO_SESSION", { scheduleId });
    return;
  }
  const client = supabaseWithToken(valid.accessToken);
  const lockedBy = crypto.randomUUID();

  const claim = await claimSchedule(client, scheduleId, lockedBy);
  if (!claim.claimed) {
    // Perdu au profit d'un autre declencheur (alarme/sweep) deja passe,
    // ou le job n'etait deja plus 'scheduled' (annule/modifie/deja
    // termine) -- jamais une erreur, juste "rien a faire ici".
    logger.info("REPUBLISH_SCHEDULER_CLAIM_LOST", { scheduleId, lockedBy });
    return;
  }
  logger.info("REPUBLISH_SCHEDULER_CLAIM_WON", {
    scheduleId,
    lockedBy,
    listingId: claim.listingId,
    vintedAccountId: claim.vintedAccountId,
  });

  // Phase 2 "Automatisations infaillibles" (2026-08-28) : a partir d'ICI, le
  // claim RPC a deja fait passer la ligne a 'running' en base (verrou
  // atomique, voir claimSchedule() ci-dessus) -- toute exception NON
  // rattrapee a partir de ce point laisserait la ligne bloquee a 'running'.
  //
  // Nuance honnete apres audit complet : ce n'est PAS un blocage permanent --
  // runSweep() (republishScheduler.ts::recoverOrphanedRunningJobs) recupere
  // deja toute ligne 'running' depassant ORPHAN_RUNNING_THRESHOLD_MS (20 min)
  // et la marque 'failed' avec UNKNOWN_OUTCOME_MESSAGE. Le vrai gain de ce
  // try/catch n'est donc pas "empecher un blocage infini" (deja couvert) mais
  // (1) faire apparaitre l'echec en quelques secondes au lieu de jusqu'a 20
  // minutes, et (2) conserver le VRAI message d'erreur plutot que le message
  // generique "resultat inconnu" -- qui, cote UI (republishOutcome.ts),
  // desactive volontairement le bouton "Reprogrammer" (canReschedule:false)
  // faute de savoir si Vinted a reellement ete touche. Une exception
  // attrapee ICI, elle, correspond a un echec survenu identifiablement AVANT
  // toute ecriture Vinted reussie (execute()/runAction n'a jamais retourne),
  // donc structurellement reprogrammable en toute securite -- exactement ce
  // que le message generique de la recuperation orpheline ne peut jamais
  // garantir.
  try {
    if (!claim.listingId || !claim.vintedAccountId || !claim.packageSize) {
      // Defense en profondeur -- ces 3 colonnes sont NOT NULL en base et la
      // RPC les relit directement depuis la ligne qu'elle vient de reclamer ;
      // ne devrait structurellement jamais arriver, mais un job claim sans ces
      // valeurs ne peut pas etre execute -- echoue honnetement plutot que de
      // planter plus loin dans la construction du payload.
      await writeTerminalStatus(client, scheduleId, "failed", { errorMessage: "Données du job incomplètes après claim" });
      return;
    }

    const payloadResult = await buildScheduledRepublishPayload(client, claim.listingId, claim.vintedAccountId, claim.packageSize);
    if (!payloadResult.ok) {
      logger.error("REPUBLISH_SCHEDULER_PAYLOAD_BUILD_FAILED", { scheduleId, error: payloadResult.error });
      await writeTerminalStatus(client, scheduleId, "failed", { errorMessage: payloadResult.error });
      return;
    }

    const request: RunActionRequest = {
      historyId: `schedule:${scheduleId}`,
      kind: "republish_listing",
      vintedAccountId: claim.vintedAccountId,
      listingId: claim.listingId,
      payload: payloadResult.payload as unknown as Record<string, unknown>,
    };

    logger.info("REPUBLISH_SCHEDULER_EXECUTION_STARTED", { scheduleId, listingId: claim.listingId, vintedAccountId: claim.vintedAccountId });

    // runAction() -- INCHANGE, voir son en-tete : dispatch par kind vers
    // handlePublishListing (republish_listing reutilise ce meme handler, voir
    // runAction.ts::HANDLERS), gere lui-meme son propre minuteur de keepalive
    // (demarre/coupe en finally) -- seul le CONTENU de onKeepalive change ici.
    const outcome: RunActionOutcome = await runAction(
      request,
      (step: PublishStep) => logger.debug("REPUBLISH_SCHEDULER_PROGRESS", { scheduleId, step }),
      () => tickScheduledKeepalive(scheduleId),
      // Mission "DIAGNOSTIC CAPTURE_MISSING" (2026-08-24) : `pending` etait deja
      // un string[], mais la console Chrome le replie en "Array(7)" -- il fallait
      // deplier chaque entree pour savoir QUELS champs bloquaient. Les versions
      // jointes (pendingNames/confirmedNames) sont lisibles directement dans le
      // flux de logs, sans remplacer les tableaux d'origine.
      (confirmed: string[], pending: string[]) =>
        logger.debug("REPUBLISH_SCHEDULER_PREFILL_SUMMARY", {
          scheduleId,
          pendingCount: pending.length,
          pendingNames: pending.join(' | ') || '(aucun)',
          confirmedCount: confirmed.length,
          confirmedNames: confirmed.join(' | ') || '(aucun)',
          confirmed,
          pending,
        }),
      () => logger.debug("REPUBLISH_SCHEDULER_READY_TO_SUBMIT", { scheduleId }),
      () => logger.debug("REPUBLISH_SCHEDULER_AWAITING_OLD_DELETION", { scheduleId })
    );

    // Nom historique conserve pour ne pas casser les filtres de log existants,
    // mais il signifie EXACTEMENT "runAction a retourne" -- jamais "le job a
    // reussi". La finalisation, juste en dessous, peut encore echouer.
    logger.info("REPUBLISH_SCHEDULER_EXECUTION_FINISHED", { scheduleId, status: outcome.status });

    // Mission "CORRECTIF JWT EXPIRE A LA FINALISATION" (2026-08-25), cause
    // confirmee par le test reel du 25/08 a 00:25 : PGRST303 "JWT expired" sur
    // l'ecriture terminale, alors que le job avait pu claim ET construire son
    // payload sans probleme.
    //
    // Mecanisme : `client` (ligne ~276) est construit UNE SEULE FOIS, a partir
    // d'un token obtenu avant le claim. getValidAccessToken() accepte un token
    // a qui il reste plus de 30 s (session.ts) -- puis runAction() peut durer
    // jusqu'a GLOBAL_TIMEOUT_MS (600 s, handlers/publishListing.ts). Un token
    // encore valide au depart est donc structurellement expirable a l'arrivee.
    //
    // C'est la SEULE frontiere du fichier traversee par une operation longue :
    // claim et construction du payload s'executent a quelques centaines de ms
    // du controle de token. On revalide donc ICI, et nulle part ailleurs --
    // aucun rafraichissement periodique, aucun refresh "au cas ou", et la
    // marge globale de 30 s reste inchangee (elle est correcte pour tous les
    // autres appelants, qui n'ont pas d'operation longue entre les deux).
    const freshToken = await getValidAccessToken();
    if (!freshToken) {
      // Rafraichissement impossible (extension depairee/session revoquee
      // pendant l'execution) : on ne peut plus rien ecrire avec un token
      // frais. Le job restera 'running' jusqu'a recuperation orpheline (20
      // min, voir l'en-tete de ce try) -- trace ici explicitement pour que ce
      // cas ne soit jamais confondu avec un simple probleme reseau.
      logger.error("REPUBLISH_SCHEDULER_FINALIZE_NO_SESSION", { scheduleId, status: outcome.status });
      return;
    }
    await finalizeScheduleOutcome(supabaseWithToken(freshToken.accessToken), scheduleId, outcome);
  } catch (err) {
    // Filet de securite FINAL -- attrape uniquement l'IMPREVU (rejet reseau
    // Supabase, exception dans runAction elle-meme...), jamais les echecs
    // "normaux" deja traites explicitement ci-dessus. Ecrit avec le client
    // ORIGINAL (obtenu avant le claim) : s'il a lui-meme expire entre-temps,
    // cette derniere ecriture echouera proprement (writeTerminalStatus est
    // deja best-effort, ne relance jamais) plutot que de faire remonter une
    // deuxieme exception -- le job resterait alors 'running' jusqu'a la
    // recuperation orpheline, jamais pire que le comportement documente
    // ci-dessus pour REPUBLISH_SCHEDULER_FINALIZE_NO_SESSION.
    logger.error("REPUBLISH_SCHEDULER_UNEXPECTED_EXCEPTION", { scheduleId, error: errorMessage(err) });
    await writeTerminalStatus(client, scheduleId, "failed", { errorMessage: `Erreur inattendue : ${errorMessage(err)}` });
  }
}
