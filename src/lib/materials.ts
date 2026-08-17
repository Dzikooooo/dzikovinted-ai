// Mission "MATIERE : MULTI-SELECT" (2026-08-16) : Vinted accepte plusieurs
// matieres (preuve live directe, checkbox.checked prouve simultanement true
// sur deux options distinctes -- voir extension/src/content/materialOptionReader.ts),
// alors que le modele ResellOS (Listing.material, colonne Supabase `text`)
// est reste scalaire de bout en bout (audit complet : aucune autre table ni
// aucun autre champ n'a jamais porte plusieurs matieres). Plutot qu'une
// migration de schema (nouvelle colonne tableau, nouvelle UI d'edition --
// aucune preuve qu'un vrai besoin existe au-dela de la capacite Vinted elle-
// meme), la strategie retenue REUTILISE le champ texte libre EXISTANT
// (EditListingModal.tsx expose deja Matiere comme un simple <input> texte,
// jamais un select) : un utilisateur peut deja y ecrire "Coton, Polyester"
// aujourd'hui sans aucun changement de code. parseMaterials() interprete ce
// texte deja existant en une liste, jamais une donnee inventee -- une valeur
// simple ("Coton") produit un tableau a un seul element, comportement
// identique a avant. Zero migration Supabase, retro-compatible par
// construction (toute annonce existante reste lisible telle quelle).
const MATERIAL_SEPARATOR_REGEX = /,|;|\/| et | & | \+ /gi;

export function parseMaterials(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) return [];

  const parts = raw
    .split(MATERIAL_SEPARATOR_REGEX)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(part);
  }
  return result;
}
