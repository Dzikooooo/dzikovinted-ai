// Convention monetaire unique pour toute l'application (validee le
// 2026-07-24, Cycle D pre-beta) : "123 €" -- entier arrondi, espace avant
// le symbole, jamais le code ISO "EUR", jamais de decimales, quel que soit
// l'ecran. Remplace les variantes qui coexistaient (Stock/Opportunites en
// "€" sans espace homogene, Comptabilite/Dashboard/Stats en "EUR", Depenses
// en 2 decimales).
//
// `Math.round(x) || 0` normalise le cas -0 (ex. Math.round(-0.3) === -0,
// qui s'afficherait litteralement "-0 €" une fois interpole dans une
// chaine) -- -0 est falsy en JS, donc `|| 0` le remplace proprement.
export function formatEUR(amount: number): string {
  return `${Math.round(amount) || 0} €`;
}
