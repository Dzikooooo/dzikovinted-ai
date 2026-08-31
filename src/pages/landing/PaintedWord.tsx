// Repositionnement Vinted-only (2026-08-31, demande produit) : le hero ne
// fait plus de distinction de profil ("Debutant ou Pro" retire du titre) --
// il ancre directement sur Vinted, seule marketplace couverte
// ([[project_scope_vinted_only]]). Avec un seul mot desormais, toute la
// mecanique de la version precedente devient inutile et a ete retiree :
// - la boucle infinie (elle n'avait de sens que pour alterner entre
//   plusieurs mots) ;
// - la reservation de hauteur fantome (elle n'existait que pour absorber la
//   difference de longueur entre "Vinted" et "Debutant ou Pro").
// L'effet pinceau (.paint-reveal, index.css) reste : il joue une seule fois
// au chargement (animation-fill-mode: forwards, aucune iteration infinie) et
// tient son etat final sans JS. index.css desactive deja l'animation sous
// prefers-reduced-motion -- pas besoin de dupliquer cette logique ici.
//
// Taille legerement superieure a la premiere ligne du H1 (text-7xl
// md:text-8xl dans Hero.tsx) : Vinted doit sauter aux yeux en premier
// (demande produit 2026-08-31 : ancrer immediatement l'utilite majeure de
// l'outil).
export function PaintedWord() {
  return (
    <span
      className="paint-reveal block text-8xl md:text-9xl font-black tracking-tight"
      style={{
        background: 'linear-gradient(90deg, #7C5CFF, #B9A6FF)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }}
    >
      Vinted.
    </span>
  );
}
