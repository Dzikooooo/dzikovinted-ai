import { ArrowRight } from 'lucide-react';
import type { AppPage } from '../../lib/types';

export function CTABanner({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-3xl mx-auto px-4 text-center">
        <h2 className="text-4xl sm:text-5xl font-black mb-4 text-gray-900">Arrête de perdre du temps sur tes annonces.</h2>
        <p className="text-gray-600 text-lg mb-8">Une photo, une annonce prête. Stock, prix et comptabilité se mettent à jour tout seuls.</p>
        <button
          onClick={() => {
            sessionStorage.setItem('resellos:authMode', 'register');
            onNavigate('auth');
          }}
          className="text-white font-bold text-lg px-10 py-4 rounded-2xl transition-colors duration-300 inline-flex items-center gap-3"
          style={{ backgroundColor: '#007782' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#005f68'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#007782'; }}
        >
          Créer mon compte gratuitement <ArrowRight className="w-5 h-5" />
        </button>
        <p className="text-sm text-gray-500 mt-4">Sans carte bancaire · Résiliable à tout moment</p>
      </div>
    </section>
  );
}
