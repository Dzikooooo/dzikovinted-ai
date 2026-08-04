import logoGlyph from '../../assets/logo-glyph.png';
import logoGlyphTransparent from '../../assets/logo-glyph-transparent.png';

interface LogoProps {
  size?: number;
  className?: string;
  // 'square' = icone autonome (fond noir + coins arrondis integres) --
  // favicon, ecrans de chargement, contextes isoles. 'transparent' = meme
  // degrade violet -> blanc d'origine, fond noir retire (seuil de
  // luminosite) -- concu pour se coller directement au mot "esell os" et
  // former visuellement "R" + "esell os" = "Resell os", SANS repeindre le
  // glyphe en blanc uni (retour explicite du 2026-07-28 : garder le violet
  // degrade, "l'integrer dans son etat normal").
  variant?: 'square' | 'transparent';
}

// Rebrand (2026-07-28) : nouveau glyphe R+eclair violet.
export function Logo({ size = 32, className = '', variant = 'square' }: LogoProps) {
  return (
    <img
      src={variant === 'transparent' ? logoGlyphTransparent : logoGlyph}
      alt="ResellOS"
      width={size}
      height={size}
      className={`object-contain flex-shrink-0 ${className}`}
    />
  );
}
