import { useEffect, useState } from 'react';

// Fermeture P0 #12 (audit pre-lancement 2026-07-10, encore ouvert le
// 2026-08-29) : "Bientot multiplateforme" retire de la boucle -- ce mot
// promettait un support multi-marketplace qui contredit directement le
// positionnement Vinted-only (FAQ.tsx, BlogPage.tsx,
// [[project_scope_vinted_only]]). Il emportait avec lui toute la
// calibration de taille/repli plus bas dans ce fichier, qui n'existait QUE
// pour lui (c'etait de loin le mot le plus long, et le seul a utiliser un
// trait d'union conditionnel) -- ce commentaire et les suivants ont ete
// nettoyes en consequence plutot que laisses a decrire un mot qui n'existe
// plus.
const WORDS = ['Vinted', 'Débutant ou Pro'];

// Mot le plus long, rendu en fantome invisible pour RESERVER la hauteur (voir
// le commentaire du composant).
const visibleLength = (w: string) => w.length;
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
// longueur du mot ("Vinted" vs "Débutant ou Pro").
//
// Boucle infinie deliberee (comme l'effet precedent) : procede
// typographique de hero, pas une activite systeme simulee.
//
// Sous prefers-reduced-motion : aucune animation, le premier mot ("Vinted")
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
  // superpose (memes classes sur les deux, voir plus bas) -- la reservation
  // reste exacte a chaque breakpoint sans valeur codee en dur, et suit
  // automatiquement le nombre de lignes reellement occupees.
  //
  // Tailles conservees telles quelles apres le retrait de "Bientot
  // multiplateforme" (P0 #12, 2026-08-29) : elles avaient ete calibrees pour
  // CE mot, de loin le plus long de la liste. "Débutant ou Pro" (desormais
  // le plus long) tient dedans sans probleme -- resserrer la taille du H1
  // en consequence resterait un polish visuel a part, pas fait ici
  // (perimetre de la correction P0). `break-words` reste un filet de
  // securite generique, plus une necessite specifique a un mot precis.
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
