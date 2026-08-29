import { ExternalLink } from 'lucide-react';
import { BRAND_VIOLET } from '../../lib/brandColors';
import dzikoPhoto from '../../assets/dziko-profile.png';

// Section "fondateur" courte pour la landing (2026-08-29) -- distincte de
// l'histoire complete sur BlogPage.tsx ("Qui je suis", dettes/addictions
// comprises) : ce format vise un lecteur qui scanne la landing en quelques
// secondes, pas le recit entier. Seuls des faits deja publics sur BlogPage
// sont repris ici (age, Vinted depuis 15 ans, beatbox) -- rien de nouveau
// invente, rien de sensible deplace vers un encart marketing ou ca ne sert
// pas le lecteur.
const BEACONS_URL = 'https://beacons.ai/dzikobeatbox';

export function Founder() {
  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] uppercase text-gray-500 mb-4">Derrière ResellOS</p>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-5 leading-tight">
              Fait par un revendeur, pour des revendeurs.
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed mb-8 max-w-md">
              Moi c'est Dziko : 20 ans, revendeur sur Vinted depuis mes 15 ans, et beatboxer à côté. ResellOS, c'est
              l'outil que j'aurais aimé avoir quand j'ai commencé. Je l'ai construit après cinq mois passés à
              comprendre exactement ce qui fait perdre du temps aux revendeurs.
            </p>
            {/* Lien externe personnel, pas de bouton "signup" : violet en
                accent tinte (meme traitement que "Rejoindre Discord" dans
                Features.tsx) plutot qu'un bouton plein, pour ne pas
                concurrencer le CTA d'inscription principal de la page. */}
            <a
              href={BEACONS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold px-5 py-3 rounded-xl border transition-colors"
              style={{ color: BRAND_VIOLET, backgroundColor: `${BRAND_VIOLET}1A`, borderColor: `${BRAND_VIOLET}33` }}
            >
              Découvrir mon univers <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          <div className="flex flex-col items-center lg:items-end">
            <img
              src={dzikoPhoto}
              alt="Dziko, fondateur de ResellOS"
              className="w-56 h-56 sm:w-64 sm:h-64 object-cover rounded-3xl border border-gray-200"
            />
            <p className="mt-4 text-sm text-gray-500">
              <span className="font-semibold text-gray-900">Dziko</span> · Fondateur de ResellOS
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
