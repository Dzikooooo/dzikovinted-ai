import { describe, expect, it } from "vitest";
import { parseWardrobeItem, stripSkuSuffix } from "../wardrobeItemParsing";

describe("parseWardrobeItem", () => {
  it("parse un item complet avec price.amount en string", () => {
    const item = parseWardrobeItem({
      id: 123,
      title: "Sweat Nike",
      url: "https://www.vinted.fr/items/123",
      price: { amount: "22.50" },
      photos: [{ url: "https://images.vinted.net/123.jpg" }],
      favourite_count: 4,
      view_count: 87,
    });
    expect(item).toEqual({
      id: "123",
      title: "Sweat Nike",
      price: 22.5,
      url: "https://www.vinted.fr/items/123",
      photoUrl: "https://images.vinted.net/123.jpg",
      favourites: 4,
      views: 87,
    });
  });

  it("parse un item avec price.amount en number", () => {
    const item = parseWardrobeItem({ id: 1, url: "https://www.vinted.fr/items/1", price: { amount: 15 } });
    expect(item?.price).toBe(15);
  });

  it("reconstruit l'URL absente à partir de l'id", () => {
    const item = parseWardrobeItem({ id: 42 });
    expect(item?.url).toBe("https://www.vinted.fr/items/42");
  });

  it("rejette un item sans id ni url exploitable", () => {
    expect(parseWardrobeItem({ title: "Sans id" })).toBeNull();
  });

  it("prix invalide (non numérique) devient null plutôt que NaN", () => {
    const item = parseWardrobeItem({ id: 1, url: "https://www.vinted.fr/items/1", price: { amount: "gratuit" } });
    expect(item?.price).toBeNull();
  });

  it("champs optionnels absents retombent sur des valeurs neutres, jamais undefined", () => {
    const item = parseWardrobeItem({ id: 1, url: "https://www.vinted.fr/items/1" });
    expect(item).toMatchObject({ title: "", photoUrl: null, favourites: 0, views: 0 });
  });
});

describe("stripSkuSuffix", () => {
  it("retire un suffixe #N manuel en fin de titre", () => {
    expect(stripSkuSuffix("Sweat Nike taille M #12")).toBe("Sweat Nike taille M");
  });

  it("retire plusieurs suffixes empilés", () => {
    expect(stripSkuSuffix("Sweat Nike #12 #7")).toBe("Sweat Nike");
  });

  it("laisse un titre sans suffixe inchangé", () => {
    expect(stripSkuSuffix("Sweat Nike taille M")).toBe("Sweat Nike taille M");
  });

  it("ne touche jamais un # au milieu du titre", () => {
    expect(stripSkuSuffix("Édition #1 collector Nike")).toBe("Édition #1 collector Nike");
  });
});
