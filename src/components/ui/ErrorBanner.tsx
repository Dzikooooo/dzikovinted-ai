import { AlertTriangle } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  className?: string;
}

// Composant dédié plutôt qu'une simple convention de classe : le vrai bug
// sur StockPage/DashboardHome n'était pas visuel, l'erreur Supabase était
// jetée avant d'atteindre le JSX. Une prop `message` obligatoire force ce
// branchement à exister à chaque site d'appel.
export function ErrorBanner({ message, className = '' }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 sm:p-4 text-sm text-red-300 ${className}`}
    >
      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
      <p>{message}</p>
    </div>
  );
}
