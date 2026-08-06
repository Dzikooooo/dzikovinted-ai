import { useState } from 'react';
import { Eye, Heart, Tag, RefreshCw, Lightbulb, CheckCircle2, XCircle, Clock as ClockIcon, RotateCcw, ShoppingBag, ChevronDown, ChevronUp } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { ACTION_KIND_LABELS } from '../../lib/actions/labels';
import { formatEUR } from '../../lib/currency';
import type { ListingTimeline as ListingTimelineData, TimelineEvent } from '../../lib/timeline';
import type { ActionKind } from '../../lib/actions/types';

// Presentation pure de la timeline (Lot "Suivi des annonces", voir
// LOT_SUIVI_ANNONCES_SPEC.md §7.2/7.3) -- ne fait aucun fetch, consomme
// uniquement ce que useListingTimeline lui fournit deja assemble/agrege.
// Garde-fou explicite : les details techniques (etapes d'une action)
// restent dans une section secondaire repliee, jamais dans le flux
// principal -- voir la ligne 'action' ci-dessous.

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDayTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const RESOLUTION_LABELS: Record<'suivie' | 'ignoree' | 'expiree' | 'remplacee', string> = {
  suivie: 'Recommandation suivie',
  ignoree: 'Recommandation ignorée',
  expiree: 'Recommandation expirée',
  remplacee: 'Recommandation remplacée',
};

const RESOLUTION_ICONS: Record<'suivie' | 'ignoree' | 'expiree' | 'remplacee', typeof CheckCircle2> = {
  suivie: CheckCircle2,
  ignoree: XCircle,
  expiree: ClockIcon,
  remplacee: RotateCcw,
};

function EngagementPeriodRow({ event }: { event: Extract<TimelineEvent, { type: 'engagement_period' }> }) {
  const isSingle = event.from === event.to;
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
        <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
      </div>
      <div>
        <p className="text-xs text-gray-500">
          {isSingle ? `Synchronisation initiale — ${formatDay(event.to)}` : `${formatDay(event.from)} → ${formatDay(event.to)}`}
          {!isSingle && <span className="text-gray-700"> · {event.snapshotCount} synchro{event.snapshotCount > 1 ? 's' : ''}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" /> {event.views.from ?? '—'} → {event.views.to ?? '—'}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="w-3 h-3" /> {event.favourites.from ?? '—'} → {event.favourites.to ?? '—'}
          </span>
          {event.price.changed && (
            <span className="flex items-center gap-1 text-amber-400/80">
              <Tag className="w-3 h-3" /> {event.price.from !== null ? formatEUR(event.price.from) : '—'} → {event.price.to !== null ? formatEUR(event.price.to) : '—'}
            </span>
          )}
          {event.status.changed && (
            <span className="text-gray-500">
              Statut : {event.status.from ?? 'inconnu'} → {event.status.to ?? 'inconnu'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionRow({ event }: { event: Extract<TimelineEvent, { type: 'action' }> }) {
  const [open, setOpen] = useState(false);
  const label = ACTION_KIND_LABELS[event.kind as ActionKind] ?? event.kind;
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-neon-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Tag className="w-3.5 h-3.5 text-neon-500" />
      </div>
      <div className="flex-1">
        <p className="text-sm text-gray-200">{label}</p>
        <p className="text-xs text-gray-500">{formatDayTime(event.at)}</p>
        {event.technicalDetail.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-400 mt-1"
            >
              {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Détails techniques
            </button>
            {open && (
              <ul className="mt-1.5 space-y-1 border-l border-white/5 pl-3">
                {event.technicalDetail.map((entry, i) => (
                  <li key={i} className="text-[11px] text-gray-600">
                    {entry.message} <span className="text-gray-700">· {formatDayTime(entry.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RecommendationOpenedRow({ event }: { event: Extract<TimelineEvent, { type: 'recommendation_opened' }> }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-neon-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Lightbulb className="w-3.5 h-3.5 text-neon-500" />
      </div>
      <div>
        <p className="text-sm text-gray-200">Recommandation émise ({event.confidence === 'haute' ? 'confiance haute' : 'à confirmer'})</p>
        <p className="text-xs text-gray-500">{formatDayTime(event.at)}</p>
        <p className="text-xs text-gray-600 mt-0.5">{event.reason}</p>
      </div>
    </div>
  );
}

// Affiche l'evolution observee apres une recommandation SUIVIE (Lot "Suivi
// des annonces" §4/§6) -- jamais une causalite affirmee, toujours "resultat
// non mesurable" quand les snapshots avant/apres manquent plutot qu'une
// phrase fabriquee. Rien n'est affiche pour les autres resolutions
// (ignoree/expiree/remplacee), qui n'ont par definition aucune action a
// mesurer.
function OutcomeSection({ outcome }: { outcome: NonNullable<Extract<TimelineEvent, { type: 'recommendation_resolved' }>['outcome']> }) {
  const measurableWindows = outcome.windows.filter((w) => w.measurable && w.summary);
  return (
    <div className="mt-1 space-y-0.5">
      {measurableWindows.length === 0 ? (
        <p className="text-xs text-gray-600">Résultat non mesurable (pas assez de synchronisations autour de cette action).</p>
      ) : (
        measurableWindows.map((w) => (
          <p key={w.days} className="text-xs text-gray-500">
            {w.summary}
          </p>
        ))
      )}
      {outcome.soldAfterDays !== null && (
        <p className="text-xs text-green-400/80">Vendue {outcome.soldAfterDays}j après cette action.</p>
      )}
    </div>
  );
}

function RecommendationResolvedRow({ event }: { event: Extract<TimelineEvent, { type: 'recommendation_resolved' }> }) {
  const Icon = RESOLUTION_ICONS[event.resolution];
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-gray-500" />
      </div>
      <div>
        <p className="text-sm text-gray-300">{RESOLUTION_LABELS[event.resolution]}</p>
        <p className="text-xs text-gray-500">{formatDayTime(event.at)}</p>
        {event.outcome && <OutcomeSection outcome={event.outcome} />}
      </div>
    </div>
  );
}

function SaleRow({ event }: { event: Extract<TimelineEvent, { type: 'sale' }> }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <ShoppingBag className="w-3.5 h-3.5 text-green-400" />
      </div>
      <div>
        <p className="text-sm text-green-300">Vendue{event.soldPrice !== null ? ` — ${formatEUR(event.soldPrice)}` : ''}</p>
        <p className="text-xs text-gray-500">{formatDay(event.at)}</p>
      </div>
    </div>
  );
}

interface ListingTimelineProps {
  timeline: ListingTimelineData | null;
  loading: boolean;
}

export function ListingTimeline({ timeline, loading }: ListingTimelineProps) {
  if (loading) {
    return <p className="text-xs text-gray-600">Chargement de l'historique…</p>;
  }

  if (!timeline || timeline.events.length === 0) {
    return (
      <EmptyState
        icon={ClockIcon}
        title="Aucun historique pour l'instant"
        description="Reviens après une prochaine synchronisation pour voir l'évolution de cette annonce."
      />
    );
  }

  return (
    <div>
      {timeline.earliestDataAt && (
        <p className="text-[11px] text-gray-600 mb-3">Historique disponible depuis le {formatDay(timeline.earliestDataAt)}</p>
      )}
      <div className="space-y-4">
        {timeline.events.map((event, i) => {
          switch (event.type) {
            case 'engagement_period':
              return <EngagementPeriodRow key={i} event={event} />;
            case 'action':
              return <ActionRow key={i} event={event} />;
            case 'recommendation_opened':
              return <RecommendationOpenedRow key={i} event={event} />;
            case 'recommendation_resolved':
              return <RecommendationResolvedRow key={i} event={event} />;
            case 'sale':
              return <SaleRow key={i} event={event} />;
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}
