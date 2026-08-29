// Fond de photo genere (2026-08-30, refonte Generateur) -- extrait de
// index.ts pour rester testable sans monter tout le monolithe Deno.serve
// (meme convention que _shared/credits.ts::isMetered). Fonction PURE, aucun
// effet de bord, aucun appel reseau.
//
// "original" n'est PAS une cle de cette table : c'est la valeur qui signifie
// "aucune edition demandee" cote index.ts (aucun appel au modele d'edition
// d'image, comportement inchange). Les 4 styles ci-dessous sont les seuls
// fonds proposes -- une allowlist fermee plutot qu'un texte libre envoye tel
// quel a Gemini, pour ne jamais laisser un style invente/mal forme produire
// une instruction d'edition incoherente.
export const BACKGROUND_STYLES: Record<string, string> = {
  blanc_studio: "un fond blanc uni de studio professionnel, éclairage neutre et homogène, aucune ombre marquée",
  lifestyle_neutre: "un intérieur lumineux et neutre (dressing ou loft scandinave), légèrement flou en arrière-plan (bokeh doux), sans élément qui distrait du produit",
  beige_gres: "un fond uni beige/grès doux, texture papier de studio photo",
  marbre_clair: "une surface en marbre clair (blanc à veines grises), vue adaptée au produit posé dessus",
};

export type BackgroundStyleKey = keyof typeof BACKGROUND_STYLES;

export function isKnownBackgroundStyle(style: string | undefined): style is BackgroundStyleKey {
  return !!style && style in BACKGROUND_STYLES;
}

// L'instruction envoyee au modele d'edition d'image -- insiste explicitement
// sur "ne jamais modifier le produit" : un modele generatif d'image peut
// legitimement deriver au-dela du fond seul si on ne le lui interdit pas
// clairement (risque reel, contrairement au modele TEXTE utilise ailleurs
// dans cette fonction qui n'a physiquement aucun moyen de toucher aux
// pixels).
export function buildBackgroundEditInstruction(style: BackgroundStyleKey): string {
  return `Remplace UNIQUEMENT l'arrière-plan de cette photo par ${BACKGROUND_STYLES[style]}. Ne modifie JAMAIS le produit au premier plan (couleur, forme, texture, étiquette, défauts, plis, matière) -- seul l'arrière-plan doit changer. Garde un cadrage et un rendu photographique réaliste, cohérent avec une vraie photo de vente.`;
}
