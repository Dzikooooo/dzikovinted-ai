import { Check, Loader2 } from 'lucide-react';

export interface ActionStepTimelineRow {
  key: string;
  label: string;
  state: 'done' | 'active' | 'pending';
  timestamp?: string;
}

// Rendu generique de checklist d'etapes (✓ neon / ⏳ spinner / ○ vide),
// partage entre le mode "live" (PublishProgressModal, pendant l'execution)
// et le mode "historique" (Centre des Actions, rejoue action_log_entries) -
// ce composant ne connait ni ActionStep ni PublishStep, seulement des
// lignes deja calculees par l'appelant. Evite de dupliquer la logique de
// rendu entre les deux usages.
export default function ActionStepTimeline({ rows }: { rows: ActionStepTimelineRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-3">
          {row.state === 'done' ? (
            <Check className="w-4 h-4 text-neon-500 flex-shrink-0" />
          ) : row.state === 'active' ? (
            <Loader2 className="w-4 h-4 text-neon-500 flex-shrink-0 animate-spin" />
          ) : (
            <div className="w-4 h-4 rounded-full border border-white/10 flex-shrink-0" />
          )}
          <span
            className={`text-sm ${
              row.state === 'active' ? 'text-gray-100 font-semibold' : row.state === 'done' ? 'text-gray-400' : 'text-gray-600'
            }`}
          >
            {row.label}
          </span>
          {row.timestamp && <span className="text-[10px] text-gray-600 ml-auto flex-shrink-0">{row.timestamp}</span>}
        </div>
      ))}
    </div>
  );
}
