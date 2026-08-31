import { useState } from 'react';
import { X, Clock, Eye, Heart, Lightbulb, Info, History as HistoryIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import VintedStatusBadge from '../ui/VintedStatusBadge';
import { OneScoreBar } from '../ui/OneScoreBar';
import { ListingTimeline } from './ListingTimeline';
import { useListingTimeline } from '../../hooks/useListingTimeline';
import { ignoreRecommendation } from '../../lib/recommendationLogSync';
import { formatRelativeSync } from '../../lib/formatRelativeTime';
import { formatEUR } from '../../lib/currency';
import { daysSince } from '../../lib/insights/math';
import type { Listing } from '../../lib/types';
import type { ListingRecommendationResult } from '../../lib/insights/types';

// Fiche annonce (Lot "Suivi des annonces", voir LOT_SUIVI_ANNONCES_SPEC.md
// §1) -- garde-fou explicite de la validation utilisateur, distingue
// STRICTEMENT deux notions qui ne doivent jamais se confondre a l'ecran :
//
//   - "recommandation actuelle"  : `recommendationState`, calculee EN
//     MEMOIRE par le Decision Engine (Lot 1) a chaque chargement -- toujours
//     affichee telle quelle, MEME si elle n'a jamais ete persistee (ex. un
//     'attendre'/'donnees_insuffisantes' qui ne cree jamais de ligne dans
//     listing_recommendation_log, voir recommendationLog.ts).
//   - "historique des recommandations" : `timeline`, alimentee par
//     listing_recommendation_log (uniquement les episodes 'action' passes
//     et l'episode ouvert actuel, s'il y en a un) -- une donnee PERSISTEE,
//     distincte de l'etat courant ci-dessus.
//
// Ces deux sources peuvent diverger legitimement (ex. la recommandation
// actuelle est 'attendre' alors que l'historique montre un episode
// 'baisser_prix' encore ouvert la veille, pas encore reevalue) -- ne
// jamais les fusionner en une seule affichage qui masquerait cet ecart.

interface ListingDetailModalProps {
  listing: Listing;
  score: number | null;
  recommendationState: ListingRecommendationResult | undefined;
  onClose: () => void;
  onEditListing: () => void;
}

function CurrentRecommendationSection({
  recommendationState,
  openRecommendationLogId,
  onIgnored,
  vintedUrl,
  onEditListing,
}: {
  recommendationState: ListingRecommendationResult | undefined;
  openRecommendationLogId: string | null;
  onIgnored: () => void;
  vintedUrl: string | null;
  onEditListing: () => void;
}) {
  const [ignoring, setIgnoring] = useState(false);

  async function handleIgnore() {
    if (!openRecommendationLogId || ignoring) return;
    setIgnoring(true);
    const { ok } = await ignoreRecommendation(openRecommendationLogId);
    setIgnoring(false);
    if (ok) onIgnored();
  }

  if (!recommendationState) return null;

  if (recommendationState.status === 'attendre') {
    return <p className="text-xs text-gray-500">{recommendationState.message}</p>;
  }

  if (recommendationState.status === 'donnees_insuffisantes') {
    return (
      <div className="flex items-start gap-2 text-gray-500">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p className="text-xs">{recommendationState.reason}</p>
      </div>
    );
  }

  if (recommendationState.status === 'recommandation_differee') {
    // text-amber-700, pas -400/80 (2026-08-31, contraste "Mes annonces") :
    // -400 seul mesurait deja 1.67:1 sur fond clair, une couche /80
    // l'aggrave encore -- voir [[project_dark_theme_color_leftovers]]. Meme
    // palier que ce MEME statut sur la carte (ListingCard.tsx, badge
    // "Action déjà tentée récemment"), incoherent auparavant entre les deux
    // ecrans.
    return (
      <div className="flex items-start gap-2 text-amber-700">
        <HistoryIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p className="text-xs">{recommendationState.reason}</p>
      </div>
    );
  }

  // status === 'action'
  return (
    <div>
      <div className="flex items-start gap-2">
        <Lightbulb className="w-4 h-4 text-neon-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">
            {recommendationState.message}
            {recommendationState.confidence === 'standard' && (
              <span className="ml-1.5 text-xs font-normal text-neon-500/70">· à confirmer</span>
            )}
          </p>
          <p className="text-xs text-gray-500 mt-1">{recommendationState.reason}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        {recommendationState.cta.type === 'open_vinted' && vintedUrl && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => window.open(vintedUrl, '_blank', 'noopener,noreferrer')}
          >
            Ouvrir sur Vinted
          </Button>
        )}
        {recommendationState.cta.type === 'edit_listing' && (
          <Button size="sm" variant="secondary" onClick={onEditListing}>
            Modifier l'annonce
          </Button>
        )}
        {openRecommendationLogId && (
          <button
            type="button"
            onClick={handleIgnore}
            disabled={ignoring}
            className="text-[11px] text-gray-500 hover:text-gray-500 disabled:opacity-50"
          >
            {ignoring ? 'Ignoré…' : 'Ignorer cette suggestion'}
          </button>
        )}
      </div>
    </div>
  );
}

export function ListingDetailModal({ listing, score, recommendationState, onClose, onEditListing }: ListingDetailModalProps) {
  const { timeline, loading, openRecommendationLogId, refetch } = useListingTimeline(listing);
  const [showTimeline, setShowTimeline] = useState(false);
  const age = Math.round(daysSince(listing.created_at, new Date()));

  return (
    <Modal onClose={onClose} size="lg">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-14 h-14 rounded-xl bg-dark-400 border border-gray-200 overflow-hidden flex-shrink-0">
            {listing.image_urls?.[0] && <img src={listing.image_urls[0]} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{listing.title}</p>
            <p className="text-xs text-gray-500">
              {listing.sku !== null && <span className="font-mono">#{listing.sku} · </span>}
              {[listing.brand, listing.category, listing.size].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Fermer" className="text-gray-500 hover:text-gray-700 flex-shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500 mb-3">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" /> En ligne depuis {Math.max(0, age)}j
        </span>
        <span>Synchro : {formatRelativeSync(listing.synced_at)}</span>
        {listing.vinted_status && <VintedStatusBadge status={listing.vinted_status} />}
        <span className="flex items-center gap-1">
          <Eye className="w-3 h-3" /> {listing.views ?? '—'}
        </span>
        <span className="flex items-center gap-1">
          <Heart className="w-3 h-3" /> {listing.favourites ?? '—'}
        </span>
        <span className="font-semibold text-gray-800">{formatEUR(listing.price)}</span>
      </div>

      {score !== null && <OneScoreBar score={score} className="mb-4" />}

      <div className="bg-surface-alt border border-gray-200 rounded-xl p-4 mb-4">
        <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-2">Recommandation actuelle</p>
        <CurrentRecommendationSection
          recommendationState={recommendationState}
          openRecommendationLogId={openRecommendationLogId}
          onIgnored={refetch}
          vintedUrl={listing.vinted_url}
          onEditListing={onEditListing}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowTimeline((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800"
      >
        {showTimeline ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Historique de l'annonce
      </button>

      {showTimeline && (
        <div className="mt-3">
          <ListingTimeline timeline={timeline} loading={loading} />
        </div>
      )}
    </Modal>
  );
}
