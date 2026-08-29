import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVintedAccountFilter } from '../contexts/VintedAccountFilterContext';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/supabaseExhaustiveFetch';
import { computeInsights } from '../lib/insights/engine';
import { ACTION_RETRY_COOLDOWN_DAYS, PRICE_CHANGE_COOLDOWN_DAYS } from '../lib/insights/constants';
import { syncRecommendationLog } from '../lib/recommendationLogSync';
import type { ResolvableAction } from '../lib/insights/recommendationLog';
import type { InsightsReport, RecentActionSummary } from '../lib/insights/types';
import type { Listing, ListingMetricSnapshot } from '../lib/types';

const SNAPSHOT_HISTORY_DAYS = 90;

// Fenetre de lookback pour les garde-fous anti-boucle (actionCooldown.ts) --
// couvre le plus long des deux cooldowns actuels, avec une marge pour
// tolerer leur divergence future sans devoir toucher cette requete.
const RECENT_ACTIONS_LOOKBACK_DAYS = Math.max(ACTION_RETRY_COOLDOWN_DAYS, PRICE_CHANGE_COOLDOWN_DAYS) + 3;

const RECENT_ACTION_KINDS = ['edit_listing', 'publish_listing', 'republish_listing'] as const;

interface RawActionLogRow {
  id: string;
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

// Variante avec id (voir recommendationLog.ts::ResolvableAction) -- utilisee
// uniquement pour la resolution 'suivie' de listing_recommendation_log,
// jamais passee a computeInsights() (qui continue de recevoir exactement
// RecentActionSummary[], sans id, comme avant -- zero changement de contrat
// pour le Lot 1 du Decision Engine).
function mapResolvableAction(row: RawActionLogRow): ResolvableAction | null {
  const base = mapRecentAction(row);
  if (!base) return null;
  return { ...base, id: row.id };
}

function groupByListingId<T extends { listingId: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const bucket = map.get(item.listingId);
    if (bucket) bucket.push(item);
    else map.set(item.listingId, [item]);
  }
  return map;
}

export function useInsights() {
  const { user } = useAuth();
  const { accounts, selectedAccountId } = useVintedAccountFilter();
  const [report, setReport] = useState<InsightsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // requestIdRef remplace le flag `ignore` par-effet -- necessaire car
  // fetchInsights() est desormais aussi appelable manuellement (refetch,
  // voir P1-C audit beta 2026-08-08 : apres le succes confirme d'une action
  // Vinted sur une annonce, ListingsManagementSection.tsx appelle refetch()
  // pour que la recommandation affichee ne reste pas perimee jusqu'a la
  // prochaine synchro passive). "Dernier appel gagne" couvre a la fois les
  // reexecutions automatiques (changement de compte filtre) ET un refetch()
  // manuel qui chevaucherait un appel automatique en cours.
  const requestIdRef = useRef(0);

  const fetchInsights = useCallback(async () => {
    if (!user) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    const historyStart = new Date(Date.now() - SNAPSHOT_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const actionsStart = new Date(Date.now() - RECENT_ACTIONS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

    let listings: Listing[];
    let listingSnapshots: ListingMetricSnapshot[];
    let rawActionRows: RawActionLogRow[];
    try {
      [listings, listingSnapshots, rawActionRows] = await Promise.all([
        fetchAllRows<Listing>((rangeStart, rangeEnd) =>
          supabase
            .from('listings')
            .select('*')
            .eq('user_id', user.id)
            .or('vinted_status.neq.deleted,vinted_status.is.null')
            .range(rangeStart, rangeEnd)
        ),
        fetchAllRows<ListingMetricSnapshot>((rangeStart, rangeEnd) =>
          supabase.from('listing_metric_snapshots').select('*').gte('captured_at', historyStart).range(rangeStart, rangeEnd)
        ),
        fetchAllRows<RawActionLogRow>((rangeStart, rangeEnd) =>
          supabase
            .from('action_log')
            .select('id, listing_id, kind, completed_at, payload')
            .eq('user_id', user.id)
            .eq('status', 'success')
            .in('kind', RECENT_ACTION_KINDS)
            .gte('completed_at', actionsStart)
            .range(rangeStart, rangeEnd)
        ),
      ]);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      console.error(err);
      setError('Impossible de calculer tes recommandations. Réessaie plus tard.');
      setLoading(false);
      return;
    }

    if (requestIdRef.current !== requestId) return;

    const recentActions = rawActionRows.map(mapRecentAction).filter((a): a is RecentActionSummary => a !== null);
    const resolvableActions = rawActionRows.map(mapResolvableAction).filter((a): a is ResolvableAction => a !== null);

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

    if (requestIdRef.current === requestId) {
      setReport({ ...scopedReport, narratives: fullReport.narratives });
      setLoading(false);
    }

    // Persistance des recommandations (Lot "Suivi des annonces", voir
    // LOT_SUIVI_ANNONCES_SPEC.md) -- best effort, jamais attendue avant
    // setReport/setLoading ci-dessus : une erreur d'ecriture ne doit
    // jamais retarder ni casser l'affichage des insights. Sourcee sur
    // `fullReport.listingRecommendations` (TOUJOURS l'ensemble complet
    // des annonces, meme quand un compte precis est filtre a l'ecran) --
    // jamais `scopedReport`, qui ne couvrirait pas les annonces des
    // comptes non selectionnes et laisserait leurs episodes ouverts
    // orphelins.
    void syncRecommendationLog(user.id, listings, fullReport.listingRecommendations, groupByListingId(resolvableActions), new Date());
  }, [user, accounts, selectedAccountId]);

  // fetchInsights() ne depend que de [user, accounts, selectedAccountId] --
  // un refetch() manuel ne peut donc jamais se re-declencher lui-meme en
  // boucle (il ne modifie aucune de ces trois dependances).
  useEffect(() => {
    void fetchInsights();
  }, [fetchInsights]);

  return { report, loading, error, refetch: fetchInsights };
}
