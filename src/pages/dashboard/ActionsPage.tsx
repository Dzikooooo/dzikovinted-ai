import { useState } from 'react';
import { Search, X, Activity, Clock, AlertTriangle } from 'lucide-react';
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

export default function ActionsPage({ initialSelectedActionId }: ActionsPageProps) {
  const { selectedAccountId } = useVintedAccountFilter();
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<ActionPeriod>('all');
  const [kind, setKind] = useState<ActionKind | 'all'>('all');
  const [result, setResult] = useState<'all' | 'success' | 'error'>('all');
  const [selectedActionId, setSelectedActionId] = useState<string | null>(initialSelectedActionId ?? null);

  const { rows, loading, error } = useActionHistory({ search, period, kind, result });
  const selectedRow = rows.find((r) => r.id === selectedActionId) ?? null;

  const total = rows.length;
  const successCount = rows.filter((r) => r.status === 'success').length;
  const errorCount = rows.filter((r) => r.status === 'error').length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black mb-1">Centre des Actions</h1>
        <p className="text-gray-400 text-sm">
          Tout ce qui s'exécute sur tes comptes Vinted, en direct et dans le temps.
        </p>
      </div>

      {error && <ErrorBanner message={error} className="mb-6" />}

      {total > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-surface border border-white/5 rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Actions</p>
            <p className="text-xl font-black">{total}</p>
          </div>
          <div className="bg-surface border border-white/5 rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Réussies</p>
            <p className="text-xl font-black text-neon-500">{successCount}</p>
          </div>
          <div className="bg-surface border border-white/5 rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Erreurs</p>
            <p className="text-xl font-black text-red-400">{errorCount}</p>
          </div>
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une action ou une annonce..."
          className="w-full bg-surface border border-white/8 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-neon-500/30 focus:ring-2 focus:ring-neon-500/20"
        />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {PERIOD_FILTERS.map(({ key: k, label }) => (
            <button
              key={k}
              onClick={() => setPeriod(k)}
              className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all flex-shrink-0 ${
                period === k ? 'bg-neon-500/10 text-neon-500 font-medium' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ActionKind | 'all')}
          className="bg-dark-400 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-neon-500/30"
        >
          <option value="all">Tous les types</option>
          {(Object.keys(ACTION_KIND_LABELS) as ActionKind[]).map((k) => (
            <option key={k} value={k}>
              {ACTION_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {RESULT_FILTERS.map(({ key: k, label }) => (
          <button
            key={k}
            onClick={() => setResult(k)}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all flex-shrink-0 ${
              result === k ? 'bg-neon-500/10 text-neon-500 font-medium' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            {label}
          </button>
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
      className="w-full text-left bg-surface border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {row.listingImageUrl ? (
            <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border border-white/10">
              <img src={row.listingImageUrl} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-12 h-12 bg-neon-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-neon-500/70" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm text-gray-100 truncate">{ACTION_KIND_LABELS[row.kind]}</p>
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
                <span className="flex items-center gap-1 text-[10px] text-red-400">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  {row.errorMessage}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Durée</p>
          <p className="text-sm font-bold text-gray-200">{formatDuration(row.durationMs)}</p>
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
        <button onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-white/5 flex-shrink-0">
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
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{row.errorMessage}</p>
        </div>
      )}

      <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Journal</h3>
      {timelineRows.length === 0 ? (
        <p className="text-sm text-gray-600">Aucune entrée pour le moment.</p>
      ) : (
        <ActionStepTimeline rows={timelineRows} />
      )}
    </Modal>
  );
}
