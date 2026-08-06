import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { buildListingTimeline } from '../lib/timeline';
import type { ListingTimeline, TimelineActionInput, TimelineRecommendationInput } from '../lib/timeline';
import type { Listing, ListingMetricSnapshot } from '../lib/types';

interface RawActionRow {
  id: string;
  kind: string;
  status: string;
  started_at: string;
  completed_at: string | null;
}

interface RawEntryRow {
  action_id: string;
  step: string | null;
  message: string;
  at: string;
}

interface RawRecommendationLogRow {
  id: string;
  kind: string;
  confidence: string;
  reason: string;
  shown_at: string;
  resolved_at: string | null;
  resolution: string | null;
}

// Assemble la timeline d'UNE annonce (Lot "Suivi des annonces", voir
// LOT_SUIVI_ANNONCES_SPEC.md) -- fait le pont I/O -> fonction pure
// (buildListingTimeline). `listing` est fourni par l'appelant (deja chargee
// par ListingsManagementSection.tsx/useInsights) plutot que re-requetee ici.
export function useListingTimeline(listing: Listing | null) {
  const [timeline, setTimeline] = useState<ListingTimeline | null>(null);
  // Id de l'episode listing_recommendation_log actuellement ouvert (s'il y
  // en a un) -- expose separement du reste de la timeline pour que le
  // bouton "Ignorer cette suggestion" (fiche annonce) sache precisement
  // quelle ligne resoudre, sans avoir a re-parcourir les evenements deja
  // aplatis en TimelineEvent[].
  const [openRecommendationLogId, setOpenRecommendationLogId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Incremente pour forcer un rechargement (ex. apres "Ignorer cette
  // suggestion") sans dupliquer toute la logique de fetch ci-dessous.
  const [reloadToken, setReloadToken] = useState(0);
  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!listing) {
      setTimeline(null);
      setOpenRecommendationLogId(null);
      setLoading(false);
      return;
    }
    let ignore = false;

    (async () => {
      setLoading(true);

      const [{ data: snapshotRows }, { data: actionRows }, { data: logRows }] = await Promise.all([
        supabase
          .from('listing_metric_snapshots')
          .select('id, listing_id, views, favourites, price, vinted_status, captured_at')
          .eq('listing_id', listing.id)
          .order('captured_at', { ascending: true }),
        supabase
          .from('action_log')
          .select('id, kind, status, started_at, completed_at')
          .eq('listing_id', listing.id)
          .eq('status', 'success')
          .order('started_at', { ascending: true }),
        supabase
          .from('listing_recommendation_log')
          .select('id, kind, confidence, reason, shown_at, resolved_at, resolution')
          .eq('listing_id', listing.id)
          .order('shown_at', { ascending: true }),
      ]);

      if (ignore) return;

      const actions = (actionRows ?? []) as RawActionRow[];
      const actionIds = actions.map((a) => a.id);

      const { data: entryRows } =
        actionIds.length > 0
          ? await supabase.from('action_log_entries').select('action_id, step, message, at').in('action_id', actionIds)
          : { data: [] as RawEntryRow[] };

      if (ignore) return;

      const entriesByActionId = new Map<string, RawEntryRow[]>();
      for (const e of (entryRows ?? []) as RawEntryRow[]) {
        const bucket = entriesByActionId.get(e.action_id);
        if (bucket) bucket.push(e);
        else entriesByActionId.set(e.action_id, [e]);
      }

      const timelineActions: TimelineActionInput[] = actions.map((a) => ({
        id: a.id,
        kind: a.kind,
        status: a.status,
        startedAt: a.started_at,
        completedAt: a.completed_at,
        entries: (entriesByActionId.get(a.id) ?? [])
          .sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0))
          .map((e) => ({ step: e.step, message: e.message, at: e.at })),
      }));

      const timelineRecommendations: TimelineRecommendationInput[] = ((logRows ?? []) as RawRecommendationLogRow[]).map((r) => ({
        id: r.id,
        kind: r.kind as TimelineRecommendationInput['kind'],
        confidence: r.confidence as TimelineRecommendationInput['confidence'],
        reason: r.reason,
        shownAt: r.shown_at,
        resolvedAt: r.resolved_at,
        resolution: r.resolution as TimelineRecommendationInput['resolution'],
      }));

      const sale =
        listing.status === 'vendu' && listing.sold_date
          ? { soldAt: listing.sold_date, soldPrice: listing.sold_price }
          : null;

      const built = buildListingTimeline(
        (snapshotRows ?? []) as ListingMetricSnapshot[],
        timelineActions,
        timelineRecommendations,
        sale
      );

      const openRow = ((logRows ?? []) as RawRecommendationLogRow[]).find((r) => r.resolved_at === null);

      if (!ignore) {
        setTimeline(built);
        setOpenRecommendationLogId(openRow?.id ?? null);
        setLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [listing, reloadToken]);

  return { timeline, loading, openRecommendationLogId, refetch };
}
