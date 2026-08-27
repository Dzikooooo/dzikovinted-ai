// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://www.vinted.fr/catalog" }
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractItemsFromDocument } from "../itemExtraction";

// ==============================================================================
// BUG REEL, confirme par capture d'ecran en direct puis par requete SQL en
// production (2026-08-27) : cliquer "Voir sur Vinted" reouvrait ResellOS.
// ==============================================================================
// `market_opportunities.vinted_url` contenait des chemins RELATIFS
// ("/items/9797084772-arcteryx-rainproof-beta-lt-jacket-men?referrer=catalog")
// au lieu d'URLs absolues. Le composant React (Opportunities.tsx, deja
// verifie et teste) rendait <a href={vinted_url}> correctement -- mais un
// href relatif se resout contre l'origine COURANTE (resellosapp.com), jamais
// vinted.fr. La donnee elle-meme etait fausse des l'ecriture, pas la lecture.
//
// Ces tests figent le comportement inverse : quelle que soit la forme du HTML
// source (href relatif ou deja absolu), extractItemsFromDocument() doit
// TOUJOURS rendre une URL absolue.

function makeResultCard(opts: {
  prefix?: string;
  title?: string;
  price?: string;
  href?: string;
  image?: string;
  favourites?: string;
}): void {
  const {
    prefix = "item-42",
    title = "polo ralph lauren homme",
    price = "25,00 €",
    href = "/items/9797084772-polo-ralph-lauren-homme?referrer=catalog",
    image = "https://images1.vinted.net/photo.jpg",
    favourites,
  } = opts;

  const container = document.createElement("div");
  container.setAttribute("data-testid", prefix);

  const titleEl = document.createElement("p");
  titleEl.setAttribute("data-testid", `${prefix}--description-title`);
  titleEl.textContent = title;

  const priceEl = document.createElement("p");
  priceEl.setAttribute("data-testid", `${prefix}--price-text`);
  priceEl.textContent = price;

  // La cause exacte du bug : un <a href="..."> tel qu'ecrit dans le HTML
  // reel de Vinted -- jsdom respecte la meme semantique href/getAttribute
  // que Chromium, donc reproduit fidelement le bug ET son correctif.
  const linkEl = document.createElement("a");
  linkEl.setAttribute("data-testid", `${prefix}--overlay-link`);
  linkEl.setAttribute("href", href);

  const imageEl = document.createElement("img");
  imageEl.setAttribute("data-testid", `${prefix}--image--img`);
  imageEl.setAttribute("src", image);

  container.append(titleEl, priceEl, linkEl, imageEl);

  if (favourites !== undefined) {
    const favEl = document.createElement("span");
    favEl.setAttribute("data-testid", "favourite-count-text");
    favEl.textContent = favourites;
    container.appendChild(favEl);
  }

  document.body.appendChild(container);
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("extractItemsFromDocument -- URL toujours absolue", () => {
  it("resout un href RELATIF (le cas reel en production) en URL ABSOLUE vinted.fr", () => {
    // L'environnement jsdom de ce fichier est fixe sur https://www.vinted.fr/catalog
    // (voir @vitest-environment-options en tete de fichier) -- exactement la
    // situation pendant un scan reel (Playwright navigue une vraie page
    // vinted.fr avant d'evaluer cette fonction).
    makeResultCard({ href: "/items/9797084772-polo-ralph-lauren-homme?referrer=catalog" });

    const [item] = extractItemsFromDocument();

    expect(item.url).toBe("https://www.vinted.fr/items/9797084772-polo-ralph-lauren-homme?referrer=catalog");
    expect(item.url.startsWith("http")).toBe(true);
  });

  it("laisse un href DEJA absolu inchange -- pas de double-prefixage", () => {
    makeResultCard({ href: "https://www.vinted.fr/items/111-deja-absolu" });

    const [item] = extractItemsFromDocument();

    expect(item.url).toBe("https://www.vinted.fr/items/111-deja-absolu");
  });

  it("extrait correctement le titre depuis le slug, que l'URL soit relative ou absolue", () => {
    makeResultCard({ href: "/items/222-veste-carhartt-detroit" });

    const [item] = extractItemsFromDocument();

    expect(item.title).toBe("veste carhartt detroit");
  });
});

describe("extractItemsFromDocument -- lecture des champs", () => {
  it("lit prix, image et favoris", () => {
    makeResultCard({ price: "42,50 €", image: "https://images1.vinted.net/x.jpg", favourites: "7" });

    const [item] = extractItemsFromDocument();

    expect(item.price).toBe(42.5);
    expect(item.image).toBe("https://images1.vinted.net/x.jpg");
    expect(item.favourites).toBe(7);
  });

  it("rend 0 favoris quand le compteur est absent, jamais une valeur inventee", () => {
    makeResultCard({});

    const [item] = extractItemsFromDocument();

    expect(item.favourites).toBe(0);
  });

  it("lit plusieurs cartes de resultats sans les confondre", () => {
    makeResultCard({ prefix: "item-1", href: "/items/1-premier", price: "10 €" });
    makeResultCard({ prefix: "item-2", href: "/items/2-second", price: "20 €" });

    const items = extractItemsFromDocument();

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.url)).toEqual([
      "https://www.vinted.fr/items/1-premier",
      "https://www.vinted.fr/items/2-second",
    ]);
  });

  it("ignore un titre sans prefixe testid exploitable", () => {
    const orphan = document.createElement("p");
    orphan.setAttribute("data-testid", "--description-title");
    orphan.textContent = "orphelin";
    document.body.appendChild(orphan);

    expect(extractItemsFromDocument()).toEqual([]);
  });

  it("rend un tableau vide sur une page sans aucun resultat", () => {
    expect(extractItemsFromDocument()).toEqual([]);
  });
});
