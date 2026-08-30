import type { AppPage } from '../../lib/types';
import { WaitlistForm } from './WaitlistForm';

export function CTABanner({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-3xl mx-auto px-4 text-center">
        <h2 className="text-4xl sm:text-5xl font-black mb-4 text-gray-900">Arrête de perdre du temps sur tes annonces.</h2>
        <p className="text-gray-600 text-lg mb-8">Une photo, une annonce prête. Stock, prix et comptabilité se mettent à jour tout seuls.</p>
        <div className="flex justify-center">
          <WaitlistForm buttonLabel="Rejoindre la liste d'attente" />
        </div>
        <p className="text-sm text-gray-500 mt-4">
          Bêta privée — déjà approuvé(e) ?{' '}
          <button
            onClick={() => {
              sessionStorage.setItem('resellos:authMode', 'register');
              onNavigate('auth');
            }}
            className="text-neon-600 hover:underline font-semibold"
          >
            Crée ton compte
          </button>
        </p>
      </div>
    </section>
  );
}
