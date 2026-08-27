import { useEffect, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
import { Logo } from '../../components/ui/Logo';
import { DiscordIcon } from '../../components/ui/DiscordIcon';
import { Badge } from '../../components/ui/Badge';

const VINTED_BLUE = '#007782';

// Round M -- bloc Avant/Avec ResellOS sous le Hero (retour utilisateur
// 2026-08-23). "Message automatique aux favoris" reste marque "(bientot)",
// coherent avec Features.tsx (module Communication) -- jamais presenter
// une fonctionnalite non construite comme deja disponible.
//
// Pas de logo Vinted (asset qu'on n'a pas, risque de marque deja signale
// plusieurs fois ce chantier) -- le mot "Vinted" en bleu #007782 fait le
// meme travail sans reproduire leur marque. Logo ResellOS et icone
// Discord : les deux nous appartiennent/sont deja utilises ailleurs dans
// le produit, aucun risque equivalent.
const PAIN_POINTS = [
  'Republier ses annonces à la main',
  'Répondre à tous les messages un par un',
  "Calculer son budget sans visibilité sur le bénéfice, le chiffre d'affaires et l'investissement",
  "Gérer l'URSSAF sans outil dédié",
];

const BENEFITS = [
  'Republication programmée ou automatique, au choix',
  'Message automatique aux favoris (bientôt)',
  'SKU généré automatiquement',
  "Vraie vue sur ta comptabilité : dépenses, bénéfice, chiffre d'affaires",
  "Cotisation URSSAF et prix du matériel (emballage, imprimante...) suivis",
  'Communauté Discord',
];

// Retour beta (2026-08-28) : 1) "Avant/Après" ne disait pas CE QUI change --
// renomme en "Sans/Avec Resell OS" (le vrai facteur de la comparaison).
// 2) demande de dynamisme visuel -- ATTENTION, ce point touche directement
// au concept "Dressing ResellOS" GELE (docs/DRESSING_EXPERIENCE.md, "Avant/
// Après -> Étagère haute", "ne pas rouvrir sans validation explicite") :
// option "vetements animes" explicitement ECARTEE par l'utilisateur en
// faveur de cette version legere, qui reste dans la structure classique de
// la landing. Le dynamisme vient de mini-cartes qui imitent REELLEMENT
// l'UI produit (meme composant Badge que WatchlistPage/VintedStatusBadge,
// memes tons violet/teal) plutot que d'une illustration decorative sans
// lien produit (design playbook, regle anti-generique #5) : chaos visuel
// SANS ResellOS (cartes desalignees, aucun statut, prix ternes) vs ordre
// AVEC ResellOS (cartes alignees, statut "Vendu" reel, prix mis en avant).
interface MiniListingCardProps {
  variant: 'chaos' | 'clean';
  price: string;
  rotateDeg?: number;
  offsetPx?: number;
}

function MiniListingCard({ variant, price, rotateDeg = 0, offsetPx = 0 }: MiniListingCardProps) {
  const chaos = variant === 'chaos';
  return (
    <div
      className={`w-20 sm:w-24 flex-shrink-0 rounded-lg border p-2 ${
        chaos ? 'border-gray-200 bg-white/80 opacity-70' : 'border-gray-200 bg-white shadow-sm'
      }`}
      style={{ transform: `rotate(${rotateDeg}deg) translateY(${offsetPx}px)` }}
    >
      <div
        className={`h-10 rounded mb-1.5 ${chaos ? 'bg-gray-200' : ''}`}
        style={chaos ? undefined : { background: `${VINTED_BLUE}14` }}
      />
      <div className={`h-1.5 w-3/4 rounded mb-1 ${chaos ? 'bg-gray-200' : 'bg-gray-300'}`} />
      <p className={`text-[10px] font-bold ${chaos ? 'text-gray-400' : 'text-gray-900'}`}>{price}</p>
      {!chaos && <Badge label="Vendu" tone="positive" className="mt-1" />}
    </div>
  );
}

// Meme discipline que Wardrobe.tsx (seul autre usage d'IntersectionObserver
// sur la landing, deja etabli dans ce repo) : declenche UNE FOIS quand la
// section entre dans le viewport, jamais une animation pilotee/scrubbee par
// le scroll. `prefers-reduced-motion` verifie en JS (pas seulement en CSS) :
// l'etat initial du rendu depend de `visible`, un simple `motion-reduce:`
// Tailwind ne suffirait pas a eviter la sequence masque -> apparition.
function useRevealOnScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

export function HeroComparison() {
  const chaosReveal = useRevealOnScroll();
  const cleanReveal = useRevealOnScroll();

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24 grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 text-left items-start">
      {/* Les deux cartes ne portent DELIBEREMENT pas le meme poids visuel :
          "Sans" reste plate (aucune ombre, fond gris, bordure discrete),
          "Avec" est surelevee. Leur donner la meme ombre serait exactement
          l'uniformite sans hierarchie que le playbook interdit -- ici la
          hierarchie EST le message de la section. */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-7 sm:p-10">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Sans Resell OS</span>
          <span className="text-sm font-semibold" style={{ color: VINTED_BLUE }}>Vinted</span>
        </div>

        <div ref={chaosReveal.ref} className="flex mb-6" aria-hidden="true">
          {[
            { price: '18 €', rotateDeg: -7, offsetPx: 3, ml: '' },
            { price: '35 €', rotateDeg: 4, offsetPx: -2, ml: '-ml-3' },
            { price: '12 €', rotateDeg: -3, offsetPx: 5, ml: '-ml-3' },
          ].map((c, i) => (
            <div
              key={i}
              className={`${c.ml} transition-all duration-700 ease-out ${
                chaosReveal.visible ? 'opacity-100' : 'opacity-0 translate-y-3'
              }`}
              style={{ transitionDelay: `${i * 90}ms` }}
            >
              <MiniListingCard variant="chaos" price={c.price} rotateDeg={c.rotateDeg} offsetPx={c.offsetPx} />
            </div>
          ))}
        </div>

        <ul className="space-y-4">
          {PAIN_POINTS.map((p) => (
            <li key={p} className="flex items-start gap-3 text-[0.9375rem] leading-6 text-gray-600">
              <X className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
              {p}
            </li>
          ))}
        </ul>
      </div>

      <div
        className="rounded-2xl border bg-white p-7 sm:p-10 shadow-xl shadow-gray-900/[0.06]"
        style={{ borderColor: `${VINTED_BLUE}40` }}
      >
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-6">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Avec Resell OS</span>
          <span className="text-gray-300">+</span>
          <span className="text-sm font-semibold" style={{ color: VINTED_BLUE }}>Vinted</span>
          <span className="text-gray-300">+</span>
          <Logo variant="transparent" size={18} />
          <span className="text-sm font-semibold text-gray-900">ResellOS</span>
          <span className="text-gray-300">+</span>
          <DiscordIcon className="w-4 h-4 text-gray-400" />
        </div>

        <div ref={cleanReveal.ref} className="flex gap-2.5 mb-6" aria-hidden="true">
          {['22 €', '39 €', '15 €'].map((price, i) => (
            <div
              key={price}
              className={`transition-all duration-700 ease-out ${
                cleanReveal.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
              }`}
              style={{ transitionDelay: `${i * 90}ms` }}
            >
              <MiniListingCard variant="clean" price={price} />
            </div>
          ))}
        </div>

        <ul className="space-y-4">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-3 text-[0.9375rem] leading-6 text-gray-700">
              <Check className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: VINTED_BLUE }} />
              {b}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
