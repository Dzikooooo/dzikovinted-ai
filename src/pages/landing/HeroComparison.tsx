import { useEffect, useRef, useState } from 'react';
import { X, Check, Bell } from 'lucide-react';
import { Logo } from '../../components/ui/Logo';
import { DiscordIcon } from '../../components/ui/DiscordIcon';
import { Badge } from '../../components/ui/Badge';
import { VINTED_INK } from '../../lib/brandColors';

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
//
// Retour "standard Stripe/Linear, effet waouh" (2026-08-28) -- CADRAGE
// EXPLICITE avant ce round (2 questions posees, reponses actees) :
// 1. Le panneau "Avec ResellOS" RESTE en theme clair -- un dark mode ici
//    recreerait exactement le probleme corrige le 2026-08-24 (dashboard
//    sombre + landing claire = "deux produits differents"). Le "waouh"
//    vient de la precision (typo, alignement, micro-etat), pas d'un
//    changement de theme.
// 2. Aucun scroll-scrubbing/zoom pilote par la position de scroll -- le
//    concept "Dressing ResellOS" (docs/DRESSING_EXPERIENCE.md) qui
//    possederait cette mecanique reste GELE, l'utilisateur l'a confirme.
//    L'animation reste une entree au scroll UNE FOIS (IntersectionObserver,
//    inchangee dans son principe depuis le round precedent), simplement
//    plus marquee.
// Copie sharpened : memes revendications FACTUELLES qu'avant (rien
// invente), phrasing plus direct sur la charge mentale/le temps perdu
// (playbook F : le benefice s'ajoute au fait, ne le remplace jamais).
const PAIN_POINTS = [
  "Republier chaque annonce à la main — encore et encore, à chaque fois qu'elle expire",
  'Répondre seul à des dizaines de messages, un par un, sans jamais rattraper le retard',
  "Deviner ton bénéfice réel, sans visibilité sur le chiffre d'affaires ni l'investissement",
  "Gérer l'URSSAF dans un tableur, sans outil dédié",
];

// Repositionnement "bouclier anti-bannissement" (2026-08-29, suite a
// l'analyse concurrentielle) : l'ancienne premiere ligne disait
// "automatique, au choix" -- FAUX, et en contradiction directe avec le
// vrai fonctionnement (clic humain toujours requis sur Vinted, voir
// PublishConfirmationModal.tsx/PublishProgressModal.tsx). Reformule en
// benefice reel plutot que corrige en silence : le clic manuel n'est pas
// une limite qu'on cache, c'est ce qui protege le compte -- justement ce
// que la republication "100% automatique" vendue par plusieurs concurrents
// ne peut pas garantir face aux verifications anti-bot de Vinted.
const BENEFITS = [
  "Republication programmée, confirmée d'un clic — jamais un robot qui clique à ta place sur ton compte",
  'Message automatique aux favoris (bientôt)',
  'SKU généré automatiquement, sur chaque annonce',
  "Vraie vue sur ta comptabilité : dépenses, bénéfice, chiffre d'affaires",
  "Cotisation URSSAF et prix du matériel (emballage, imprimante...) suivis",
  'Communauté Discord',
];

interface MiniListingCardProps {
  variant: 'chaos' | 'clean';
  price: string;
  rotateDeg?: number;
  offsetPx?: number;
  muted?: number;
  glow?: boolean;
  sku?: string;
  status?: 'Vendu' | null;
  notifyCount?: number;
  correctedFrom?: string;
}

// Deux leviers PRECIS plutot qu'un effet decoratif ajoute au hasard
// (playbook, anti-generique #1 : un glow/badge n'a le droit d'exister que
// s'il sert un but, jamais "parce que ca fait plus premium").
// 1) Cote chaos : `notifyCount` (badge rouge, messages non lus -- pointe
//    directement le pain point "Répondre seul à des dizaines de messages")
//    et `correctedFrom` (prix barre + prix reecrit -- pointe "Deviner ton
//    bénéfice réel") sont des representations d'un VRAI probleme deja
//    nomme dans PAIN_POINTS, jamais un ajout gratuit.
// 2) Cote clean : `sku` reprend le VRAI format ResellOS ("#12", voir
//    src/lib/sku.ts::formatTitleWithSku, jamais un code invente) en
//    font-mono (token deja defini, tailwind.config.js). `status` n'affiche
//    "Vendu" que sur certaines cartes -- une annonce "en ligne" n'affiche
//    normalement AUCUN badge cote vrai produit (meme convention que
//    VintedStatusBadge.tsx : "l'etat par defaut, pas besoin d'insister").
function MiniListingCard({
  variant,
  price,
  rotateDeg = 0,
  offsetPx = 0,
  muted = 0.7,
  glow = false,
  sku,
  status = null,
  notifyCount,
  correctedFrom,
}: MiniListingCardProps) {
  const chaos = variant === 'chaos';
  return (
    <div
      className={`relative w-20 sm:w-24 flex-shrink-0 rounded-lg border p-2 transition-shadow duration-500 ${
        chaos ? 'border-gray-200 bg-white/80' : 'border-gray-200 bg-white ring-1 ring-gray-900/[0.04]'
      }`}
      style={{
        transform: `rotate(${rotateDeg}deg) translateY(${offsetPx}px)`,
        opacity: chaos ? muted : undefined,
        boxShadow: !chaos ? (glow ? '0 10px 28px -10px rgba(124,92,255,0.28)' : '0 1px 2px rgba(17,24,39,0.04)') : undefined,
      }}
    >
      {chaos && !!notifyCount && (
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold leading-none shadow-sm"
        >
          {notifyCount}
        </span>
      )}
      <div
        className={`h-10 rounded mb-1.5 ${chaos ? 'bg-gray-200' : ''}`}
        style={chaos ? undefined : { background: `${VINTED_INK}14` }}
      />
      <div className={`h-1.5 w-3/4 rounded mb-1 ${chaos ? 'bg-gray-200' : 'bg-gray-300'}`} />
      {correctedFrom ? (
        <p className="text-[10px] font-bold leading-tight">
          <span className="text-gray-400 line-through mr-1">{correctedFrom}</span>
          <span className="text-red-600 -rotate-2 inline-block">{price}</span>
        </p>
      ) : (
        <p className={`text-[10px] font-bold ${chaos ? 'text-gray-400' : 'text-gray-900'}`}>{price}</p>
      )}
      {!chaos && (
        <div className="flex items-center justify-between mt-1">
          {sku && <span className="font-mono text-[9px] text-gray-400">{sku}</span>}
          {status && <Badge label={status} tone="positive" />}
        </div>
      )}
    </div>
  );
}

// Meme discipline que Wardrobe.tsx (seul autre usage d'IntersectionObserver
// sur la landing, deja etabli dans ce repo) : declenche UNE FOIS quand la
// section entre dans le viewport, jamais une animation pilotee/scrubbee par
// le scroll (cadrage explicite reconfirme dans ce round, voir plus haut).
// `prefers-reduced-motion` verifie en JS (pas seulement en CSS) : l'etat
// initial du rendu depend de `visible`, un simple `motion-reduce:` Tailwind
// ne suffirait pas a eviter la sequence masque -> apparition.
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
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
      {/* Accroche courte au-dessus du comparatif -- le "waouh" demande vient
          d'abord de la clarte du message (playbook F), pas d'un effet
          visuel : la phrase nomme directement Vinted et pose le choix en
          une lecture, avant meme que l'oeil n'atteigne les deux cartes. */}
      <p className="text-center text-sm sm:text-base font-semibold text-gray-500 mb-8 sm:mb-10">
        Deux façons de vendre sur Vinted. Une seule te fait gagner ton temps.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 text-left items-start">
        {/* Les deux cartes ne portent DELIBEREMENT pas le meme poids visuel :
            "Sans" reste plate (aucune ombre, fond gris, bordure discrete),
            "Avec" est surelevee. Leur donner la meme ombre serait exactement
            l'uniformite sans hierarchie que le playbook interdit -- ici la
            hierarchie EST le message de la section. */}
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-7 sm:p-10">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Sans Resell OS</span>
            <span className="text-sm font-semibold" style={{ color: VINTED_INK }}>Vinted</span>
          </div>

          {/* Ecarts d'angle/decalage/opacite INDIVIDUELS (jamais une seule
              classe uniforme) -- un vrai tas jete sur un bureau n'a jamais 3
              cartes identiques. Badge rouge + prix corrige a la main :
              representations directes des pain points ci-dessous, pas des
              gadgets ajoutes en plus. Easing "back-out" (leger depassement
              avant stabilisation, jamais present cote "clean") : la courbe
              elle-meme porte le sens -- une carte posee sans soin rebondit
              legerement en se posant. Stagger plus lache (130ms) : un geste
              desordonne n'a pas de cadence. */}
          <div ref={chaosReveal.ref} className="flex mb-6" aria-hidden="true">
            {[
              { price: '18 €', rotateDeg: -11, offsetPx: 5, muted: 0.52, ml: '', notifyCount: 7 },
              { price: '29 €', correctedFrom: '35 €', rotateDeg: 7, offsetPx: -4, muted: 0.8, ml: '-ml-4' },
              { price: '12 €', rotateDeg: -7, offsetPx: 8, muted: 0.6, ml: '-ml-4' },
            ].map((c, i) => (
              <div
                key={i}
                className={`${c.ml} transition-all ${chaosReveal.visible ? 'opacity-100' : 'opacity-0 translate-y-5'}`}
                style={{
                  transitionDuration: '900ms',
                  transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                  transitionDelay: `${i * 130}ms`,
                }}
              >
                <MiniListingCard
                  variant="chaos"
                  price={c.price}
                  rotateDeg={c.rotateDeg}
                  offsetPx={c.offsetPx}
                  muted={c.muted}
                  notifyCount={c.notifyCount}
                  correctedFrom={c.correctedFrom}
                />
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

          {/* Charge mentale nommee explicitement (retour "piquer la ou ca
              fait mal") -- une icone de notification statique (jamais de
              pulsation infinie, voir la discipline anti-generique #1) sert
              d'ancrage visuel a la phrase, sans repeter un pain point deja
              liste ci-dessus. */}
          <div className="flex items-center gap-2 mt-6 pt-5 border-t border-gray-200 text-xs text-gray-500">
            <Bell className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            Chaque jour recommence à zéro — rien ne se fait tout seul.
          </div>
        </div>

        <div
          className="rounded-2xl border bg-white p-7 sm:p-10 shadow-xl shadow-gray-900/[0.06]"
          style={{ borderColor: `${VINTED_INK}40` }}
        >
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-6">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Avec Resell OS</span>
            <span className="text-gray-300">+</span>
            <span className="text-sm font-semibold" style={{ color: VINTED_INK }}>Vinted</span>
            <span className="text-gray-300">+</span>
            <Logo variant="transparent" size={18} />
            <span className="text-sm font-semibold text-gray-900">ResellOS</span>
            <span className="text-gray-300">+</span>
            <DiscordIcon className="w-4 h-4 text-gray-400" />
          </div>

          {/* Miroir exact du cote "chaos" mais avec l'intention inverse :
              aucune rotation, un espacement egal, et un easing "expo-out"
              SANS depassement -- une deceleration nette, la signature d'un
              geste precis. Stagger plus serre (70ms) : une cadence
              reguliere lit comme "orchestre", jamais aleatoire. SKU (vrai
              format produit) + "Vendu" sur 2 cartes sur 3 seulement -- la
              3e reste sans badge, exactement la convention du vrai produit
              pour une annonce "en ligne" (VintedStatusBadge.tsx). La lueur
              (`glow`) n'apparait que PENDANT la fenetre de transition
              d'entree -- jamais une pulsation permanente. */}
          <div ref={cleanReveal.ref} className="flex gap-2.5 mb-6" aria-hidden="true">
            {[
              { price: '22 €', sku: '#12', status: 'Vendu' as const },
              { price: '39 €', sku: '#47', status: 'Vendu' as const },
              { price: '15 €', sku: '#23', status: null },
            ].map((c, i) => (
              <div
                key={c.price}
                className={`transition-all ${cleanReveal.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}
                style={{
                  transitionDuration: '600ms',
                  transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                  transitionDelay: `${i * 70}ms`,
                }}
              >
                <MiniListingCard
                  variant="clean"
                  price={c.price}
                  sku={c.sku}
                  status={c.status}
                  glow={cleanReveal.visible && !cleanReveal.settled}
                />
              </div>
            ))}
          </div>

          <ul className="space-y-4">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-3 text-[0.9375rem] leading-6 text-gray-700">
                <Check className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: VINTED_INK }} />
                {b}
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2 mt-6 pt-5 border-t border-gray-200 text-xs text-gray-500">
            <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: VINTED_INK }} />
            ResellOS tourne pendant que tu vis ta vie.
          </div>
        </div>
      </div>
    </section>
  );
}
