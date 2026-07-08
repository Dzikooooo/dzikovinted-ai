import { ArrowRight } from 'lucide-react';
import type { AppPage } from '../../lib/types';

export function CTABanner({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-neon-500/5" />
      <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
        <h2 className="text-3xl sm:text-4xl font-black mb-4">Prêt à développer votre activité ?</h2>
        <p className="text-gray-400 mb-8">Rejoins les revendeurs qui automatisent leurs annonces, suivent leurs ventes et pilotent leur activité depuis une seule plateforme.</p>
        <button
          onClick={() => onNavigate('auth')}
          className="bg-neon-500 text-black font-bold text-lg px-10 py-4 rounded-2xl
transition-all duration-300
hover:scale-[1.02]
active:scale-[0.98] hover:bg-neon-600 transition-all duration-300 hover:shadow-[0_0_40px_rgba(255,196,0,0.3)] inline-flex items-center gap-3"
        >
          Créer mon compte gratuitement <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
}
