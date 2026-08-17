import { describe, expect, it } from "vitest";
import { describeMatchAttempt, matchOption } from "../matchOption";

describe("matchOption", () => {
  it("returns null for null/undefined/empty input", () => {
    expect(matchOption(null, ["M", "L"])).toBeNull();
    expect(matchOption(undefined, ["M", "L"])).toBeNull();
    expect(matchOption("   ", ["M", "L"])).toBeNull();
  });

  it("returns null when there are no options", () => {
    expect(matchOption("M", [])).toBeNull();
  });

  it("matches an exact option", () => {
    expect(matchOption("M", ["S", "M", "L"])).toBe("M");
  });

  it("matches case-insensitively", () => {
    expect(matchOption("très bon état", ["Neuf avec étiquette", "Très bon état"])).toBe("Très bon état");
  });

  it("matches ignoring accents", () => {
    expect(matchOption("tres bon etat", ["Neuf avec étiquette", "Très bon état"])).toBe("Très bon état");
  });

  it("matches via substring when no exact match exists", () => {
    expect(matchOption("Zara", ["Zara Basic", "Nike"])).toBe("Zara Basic");
  });

  it("never fabricates a match when nothing is close enough", () => {
    expect(matchOption("Balenciaga", ["Zara", "Nike", "Adidas"])).toBeNull();
  });

  // Mission "FINIR LES CHAMPS MANQUANTS" (2026-08-11), item 5 : preuve
  // directe du risque de faux positif -- DB "Ralph" (donnee tronquee/
  // partielle) face aux options Vinted reelles ["Ralph Lauren", "Polo Ralph
  // Lauren"] : AUCUNE des deux n'est un match exact, mais toutes les deux
  // contiennent "ralph" -- deux candidats partiels egalement valides.
  // L'ancienne version (.find()) aurait silencieusement choisi le premier de
  // la liste, sans aucune garantie de justesse -- desormais refuse tout
  // choix ambigu plutot que de deviner lequel des deux est le bon.
  it("refuses to pick between two equally valid partial matches -- 'Ralph' vs 'Ralph Lauren'/'Polo Ralph Lauren'", () => {
    expect(matchOption("Ralph", ["Ralph Lauren", "Polo Ralph Lauren"])).toBeNull();
    expect(matchOption("Ralph", ["Polo Ralph Lauren", "Ralph Lauren"])).toBeNull();
  });

  it("still matches on an exact match even when OTHER options merely contain it as a substring -- exact equality outranks substring ambiguity", () => {
    expect(matchOption("Ralph Lauren", ["Ralph Lauren", "Polo Ralph Lauren"])).toBe("Ralph Lauren");
  });

  it("still matches when only one candidate is a substring/superstring of the other options", () => {
    expect(matchOption("Ralph Lauren", ["Ralph Lauren", "Nike", "Adidas"])).toBe("Ralph Lauren");
    expect(matchOption("Zara", ["Zara Basic", "Nike"])).toBe("Zara Basic");
  });

  it("refuses when multiple options normalize to the exact same text (duplicate options)", () => {
    expect(matchOption("M", ["M", "m", "L"])).toBeNull();
  });

  // Mission "CORRIGER LES ATTRIBUTS POST-CATEGORIE" (2026-08-12) : preuve
  // live directe -- payload.brand = "Polo Ralph Lauren", options reelles
  // Vinted (52 lues) contiennent "Ralph Lauren" ET "Polo Ralph Lauren" comme
  // DEUX entrees distinctes (le cas exact anticipe par le test "Ralph" plus
  // haut, mais avec la vraie source ambigue -- "Polo Ralph Lauren" est
  // exact contre l'une des deux options, donc PAS ambigu ici : l'exactitude
  // gagne toujours sur la ressemblance partielle d'une AUTRE option).
  it("real brand scenario -- 'Polo Ralph Lauren' matches uniquely when Vinted lists both 'Ralph Lauren' and 'Polo Ralph Lauren' (exact wins)", () => {
    expect(matchOption("Polo Ralph Lauren", ["Ralph Lauren", "Polo Ralph Lauren", "Nike", "Adidas"])).toBe(
      "Polo Ralph Lauren"
    );
  });

  // Meme scenario, mais si la source ResellOS ne porte que "Ralph" (donnee
  // partielle/tronquee) -- aucune des deux options n'est un match exact,
  // les deux sont des matches partiels egalement valides => refus, jamais un
  // choix arbitraire entre "Ralph Lauren" et "Polo Ralph Lauren".
  it("real brand scenario -- a truncated source value ('Ralph') stays ambiguous between the two real Vinted entries", () => {
    expect(matchOption("Ralph", ["Ralph Lauren", "Polo Ralph Lauren", "Nike", "Adidas"])).toBeNull();
  });

  // Mission "FINIR LA REPUBLICATION" (2026-08-13), item 4 : preuve live
  // directe -- requestedValue "Polo Ralph Lauren", 52 options lues,
  // exactMatches.length===2, reason "multiple_exact_matches_ambiguous". Les
  // diagnostics structuraux existants (describeExactMatchStructure) n'ont
  // PAS encore ete captures en live pour cette annonce precise -- aucune
  // deduplication n'est tentee ici (pas de Set(text), aucune identite
  // structurelle prouvee) : matchOption() reste INCHANGE et continue de
  // refuser ce cas plutot que de deviner lequel des deux <li> identiques
  // choisir. Marque reste MANUAL_REQUIRED tant que ce diagnostic n'est pas
  // fourni en live (voir le rapport de mission pour le detail).
  it("real live scenario -- 'Polo Ralph Lauren' appears twice with IDENTICAL text among 52 real Vinted options -- stays ambiguous (never a Set(text) dedup guess)", () => {
    const realisticOptionsWithDuplicate = [
      "Nike",
      "Adidas",
      "Ralph Lauren",
      "Polo Ralph Lauren",
      "Zara",
      "Polo Ralph Lauren", // meme texte, deuxieme <li> distinct observe en live
      "H&M",
    ];
    expect(matchOption("Polo Ralph Lauren", realisticOptionsWithDuplicate)).toBeNull();
  });

  // Contre-preuve : sans le doublon, le meme requestedValue matche
  // uniquement -- la duplication EST la cause de l'ambiguite, pas
  // matchOption() lui-meme.
  it("the same requestedValue matches uniquely once the duplicate entry is removed (proves the duplicate itself is the cause of the ambiguity)", () => {
    const optionsWithoutDuplicate = ["Nike", "Adidas", "Ralph Lauren", "Polo Ralph Lauren", "Zara", "H&M"];
    expect(matchOption("Polo Ralph Lauren", optionsWithoutDuplicate)).toBe("Polo Ralph Lauren");
  });

  // Mission "BRAND SEARCH-FILTER FLOW" (2026-08-13) : preuve live directe --
  // taper "Polo Ralph Lauren" dans le champ de recherche Marque de Vinted
  // fait passer le DOM de 2 candidats ambigus a EXACTEMENT 1 resultat
  // canonique visible. Ce test documente exactement ce scenario post-filtre
  // (contrairement au test precedent, qui documente le scenario PRE-filtre,
  // 52 options non filtrees) -- matchOption() n'a besoin d'aucune
  // modification pour gerer les deux : une fois le filtrage reussi, un seul
  // candidat exact suffit a lever l'ambiguite naturellement.
  it("real live scenario -- after typing the search filter, only ONE 'Polo Ralph Lauren' candidate remains and matches uniquely", () => {
    const filteredOptions = ["Polo Ralph Lauren"];
    expect(matchOption("Polo Ralph Lauren", filteredOptions)).toBe("Polo Ralph Lauren");
  });
});

// Mission "FINIR LA REPUBLICATION" (2026-08-13), item 2 -- HISTORIQUE : a ce
// stade, aucun reader dedie n'existait encore pour Taille (aucune preuve
// live de la structure DOM reelle). Mission "FIX LIVE-GROUNDED : TAILLE +
// COULEUR" (2026-08-13, suivante) : preuve live fournie (size-group-{n}-
// grid-option-{id}, voir sizeOptionReader.ts/sizeOptionReader.test.ts) --
// Taille utilise desormais un chemin DEDIE. matchOption() reste NEANMOINS
// le mecanisme de matching reutilise tel quel par ce chemin dedie (voir
// vinted-publish.ts::attemptDedicatedPickerPrefill) -- ces tests restent
// donc la preuve de non-regression pertinente, juste plus "generic path
// only" comme l'indiquait l'ancien commentaire.
describe("matchOption() against a realistic Vinted size scale (Taille -- reused as-is by the dedicated sizeOptionReader.ts path)", () => {
  const REAL_SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL", "8XL", "Taille unique"];

  it("'L' matches exactly 'L' -- never 'XL', 'XXL', 'XXXL' or any other XL variant despite sharing the same letter", () => {
    expect(matchOption("L", REAL_SIZE_OPTIONS)).toBe("L");
  });

  it("'XL' matches exactly 'XL' -- never 'L' or 'XXL'", () => {
    expect(matchOption("XL", REAL_SIZE_OPTIONS)).toBe("XL");
  });

  it("'Taille unique' matches exactly, live-confirmed label", () => {
    expect(matchOption("Taille unique", REAL_SIZE_OPTIONS)).toBe("Taille unique");
  });

  it("a size absent from the real scale returns null (manual) rather than guessing the closest one", () => {
    expect(matchOption("9XL", REAL_SIZE_OPTIONS)).toBeNull();
  });

  it("matches case-insensitively ('l' -> 'L')", () => {
    expect(matchOption("l", REAL_SIZE_OPTIONS)).toBe("L");
  });
});

// Mission "FINIR LA REPUBLICATION" (2026-08-13), item 3 -- HISTORIQUE : idem
// Taille, situation resolue par la mission suivante "FIX LIVE-GROUNDED :
// TAILLE + COULEUR" (color-{id}, voir colorOptionReader.ts/
// colorOptionReader.test.ts) -- Couleur utilise desormais un chemin DEDIE,
// qui reutilise TEL QUEL matchOption() pour le matching. Vinted autorise
// jusqu'a 2 couleurs, mais ResellOS ne transmet ici qu'UNE seule valeur
// source ("Bleu") : aucune couleur supplementaire n'est inventee par
// matchOption() lui-meme (il ne recoit et ne traite qu'une valeur a la fois).
describe("matchOption() against a realistic Vinted color list (Couleur -- reused as-is by the dedicated colorOptionReader.ts path)", () => {
  const REAL_COLOR_OPTIONS = ["Noir", "Blanc", "Bleu", "Bleu marine", "Rouge", "Vert", "Gris", "Beige"];

  it("'Bleu' matches uniquely despite 'Bleu marine' also containing it -- exact equality outranks substring ambiguity", () => {
    expect(matchOption("Bleu", REAL_COLOR_OPTIONS)).toBe("Bleu");
  });

  it("a color absent from the list returns null (manual) rather than guessing the closest one", () => {
    expect(matchOption("Turquoise", REAL_COLOR_OPTIONS)).toBeNull();
  });

  it("an ambiguous partial value refuses rather than picking one of several equally valid candidates", () => {
    // "Bleu" est contenu dans "Bleu clair" ET "Bleu marine" a parts egales
    // (aucun exact match dans cette liste precise) -- deux candidats partiels
    // egalement valides, doit rester manuel plutot que de choisir l'un d'eux.
    const optionsWithOverlappingBlues = ["Bleu clair", "Bleu marine", "Rouge"];
    expect(matchOption("Bleu", optionsWithOverlappingBlues)).toBeNull();
  });
});

// Mission "MATIERE" (2026-08-16) : matchOption() reste le mecanisme de
// matching reutilise TEL QUEL par attemptAttributePrefill() pour Matiere --
// AUCUN reader/chemin dedie n'existe pour ce champ (contrairement a
// Taille/Couleur/Marque/Etat), donc ce chemin generique + matchOption() sont
// la SEULE couverture de test possible sans mocker `chrome` (meme contrainte
// que les autres attempt*Prefill(), jamais testes directement -- voir
// vinted-publish.ts::attemptAttributePrefill). IMPORTANT : contrairement a
// REAL_SIZE_OPTIONS (echelle Vinted confirmee en direct ailleurs) et
// REAL_COLOR_OPTIONS (liste de couleurs Vinted courantes), la liste de
// matieres ci-dessous n'a JAMAIS ete verifiee en direct sur le DOM Vinted
// reel (voir le rapport d'audit Matiere) -- elle sert uniquement a prouver
// que matchOption() lui-meme se comporte correctement (casse, accents,
// ambiguite, absence) independamment de la vraie liste Vinted, qui reste a
// confirmer par le prochain test live.
describe("matchOption() against a plausible (NOT live-verified) Vinted material list (Matière -- generic attemptAttributePrefill path)", () => {
  const PLAUSIBLE_MATERIAL_OPTIONS = ["Coton", "Polyester", "Laine", "Cuir", "Lin", "Soie", "Cachemire", "Denim"];

  it("'Coton' matches exactly", () => {
    expect(matchOption("Coton", PLAUSIBLE_MATERIAL_OPTIONS)).toBe("Coton");
  });

  it("'Polyester' matches exactly", () => {
    expect(matchOption("Polyester", PLAUSIBLE_MATERIAL_OPTIONS)).toBe("Polyester");
  });

  it("'Laine' matches exactly", () => {
    expect(matchOption("Laine", PLAUSIBLE_MATERIAL_OPTIONS)).toBe("Laine");
  });

  it("returns null for an empty/absent source material (never fabricates a choice)", () => {
    expect(matchOption(null, PLAUSIBLE_MATERIAL_OPTIONS)).toBeNull();
    expect(matchOption("", PLAUSIBLE_MATERIAL_OPTIONS)).toBeNull();
  });

  it("returns null for a material unknown to the Vinted list, rather than guessing the closest one", () => {
    expect(matchOption("Néoprène", PLAUSIBLE_MATERIAL_OPTIONS)).toBeNull();
  });

  it("matches case-insensitively and ignoring accents ('coton' -> 'Coton', 'cachemire' -> 'Cachemire')", () => {
    expect(matchOption("coton", PLAUSIBLE_MATERIAL_OPTIONS)).toBe("Coton");
    expect(matchOption("cachemire", PLAUSIBLE_MATERIAL_OPTIONS)).toBe("Cachemire");
  });

  it("tolerates surrounding whitespace ('  Laine  ' -> 'Laine')", () => {
    expect(matchOption("  Laine  ", PLAUSIBLE_MATERIAL_OPTIONS)).toBe("Laine");
  });

  it("refuses an ambiguous partial value rather than picking between two equally valid candidates", () => {
    // "Coton" est contenu a la fois dans "Coton bio" et "Coton mélangé" --
    // aucun match exact dans cette liste precise, deux candidats partiels
    // egalement valides.
    const optionsWithOverlappingCotton = ["Coton bio", "Coton mélangé", "Laine"];
    expect(matchOption("Coton", optionsWithOverlappingCotton)).toBeNull();
  });

  // Documente le GAP multi-matiere (mission "MATIERE", point 4) : le modele
  // ResellOS est scalaire de bout en bout (extraction/stockage/payload, voir
  // itemSelectors.ts::extractMaterial, types.ts::Listing.material,
  // messages.ts::PublishListingPayload.material -- tous `string | null`,
  // aucun tableau) alors meme que le data-testid Vinted du trigger porte
  // "multi" (category-material-multi-list-input, publishSelectors.ts) --
  // matchOption() lui-meme ne recoit et ne traite jamais qu'UNE seule valeur
  // a la fois, exactement comme pour Couleur (meme gap documente plus haut
  // dans ce fichier). Si Vinted s'avere reellement multi-select pour ce
  // champ (a confirmer par le diagnostic live), ResellOS ne selectionnera
  // jamais qu'UNE seule matiere parmi plusieurs valeurs sources
  // potentielles -- tant que le modele de donnees ResellOS lui-meme
  // n'evolue pas vers un tableau, cette limitation est structurelle et non
  // un bug de matchOption().
  it("only ever matches a single material value at a time -- the multi-material gap is structural (ResellOS payload.material is a scalar string, never an array), not a matchOption() limitation", () => {
    expect(matchOption("Coton", PLAUSIBLE_MATERIAL_OPTIONS)).toBe("Coton");
  });
});

// Mission "CORRIGER LES ATTRIBUTS POST-CATEGORIE" (2026-08-12), item 3 :
// describeMatchAttempt() est le diagnostic PUREMENT observationnel ajoute
// pour remplacer la devinette par une preuve exacte quand matchOption()
// refuse un champ (ex. no_reliable_match sur la marque en test live) --
// jamais utilise pour la decision de selection elle-meme (matchOption()
// reste inchangee et seule habilitee a decider).
describe("describeMatchAttempt", () => {
  it("reports reason 'no_candidate_contains_or_is_contained_by_requested_value' when nothing is close enough", () => {
    const diag = describeMatchAttempt("Balenciaga", ["Zara", "Nike", "Adidas"]);
    expect(diag.exactMatches).toEqual([]);
    expect(diag.fuzzyMatches).toEqual([]);
    expect(diag.reason).toBe("no_candidate_contains_or_is_contained_by_requested_value");
  });

  it("reports reason 'multiple_partial_matches_ambiguous' for the truncated-brand case, listing both real candidates", () => {
    const diag = describeMatchAttempt("Ralph", ["Ralph Lauren", "Polo Ralph Lauren", "Nike"]);
    expect(diag.exactMatches).toEqual([]);
    expect(diag.fuzzyMatches).toEqual(["Ralph Lauren", "Polo Ralph Lauren"]);
    expect(diag.reason).toBe("multiple_partial_matches_ambiguous");
  });

  it("reports reason 'multiple_exact_matches_ambiguous' for duplicate-normalized options", () => {
    const diag = describeMatchAttempt("M", ["M", "m", "L"]);
    expect(diag.exactMatches).toEqual(["M", "m"]);
    expect(diag.reason).toBe("multiple_exact_matches_ambiguous");
  });

  it("exposes the normalized forms of both the requested value and every candidate, for direct comparison in logs", () => {
    const diag = describeMatchAttempt("très bon état", ["Neuf avec étiquette", "Très bon état"]);
    expect(diag.normalizedRequestedValue).toBe("tres bon etat");
    expect(diag.normalizedCandidates).toEqual(["neuf avec etiquette", "tres bon etat"]);
  });
});
