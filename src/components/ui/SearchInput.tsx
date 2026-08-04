import { Search } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  className?: string;
}

// Champ de recherche partage (chantier coherence UI, 2026-07-29) : meme
// balisage strictement duplique entre StockPage et Opportunities.
export function SearchInput({ className = '', ...rest }: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
      <input
        type="text"
        className="w-full bg-surface border border-white/8 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-neon-500/30 focus:ring-2 focus:ring-neon-500/20"
        {...rest}
      />
    </div>
  );
}
