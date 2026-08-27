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
  muted?: number;
  glow?: boolean;
}

// Retour beta (2026-08-28) : "rendu plus pro, moins template IA" -- deux
// leviers PRECIS plutot qu'un effet decoratif ajoute au hasard (playbook,
// anti-generique #1 : un glow n'a le droit d'exister que s'il sert un but).
// 1) Le desordre cote "chaos" est desormais VARIABLE (opacite individuelle
//    `muted`, jamais une seule classe uniforme) -- un vrai tas a des cartes
//    plus ou moins visibles, pas des copies identiques a 70% d'opacite.
// 2) La lueur cote "clean" (`glow`) n'existe QUE pendant la transition
//    d'entree (voir plus bas, couplee au meme etat `visible` que
//    opacite/position) -- jamais une pulsation permanente type blob de
//    fond : c'est une confirmation visuelle de "cette carte vient de se
//    ranger", pas une decoration statique. Teinte violette (BRAND_VIOLET) :
//    l'element designe bien ResellOS, jamais Vinted (voir CLAUDE.md).
function MiniListingCard({ variant, price, rotateDeg = 0, offsetPx = 0, muted = 0.7, glow = false }: MiniListingCardProps) {
  const chaos = variant === 'chaos';
  return (
    <div
      className={`w-20 sm:w-24 flex-shrink-0 rounded-lg border p-2 transition-shadow duration-500 ${
        chaos ? 'border-gray-200 bg-white/80' : 'border-gray-200 bg-white ring-1 ring-gray-900/[0.04]'
      }`}
      style={{
        transform: `rotate(${rotateDeg}deg) translateY(${offsetPx}px)`,
        opacity: chaos ? muted : undefined,
        boxShadow: !chaos ? (glow ? '0 10px 28px -10px rgba(124,92,255,0.28)' : '0 1px 2px rgba(17,24,39,0.04)') : undefined,
      }}
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
//
// `settled` bascule ~650ms apres `visible` (duree de la transition d'entree
// la plus longue, cote "chaos", + marge) -- seule fenetre pendant laquelle
// la lueur du cote "clean" existe (voir MiniListingCard) : une preuve
// visuelle que CETTE carte precise vient de se mettre en place, jamais un
// halo permanent (playbook, anti-generique #1).
function useRevealOnScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      setSettled(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          settleTimer = setTimeout(() => setSettled(true), 650);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, []);

  return { ref, visible, settled };
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

        {/* Ecarts d'angle/decalage/opacite ELARGIS et INDIVIDUELS (retour
            "accentuer le brouillon") -- un vrai tas jete sur un bureau n'a
            jamais 3 cartes a la meme opacite/inclinaison. Easing "back-out"
            (leger depassement avant stabilisation, jamais present cote
            "clean") : la courbe elle-meme porte le sens -- une carte posee
            sans soin rebondit legerement en se posant, une carte rangee
            non. Stagger plus lache (120ms) que le cote clean : un geste
            desordonne n'a pas de cadence. */}
        <div ref={chaosReveal.ref} className="flex mb-6" aria-hidden="true">
          {[
            { price: '18 €', rotateDeg: -10, offsetPx: 4, muted: 0.55, ml: '' },
            { price: '35 €', rotateDeg: 6, offsetPx: -3, muted: 0.78, ml: '-ml-4' },
            { price: '12 €', rotateDeg: -6, offsetPx: 7, muted: 0.62, ml: '-ml-4' },
          ].map((c, i) => (
            <div
              key={i}
              className={`${c.ml} transition-all ${chaosReveal.visible ? 'opacity-100' : 'opacity-0 translate-y-4'}`}
              style={{
                transitionDuration: '850ms',
                transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                transitionDelay: `${i * 120}ms`,
              }}
            >
              <MiniListingCard variant="chaos" price={c.price} rotateDeg={c.rotateDeg} offsetPx={c.offsetPx} muted={c.muted} />
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

        {/* Miroir exact du cote "chaos" mais avec l'intention inverse :
            aucune rotation, un espacement egal (gap-2.5, jamais de
            chevauchement), et un easing "expo-out" SANS depassement -- une
            deceleration nette, la signature d'un geste precis. Stagger plus
            serre (70ms) : une cadence reguliere lit comme "orchestre",
            jamais aleatoire. La lueur (`glow`) n'apparait que PENDANT les
            ~500ms de la transition d'entree (voir son useEffect ci-dessous)
            -- jamais une pulsation permanente. */}
        <div ref={cleanReveal.ref} className="flex gap-2.5 mb-6" aria-hidden="true">
          {['22 €', '39 €', '15 €'].map((price, i) => (
            <div
              key={price}
              className={`transition-all ${cleanReveal.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              style={{
                transitionDuration: '550ms',
                transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                transitionDelay: `${i * 70}ms`,
              }}
            >
              <MiniListingCard variant="clean" price={price} glow={cleanReveal.visible && !cleanReveal.settled} />
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
