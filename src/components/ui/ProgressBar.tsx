interface ProgressBarRowProps {
  label: string;
  value: string;
  fraction: number;
  rank?: number;
  labelClassName?: string;
  valueClassName?: string;
}

// Ligne "label + barre + valeur" partagee (Design Freeze, Lot 6) : reprend
// a l'identique le pattern deja duplique entre AccountingPage
// (Depenses par categorie) et StatsPage (Marques les plus frequentes,
// Distribution des prix) -- meme degrade neon, meme structure, pour ne
// plus avoir a le reecrire a chaque nouveau graphique en barres.
export function ProgressBarRow({
  label,
  value,
  fraction,
  rank,
  labelClassName = 'w-28',
  valueClassName = 'w-16',
}: ProgressBarRowProps) {
  const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  return (
    <div className="flex items-center gap-3">
      {rank !== undefined && <span className="text-xs font-medium text-gray-600 w-4 flex-shrink-0 tabular-nums">{rank}.</span>}
      <span className={`text-xs text-gray-700 truncate flex-shrink-0 font-medium ${labelClassName}`}>{label}</span>
      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-neon-500/40 to-neon-500/80 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-medium text-gray-700 flex-shrink-0 text-right tabular-nums ${valueClassName}`}>
        {value}
      </span>
    </div>
  );
}
