// Aide a la declaration URSSAF -- micro-entreprise, BIC achat/revente de
// marchandises (2026-08-26). Remplace l'ancien encart "TVA sur la marge",
// qui n'avait pas lieu d'etre ici : une micro-entreprise sous le seuil de
// franchise en base ne facture ni ne declare de TVA. Un revendeur Vinted en
// micro-BIC declare un chiffre d'affaires, pas une TVA sur marge.
//
// LES DEUX TAUX NE SONT PAS DE NOUS et ne doivent jamais etre "ajustes" a
// l'oeil :
//   12,3 %  cotisations sociales, vente de marchandises (BIC achat/revente).
//           Deja le taux utilise par la page avant cette refonte.
//   71 %    abattement forfaitaire pour frais du regime micro-BIC vente de
//           marchandises. Le revenu imposable est donc 29 % du CA.
//
// CE QUE CE MODULE NE SAIT PAS, et que l'ecran doit dire a l'utilisateur :
// l'URSSAF se declare sur les sommes REELLEMENT ENCAISSEES pendant la
// periode. ResellOS ne connait que `sold_price` des annonces marquees vendues
// avec une `sold_date` -- ce n'est pas une date d'encaissement, et il manque
// toute vente non enregistree dans l'app. Le chiffre produit ici est une aide
// a la saisie, jamais un montant a recopier les yeux fermes.

export const URSSAF_BIC_RATE = 0.123;
export const MICRO_BIC_ALLOWANCE = 0.71;

export interface UrssafDeclarationEstimate {
  /** CA brut de la periode : le montant a reporter dans la case URSSAF. */
  declarableRevenue: number;
  /** Cotisations sociales estimees = CA x 12,3 %. */
  socialContributions: number;
  /** Revenu net imposable a l'IR = CA x (1 - 71 %). */
  taxableIncome: number;
}

export function computeUrssafDeclaration(revenue: number): UrssafDeclarationEstimate {
  // Un CA negatif n'existe pas : une periode a perte reste un CA de 0 du
  // point de vue de la declaration (les pertes se traitent ailleurs, pas en
  // minorant le chiffre d'affaires). Non-fini => 0 plutot que NaN a l'ecran.
  const base = Number.isFinite(revenue) && revenue > 0 ? revenue : 0;
  return {
    declarableRevenue: base,
    socialContributions: base * URSSAF_BIC_RATE,
    taxableIncome: base * (1 - MICRO_BIC_ALLOWANCE),
  };
}
