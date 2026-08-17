// Miroir de src/lib/materials.ts (app) -- meme logique de decoupage,
// duplique car l'extension est un paquet independant (voir EXTENSION.md §9,
// meme convention deja assumee pour ActionKind/PublishListingPayload).
//
// Mission "MATIERE : BUG MATCHING" (2026-08-16) -- CAUSE EXACTE prouvee par
// lecture de code (pas une hypothese) : le site d'appel de vinted-publish.ts
// (runPublish()) derivait `requestedMaterials` ainsi :
//   payload.materials && payload.materials.length > 0
//     ? payload.materials
//     : payload.material ? [payload.material] : []
// Le repli sur `payload.material` enveloppait la chaine BRUTE, EVENTUELLEMENT
// JOINTE ("Coton, Polyester"), dans un tableau A UN SEUL ELEMENT -- jamais
// decoupee. Preuve live directe : log PREFILL_MATERIAL
// requested:"Coton, Polyester" (une seule iteration de boucle, une seule
// "matiere" logique) alors que le texte DOM reel de material-44 est bien
// "Coton" seul -- la boucle de attemptMaterialPrefill() recevait donc une
// seule chaine jointe au lieu de deux valeurs atomiques, expliquant
// exactement "no_reliable_match" (aucune option Vinted ne s'appelle
// litteralement "Coton, Polyester").
//
// Ce module est desormais applique en DEFENSE au point de consommation
// (vinted-publish.ts), sur CHAQUE element de `payload.materials` ET sur le
// repli `payload.material` -- jamais suppose deja atomique, quelle que soit
// la source (app web deja a jour ou non, appelant futur qui ne peuplerait
// que le champ scalaire).
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
