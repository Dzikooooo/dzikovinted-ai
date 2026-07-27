import { useState } from 'react';
import { Lightbulb, Plus, ChevronUp, MessageSquareReply, Trash2, BadgeCheck } from 'lucide-react';
import { useSuggestions, type SuggestionWithVote } from '../../../hooks/useSuggestions';
import { useIsAdmin } from '../../../hooks/useIsAdmin';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { SuggestionCreateModal } from '../../../components/community/SuggestionCreateModal';
import { SuggestionReplyModal } from '../../../components/community/SuggestionReplyModal';
import type { SuggestionStatus } from '../../../lib/types';

const STATUS_STYLES: Record<SuggestionStatus, { label: string; bg: string; text: string }> = {
  open: { label: 'Nouvelle', bg: 'bg-white/10', text: 'text-gray-400' },
  planned: { label: 'Prévue', bg: 'bg-amber-400/10', text: 'text-amber-400' },
  in_progress: { label: 'En cours', bg: 'bg-neon-500/10', text: 'text-neon-500' },
  done: { label: 'Faite', bg: 'bg-emerald-400/10', text: 'text-emerald-400' },
  declined: { label: 'Refusée', bg: 'bg-red-500/10', text: 'text-red-400' },
};

// Seul onglet Communaute ou "Creer" est ouvert a tout le monde -- le
// bouton de creation n'est jamais conditionne a isAdmin ici (voir la
// migration suggestions). isAdmin ne controle QUE repondre/supprimer.
export function SuggestionsTab() {
  const isAdmin = useIsAdmin();
  const { suggestions, loading, error, createSuggestion, toggleVote, replyToSuggestion, deleteSuggestion } = useSuggestions();
  const [showCreate, setShowCreate] = useState(false);
  const [replyTarget, setReplyTarget] = useState<SuggestionWithVote | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <p className="text-sm text-gray-400">Propose une idée, vote pour celles des autres.</p>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-neon-500 text-black text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-neon-600 hover:shadow-[0_0_20px_rgba(255,196,0,0.3)] transition-all flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nouvelle suggestion
        </button>
      </div>

      {error && <ErrorBanner message={error} className="mb-6" />}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} shape="block" className="h-24" />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <EmptyState icon={Lightbulb} title="Aucune suggestion pour l'instant" description="Sois le premier à en proposer une." />
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => {
            const style = STATUS_STYLES[s.status];
            return (
              <div key={s.id} className="group relative flex gap-4 bg-surface border border-white/5 rounded-2xl p-4">
                <button
                  onClick={() => toggleVote(s.id, s.votedByMe)}
                  className={`flex flex-col items-center justify-center gap-0.5 w-14 h-16 rounded-xl border flex-shrink-0 transition-all ${
                    s.votedByMe
                      ? 'bg-neon-500/10 border-neon-500/40 text-neon-500'
                      : 'bg-dark-400 border-white/10 text-gray-400 hover:border-white/20 hover:text-white'
                  }`}
                  aria-pressed={s.votedByMe}
                  aria-label={s.votedByMe ? 'Retirer mon vote' : 'Voter pour cette suggestion'}
                >
                  <ChevronUp className="w-4 h-4" />
                  <span className="text-sm font-bold tabular-nums">{s.votes_count}</span>
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm text-gray-100">{s.title}</h3>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg flex-shrink-0 ${style.text} ${style.bg}`}>{style.label}</span>
                  </div>
                  {s.description && <p className="text-sm text-gray-500 mt-1">{s.description}</p>}

                  {s.admin_reply && (
                    <div className="mt-3 bg-neon-500/5 border border-neon-500/20 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <BadgeCheck className="w-3.5 h-3.5 text-neon-500" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-neon-500">Réponse de l'équipe</span>
                      </div>
                      <p className="text-sm text-gray-300 whitespace-pre-line">{s.admin_reply}</p>
                    </div>
                  )}
                </div>

                {isAdmin && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setReplyTarget(s)}
                      aria-label="Répondre"
                      className="p-1.5 rounded-lg hover:bg-white/5 text-gray-600 hover:text-gray-300 transition-all"
                    >
                      <MessageSquareReply className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteSuggestion(s.id)}
                      aria-label="Supprimer"
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <SuggestionCreateModal onClose={() => setShowCreate(false)} onCreate={createSuggestion} />}
      {replyTarget && <SuggestionReplyModal suggestion={replyTarget} onClose={() => setReplyTarget(null)} onReply={replyToSuggestion} />}
    </div>
  );
}
