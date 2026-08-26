import { Logo } from './Logo';

// Wordmark "Resell OS" -- source UNIQUE du lockup logo + texte (2026-08-24).
//
// Avant ce composant, les 6 emplacements du produit (navbar landing, footer,
// sidebar dashboard, Auth, ResetPassword, Settings) dupliquaient chacun leur
// propre balisage, avec des tailles et des espacements differents. Trois
// defauts mesures sur le rendu REEL de la navbar :
//   - 4 px de trou entre le glyphe "R" et "esell" -- le mot "Resell" se
//     lisait casse en deux ;
//   - "OS" rendu a 20 px contre 26.4 px pour "esell" ;
//   - aucun espace typographique fiable avant "OS".
//
// Le glyphe R fait office de premiere lettre : il doit rester COLLE au texte
// (d'ou le leger retrait negatif, qui compense aussi la marge transparente
// du PNG). L'espace avant "OS" est exprime en `em` pour rester proportionnel
// a chaque taille.
//
// `OS` est toujours en MAJUSCULES et toujours violet (couleur de marque) --
// jamais parametrable, c'est la regle d'identite.

const SIZES = {
  sm: { logo: 22, text: 'text-base' },
  md: { logo: 30, text: 'text-lg' },
  lg: { logo: 40, text: 'text-2xl' },
  xl: { logo: 44, text: 'text-[1.65rem]' },
} as const;

export type WordmarkSize = keyof typeof SIZES;

export function Wordmark({
  size = 'md',
  className = '',
  logoClassName = '',
}: {
  size?: WordmarkSize;
  className?: string;
  logoClassName?: string;
}) {
  const { logo, text } = SIZES[size];
  return (
    <span className={`inline-flex items-center leading-none ${className}`}>
      <Logo variant="transparent" size={logo} className={logoClassName} />
      <span className={`${text} font-black tracking-tight text-gray-900 -ml-[0.12em]`}>esell</span>
      <span className={`${text} font-black tracking-tight text-neon-500 ml-[0.28em]`}>OS</span>
    </span>
  );
}
