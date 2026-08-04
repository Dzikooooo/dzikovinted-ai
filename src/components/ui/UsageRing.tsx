// Anneau de progression circulaire generique (SVG, currentColor) -- premiere
// utilisation : quota de credits sur DashboardHome.tsx (pilote de la refonte
// esthetique, 2026-07-28), remplace l'ancienne barre horizontale + gros
// chiffre duplique. Pas de donnee inventee : `value` est toujours un
// pourcentage deja derive d'un chiffre reel par l'appelant (ex. credits/limit),
// jamais calcule ici.
interface UsageRingProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  colorClassName?: string; // classe de couleur de texte, reprise en stroke via currentColor
  children?: React.ReactNode;
}

export function UsageRing({ value, size = 72, strokeWidth = 7, colorClassName = 'text-neon-500', children }: UsageRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} className="fill-none stroke-white/5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke="currentColor"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`fill-none ${colorClassName} transition-all duration-700 ease-out`}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}
