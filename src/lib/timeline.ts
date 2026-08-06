import type { RecommendationConfidence, RecommendationKind } from './insights/types';
import { measureRecommendationOutcome } from './insights/recommendationOutcome';
import type { RecommendationOutcome } from './insights/recommendationOutcome';
import type { ListingMetricSnapshot } from './types';

// Timeline par annonce (Lot "Suivi des annonces", voir
// LOT_SUIVI_ANNONCES_SPEC.md) -- fonction PURE, assemble des donnees deja
// requetees par useListingTimeline.ts (I/O). Regle centrale (garde-fou
// explicite de la validation utilisateur) : ne jamais afficher chaque
// synchro passive comme une ligne a part -- les synchros consecutives sont
// agregees en une seule periode resumee (vues/favoris/prix/statut de
// debut a fin), les details techniques (etapes d'une action) restent dans
// un champ secondaire, jamais dans le flux principal.

export interface TimelineActionEntry {
  step: string | null;
  message: string;
  at: string;
}

export interface TimelineActionInput {
  id: string;
  kind: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  entries: TimelineActionEntry[];
}

export interface TimelineRecommendationInput {
  id: string;
  kind: RecommendationKind;
  confidence: RecommendationConfidence;
  reason: string;
  shownAt: string;
  resolvedAt: string | null;
  resolution: 'suivie' | 'ignoree' | 'expiree' | 'remplacee' | null;
}

export interface TimelineSaleInput {
  soldAt: string;
  soldPrice: number | null;
}

export type TimelineEvent =
  | {
      type: 'engagement_period';
      at: string; // date de tri = fin de periode
      from: string;
      to: string;
      snapshotCount: number;
      views: { from: number | null; to: number | null };
      favourites: { from: number | null; to: number | null };
      price: { from: number | null; to: number | null; changed: boolean };
      status: { from: string | null; to: string | null; changed: boolean };
    }
  | {
      type: 'action';
      at: string;
      actionId: string;
      kind: string;
      status: string;
      completedAt: string | null;
      technicalDetail: TimelineActionEntry[];
    }
  | {
      type: 'recommendation_opened';
      at: string;
      logId: string;
      kind: RecommendationKind;
      confidence: RecommendationConfidence;
      reason: string;
    }
  | {
      type: 'recommendation_resolved';
      at: string;
      logId: string;
      kind: RecommendationKind;
      resolution: 'suivie' | 'ignoree' | 'expiree' | 'remplacee';
      // Uniquement calcule pour resolution='suivie' -- une recommandation
      // ignoree/expiree/remplacee n'a par definition aucune action a
      // laquelle rattacher une mesure (voir recommendationOutcome.ts).
      // Toujours une evolution OBSERVEE, jamais un impact affirme.
      outcome: RecommendationOutcome | null;
    }
  | { type: 'sale'; at: string; soldPrice: number | null };

export interface ListingTimeline {
  // Plus ancien point de donnees reellement connu -- null si l'annonce n'a
  // jamais ete synchronisee. Affiche tel quel ("Historique disponible
  // depuis le...") plutot que de laisser croire a un historique qui
  // remonterait a la creation de l'annonce.
  earliestDataAt: string | null;
  // Ordre chronologique DESCENDANT (le plus recent en premier), pret pour
  // l'affichage direct.
  events: TimelineEvent[];
}

type ChronoEvent =
  | { kind: 'snapshot'; at: string; snapshot: ListingMetricSnapshot }
  | { kind: 'action'; at: string; action: TimelineActionInput }
  | { kind: 'recommendation_opened'; at: string; row: TimelineRecommendationInput }
  | { kind: 'recommendation_resolved'; at: string; row: TimelineRecommendationInput }
  | { kind: 'sale'; at: string; sale: TimelineSaleInput };

function flushSnapshotBuffer(buffer: ListingMetricSnapshot[]): TimelineEvent | null {
  if (buffer.length === 0) return null;
  const first = buffer[0];
  const last = buffer[buffer.length - 1];
  return {
    type: 'engagement_period',
    at: last.captured_at,
    from: first.captured_at,
    to: last.captured_at,
    snapshotCount: buffer.length,
    views: { from: first.views, to: last.views },
    favourites: { from: first.favourites, to: last.favourites },
    price: { from: first.price, to: last.price, changed: first.price !== last.price },
    status: { from: first.vinted_status, to: last.vinted_status, changed: first.vinted_status !== last.vinted_status },
  };
}

export function buildListingTimeline(
  snapshots: ListingMetricSnapshot[],
  actions: TimelineActionInput[],
  recommendations: TimelineRecommendationInput[],
  sale: TimelineSaleInput | null
): ListingTimeline {
  const earliestDataAt =
    snapshots.length === 0
      ? null
      : snapshots.reduce((min, s) => (s.captured_at < min ? s.captured_at : min), snapshots[0].captured_at);

  // Fusion chronologique ascendante de toutes les sources -- les
  // "recommendation" produisent DEUX evenements potentiels (ouverture ET
  // resolution eventuelle), traites separement pour rester factuels.
  const chrono: ChronoEvent[] = [];
  for (const s of snapshots) chrono.push({ kind: 'snapshot', at: s.captured_at, snapshot: s });
  for (const a of actions) chrono.push({ kind: 'action', at: a.startedAt, action: a });
  for (const r of recommendations) {
    chrono.push({ kind: 'recommendation_opened', at: r.shownAt, row: r });
    if (r.resolvedAt && r.resolution) chrono.push({ kind: 'recommendation_resolved', at: r.resolvedAt, row: r });
  }
  if (sale) chrono.push({ kind: 'sale', at: sale.soldAt, sale });

  chrono.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  const events: TimelineEvent[] = [];
  let snapshotBuffer: ListingMetricSnapshot[] = [];

  const flush = () => {
    const merged = flushSnapshotBuffer(snapshotBuffer);
    if (merged) events.push(merged);
    snapshotBuffer = [];
  };

  for (const ev of chrono) {
    if (ev.kind === 'snapshot') {
      snapshotBuffer.push(ev.snapshot);
      continue;
    }
    // Tout evenement non-snapshot coupe la periode en cours -- garde le
    // resume agrege avant d'inserer l'evenement significatif.
    flush();
    if (ev.kind === 'action') {
      events.push({
        type: 'action',
        at: ev.action.startedAt,
        actionId: ev.action.id,
        kind: ev.action.kind,
        status: ev.action.status,
        completedAt: ev.action.completedAt,
        technicalDetail: ev.action.entries,
      });
    } else if (ev.kind === 'recommendation_opened') {
      events.push({
        type: 'recommendation_opened',
        at: ev.row.shownAt,
        logId: ev.row.id,
        kind: ev.row.kind,
        confidence: ev.row.confidence,
        reason: ev.row.reason,
      });
    } else if (ev.kind === 'recommendation_resolved') {
      // resolution/resolvedAt garantis non-null par le filtre plus haut.
      const resolution = ev.row.resolution as 'suivie' | 'ignoree' | 'expiree' | 'remplacee';
      const resolvedAt = ev.row.resolvedAt as string;
      events.push({
        type: 'recommendation_resolved',
        at: resolvedAt,
        logId: ev.row.id,
        kind: ev.row.kind,
        resolution,
        outcome: resolution === 'suivie' ? measureRecommendationOutcome(resolvedAt, snapshots, sale) : null,
      });
    } else if (ev.kind === 'sale') {
      events.push({ type: 'sale', at: ev.sale.soldAt, soldPrice: ev.sale.soldPrice });
    }
  }
  flush();

  // Affichage le plus recent en premier (voir wireframe LOT_SUIVI_ANNONCES_SPEC.md §7.2).
  events.reverse();

  return { earliestDataAt, events };
}
