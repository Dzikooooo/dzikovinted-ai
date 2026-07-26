import logoGlyph from '../../assets/logo-glyph.png';

interface LogoProps {
  size?: number;
  className?: string;
}

// Glyphe seul (or, fond transparent) -- remplace l'ancien carre bg-neon-500 +
// icone Zap. Pas de conteneur colore : sur les fonds sombres de l'app
// (dark-400/surface, ~#0a0a0a), un carre or "pop" alors qu'un carre noir se
// fondrait dans la page -- voir decision Design Freeze du 2026-07-27.
export function Logo({ size = 32, className = '' }: LogoProps) {
  return (
    <img
      src={logoGlyph}
      alt="ResellOS"
      width={size}
      height={size}
      className={`object-contain flex-shrink-0 ${className}`}
    />
  );
}
