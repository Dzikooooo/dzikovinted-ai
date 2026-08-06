import { supabase } from './supabase';
import { getSyncFreshnessTier } from './insights/dataSufficiency';
import { diffRecommendationLog } from './insights/recommendationLog';
import type { OpenRecommendationLogRow, RecommendationLogUpdate, ResolvableAction } from './insights/recommendationLog';
import type { ListingRecommendationResult } from './insights/types';
import type { Listing } from './types';

// Ecriture de listing_recommendation_log (Lot "Suivi des annonces", voir
// LOT_SUIVI_ANNONCES_SPEC.md) -- deliberement HORS de src/lib/insights/,
// qui reste une fonction pure sans acces reseau/base (invariant du Lot 1,
// jamais casse ici). Ce module fait le pont : lit l'etat ouvert existant,
// appelle diffRecommendationLog (pure), applique le resultat.
//
// Appele en "best effort" depuis useInsights.ts (jamais attendu avant
// setReport/setLoading) : une erreur ici ne doit jamais empecher
// l'affichage des insights, seulement etre journalisee.

interface RawOpenRow {
  id: string;
  listing_id: string;
  kind: string;
  confidence: string;
  reason: string;
  cta_type: string;
  shown_at: string;
  last_confirmed_at: string;
  consecutive_misses: number;
  first_miss_at: string | null;
}

function mapOpenRow(row: RawOpenRow): OpenRecommendationLogRow {
  return {
    id: row.id,
    listingId: row.listing_id,
    kind: row.kind as OpenRecommendationLogRow['kind'],
    confidence: row.confidence as OpenRecommendationLogRow['confidence'],
    reason: row.reason,
    ctaType: row.cta_type as OpenRecommendationLogRow['ctaType'],
    shownAt: row.shown_at,
    lastConfirmedAt: row.last_confirmed_at,
    consecutiveMisses: row.consecutive_misses,
    firstMissAt: row.first_miss_at,
  };
}

async function applyUpdate(update: RecommendationLogUpdate): Promise<void> {
  if (update.op === 'heartbeat') {
    const payload: Record<string, unknown> = { last_confirmed_at: update.now, consecutive_misses: 0, first_miss_at: null };
    if (update.confidence) payload.confidence = update.confidence;
    if (update.reason) payload.reason = update.reason;
    const { error } = await supabase.from('listing_recommendation_log').update(payload).eq('id', update.id);
    if (error) console.error('[ResellOS] listing_recommendation_log heartbeat a echoue', error.message);
    return;
  }
  if (update.op === 'increment_miss') {
    const { error } = await supabase
      .from('listing_recommendation_log')
      .update({ consecutive_misses: update.consecutiveMisses, first_miss_at: update.firstMissAt })
      .eq('id', update.id);
    if (error) console.error('[ResellOS] listing_recommendation_log increment_miss a echoue', error.message);
    return;
  }
  // op === 'resolve'
  const { error } = await supabase
    .from('listing_recommendation_log')
    .update({ resolved_at: update.resolvedAt, resolution: update.resolution, resolution_action_id: update.resolutionActionId ?? null })
    .eq('id', update.id);
  if (error) console.error('[ResellOS] listing_recommendation_log resolve a echoue', error.message);
}

export async function syncRecommendationLog(
  userId: string,
  listings: Listing[],
  listingRecommendations: Map<string, ListingRecommendationResult>,
  resolvableActionsByListingId: Map<string, ResolvableAction[]>,
  now: Date
): Promise<void> {
  try {
    const { data: openRows, error: openRowsError } = await supabase
      .from('listing_recommendation_log')
      .select('id, listing_id, kind, confidence, reason, cta_type, shown_at, last_confirmed_at, consecutive_misses, first_miss_at')
      .eq('user_id', userId)
      .is('resolved_at', null);
    if (openRowsError) {
      console.error('[ResellOS] Lecture des episodes de recommandation ouverts a echoue', openRowsError.message);
      return;
    }

    const openRowByListingId = new Map<string, OpenRecommendationLogRow>(
      ((openRows ?? []) as RawOpenRow[]).map((r) => [r.listing_id, mapOpenRow(r)])
    );

    const freshnessByListingId = new Map(
      listings.map((l) => [l.id, getSyncFreshnessTier(l, now)] as const)
    );

    const listingIds = new Set<string>([...listingRecommendations.keys(), ...openRowByListingId.keys()]);

    const diff = diffRecommendationLog(
      Array.from(listingIds),
      listingRecommendations,
      freshnessByListingId,
      openRowByListingId,
      resolvableActionsByListingId,
      now
    );

    for (const ins of diff.inserts) {
      const { error } = await supabase.from('listing_recommendation_log').insert({
        user_id: userId,
        listing_id: ins.listingId,
        kind: ins.kind,
        confidence: ins.confidence,
        reason: ins.reason,
        cta_type: ins.ctaType,
        shown_at: ins.now,
        last_confirmed_at: ins.now,
      });
      if (!error) continue;

      // Conflit sur l'index unique partiel (listing_id) where resolved_at
      // is null : un autre onglet/refresh a deja ouvert cet episode entre
      // notre lecture et notre ecriture -- pas une erreur, on rattrape en
      // heartbeat plutot que de planter la synchro silencieuse (garde-fou
      // "tout conflit 23505 doit etre traite proprement sans erreur
      // client"). Si le kind concurrent differe du notre, on laisse le
      // prochain refresh reconcilier naturellement (diffRecommendationLog
      // est idempotent) plutot que de forcer un etat incoherent.
      if (error.code === '23505') {
        const { data: concurrent } = await supabase
          .from('listing_recommendation_log')
          .select('id, kind')
          .eq('listing_id', ins.listingId)
          .is('resolved_at', null)
          .maybeSingle();
        if (concurrent && concurrent.kind === ins.kind) {
          await supabase
            .from('listing_recommendation_log')
            .update({ last_confirmed_at: ins.now, confidence: ins.confidence, reason: ins.reason, consecutive_misses: 0, first_miss_at: null })
            .eq('id', concurrent.id);
        }
        continue;
      }
      console.error('[ResellOS] Ouverture d\'un episode de recommandation a echoue', error.message);
    }

    for (const upd of diff.updates) {
      await applyUpdate(upd);
    }
  } catch (err) {
    console.error('[ResellOS] Synchronisation de listing_recommendation_log a echoue', err);
  }
}

// 'ignoree' est le SEUL etat de resolution qui exige une action explicite
// de l'utilisateur (voir recommendationLog.ts) -- jamais inferee, toujours
// ecrite depuis un vrai clic (fiche annonce, "Ignorer cette suggestion").
// Le `.is('resolved_at', null)` protege contre un double-clic/une course
// avec un refresh qui aurait deja resolu la ligne autrement entre-temps :
// dans ce cas la mise a jour ne touche simplement aucune ligne (0 affectee,
// pas une erreur) plutot que d'ecraser une resolution deja actee.
export async function ignoreRecommendation(logId: string): Promise<{ ok: boolean }> {
  const { error, count } = await supabase
    .from('listing_recommendation_log')
    .update({ resolved_at: new Date().toISOString(), resolution: 'ignoree' }, { count: 'exact' })
    .eq('id', logId)
    .is('resolved_at', null);
  if (error) {
    console.error("[ResellOS] Marquage 'ignoree' a echoue", error.message);
    return { ok: false };
  }
  return { ok: (count ?? 0) > 0 };
}
