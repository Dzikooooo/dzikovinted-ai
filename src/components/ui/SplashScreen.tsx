import { Logo } from './Logo';

// Ecran de demarrage -- affiche a chaque ouverture/lancement/refresh tant
// que la session Supabase n'est pas encore resolue (voir App.tsx::loading),
// avec une duree minimale imposee pour ne jamais flasher en dessous de ce
// qui est perceptible (demande produit 2026-08-04).
//
// Refonte theme clair (2026-08-24). Trois defauts corriges, tous constates
// sur le rendu reel :
//   - `variant="square"` affichait logo-glyph.png, dont le FOND NOIR et les
//     coins arrondis sont peints DANS l'image -- d'ou le "petit carre noir"
//     au milieu d'un ecran blanc. `variant="transparent"` est la meme marque
//     sans ce fond.
//   - le glyphe faisait 46 px au centre d'un plein ecran : un favicon, pas
//     un ecran de marque. Passe a ~112 px, puis ~144 px (2026-08-26).
//   - "by Dziko" en 11 px etait illisible. Passe en 13 px, puis 15 px, en
//     majuscules et interlettrage large.
//
// Passe 2026-08-26 : le glyphe et la mention sont encore agrandis d'un cran,
// et "BY DZIKO" quitte le gris clair (text-gray-400, contraste insuffisant
// sur blanc) pour du noir franc.
//
// Les deux anneaux qui tournaient sont retires : deux cercles en rotation
// permanente EST un spinner generique, explicitement ecarte. Le mouvement
// devient une respiration tres lente du glyphe (.splash-breathe, index.css)
// -- perceptible sans jamais attirer l'attention, et neutralisee sous
// prefers-reduced-motion.
export function SplashScreen() {
  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center gap-10 px-6">
      <div className="splash-breathe">
        <Logo variant="transparent" size={144} className="w-32 h-32 sm:w-36 sm:h-36" />
      </div>
      <p className="text-[15px] text-gray-900 font-mono font-semibold uppercase tracking-[0.35em]">by Dziko</p>
    </div>
  );
}
