import { Check, Sparkles } from 'lucide-react';

const LOADING_MESSAGES = [
  { text: 'Analyse du vetement...', sub: 'Detection des caracteristiques visuelles' },
  { text: 'Detection de la marque...', sub: 'Identification du logo et des etiquettes' },
  { text: 'Estimation du prix...', sub: 'Comparaison avec le marche Vinted' },
  { text: 'Generation SEO...', sub: 'Optimisation titre, description et mots-cles' },
];

interface LoadingStepProps {
  loadingStep: number;
}

export function LoadingStep({ loadingStep }: LoadingStepProps) {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-8">
      <div className="text-center max-w-sm w-full">
        <div className="relative w-28 h-28 mx-auto mb-10">
          <div className="absolute inset-0 rounded-full border-2 border-neon-500/20 animate-spin" style={{ animationDuration: '3s' }} />
          <div className="absolute inset-3 rounded-full border-2 border-dashed border-neon-500/40 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '2s' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-neon-500 animate-pulse" />
          </div>
        </div>
        <h2 className="text-xl font-black mb-2">L'IA analyse ton vetement</h2>
        <p className="text-gray-500 text-sm mb-8">Quelques secondes...</p>
        <div className="space-y-3">
          {LOADING_MESSAGES.map(({ text, sub }, i) => {
            const isActive = i === loadingStep;
            const isDone = i < loadingStep;
            return (
              <div key={text} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-500 ${isActive ? 'bg-neon-500/10 border-neon-500/30 shadow-[0_0_20px_rgba(255,196,0,0.1)]' : isDone ? 'bg-neon-500/5 border-neon-500/10' : 'bg-surface border-white/5'}`}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-neon-500 animate-pulse' : isDone ? 'bg-neon-500/60' : 'bg-gray-700'}`} />
                <div className="flex-1 text-left">
                  <span className={`text-sm block ${isActive ? 'text-neon-500 font-medium' : isDone ? 'text-gray-400' : 'text-gray-600'}`}>{text}</span>
                  {isActive && <span className="text-[10px] text-neon-500/50 block mt-0.5">{sub}</span>}
                </div>
                {isDone && <Check className="w-4 h-4 text-neon-500/70 ml-auto" />}
                {isActive && (
                  <div className="ml-auto flex gap-1">
                    {[0, 200, 400].map((d) => <div key={d} className="w-1 h-1 rounded-full bg-neon-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
