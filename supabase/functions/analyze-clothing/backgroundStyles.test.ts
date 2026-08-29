import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { BACKGROUND_STYLES, buildBackgroundEditInstruction, isKnownBackgroundStyle } from "./backgroundStyles.ts";

Deno.test("isKnownBackgroundStyle reconnait chaque cle de l'allowlist", () => {
  for (const key of Object.keys(BACKGROUND_STYLES)) {
    assertEquals(isKnownBackgroundStyle(key), true);
  }
});

Deno.test("isKnownBackgroundStyle rejette 'original', undefined et un texte invente", () => {
  assertEquals(isKnownBackgroundStyle("original"), false);
  assertEquals(isKnownBackgroundStyle(undefined), false);
  assertEquals(isKnownBackgroundStyle("n'importe quoi"), false);
});

Deno.test("buildBackgroundEditInstruction insiste sur ne jamais modifier le produit", () => {
  const instruction = buildBackgroundEditInstruction("blanc_studio");
  assertStringIncludes(instruction, "Ne modifie JAMAIS le produit");
  assertStringIncludes(instruction, BACKGROUND_STYLES.blanc_studio);
});

Deno.test("buildBackgroundEditInstruction produit un texte distinct par style", () => {
  const a = buildBackgroundEditInstruction("beige_gres");
  const b = buildBackgroundEditInstruction("marbre_clair");
  assertEquals(a === b, false);
});
