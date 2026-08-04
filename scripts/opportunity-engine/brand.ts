// Validation defensive de derniere ligne avant ecriture en base (voir
// vinted-scan.ts::main, upsert market_opportunities) -- P0-1, 2026-08-04.
// La vraie cause des marques polluees (LOOK, Softshell, "Stussy zip hoodie,
// S") etait que market_opportunities.brand utilisait le texte scrape du DOM
// de la fiche Vinted (extractItemsFromPage(), titleEl.textContent), un champ
// qui contient parfois le titre libre complet de l'annonce plutot qu'une
// marque, quand le vendeur n'a pas associe de marque catalogue Vinted a son
// article. Le correctif principal est de ne plus utiliser cette valeur
// scrapee du tout et de reutiliser watch.brand (le nom de marque de la
// recherche watchlist elle-meme, deja verifie par isRelevant() -- chaque
// item retenu contient forcement watch.brand, ou un synonyme connu, dans son
// propre titre avant meme d'arriver ici). watch.brand est donc deja fiable
// par construction ; cette fonction est un filet de securite supplementaire,
// pas la defense principale, pour le jour ou une source moins fiable
// (ex. entree utilisateur libre dans "Ajouter une recherche") alimentera
// directement ce champ.
//
// Volontairement permissif sur le nombre de mots : plusieurs vraies marques
// suivies aujourd'hui font 2 a 4 mots ("The North Face", "C.P. Company",
// "New Balance", "Nike x Stussy", "Comme des Garcons") -- une limite stricte
// sur le nombre de mots seule aurait rejete des marques rares legitimes,
// contrainte explicite de ce correctif. Le signal retenu est plus specifique
// : une marque ne se termine jamais par une virgule suivie d'une taille
// ("Stussy zip hoodie, S"), motif qui n'existe que dans un titre d'annonce.
const MAX_BRAND_LENGTH = 40;
const MAX_BRAND_WORDS = 6;
const SIZE_SUFFIX_PATTERN = /,\s*(XXS|XS|S|M|L|XL|XXL|XXXL|\d{1,3}([.,]\d)?)\s*$/i;

// null = valeur rejetee (jamais une chaine inventee en remplacement) -- une
// ligne market_opportunities avec brand=null degrade proprement cote UI
// (Opportunities.tsx traite deja item.brand comme optionnel : filtre
// "Marque" et compteur "marque la plus vue" l'ignorent simplement), plutot
// que d'ecrire une etiquette fabriquee comme "Autre" ou "Inconnu".
export function normalizeBrand(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_BRAND_LENGTH) return null;
  if (SIZE_SUFFIX_PATTERN.test(trimmed)) return null;
  if (trimmed.split(' ').length > MAX_BRAND_WORDS) return null;
  return trimmed;
}
