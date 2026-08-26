import { ArrowRight } from 'lucide-react';
import type { AppPage } from '../../lib/types';
import { PaintedWord } from './PaintedWord';

// Round M -- retouches Hero (retour utilisateur 2026-08-23, comparaison
// directe avec VintyResell) :
// - section jugee trop serree (la section suivante etait deja visible en
//   arrivant sur la page) -- HeroComparison.tsx ajoute une vraie hauteur
//   de contenu plutot que du padding artificiel.
// - "Vinted" recoit une animation ponctuelle (.underline-draw, index.css)
//   -- un trait qui se dessine une seule fois au chargement, jamais une
//   boucle.
// - texte de reassurance ecarte du CTA (etaient colles).
// - sous-texte reecrit : ton plus humain (tu/ton, virgules plutot qu'un
//   point sec juste apres "Prends une photo"), taille reduite (etait plus
//   gros que necessaire pour un sous-texte).
export function Hero({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  return (
    <section className="pt-40 pb-28 sm:pt-48 sm:pb-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <p className="text-sm font-semibold tracking-[0.2em] uppercase text-gray-500">
          Plateforme tout-en-un pour revendeurs
        </p>

        {/* Le mot anime occupe sa PROPRE ligne, jamais la fin de "du
            revendeur" : selon sa longueur il repoussait le reste du titre et
            faisait sauter tout le bloc sous-titre/CTA a chaque alternance.
            PaintedWord reserve lui-meme sa hauteur (voir son commentaire). */}
        <h1 className="mt-8 text-7xl md:text-8xl font-black tracking-tight leading-none mb-10 text-gray-900">
          <span className="block">Le système complet du revendeur</span>
          <PaintedWord />
        </h1>
        <p className="mt-8 max-w-2xl mx-auto text-lg leading-8 text-gray-600 mb-14">
          Il est maintenant temps de piloter ton activité et d'automatiser les tâches les plus importantes, mais également de structurer tes déclarations URSSAF en micro-entreprise. Et tout ça, seulement depuis Resell OS !
        </p>
        <div className="flex flex-col items-center justify-center gap-5">
          <button
            onClick={() => {
              sessionStorage.setItem('resellos:authMode', 'register');
              onNavigate('auth');
            }}
            className="w-full sm:w-auto text-white font-bold text-lg px-10 py-5 rounded-2xl transition-colors duration-300"
            style={{ backgroundColor: '#007782' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#005f68'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#007782'; }}
          >
            <span className="flex items-center gap-3 justify-center">
              Commencer gratuitement
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </span>
          </button>
          <p className="text-sm text-gray-600">Sans carte bancaire · 10 annonces offertes</p>
        </div>
      </div>
    </section>
  );
}
