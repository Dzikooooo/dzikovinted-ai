import { useState } from 'react';
import { X, Activity, Clock, AlertTriangle, Search, History } from 'lucide-react';
import { useVintedAccountFilter } from '../../contexts/VintedAccountFilterContext';
import { useActionHistory, useActionLogEntries, type ActionHistoryRow } from '../../hooks/useActionHistory';
import { ACTION_KIND_LABELS, ACTION_KIND_ICONS } from '../../lib/actions/labels';
import type { ActionPeriod } from '../../lib/actions/periodRange';
import type { ActionKind } from '../../lib/actions/types';
import AccountAvatar from '../../components/ui/AccountAvatar';
import ActionStatusBadge from '../../components/actions/ActionStatusBadge';
import ActionStepTimeline, { type ActionStepTimelineRow } from '../../components/actions/ActionStepTimeline';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { FilterPill } from '../../components/ui/FilterPill';
import { SearchInput } from '../../components/ui/SearchInput';
import Opportunities from './Opportunities';

const PERIOD_FILTERS: { key: ActionPeriod; label: string }[] = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week', label: 'Cette semaine' },
  { key: 'month', label: 'Ce mois' },
  { key: 'all', label: 'Tout' },
];

const RESULT_FILTERS: { key: 'all' | 'success' | 'error'; label: string }[] = [
  { key: 'all', label: 'Tous les résultats' },
  { key: 'success', label: 'Succès' },
  { key: 'error', label: 'Erreurs' },
];

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days}j`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms} ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface ActionsPageProps {
  initialSelectedActionId?: string;
}

type NichesTab = 'opportunities' | 'history';

// "Niches" (ex-Centre des Actions) fusionne desormais Opportunites -- demande
// produit 2026-07-31 : les deux concepts sont deja lies (un scan
// d'opportunites est lui-meme une action loggee dans l'historique
// ci-dessous), plutot que deux pages separees dans la sidebar. Un simple
// selecteur d'onglet au-dessus, chaque onglet garde son propre contenu tel
// quel (aucune logique interne modifiee).
export default function ActionsPage({ initialSelectedActionId }: ActionsPageProps) {
  // Arriver ici avec un actionId precis (depuis "Voir dans Niches" ailleurs
  // dans l'app) signifie toujours "montre-moi cette action" -> l'onglet
  // Historique, jamais Opportunites.
  const [tab, setTab] = useState<NichesTab>(initialSelectedActionId ? 'history' : 'opportunities');
  const [historyInitialId, setHistoryInitialId] = useState<string | undefined>(initialSelectedActionId);

  return (
    <div>
      <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 max-w-7xl mx-auto flex gap-1">
        <FilterPill label="Opportunités" icon={<Search className="w-3.5 h-3.5" />} active={tab === 'opportunities'} onClick={() => setTab('opportunities')} />
        <FilterPill label="Historique des actions" icon={<History className="w-3.5 h-3.5" />} active={tab === 'history'} onClick={() => setTab('history')} />
      </div>

      {tab === 'opportunities' && (
        <Opportunities
          onViewAction={(actionId) => {
            setHistoryInitialId(actionId);
            setTab('history');
          }}
        />
      )}
      {tab === 'history' && <NichesHistoryTab initialSelectedActionId={historyInitialId} />}
    </div>
  );
}

function NichesHistoryTab({ initialSelectedActionId }: ActionsPageProps) {
  const { selectedAccountId } = useVintedAccountFilter();
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<ActionPeriod>('all');
  const [kind, setKind] = useState<ActionKind | 'all'>('all');
  const [result, setResult] = useState<'all' | 'success' | 'error'>('all');
  const [selectedActionId, setSelectedActionId] = useState<string | null>(initialSelectedActionId ?? null);

  const { rows, counts, hasMore, loading, loadingMore, error, loadMore } = useActionHistory({
    search,
    period,
    kind,
    result,
  });
  const selectedRow = rows.find((r) => r.id === selectedActionId) ?? null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={
          !loading && counts.total > 0
            ? <>{counts.total} action{counts.total !== 1 ? 's' : ''} <span className="text-neon-500">enregistrée{counts.total !== 1 ? 's' : ''}</span></>
            : 'Historique des actions'
        }
        description="Tout ce qui s'exécute sur tes comptes Vinted, en direct et dans le temps."
      />

      {error && <ErrorBanner message={error} className="mb-6" />}

      {counts.total > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard label="Actions" value={counts.total} />
          <StatCard label="Réussies" value={counts.success} highlight tone="positive" />
          <StatCard label="Erreurs" value={counts.error} highlight tone="negative" />
        </div>
      )}

      <SearchInput
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher une action ou une annonce..."
        className="mb-4"
      />

      <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
        {PERIOD_FILTERS.map(({ key: k, label }) => (
          <FilterPill key={k} label={label} active={period === k} onClick={() => setPeriod(k)} />
        ))}
      </div>

      {/* Boutons segmentes plutot qu'un <select> natif -- meme pattern que
          les filtres periode/resultat ci-dessus et que tous les autres
          filtres a choix du produit (Stock, Opportunites, Watchlist,
          Comptabilite), seul endroit qui utilisait encore un select brut. */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        <FilterPill label="Tous les types" active={kind === 'all'} onClick={() => setKind('all')} />
        {(Object.keys(ACTION_KIND_LABELS) as ActionKind[]).map((k) => (
          <FilterPill key={k} label={ACTION_KIND_LABELS[k]} active={kind === k} onClick={() => setKind(k)} />
        ))}
      </div>

      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {RESULT_FILTERS.map(({ key: k, label }) => (
          <FilterPill key={k} label={label} active={result === k} onClick={() => setResult(k)} />
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} shape="block" className="h-20" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Aucune action"
          description="Publie ou modifie une annonce pour voir l'historique ici."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3">
            {rows.map((row) => (
              <ActionRow
                key={row.id}
                row={row}
                showAccount={selectedAccountId === 'all'}
                onClick={() => setSelectedActionId(row.id)}
              />
            ))}
          </div>
          {hasMore && (
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              className="mt-4"
              loading={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? 'Chargement...' : 'Charger plus'}
            </Button>
          )}
        </>
      )}

      {selectedRow && <ActionDetailPanel row={selectedRow} onClose={() => setSelectedActionId(null)} />}
    </div>
  );
}

function ActionRow({
  row,
  showAccount,
  onClick,
}: {
  row: ActionHistoryRow;
  showAccount: boolean;
  onClick: () => void;
}) {
  const Icon = ACTION_KIND_ICONS[row.kind];
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-surface border border-gray-200 rounded-2xl p-4 hover:border-gray-200 transition-all"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {row.listingImageUrl ? (
            <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border border-gray-200">
              <img src={row.listingImageUrl} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-12 h-12 bg-neon-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-neon-500/70" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm text-gray-900 truncate">{ACTION_KIND_LABELS[row.kind]}</p>
              <ActionStatusBadge status={row.status} />
            </div>
            {row.listingTitle && <p className="text-xs text-gray-500 mt-1 truncate">{row.listingTitle}</p>}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {showAccount && row.vintedAccountLabel && (
                <span className="flex items-center gap-1 text-[10px] text-gray-500">
                  <AccountAvatar label={row.vintedAccountLabel} size="sm" />
                  {row.vintedAccountLabel}
                </span>
              )}
              <span className="flex items-center gap-1 text-[10px] text-gray-500">
                <Clock className="w-2.5 h-2.5" />
                {formatRelativeTime(row.startedAt)}
              </span>
              {row.status === 'error' && row.errorMessage && (
                <span className="flex items-center gap-1 text-[10px] text-red-700">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  {row.errorMessage}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Durée</p>
          <p className="text-sm font-bold text-gray-800">{formatDuration(row.durationMs)}</p>
        </div>
      </div>
    </button>
  );
}

function ActionDetailPanel({ row, onClose }: { row: ActionHistoryRow; onClose: () => void }) {
  const { entries } = useActionLogEntries(row.id);
  const Icon = ACTION_KIND_ICONS[row.kind];

  const timelineRows: ActionStepTimelineRow[] = entries.map((entry) => ({
    key: entry.id,
    label: entry.message,
    state: 'done',
    timestamp: formatTime(entry.at),
  }));

  return (
    <Modal onClose={onClose} size="lg" className="max-h-[85vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-neon-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-neon-500" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-black truncate">{ACTION_KIND_LABELS[row.kind]}</h2>
            {row.listingTitle && <p className="text-xs text-gray-500 truncate">{row.listingTitle}</p>}
          </div>
        </div>
        <button onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-gray-100 flex-shrink-0">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-5">
        <ActionStatusBadge status={row.status} />
        <span className="text-[10px] text-gray-500">Durée : {formatDuration(row.durationMs)}</span>
        {row.vintedAccountLabel && (
          <span className="flex items-center gap-1 text-[10px] text-gray-500">
            <AccountAvatar label={row.vintedAccountLabel} size="sm" />
            {row.vintedAccountLabel}
          </span>
        )}
      </div>

      {row.status === 'error' && row.errorMessage && (
        <div className="mb-5 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{row.errorMessage}</p>
        </div>
      )}

      <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Journal</h3>
      {timelineRows.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune entrée pour le moment.</p>
      ) : (
        <ActionStepTimeline rows={timelineRows} />
      )}
    </Modal>
  );
}
