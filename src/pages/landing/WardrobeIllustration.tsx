// Round M -- illustrations dessinees a la main pour le "dressing"
// (Features.tsx), en remplacement de l'icone Shirt generique de
// lucide-react (retour utilisateur : "pas de vrai vetement, on s'fait
// chier, pas d'animation quali" -- l'icone toute faite avait tue toute
// la personnalite du concept). Formes simples et volontairement sobres
// (silhouette, pas un dessin detaille) pour rester fiables a l'oeil sans
// verification visuelle possible ce round -- mieux vaut une forme simple
// bien executee qu'une forme ambitieuse ratee.

export function Hanger({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 30" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M30 2c0 0-4 0-4 4c0 3 4 3 4 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M4 27L28 10.5c1.2-.8 2.8-.8 4 0L56 27"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Silhouette de polo simplifiee (col, epaules, manches courtes, corps) --
// degrade violet identite ResellOS pour un effet "tissu" plutot qu'un
// aplat plat.
export function Garment({ className = '', gradientId }: { className?: string; gradientId: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7C5CFF" />
          <stop offset="100%" stopColor="#C7BBFF" />
        </linearGradient>
      </defs>
      <path
        d="M38 8h10l6 7 6-7h10l16 16-13 11-6-5v58H34V29l-6 5-13-11L33 8h5z"
        fill={`url(#${gradientId})`}
        stroke="#5429FF"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M42 8c0 4 3.5 7 8 7s8-3 8-7"
        fill="none"
        stroke="#5429FF"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
