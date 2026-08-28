// Accents de marque, centralises ici pour que la regle qui les separe ne soit
// plus redecidee fichier par fichier. Deplace depuis src/pages/landing/ le
// 2026-08-26 : le dashboard en a besoin aussi (page Compte Vinted).
//
//   BRAND_VIOLET -- tout ce qui est ResellOS : icones de modules, onglets,
//                   puces, liens de la marque. C'est la couleur du glyphe "R"
//                   et du "OS" du wordmark. Reprend EXACTEMENT le token
//                   `neon-500` de tailwind.config.js -- preferer la classe
//                   `text-neon-500` quand une classe suffit, cette constante
//                   quand seul un style inline le permet.
//
//   VINTED_*     -- UNIQUEMENT quand l'element designe reellement Vinted (le
//                   mot "Vinted", un compte Vinted, un CTA vers Vinted).
//                   Jamais un accent decoratif.
//
// POURQUOI DEUX TEINTES VINTED, et non une seule : c'est une contrainte de
// CONTRASTE, pas une hesitation. Ratios mesures sur fond blanc :
//
//   #09B1BA  2.62:1  -- echoue WCAG AA, y compris pour du grand texte (3:1)
//   #007782  5.30:1  -- passe AA pour du texte normal (4.5:1)
//
// VINTED_TEAL est donc reserve aux APLATS PUREMENT DECORATIFS (pastilles,
// bordures, remplissages) sur lesquels AUCUN texte ne repose. VINTED_INK est
// la seule des deux utilisable des qu'un libelle entre en jeu -- comme
// couleur du texte, ET comme fond d'un bouton plein.
//
// PIEGE CORRIGE LE 2026-08-26 : un contraste est symetrique. Le 2.62:1
// ci-dessus vaut aussi pour du BLANC POSE SUR le teal, pas seulement pour du
// teal lu sur blanc. Un bouton plein #09B1BA a libelle blanc echoue donc AA
// exactement comme du texte teal sur blanc. Le playbook l'autorisait a tort ;
// les deux boutons concernes ("Ouvrir sur Vinted", "Voir sur Vinted") sont
// passes en VINTED_INK, ou le blanc mesure 5.30:1.
export const BRAND_VIOLET = '#7C5CFF';
export const VINTED_TEAL = '#09B1BA';
export const VINTED_INK = '#007782';
