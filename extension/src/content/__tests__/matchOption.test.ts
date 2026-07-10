import { describe, expect, it } from "vitest";
import { matchOption } from "../matchOption";

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
});
