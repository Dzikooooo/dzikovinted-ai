import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVintedAccountFilter } from '../contexts/VintedAccountFilterContext';
import { supabase } from '../lib/supabase';
import { computeInsights } from '../lib/insights/engine';
import { ACTION_RETRY_COOLDOWN_DAYS, PRICE_CHANGE_COOLDOWN_DAYS } from '../lib/insights/constants';
import type { InsightsReport, RecentActionSummary } from '../lib/insights/types';
import type { Listing, ListingMetricSnapshot } from '../lib/types';

const SNAPSHOT_HISTORY_DAYS = 90;

// Fenetre de lookback pour les garde-fous anti-boucle (actionCooldown.ts) --
// couvre le plus long des deux cooldowns actuels, avec une marge pour
// tolerer leur divergence future sans devoir toucher cette requete.
const RECENT_ACTIONS_LOOKBACK_DAYS = Math.max(ACTION_RETRY_COOLDOWN_DAYS, PRICE_CHANGE_COOLDOWN_DAYS) + 3;

const RECENT_ACTION_KINDS = ['edit_listing', 'publish_listing', 'republish_listing'] as const;

interface RawActionLogRow {
  listing_id: string | null;
  kind: string;
  completed_at: string | null;
  payload: { changedFields?: string[] } | null;
}

function mapRecentAction(row: RawActionLogRow): RecentActionSummary | null {
  if (!row.listing_id || !row.completed_at) return null;
  return {
    listingId: row.listing_id,
    kind: row.kind as RecentActionSummary['kind'],
    completedAt: row.completed_at,
    changedFields: row.payload?.changedFields,
  };
}

export function useInsights() {
  const { user } = useAuth();
  const { accounts, selectedAccountId } = useVintedAccountFilter();
  const [report, setReport] = useState<InsightsReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let ignore = false;

    (async () => {
      setLoading(true);
      const historyStart = new Date(Date.now() - SNAPSHOT_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const actionsStart = new Date(Date.now() - RECENT_ACTIONS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const [{ data: allListings }, { data: snapshots }, { data: recentActionRows }] = await Promise.all([
        supabase
          .from('listings')
          .select('*')
          .eq('user_id', user.id)
          .or('vinted_status.neq.deleted,vinted_status.is.null'),
        supabase.from('listing_metric_snapshots').select('*').gte('captured_at', historyStart),
        supabase
          .from('action_log')
          .select('listing_id, kind, completed_at, payload')
          .eq('user_id', user.id)
          .eq('status', 'success')
          .in('kind', RECENT_ACTION_KINDS)
          .gte('completed_at', actionsStart),
      ]);

      if (ignore) return;

      const listings = (allListings ?? []) as Listing[];
      const listingSnapshots = (snapshots ?? []) as ListingMetricSnapshot[];
      const recentActions = ((recentActionRows ?? []) as RawActionLogRow[])
        .map(mapRecentAction)
        .filter((a): a is RecentActionSummary => a !== null);

      // Les recommandations/alertes/priorites/scores sont calcules sur le
      // sous-ensemble du compte selectionne (coherent avec le badge "Vue :
      // {compte}" deja etabli en Phase B) ; les narrations restent calculees
      // sur TOUT l'inventaire pour permettre les comparaisons inter-comptes
      // ("matleshop est votre compte le plus performant") meme quand un
      // compte precis est filtre a l'ecran.
      const scopedListings =
        selectedAccountId === 'all' ? listings : listings.filter((l) => l.vinted_account_id === selectedAccountId);
      const scopedListingIds = new Set(scopedListings.map((l) => l.id));
      const scopedSnapshots = listingSnapshots.filter((s) => scopedListingIds.has(s.listing_id));

      const scopedReport = computeInsights(scopedListings, accounts, scopedSnapshots, recentActions);
      const fullReport =
        selectedAccountId === 'all'
          ? scopedReport
          : computeInsights(listings, accounts, listingSnapshots, recentActions);

      if (!ignore) {
        setReport({ ...scopedReport, narratives: fullReport.narratives });
        setLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [user, accounts, selectedAccountId]);

  return { report, loading };
}
