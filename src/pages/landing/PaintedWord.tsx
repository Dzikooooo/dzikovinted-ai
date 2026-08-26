import { useEffect, useState } from 'react';

// ­ = trait d'union conditionnel (soft hyphen) : invisible tant que le mot
// tient sur une ligne, il devient un vrai "-" a l'endroit exact ou le mot doit
// se couper. Sous `sm`, "Multiplateforme." ne tient sur aucune ligne (343 px
// disponibles a 375 px de viewport) et se coupait n'importe ou -- rendu reel
// constate : "Multiplatef / orme.". `hyphens: auto` a ete essaye d'abord et NE
// FONCTIONNE PAS ici (Chromium sans dictionnaire de cesure francais, verifie
// en direct) ; le trait d'union conditionnel, lui, ne depend d'aucun
// dictionnaire et donne "Multi- / plateforme.".
const WORDS = ['Vinted', 'Débutant ou Pro', 'Bientôt multi­plateforme'];

// Mot le plus long, rendu en fantome invisible pour RESERVER la hauteur (voir
// le commentaire du composant). Comparaison faite SANS les traits d'union
// conditionnels : ils comptent dans `length` sans rien ajouter a la largeur
// rendue, et fausseraient le choix.
const visibleLength = (w: string) => w.replace(/­/g, '').length;
const LONGEST_WORD = WORDS.reduce((a, b) => (visibleLength(b) > visibleLength(a) ? b : a));
const REVEAL_MS = 900;
const HOLD_MS = 1800;
const ERASE_MS = 700;

// Round M -- mot anime dans le H1 du Hero, remplace l'effet machine a
// ecrire (retour utilisateur : "jamais d'animation brute" -- le
// caractere-par-caractere etait juge trop mecanique). Effet "pinceau" :
// le mot se revele comme peint (clip-path qui s'ouvre + flou qui se
// dissipe, degrade violet identite ResellOS), puis s'efface comme essuye
// (meme technique inversee) -- jamais un cut sec, toujours une courbe
// deceleree/accelree douce (cubic-bezier(0.65,0,0.35,1) dans les deux
// sens, cf. .paint-reveal/.paint-erase, index.css).
//
// Duree fixe par phase (pas liee au nombre de caracteres, contrairement a
// l'ancien effet clavier) -- fonctionne pareil quelle que soit la
// longueur du mot ("Vinted" vs "Bientot multiplateforme").
//
// Boucle infinie deliberee (comme l'effet precedent) : procede
// typographique de hero, pas une activite systeme simulee.
//
// Sous prefers-reduced-motion : aucune animation, le premier mot ("Pro")
// affiche en statique.
export function PaintedWord() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');

  useEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const duration = phase === 'in' ? REVEAL_MS : phase === 'hold' ? HOLD_MS : ERASE_MS;
    const timer = setTimeout(() => {
      if (phase === 'in') setPhase('hold');
      else if (phase === 'hold') setPhase('out');
      else {
        setWordIndex((i) => (i + 1) % WORDS.length);
        setPhase('in');
      }
    }, duration);
    return () => clearTimeout(timer);
  }, [phase, reduceMotion]);

  const gradientStyle = {
    background: 'linear-gradient(90deg, #7C5CFF, #B9A6FF)',
    WebkitBackgroundClip: 'text' as const,
    backgroundClip: 'text' as const,
    color: 'transparent',
  };

  // Le mot vit sur sa PROPRE ligne (`block`), et cette ligne reserve en
  // permanence la hauteur du mot le plus long via un fantome invisible
  // superpose. Deux raisons de preferer ce fantome a un `min-h-[Nem]` code en
  // dur : la reservation reste exacte a CHAQUE breakpoint (le H1 passe de
  // text-7xl a text-8xl) sans avoir a recalculer une valeur, et elle suit
  // automatiquement le nombre de lignes reellement occupees quand le mot le
  // plus long doit se replier.
  //
  // `whitespace-nowrap` a ete RETIRE : a text-8xl, "Bientot multiplateforme"
  // sur une seule ligne depasse la largeur du conteneur et faisait defiler la
  // page horizontalement. Le repli est desormais autorise, et le fantome
  // reserve la hauteur correspondante.
  //
  // `break-words` en plus, mesure en direct a 460 px de viewport : le seul mot
  // "multiplateforme." fait ~585 px a text-7xl, contre 428 px disponibles. Il
  // ne tient sur AUCUNE ligne -- un retour a la ligne entre mots ne suffit
  // donc pas, il faut autoriser la coupure a l'interieur du mot. Sans cela la
  // page defile horizontalement sur mobile.
  //
  // La MEME classe est appliquee au fantome et au mot anime : c'est ce qui
  // garantit qu'ils occupent exactement le meme nombre de lignes, donc que la
  // hauteur reservee reste juste.
  //
  // Taille DEDIEE, plus petite que le reste du H1 (text-7xl md:text-8xl) aux
  // breakpoints intermediaires. Objectif : que les trois propositions tiennent
  // sur UNE seule ligne des `md`, sinon la hauteur reservee vaut 2 lignes et
  // une ligne vide apparait sous "Vinted." sur desktop.
  //
  // Largeurs mesurees pour le mot le plus long ("Multiplateforme.") contre la
  // place reellement disponible (conteneur max-w-5xl moins le padding) :
  //   viewport 768  -> 720 dispo ; 781 a 96px (deborde) ; 586 a 72px  -> OK
  //   viewport 1024 -> 976 dispo ; 781 a 96px -> OK
  // En dessous de `md` le repli sur 2 lignes est assume : aucune taille
  // raisonnable ne fait tenir ce mot sur 343 px de large.
  // Taille de base a text-5xl (48 px) : c'est ce qui fait tenir "plateforme."
  // (~270 px) sur la ligne la plus etroite visee (288 px dispo a 320 px de
  // viewport) apres coupure au trait d'union conditionnel. `break-words` reste
  // en dernier filet pour ne JAMAIS laisser la page defiler horizontalement.
  // TAILLES RECALIBREES le 2026-08-26, apres passage de "Multiplateforme" a
  // "Bientot multiplateforme" (+50 % de caracteres). Largeurs MESUREES en
  // direct pour le mot le plus long, police et graisse reelles :
  //
  //     48px -> 535   60px -> 684   72px -> 832   96px -> 1128
  //
  // Place disponible (conteneur max-w-5xl moins padding) :
  //     375px -> 343    640px -> 592    768px -> 720    >=1024px -> 976
  //
  // D'ou un cran de moins qu'avant a chaque palier : 72px tient dans 976,
  // 60px dans 720, 48px dans 592. L'ancien lg:text-8xl donnait 1128 pour 976
  // disponibles -- le mot passait sur DEUX lignes, et le fantome reservait
  // donc une ligne vide sous "Vinted." et "Debutant ou Pro." sur desktop.
  //
  // EN DESSOUS DE sm, le repli sur deux lignes reste assume : tenir sur une
  // ligne a 375px exigerait ~32px, et a 320px ~27px -- le titre du hero
  // deviendrait minuscule sur mobile pour resoudre un defaut qui ne se voit
  // que sur grand ecran. Le trait d'union conditionnel donne la une coupure
  // propre ("Bientot multi- / plateforme.").
  //
  // TOUJOURS PAS de `whitespace-nowrap`, malgre l'apparence de solution :
  // il ne redimensionne rien, il interdit juste le repli -- sur mobile le mot
  // deborderait alors du conteneur et ferait defiler la page horizontalement,
  // exactement le bug pour lequel cette classe avait deja ete retiree.
  // `break-words` reste le dernier filet.
  const lineClasses = 'block break-words text-4xl sm:text-5xl md:text-6xl lg:text-7xl';
  const animated = reduceMotion ? (
    <span className={lineClasses} style={gradientStyle}>
      {WORDS[0]}.
    </span>
  ) : (
    // 'in' et 'hold' partagent la meme cle : l'animation de reveal joue une
    // fois puis tient son etat final (animation-fill-mode: forwards) sans
    // etre remontee/relancee pendant le hold. Seul le passage a 'out'
    // change de cle, pour rejouer l'effacement a partir d'un etat neuf.
    <span
      key={`${wordIndex}-${phase === 'out' ? 'out' : 'in'}`}
      className={`${lineClasses} ${phase === 'out' ? 'paint-erase' : 'paint-reveal'}`}
      style={gradientStyle}
    >
      {WORDS[wordIndex]}.
    </span>
  );

  return (
    <span className="relative block w-full">
      <span aria-hidden="true" className={`invisible ${lineClasses}`}>
        {LONGEST_WORD}.
      </span>
      <span className="absolute inset-x-0 top-0">{animated}</span>
    </span>
  );
}
