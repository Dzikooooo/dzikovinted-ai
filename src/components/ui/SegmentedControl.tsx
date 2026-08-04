interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  fullWidth?: boolean;
  className?: string;
}

// Controle segmente partage (chantier coherence UI, 2026-07-29) : meme
// traitement deja identique entre AccountingPage (periode) et Opportunities
// (tri) -- extrait ici une seule fois plutot que duplique/redefini a chaque
// nouvel usage.
export function SegmentedControl<T extends string>({ options, value, onChange, fullWidth = false, className = '' }: SegmentedControlProps<T>) {
  return (
    <div className={`flex bg-surface-alt border border-white/10 rounded-xl overflow-hidden ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-4 py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-400 ${fullWidth ? 'flex-1' : ''} ${
            value === option.value ? 'bg-neon-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
