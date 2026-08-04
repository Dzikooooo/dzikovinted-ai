import { ArrowRight } from 'lucide-react';
import type { AppPage } from '../../lib/types';

export function CTABanner({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  return (
    <section className="py-16 sm:py-24 relative overflow-hidden">
      <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(124,92,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(124,92,255,0.03) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-neon-500/8 rounded-full blur-[140px] pointer-events-none" />
      <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
        <h2 className="text-4xl sm:text-5xl font-black mb-4">Arrête de perdre du temps sur tes annonces.</h2>
        <p className="text-gray-400 text-lg mb-8">Une photo, une annonce prête. Stock, prix et comptabilité se mettent à jour tout seuls.</p>
        <button
          onClick={() => onNavigate('auth')}
          className="bg-neon-600 text-white font-bold text-lg px-10 py-4 rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] hover:bg-neon-700 hover:shadow-[0_0_40px_rgba(124,92,255,0.3)] inline-flex items-center gap-3"
        >
          Créer mon compte gratuitement <ArrowRight className="w-5 h-5" />
        </button>
        <p className="text-sm text-gray-600 mt-4">Sans carte bancaire · Résiliable à tout moment</p>
      </div>
    </section>
  );
}
