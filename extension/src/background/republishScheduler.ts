// Mission "ROUND 3 -- CHROME.ALARMS UNIQUEMENT, REVEIL/LOG SANS EXECUTION
// VINTED" (2026-08-20) : prouve que le service worker MV3 peut etre reveille
// automatiquement a l'heure programmee (republish_schedules, persistee cote
// app depuis le round 2) et DETECTER un job du. Round 3 : strictement lecture
// + log, aucune execution.
//
// Mission "ROUND 4 -- EXECUTION REELLE D'UNE REPUBLICATION PROGRAMMEE"
// (2026-08-20) : ce module reste UNIQUEMENT responsable de la detection
// (alarmes/sweep/startup) -- la logique de claim/execution/finalisation vit
// entierement dans scheduledRepublishExecutor.ts (executeClaimedSchedule()),
// appelee ici apres chaque detection JOB_DUE/SWEEP_DUE_JOB. onStartup reste
// detection + resynchronisation UNIQUEMENT (jamais un troisieme executeur --
// voir handleExtensionStartup ci-dessous, inchange depuis le round 3) :
// un job deja en retard au demarrage recoit une alarme via resyncAlarms(),
// qui se declenche quasi immediatement et passe par le meme chemin
// handleJobAlarmFired que n'importe quelle alarme normale.
//
// Reutilise la session Supabase DEJA geree par ce paquet (getValidAccessToken/
// supabaseWithToken, voir session.ts/supabaseClient.ts, deja utilisees par
// sync.ts) -- RLS utilisateur standard (anon key + JWT), jamais de
// service_role, jamais d'Edge Function, jamais de RPC. Si l'extension n'est
// pas appairee (aucune session valide), ce module reste silencieux
// (best-effort, meme discipline que sync.ts) -- jamais une erreur bruyante.
//
// chrome.alarms plutot que setInterval (interdit explicitement) : un
// setInterval ne survit ni a la suspension du service worker (~30s
// d'inactivite, MV3) ni a un redemarrage de Chrome -- chrome.alarms est le
// SEUL mecanisme qui persiste des deux cotes (alarmes stockees par Chrome
// lui-meme, reveillent le service worker au besoin, et les alarmes en retard
// au demarrage du navigateur se declenchent des que possible plutot que
// d'etre perdues).
//
// Nommage des alarmes : un prefixe stable (REPUBLISH_ALARM_PREFIX) suivi de
// l'id de la ligne republish_schedules -- permet de retrouver le job
// correspondant a une alarme reçue (scheduleIdFromAlarmName) et de ne JAMAIS
// confondre une alarme de ce planificateur avec une alarme d'une autre
// feature future. L'alarme de sweep periodique porte un nom fixe distinct,
// jamais confondue avec une alarme de job (un id de job ne peut jamais
// collisionner avec elle, un uuid ne contient jamais ce nom exact).

import { getValidAccessToken } from "./session";
import { supabaseWithToken } from "./supabaseClient";
import { logger } from "./logger";
import { errorMessage } from "../lib/errorMessage";
import { executeClaimedSchedule } from "./scheduledRepublishExecutor";

export const REPUBLISH_ALARM_PREFIX = "resellos:republish:";
export const REPUBLISH_SWEEP_ALARM_NAME = "resellos:republish-sweep";
// Frequence "raisonnable" demandee explicitement -- filet de secours en cas
// d'alarme de job individuelle perdue (desinstallation/reinstallation,
// anomalie Chrome...), jamais le mecanisme primaire de declenchement.
const SWEEP_INTERVAL_MINUTES = 5;

export function alarmNameForSchedule(scheduleId: string): string {
  return `${REPUBLISH_ALARM_PREFIX}${scheduleId}`;
}

// null si le nom ne porte pas notre prefixe -- utilise pour distinguer une
// alarme de job d'une alarme totalement inconnue (ignoree silencieusement,
// jamais une erreur -- pourrait appartenir a une autre feature future).
export function scheduleIdFromAlarmName(alarmName: string): string | null {
  return alarmName.startsWith(REPUBLISH_ALARM_PREFIX) ? alarmName.slice(REPUBLISH_ALARM_PREFIX.length) : null;
}

// Duplique volontairement (jamais importe depuis src/services/republishSchedules.ts,
// paquet applicatif distinct) -- meme convention de duplication assumee que
// le reste de l'extension (voir extensionBridge.ts/SyncVintedAccountResult) :
// seuls les champs reellement lus ici, jamais select('*').
interface RepublishScheduleJob {
  id: string;
  listing_id: string;
  vinted_account_id: string;
  scheduled_for: string; // ISO (timestamptz)
  status: string;
}

const SCHEDULE_COLUMNS = "id, listing_id, vinted_account_id, scheduled_for, status";

// Lecture best-effort : aucune session valide (extension non appairee) ->
// tableau vide, jamais une exception -- meme discipline que
// sync.ts::recordAccountDetected pour le cas "not_paired".
async function fetchScheduledJobs(): Promise<RepublishScheduleJob[]> {
  const valid = await getValidAccessToken();
  if (!valid) {
    logger.debug("REPUBLISH_SCHEDULER: pas de session valide, resync ignoree (extension non appairee)");
    return [];
  }
  const client = supabaseWithToken(valid.accessToken);
  const { data, error } = await client.from("republish_schedules").select(SCHEDULE_COLUMNS).eq("status", "scheduled");
  if (error) {
    logger.warn("REPUBLISH_SCHEDULER: lecture de republish_schedules echouee", { error: errorMessage(error) });
    return [];
  }
  return (data ?? []) as RepublishScheduleJob[];
}

// Mission "RECUPERATION DES JOBS RUNNING ORPHELINS" (2026-08-25).
//
// Probleme reel constate le 25/08 : quand l'ecriture terminale echoue (JWT
// expire, service worker tue, reseau coupe), la ligne reste bloquee en
// 'running' DEFINITIVEMENT -- le RPC de claim ne reclame que les lignes
// 'scheduled', donc ni l'alarme ni le sweep ne peuvent la reprendre. Pire :
// l'index unique partiel couvre scheduled+running, donc l'annonce ne peut
// plus recevoir AUCUNE nouvelle programmation. Un echec d'ecriture de 200 ms
// verrouillait ainsi une annonce pour toujours.
//
// Seuil : runAction plafonne a GLOBAL_TIMEOUT_MS (600 s, voir
// handlers/publishListing.ts) ; avec le claim, la construction du payload et
// les marges, un job legitime ne depasse pas ~11 min. 20 minutes laissent
// donc pres du double -- le cout d'attendre plus longtemps est nul, celui de
// toucher un job vivant ne l'est pas.
const ORPHAN_RUNNING_THRESHOLD_MS = 20 * 60 * 1000;

// REGLE ABSOLUE : ne JAMAIS re-executer. Une republication cree une vraie
// annonce Vinted -- elle n'est pas idempotente. Si l'action avait reussi et
// que seule la finalisation avait echoue, rejouer creerait un DOUBLON reel.
// Or c'est precisement l'information qui manque (elle n'a pas pu etre
// ecrite). On termine donc la ligne en 'failed' avec un message qui dit
// honnetement qu'on ne sait pas, et l'humain tranche (voir
// src/lib/republishOutcome.ts, motif "resultat inconnu", canReschedule
// false).
const UNKNOWN_OUTCOME_MESSAGE =
  "Résultat inconnu : l'exécution s'est interrompue avant confirmation. Vérifie sur Vinted si l'annonce a été republiée avant d'en reprogrammer une.";

async function recoverOrphanedRunningJobs(): Promise<void> {
  const thresholdIso = new Date(Date.now() - ORPHAN_RUNNING_THRESHOLD_MS).toISOString();

  const valid = await getValidAccessToken();
  if (!valid) return; // best-effort, meme discipline que fetchScheduledJobs

  const client = supabaseWithToken(valid.accessToken);

  // Lit TOUTES les lignes 'running' puis filtre l'eligibilite en JS (plutot
  // qu'un .lt() cote requete) : le meme predicat est de toute facon rejoue
  // dans l'UPDATE conditionnel ci-dessous, qui reste la seule autorite. Cela
  // garde la possibilite de distinguer, en cas de doute, "aucune ligne
  // running" de "ligne running pas encore eligible".
  const { data: running, error: readError } = await client
    .from("republish_schedules")
    .select("id, locked_at")
    .eq("status", "running");

  if (readError) {
    logger.warn("REPUBLISH_SCHEDULER_ORPHAN_SCAN_FAILED", {
      error: errorMessage(readError),
      errorCode: (readError as { code?: string }).code ?? null,
    });
    return;
  }

  const rows = (running ?? []) as { id: string; locked_at: string | null }[];
  // locked_at null => jamais claim (anomalie) : jamais eligible, on ne devine pas.
  const orphans = rows.filter((r) => r.locked_at !== null && r.locked_at < thresholdIso);
  if (orphans.length === 0) return;

  for (const orphan of orphans) {
    // UPDATE CONDITIONNEL : les memes predicats que la lecture sont rejoues
    // ici. Entre le select et l'update, l'execution reelle a pu se terminer
    // normalement et ecrire son resultat -- dans ce cas status n'est plus
    // 'running' et cet update n'affecte AUCUNE ligne, ce qui est exactement
    // le comportement voulu. `.select()` fait renvoyer les lignes reellement
    // modifiees : c'est la seule preuve fiable que la recuperation a eu lieu
    // (une absence d'erreur ne prouve rien, un update qui matche 0 ligne
    // reussit sans erreur).
    const { data: updated, error: updateError } = await client
      .from("republish_schedules")
      .update({
        status: "failed",
        error_message: UNKNOWN_OUTCOME_MESSAGE,
        completed_at: new Date().toISOString(),
      })
      .eq("id", orphan.id)
      .eq("status", "running")
      .lt("locked_at", thresholdIso)
      .select("id");

    if (updateError) {
      logger.warn("REPUBLISH_SCHEDULER_ORPHAN_RECOVERY_FAILED", {
        scheduleId: orphan.id,
        error: errorMessage(updateError),
      });
      continue;
    }

    const rowsAffected = updated?.length ?? 0;
    // Aucune donnee sensible : identifiants techniques et horodatages
    // uniquement -- ni titre d'annonce, ni pseudo Vinted, ni token.
    logger.warn("REPUBLISH_SCHEDULER_ORPHAN_RECOVERED", {
      scheduleId: orphan.id,
      lockedAt: orphan.locked_at,
      threshold: thresholdIso,
      rowsAffected,
      // 0 = la ligne s'est terminee normalement entre-temps : rien a
      // recuperer, ce n'est pas une anomalie.
      recovered: rowsAffected > 0,
    });
  }
}

async function fetchSingleJob(scheduleId: string): Promise<RepublishScheduleJob | null> {
  const valid = await getValidAccessToken();
  if (!valid) {
    logger.debug("REPUBLISH_SCHEDULER: alarme declenchee mais pas de session valide", { scheduleId });
    return null;
  }
  const client = supabaseWithToken(valid.accessToken);
  const { data, error } = await client.from("republish_schedules").select(SCHEDULE_COLUMNS).eq("id", scheduleId).maybeSingle();
  if (error) {
    logger.warn("REPUBLISH_SCHEDULER: lecture du job en alarme echouee", { scheduleId, error: errorMessage(error) });
    return null;
  }
  return (data as RepublishScheduleJob | null) ?? null;
}

// Cree/ecrase l'alarme sweep -- chrome.alarms.create() avec un nom deja
// utilise REMPLACE silencieusement l'alarme existante (comportement natif
// documente), jamais besoin de la clear() explicitement avant. Appelee au
// demarrage (init) ET a chaque onStartup -- idempotent, aucun effet de bord
// a etre appelee plusieurs fois.
function ensureSweepAlarm(): void {
  chrome.alarms.create(REPUBLISH_SWEEP_ALARM_NAME, { periodInMinutes: SWEEP_INTERVAL_MINUTES, delayInMinutes: SWEEP_INTERVAL_MINUTES });
}

// Coeur de la resynchronisation -- appelee au chargement du module (chaque
// reveil du service worker) ET a onStartup (redemarrage reel du navigateur).
// `prefetchedJobs` (optionnel) evite une deuxieme lecture Supabase quand
// l'appelant (handleExtensionStartup) a deja recupere la liste pour son
// propre besoin (detection des jobs en retard).
//
// Regles : toute alarme resellos:republish:* dont l'id ne correspond plus a
// AUCUN job status='scheduled' est supprimee (job annule/termine/supprime) ;
// chaque job scheduled recoit une alarme recreee avec le `scheduled_for`
// COURANT (create() ecrase -- couvre a la fois "creation" et
// "replanification apres modification" sans logique de comparaison
// separee).
export async function resyncAlarms(prefetchedJobs?: RepublishScheduleJob[]): Promise<void> {
  const jobs = prefetchedJobs ?? (await fetchScheduledJobs());
  const jobIds = new Set(jobs.map((j) => j.id));

  const existingAlarms = await chrome.alarms.getAll();
  for (const alarm of existingAlarms) {
    const scheduleId = scheduleIdFromAlarmName(alarm.name);
    if (scheduleId === null) continue; // pas une alarme de job (ex. sweep) -- jamais touchee ici
    if (!jobIds.has(scheduleId)) {
      await chrome.alarms.clear(alarm.name);
      logger.debug("REPUBLISH_SCHEDULER_ALARM_CLEARED", { scheduleId, alarmName: alarm.name });
    }
  }

  for (const job of jobs) {
    const when = new Date(job.scheduled_for).getTime();
    if (Number.isNaN(when)) {
      logger.warn("REPUBLISH_SCHEDULER: scheduled_for illisible, alarme non creee", { scheduleId: job.id, scheduledFor: job.scheduled_for });
      continue;
    }
    chrome.alarms.create(alarmNameForSchedule(job.id), { when });
  }

  ensureSweepAlarm();
}

// onStartup (redemarrage reel de Chrome, jamais un simple reveil du service
// worker) : detecte les jobs deja depasses AVANT de resynchroniser les
// alarmes -- log dedie REPUBLISH_SCHEDULER_STARTUP_OVERDUE, distinct de
// REPUBLISH_SCHEDULER_JOB_DUE (qui vient du declenchement normal d'une
// alarme). Un job deja en retard recoit malgre tout une alarme (via
// resyncAlarms ci-dessous, `when` dans le passe) -- chrome.alarms declenche
// alors une alarme en retard des que possible, produisant ENSUITE son propre
// JOB_DUE via le chemin normal -- ce log-ci est un diagnostic
// supplementaire au moment precis du redemarrage, jamais un remplacement.
export async function handleExtensionStartup(): Promise<void> {
  const jobs = await fetchScheduledJobs();
  const now = Date.now();
  for (const job of jobs) {
    const scheduledForMs = new Date(job.scheduled_for).getTime();
    if (Number.isNaN(scheduledForMs) || scheduledForMs > now) continue;
    logger.warn("REPUBLISH_SCHEDULER_STARTUP_OVERDUE", {
      scheduleId: job.id,
      listingId: job.listing_id,
      scheduledFor: job.scheduled_for,
      detectedAt: new Date(now).toISOString(),
      latenessMs: now - scheduledForMs,
    });
  }
  await resyncAlarms(jobs);
}

// Verifications completes demandees avant de logger JOB_DUE : le job existe
// toujours, reste status='scheduled' (jamais deja modifie/annule entre la
// creation de l'alarme et son declenchement), et scheduled_for est bien
// atteint (garde-fou si l'alarme se declenche legerement en avance -- ne
// devrait normalement pas arriver, chrome.alarms peut neanmoins avancer/
// retarder legerement selon sa propre granularite).
async function handleJobAlarmFired(scheduleId: string): Promise<void> {
  const job = await fetchSingleJob(scheduleId);
  if (!job) {
    logger.debug("REPUBLISH_SCHEDULER: job introuvable a l'alarme (supprime/deja resolu)", { scheduleId });
    return;
  }
  if (job.status !== "scheduled") {
    logger.debug("REPUBLISH_SCHEDULER: job plus au statut scheduled, alarme ignoree", { scheduleId, status: job.status });
    return;
  }
  const scheduledForMs = new Date(job.scheduled_for).getTime();
  const firedAt = Date.now();
  if (Number.isNaN(scheduledForMs) || scheduledForMs > firedAt) {
    logger.debug("REPUBLISH_SCHEDULER: alarme declenchee avant l'heure prevue, ignoree", { scheduleId, scheduledFor: job.scheduled_for });
    return;
  }

  // Round 3 : detection honnete, TOUJOURS loguee avant toute decision.
  // Round 4 : declenche desormais reellement l'execution (executeClaimedSchedule)
  // -- le claim RPC atomique (scheduledRepublishExecutor.ts) reste la SEULE
  // garantie qu'une seule execution reelle aboutit, meme si ce meme job est
  // aussi detecte par le sweep dans la meme fenetre : jamais un deuxieme
  // moteur, jamais un deuxieme handlePublishListing/chrome.tabs.create sans
  // passer par ce claim.
  logger.info("REPUBLISH_SCHEDULER_JOB_DUE", {
    scheduleId: job.id,
    listingId: job.listing_id,
    scheduledFor: job.scheduled_for,
    firedAt: new Date(firedAt).toISOString(),
    latenessMs: firedAt - scheduledForMs,
  });
  await executeClaimedSchedule(job.id);
}

// Filet de secours periodique : rejoue la meme logique de detection "du"
// que handleJobAlarmFired, mais sur TOUS les jobs scheduled d'un coup.
// Round 4 : tente aussi le claim+execution pour chaque job du trouve ici --
// c'est exactement la raison d'etre du sweep (rattraper un job dont
// l'alarme individuelle aurait ete perdue), le claim atomique empechant
// toute double execution si l'alarme du job a en realite deja demarre.
async function runSweep(): Promise<void> {
  // Recuperation AVANT execution : liberer d'abord les lignes bloquees en
  // 'running' rend l'index unique partiel de nouveau disponible pour ces
  // annonces. Ne reinjecte jamais de travail dans la boucle ci-dessous (la
  // recuperation termine en 'failed', jamais en 'scheduled').
  await recoverOrphanedRunningJobs();

  const jobs = await fetchScheduledJobs();
  const now = Date.now();
  for (const job of jobs) {
    const scheduledForMs = new Date(job.scheduled_for).getTime();
    if (Number.isNaN(scheduledForMs) || scheduledForMs > now) continue;
    logger.info("REPUBLISH_SCHEDULER_SWEEP_DUE_JOB", {
      scheduleId: job.id,
      listingId: job.listing_id,
      scheduledFor: job.scheduled_for,
      firedAt: new Date(now).toISOString(),
      latenessMs: now - scheduledForMs,
    });
    await executeClaimedSchedule(job.id);
  }

  // Mission "CORRECTIF BETA -- ALARME INDIVIDUELLE JAMAIS CREEE" (2026-08-24),
  // cause confirmee par le test reel du 24/08 : le job de 21:05 a ete rattrape
  // par CE sweep (REPUBLISH_SCHEDULER_SWEEP_DUE_JOB, latenessMs 211379 ~ 3min31)
  // et NON par son alarme individuelle (qui aurait produit JOB_DUE).
  //
  // Raison : resyncAlarms() -- seule fonction qui cree les alarmes
  // individuelles -- n'etait appelee qu'au chargement du module (demarrage du
  // service worker) et sur onStartup. Rien ne notifie l'extension quand une
  // programmation est creee depuis l'app : un job cree alors que le service
  // worker tournait deja n'obtenait donc JAMAIS d'alarme precise, et seul ce
  // sweep periodique (5 min) pouvait le rattraper.
  //
  // Le sweep reprend donc la resynchronisation a son compte. VOLONTAIREMENT
  // SANS reutiliser `jobs` lu en debut de fonction : cette liste est
  // ANTERIEURE aux executions ci-dessus, et les jobs qui viennent de tourner
  // n'y sont plus 'scheduled'. La repasser a resyncAlarms() recreerait une
  // alarme (avec un `when` deja passe) pour un job deja execute. On relit donc
  // l'etat frais -- une lecture Supabase toutes les 5 minutes, negligeable.
  //
  // PORTEE REELLE (beta, pas une garantie absolue) : cela ne donne une alarme
  // precise qu'aux jobs decouverts par un sweep AVANT leur echeance -- soit,
  // en pratique, ceux programmes a plus de ~5 min. Une programmation creee
  // pour dans moins de 5 minutes reste rattrapee par le sweep suivant, donc
  // toujours avec un retard pouvant aller jusqu'a l'intervalle de sweep.
  // Supprimer cette fenetre demanderait une notification app -> extension a la
  // creation, hors perimetre ici.
  await resyncAlarms();
}

// Exportee pour les tests (declenchement direct sans passer par
// initRepublishScheduler(), qui enchaine aussi sa propre resynchronisation
// en arriere-plan -- exporter ce point d'entree evite toute course entre
// les deux dans un test cible sur UNE seule alarme).
export async function handleAlarmFired(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name === REPUBLISH_SWEEP_ALARM_NAME) {
    await runSweep();
    return;
  }
  const scheduleId = scheduleIdFromAlarmName(alarm.name);
  if (scheduleId === null) {
    // Alarme hors de ce planificateur (prefixe non reconnu) -- ignoree
    // silencieusement, jamais une erreur : pourrait appartenir a une future
    // feature distincte.
    return;
  }
  await handleJobAlarmFired(scheduleId);
}

// Point d'entree unique, appele une seule fois au demarrage du service
// worker (voir background/index.ts) -- meme convention que
// installDeleteRequestInstrumentation()/installPublishMutationInstrumentation().
// Enregistre les listeners, s'assure que l'alarme de sweep existe, et lance
// une premiere resynchronisation best-effort (fire-and-forget : ce module ne
// doit jamais retarder le demarrage du service worker).
export function initRepublishScheduler(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    void handleAlarmFired(alarm);
  });
  chrome.runtime.onStartup.addListener(() => {
    void handleExtensionStartup();
  });
  ensureSweepAlarm();
  void resyncAlarms();

  // POINT DE VIGILANCE NON RESOLU (2026-08-25, laisse volontairement en
  // commentaire) : chrome.alarms.create() avec un nom deja utilise EFFACE
  // l'alarme existante. ensureSweepAlarm() tourne a CHAQUE reveil du service
  // worker avec delayInMinutes:5 -- chaque reveil repousse donc le premier
  // declenchement du sweep de 5 minutes. Un service worker reveille tres
  // frequemment pourrait voir son sweep retarde, voire jamais declenche.
  //
  // Non confirme : le sweep a bien fini par tourner lors du test du 25/08
  // (la recuperation d'un job orphelin a fonctionne), donc la famine n'est
  // au minimum pas systematique. A instrumenter si un retard de sweep est
  // reobserve -- ne pas "corriger" a l'aveugle.
}
