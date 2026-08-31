// Composant partage pour le score par annonce (StockPage.tsx et
// Opportunities.tsx affichaient chacun leur propre implementation du meme
// score sous un nom different -- "Score IA" / "Opportunity Score", voir
// src/lib/insights/scoring.ts pour le calcul reel : additif, transparent,
// base neutre 50, jamais un score "IA" opaque). Un seul nom, "One Score",
// un seul composant.
import { InfoTooltip } from './InfoTooltip';

interface OneScoreBarProps {
  score: number;
  size?: 'sm' | 'md';
  className?: string;
}

// Texte du picto info (2026-08-31) : reprend LITTERALEMENT les signaux reels
// de computeScores() (scoring.ts) -- vues/favoris vs mediane, anciennete en
// ligne, ROI, performance marque/categorie sur CE compte -- jamais une
// description vague type "notre IA analyse ton annonce".
const SCORE_EXPLANATION =
  'Score sur 100 (base neutre 50) : vues et favoris vs la moyenne, ancienneté en ligne, ROI, performance de la marque et de la catégorie sur ton compte.';

export function OneScoreBar({ score, size = 'sm', className = '' }: OneScoreBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const labelSize = size === 'sm' ? 'text-[10px]' : 'text-[11px]';
  const barHeight = size === 'sm' ? 'h-1' : 'h-1.5';
  const labelGap = size === 'sm' ? 'mb-1' : 'mb-1.5';

  return (
    <div className={className}>
      <div className={`flex items-center justify-between ${labelSize} text-gray-500 ${labelGap}`}>
        <span className="flex items-center gap-1">
          One Score
          <InfoTooltip text={SCORE_EXPLANATION} />
        </span>
        <span>{clamped}/100</span>
      </div>
      <div className={`${barHeight} bg-gray-100 rounded-full overflow-hidden`}>
        <div
          className="h-full bg-neon-500 rounded-full shadow-[0_0_8px_rgba(124,92,255,0.6)] transition-all duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
