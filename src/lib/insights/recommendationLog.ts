import type { ListingRecommendationResult, RecentActionSummary, RecommendationCta, RecommendationConfidence, RecommendationKind } from './types';
import type { SyncFreshnessTier } from './dataSufficiency';
import { MIN_CONSECUTIVE_FRESH_MISSES_BEFORE_EXPIRY, MIN_DAYS_BEFORE_EXPIRY } from './constants';

// Persistance des recommandations (Lot "Suivi des annonces", voir
// LOT_SUIVI_ANNONCES_SPEC.md) -- fonctions PURES uniquement, aucun acces
// reseau/base ici (meme invariant que le reste de src/lib/insights/,
// jamais casse par ce lot). L'I/O reel (lecture des lignes ouvertes,
// ecriture Supabase, gestion des conflits 23505) vit dans useInsights.ts,
// qui consomme le resultat de diffRecommendationLog ci-dessous.

// RecentActionSummary (types.ts) n'a jamais porte d'id -- inutile aux
// garde-fous anti-boucle de actionCooldown.ts, qui n'ont besoin que de
// kind/completedAt/changedFields. resolution_action_id (migration
// 20260806100000) a en revanche besoin du vrai id action_log pour tracer
// PRECISEMENT quelle action a resolu une recommandation -- etendu ici
// plutot que d'ajouter ce champ a RecentActionSummary (garde le Lot 1
// intact, zero risque de regression sur recommendations.ts/context.ts).
export interface ResolvableAction extends RecentActionSummary {
  id: string;
}

export interface OpenRecommendationLogRow {
  id: string;
  listingId: string;
  kind: RecommendationKind;
  confidence: RecommendationConfidence;
  reason: string;
  ctaType: RecommendationCta['type'];
  shownAt: string;
  lastConfirmedAt: string;
  consecutiveMisses: number;
  firstMissAt: string | null;
}

export interface RecommendationLogInsert {
  listingId: string;
  kind: RecommendationKind;
  confidence: RecommendationConfidence;
  reason: string;
  ctaType: RecommendationCta['type'];
  now: string;
}

export type RecommendationLogUpdate =
  // Meme episode toujours actif : reset du compteur de miss. confidence/
  // reason optionnels -- absents quand la source est un etat
  // 'recommandation_differee' (qui ne porte pas ces champs), auquel cas les
  // valeurs deja en base restent inchangees plutot que d'etre ecrasees par
  // une donnee inventee.
  | { op: 'heartbeat'; id: string; now: string; confidence?: RecommendationConfidence; reason?: string }
  // Miss frais compte, pas encore assez pour expirer.
  | { op: 'increment_miss'; id: string; now: string; firstMissAt: string; consecutiveMisses: number }
  | {
      op: 'resolve';
      id: string;
      resolution: 'suivie' | 'remplacee' | 'expiree';
      resolvedAt: string;
      resolutionActionId?: string;
    };

export interface RecommendationLogDiff {
  inserts: RecommendationLogInsert[];
  updates: RecommendationLogUpdate[];
}

// Est-ce qu'une action reussie donnee "resout" une recommandation de ce
// kind -- mapping explicite, jamais devine. verifier_annonce n'a
// deliberement AUCUNE resolution automatique : les defauts qu'elle signale
// (photo/categorie manquante, echec de sync) ne sont pas modifiables via
// edit_listing (titre/description/prix uniquement, voir
// EditListingPayload) -- seule une correction manuelle sur Vinted suivie
// d'une resynchro peut la resoudre, ce qui ne laisse jamais de trace dans
// action_log. Se ferme donc uniquement par expiration ou remplacement.
function actionResolves(kind: RecommendationKind, action: ResolvableAction): boolean {
  switch (kind) {
    case 'baisser_prix':
      return action.kind === 'edit_listing' && !!action.changedFields?.includes('price');
    case 'considerer_republication':
      return action.kind === 'publish_listing' || action.kind === 'republish_listing';
    case 'revoir_annonce':
      return action.kind === 'edit_listing';
    case 'verifier_annonce':
      return false;
  }
}

function resolve(
  id: string,
  resolution: 'suivie' | 'remplacee' | 'expiree',
  resolvedAt: string,
  resolutionActionId?: string
): RecommendationLogUpdate {
  return { op: 'resolve', id, resolution, resolvedAt, resolutionActionId };
}

interface DiffOneListingResult {
  insert: RecommendationLogInsert | null;
  update: RecommendationLogUpdate | null;
}

function diffOneListing(
  listingId: string,
  current: ListingRecommendationResult | undefined,
  freshness: SyncFreshnessTier,
  openRow: OpenRecommendationLogRow | undefined,
  actions: ResolvableAction[],
  now: Date
): DiffOneListingResult {
  const nowIso = now.toISOString();

  if (!openRow) {
    // Rien a resoudre -- seul cas a traiter : une nouvelle recommandation
    // active a ouvrir.
    if (current?.status === 'action') {
      return {
        insert: {
          listingId,
          kind: current.kind,
          confidence: current.confidence,
          reason: current.reason,
          ctaType: current.cta.type,
          now: nowIso,
        },
        update: null,
      };
    }
    return { insert: null, update: null };
  }

  // Un episode est ouvert pour cette annonce a partir d'ici -----------------

  // 1) 'suivie' est prioritaire sur tout le reste : une action compatible et
  //    posterieure a l'ouverture de l'episode le ferme, meme si la meme
  //    recommandation re-matche juste apres (Lot 1 impose de toute facon un
  //    cooldown qui l'empeche generalement de re-matcher immediatement,
  //    voir actionCooldown.ts -- verifie ici independamment pour rester
  //    correct meme si ce cooldown venait a changer).
  const resolvingAction = actions.find(
    (a) => actionResolves(openRow.kind, a) && new Date(a.completedAt).getTime() > new Date(openRow.shownAt).getTime()
  );
  if (resolvingAction) {
    return { insert: null, update: resolve(openRow.id, 'suivie', resolvingAction.completedAt, resolvingAction.id) };
  }

  // 2) Nouvelle recommandation active (status='action').
  if (current?.status === 'action') {
    if (current.kind === openRow.kind) {
      return {
        insert: null,
        update: { op: 'heartbeat', id: openRow.id, now: nowIso, confidence: current.confidence, reason: current.reason },
      };
    }
    return {
      insert: {
        listingId,
        kind: current.kind,
        confidence: current.confidence,
        reason: current.reason,
        ctaType: current.cta.type,
        now: nowIso,
      },
      update: resolve(openRow.id, 'remplacee', nowIso),
    };
  }

  // 3) 'recommandation_differee' : le signal tient toujours, juste bloque
  //    par un cooldown -- pas un miss, pas un rematch a part entiere, mais
  //    on rassure l'episode (heartbeat, reset des misses) si le kind est
  //    identique ; un kind different signale malgre tout une situation
  //    nouvelle -> remplacee.
  if (current?.status === 'recommandation_differee') {
    if (current.kind === openRow.kind) {
      return { insert: null, update: { op: 'heartbeat', id: openRow.id, now: nowIso } };
    }
    return { insert: null, update: resolve(openRow.id, 'remplacee', nowIso) };
  }

  // 4) Annonce sortie du perimetre du moteur (vendue, brouillon...) --
  //    signal terminal certain, distinct d'un simple miss : expire
  //    immediatement, jamais soumis au compteur de misses (qui suppose une
  //    annonce toujours suivie par le moteur).
  if (current === undefined) {
    return { insert: null, update: resolve(openRow.id, 'expiree', nowIso) };
  }

  // 5) 'donnees_insuffisantes' (synchro perimee OU echantillon insuffisant) :
  //    ne compte jamais comme un miss ni comme un reset -- on ne sait rien,
  //    le compteur reste gele a l'etat.
  if (current.status === 'donnees_insuffisantes') {
    return { insert: null, update: null };
  }

  // 6) 'attendre' : seul etat qui alimente le compteur de miss, et
  //    uniquement quand l'evaluation est fraiche (le garde-fou exige des
  //    evaluations FRAICHES consecutives -- une evaluation en synchro
  //    'tendue' ne compte ni comme miss ni comme reset).
  if (freshness !== 'fraiche') {
    return { insert: null, update: null };
  }

  const consecutiveMisses = openRow.consecutiveMisses + 1;
  const firstMissAt = openRow.firstMissAt ?? nowIso;
  const daysSinceFirstMiss = (now.getTime() - new Date(firstMissAt).getTime()) / (24 * 60 * 60 * 1000);

  if (consecutiveMisses >= MIN_CONSECUTIVE_FRESH_MISSES_BEFORE_EXPIRY && daysSinceFirstMiss >= MIN_DAYS_BEFORE_EXPIRY) {
    return { insert: null, update: resolve(openRow.id, 'expiree', nowIso) };
  }

  return { insert: null, update: { op: 'increment_miss', id: openRow.id, now: nowIso, firstMissAt, consecutiveMisses } };
}

// Point d'entree : traite l'ensemble des annonces d'un coup. `listingIds`
// doit couvrir toute annonce ayant soit un resultat courant, soit un
// episode ouvert (l'appelant, useInsights.ts, passe l'union des deux).
export function diffRecommendationLog(
  listingIds: string[],
  currentByListingId: Map<string, ListingRecommendationResult>,
  freshnessByListingId: Map<string, SyncFreshnessTier>,
  openRowByListingId: Map<string, OpenRecommendationLogRow>,
  actionsByListingId: Map<string, ResolvableAction[]>,
  now: Date
): RecommendationLogDiff {
  const inserts: RecommendationLogInsert[] = [];
  const updates: RecommendationLogUpdate[] = [];

  for (const listingId of listingIds) {
    const result = diffOneListing(
      listingId,
      currentByListingId.get(listingId),
      freshnessByListingId.get(listingId) ?? 'perimee',
      openRowByListingId.get(listingId),
      actionsByListingId.get(listingId) ?? [],
      now
    );
    if (result.insert) inserts.push(result.insert);
    if (result.update) updates.push(result.update);
  }

  return { inserts, updates };
}
