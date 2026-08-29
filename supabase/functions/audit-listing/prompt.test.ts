import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { buildAuditPrompt } from "./prompt.ts";

Deno.test("buildAuditPrompt inclut chaque champ reel de l'annonce", () => {
  const prompt = buildAuditPrompt({
    title: "Pull Carhartt homme M",
    description: "Tres bon etat",
    category: "Pulls",
    brand: "Carhartt",
    condition: "Très bon état",
    photoCount: 3,
  });
  assertStringIncludes(prompt, "Pull Carhartt homme M");
  assertStringIncludes(prompt, "Tres bon etat");
  assertStringIncludes(prompt, "Pulls");
  assertStringIncludes(prompt, "Carhartt");
  assertStringIncludes(prompt, "Très bon état");
  assertStringIncludes(prompt, "Nombre de photos : 3");
});

Deno.test("champs absents (null) -> mentions honnetes, jamais une valeur vide silencieuse", () => {
  const prompt = buildAuditPrompt({
    title: "Pull sans marque",
    description: null,
    category: null,
    brand: null,
    condition: null,
    photoCount: 0,
  });
  assertStringIncludes(prompt, "(aucune)");
  assertStringIncludes(prompt, "(non renseignee)");
  assertStringIncludes(prompt, "(non renseigne)");
  assertStringIncludes(prompt, "Nombre de photos : 0");
});

Deno.test("l'instruction photo_note rappelle explicitement qu'aucun contenu visuel n'est analyse", () => {
  const prompt = buildAuditPrompt({
    title: "Pull",
    description: null,
    category: null,
    brand: null,
    condition: null,
    photoCount: 5,
  });
  assertStringIncludes(prompt, "jamais sur leur contenu visuel");
  assertEquals(prompt.includes("Nombre de photos : 5"), true);
});
