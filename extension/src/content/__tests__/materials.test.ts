import { describe, expect, it } from "vitest";
import { parseMaterials } from "../materials";

// Mission "MATIERE : BUG MATCHING" (2026-08-16) : miroir des tests de
// src/lib/__tests__/materials.test.ts (app) -- meme logique dupliquee cote
// extension (paquet independant), desormais appliquee en DEFENSE au point de
// consommation dans vinted-publish.ts::runPublish() sur payload.materials[i]
// ET sur le repli payload.material. Preuve live directe de la necessite :
// requested:"Coton, Polyester" observe comme UNE SEULE "matiere" logique
// (une seule iteration de boucle) au lieu de deux -- cause exacte du
// outcome:"no_reliable_match" (aucune option Vinted ne s'appelle
// litteralement "Coton, Polyester").
describe("parseMaterials", () => {
  it("returns an empty array for null/undefined/empty/whitespace-only input", () => {
    expect(parseMaterials(null)).toEqual([]);
    expect(parseMaterials(undefined)).toEqual([]);
    expect(parseMaterials("")).toEqual([]);
    expect(parseMaterials("   ")).toEqual([]);
  });

  it("wraps a single material with no separator into a one-element array (already-atomic input stays a no-op)", () => {
    expect(parseMaterials("Coton")).toEqual(["Coton"]);
  });

  it("splits the exact live-observed failure case -- 'Coton, Polyester' becomes two atomic values", () => {
    expect(parseMaterials("Coton, Polyester")).toEqual(["Coton", "Polyester"]);
  });

  it("splits on a semicolon and a slash", () => {
    expect(parseMaterials("Coton; Polyester")).toEqual(["Coton", "Polyester"]);
    expect(parseMaterials("Coton/Polyester")).toEqual(["Coton", "Polyester"]);
  });

  it("splits on ' et '/' & '/' + '", () => {
    expect(parseMaterials("Coton et Polyester")).toEqual(["Coton", "Polyester"]);
    expect(parseMaterials("Coton & Polyester")).toEqual(["Coton", "Polyester"]);
    expect(parseMaterials("Coton + Polyester")).toEqual(["Coton", "Polyester"]);
  });

  it("trims surrounding whitespace on each part", () => {
    expect(parseMaterials("  Coton ,  Polyester  ")).toEqual(["Coton", "Polyester"]);
  });

  it("drops empty parts produced by trailing/duplicate separators rather than inventing a blank material", () => {
    expect(parseMaterials("Coton, , Polyester")).toEqual(["Coton", "Polyester"]);
    expect(parseMaterials("Coton,")).toEqual(["Coton"]);
  });

  it("deduplicates case-insensitively while preserving first-seen casing and order", () => {
    expect(parseMaterials("Coton, coton, COTON")).toEqual(["Coton"]);
  });
});
