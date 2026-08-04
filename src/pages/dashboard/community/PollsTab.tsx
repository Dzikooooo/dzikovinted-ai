import { useState } from 'react';
import { BarChart2, Plus, Lock, Unlock, Trash2, Check } from 'lucide-react';
import { usePolls } from '../../../hooks/usePolls';
import { useIsAdmin } from '../../../hooks/useIsAdmin';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { ProgressBarRow } from '../../../components/ui/ProgressBar';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { PollCreateModal } from '../../../components/community/PollCreateModal';

export function PollsTab() {
  const isAdmin = useIsAdmin();
  const { polls, loading, error, vote, retractVote, createPoll, setPollStatus, deletePoll } = usePolls();
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <p className="text-sm text-gray-400">Donne ton avis, en direct.</p>
        {isAdmin && (
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowForm(true)}>
            Nouveau sondage
          </Button>
        )}
      </div>

      {error && <ErrorBanner message={error} className="mb-6" />}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} shape="block" className="h-40" />
          ))}
        </div>
      ) : polls.length === 0 ? (
        <EmptyState icon={BarChart2} title="Aucun sondage pour l'instant" description="Les prochains sondages ResellOS apparaîtront ici." />
      ) : (
        <div className="space-y-4">
          {polls.map((poll) => {
            const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes_count, 0);
            const showResults = poll.status === 'closed' || poll.myOptionId !== null;
            return (
              <div key={poll.id} className="group relative bg-surface border border-white/5 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4 mb-1">
                  <h3 className="font-bold text-gray-100 pr-16">{poll.question}</h3>
                  <Badge label={poll.status === 'open' ? 'Ouvert' : 'Clos'} tone={poll.status === 'open' ? 'brand' : 'neutral'} />
                </div>
                {poll.description && <p className="text-sm text-gray-500 mb-4">{poll.description}</p>}

                {isAdmin && (
                  <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setPollStatus(poll.id, poll.status === 'open' ? 'closed' : 'open')}
                      aria-label={poll.status === 'open' ? 'Clôturer' : 'Rouvrir'}
                      className="p-1.5 rounded-lg hover:bg-white/5 text-gray-600 hover:text-gray-300 transition-all"
                    >
                      {poll.status === 'open' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => deletePoll(poll.id)}
                      aria-label="Supprimer"
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {showResults ? (
                  <div className="space-y-2.5 mt-4">
                    {poll.options.map((opt) => (
                      <div key={opt.id} className="flex items-center gap-2">
                        {poll.myOptionId === opt.id && <Check className="w-3.5 h-3.5 text-neon-500 flex-shrink-0" />}
                        <div className="flex-1">
                          <ProgressBarRow
                            label={opt.label}
                            value={`${opt.votes_count}`}
                            fraction={totalVotes > 0 ? opt.votes_count / totalVotes : 0}
                            labelClassName="w-32"
                          />
                        </div>
                      </div>
                    ))}
                    <p className="text-[10px] font-mono text-gray-600 mt-3">
                      {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
                    </p>
                    {poll.status === 'open' && poll.myOptionId && (
                      <button onClick={() => retractVote(poll.id)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors mt-1">
                        Retirer mon vote
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                    {poll.options.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => vote(poll.id, opt.id)}
                        className="text-left px-4 py-2.5 rounded-xl text-sm font-medium bg-dark-400 border border-white/10 text-gray-300 hover:border-neon-500/40 hover:text-white transition-all"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && <PollCreateModal onClose={() => setShowForm(false)} onCreate={createPoll} />}
    </div>
  );
}
