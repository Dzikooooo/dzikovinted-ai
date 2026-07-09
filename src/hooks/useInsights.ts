import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVintedAccountFilter } from '../contexts/VintedAccountFilterContext';
import { supabase } from '../lib/supabase';
import { computeInsights } from '../lib/insights/engine';
import type { InsightsReport } from '../lib/insights/types';
import type { Listing, ListingMetricSnapshot } from '../lib/types';

const SNAPSHOT_HISTORY_DAYS = 90;

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

      const [{ data: allListings }, { data: snapshots }] = await Promise.all([
        supabase
          .from('listings')
          .select('*')
          .eq('user_id', user.id)
          .or('vinted_status.neq.deleted,vinted_status.is.null'),
        supabase.from('listing_metric_snapshots').select('*').gte('captured_at', historyStart),
      ]);

      if (ignore) return;

      const listings = (allListings ?? []) as Listing[];
      const listingSnapshots = (snapshots ?? []) as ListingMetricSnapshot[];

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

      const scopedReport = computeInsights(scopedListings, accounts, scopedSnapshots);
      const fullReport =
        selectedAccountId === 'all' ? scopedReport : computeInsights(listings, accounts, listingSnapshots);

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
