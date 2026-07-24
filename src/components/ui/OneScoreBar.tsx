// Composant partage pour le score par annonce (StockPage.tsx et
// Opportunities.tsx affichaient chacun leur propre implementation du meme
// score sous un nom different -- "Score IA" / "Opportunity Score", voir
// src/lib/insights/scoring.ts pour le calcul reel : additif, transparent,
// base neutre 50, jamais un score "IA" opaque). Un seul nom, "One Score",
// un seul composant.
interface OneScoreBarProps {
  score: number;
  size?: 'sm' | 'md';
  className?: string;
}

export function OneScoreBar({ score, size = 'sm', className = '' }: OneScoreBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const labelSize = size === 'sm' ? 'text-[10px]' : 'text-[11px]';
  const barHeight = size === 'sm' ? 'h-1' : 'h-1.5';
  const labelGap = size === 'sm' ? 'mb-1' : 'mb-1.5';

  return (
    <div className={className}>
      <div className={`flex items-center justify-between ${labelSize} text-gray-500 ${labelGap}`}>
        <span>One Score</span>
        <span>{clamped}/100</span>
      </div>
      <div className={`${barHeight} bg-white/10 rounded-full overflow-hidden`}>
        <div
          className="h-full bg-neon-500 rounded-full transition-all duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
