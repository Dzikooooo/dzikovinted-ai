import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DELETE_CONFIRM_TEXT,
  DELETE_MODAL_HEADING_TEXT,
  DELETE_TRIGGER_TEXT,
  findButtonByExactText,
  findDeleteConfirmButton,
  findDeleteTriggerButton,
  isDeleteConfirmationModalVisible,
} from "../deleteFlowSelectors";

// jsdom n'implemente pas de layout reel -- offsetParent/getClientRects()
// restent toujours "invisibles" sans ce stub explicite, meme discipline que
// attributeDropdownDiagnostics.ts.
function stubVisible(el: Element): void {
  Object.defineProperty(el, "offsetParent", { get: () => document.body, configurable: true });
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("findButtonByExactText", () => {
  it("finds a button whose trimmed text matches exactly", () => {
    document.body.innerHTML = "<button>  Supprimer  </button>";
    const btn = findButtonByExactText(document, "Supprimer");
    expect(btn).not.toBeNull();
  });

  it("does not match a button whose text only contains the string as a substring", () => {
    document.body.innerHTML = "<button>Supprimer le brouillon</button>";
    expect(findButtonByExactText(document, "Supprimer")).toBeNull();
  });

  it("returns null when no button matches", () => {
    document.body.innerHTML = "<button>Modifier</button>";
    expect(findButtonByExactText(document, "Supprimer")).toBeNull();
  });
});

describe("findDeleteTriggerButton / findDeleteConfirmButton", () => {
  it("distinguishes the trigger button from the confirm button even though both share the word Supprimer", () => {
    document.body.innerHTML = `
      <button>${DELETE_TRIGGER_TEXT}</button>
      <div role="dialog">
        <button id="confirm">${DELETE_CONFIRM_TEXT}</button>
      </div>
    `;
    stubVisible(document.getElementById("confirm")!);
    expect(findDeleteTriggerButton(document)?.textContent?.trim()).toBe(DELETE_TRIGGER_TEXT);
    expect(findDeleteConfirmButton(document)?.textContent?.trim()).toBe(DELETE_CONFIRM_TEXT);
  });

  it("returns null for each when absent", () => {
    document.body.innerHTML = "<button>Autre chose</button>";
    expect(findDeleteTriggerButton(document)).toBeNull();
    expect(findDeleteConfirmButton(document)).toBeNull();
  });

  // Mission "AUDITER LE FAUX modal_confirmed" (2026-08-17) -- REGRESSION
  // directe du bug live : findDeleteTriggerButton n'exige toujours aucune
  // visibilite (perimetre inchange, deja confirme correct en direct) ;
  // findDeleteConfirmButton, lui, ne doit plus jamais retourner un bouton
  // cache/premonte.
  it("findDeleteConfirmButton returns null when the confirm button exists but is hidden", () => {
    document.body.innerHTML = `<button>${DELETE_CONFIRM_TEXT}</button>`;
    // Aucun stub de visibilite.
    expect(findDeleteConfirmButton(document)).toBeNull();
  });

  it("findDeleteConfirmButton returns the button once it is visible", () => {
    document.body.innerHTML = `<button id="confirm">${DELETE_CONFIRM_TEXT}</button>`;
    stubVisible(document.getElementById("confirm")!);
    expect(findDeleteConfirmButton(document)?.textContent?.trim()).toBe(DELETE_CONFIRM_TEXT);
  });

  it("findDeleteConfirmButton skips a hidden candidate and returns a later visible one", () => {
    document.body.innerHTML = `
      <button id="hidden-decoy">${DELETE_CONFIRM_TEXT}</button>
      <button id="real">${DELETE_CONFIRM_TEXT}</button>
    `;
    // Seul le second candidat est reellement visible.
    stubVisible(document.getElementById("real")!);
    expect(findDeleteConfirmButton(document)?.id).toBe("real");
  });
});

describe("isDeleteConfirmationModalVisible", () => {
  // Mission "AUDITER LE FAUX modal_confirmed" (2026-08-17) -- REGRESSION
  // directe du bug live : le heading existe bel et bien dans le DOM mais
  // n'est jamais reellement visible (Vinted le conserve cache avant
  // l'ouverture reelle de la modale) -- ne doit plus jamais matcher.
  it("returns false when the heading text is present but hidden (offsetParent non stubbed)", () => {
    document.body.innerHTML = "<div>Supprimer l'article</div>";
    // Aucun stub de visibilite -- reste "invisible" par defaut sous jsdom.
    expect(isDeleteConfirmationModalVisible(document)).toBe(false);
  });

  it("returns true when the exact heading text is present AND visible", () => {
    document.body.innerHTML = "<div>Supprimer l'article</div>";
    stubVisible(document.querySelector("div")!);
    expect(isDeleteConfirmationModalVisible(document)).toBe(true);
  });

  it("tolerates a curly apostrophe (Vinted may render either form)", () => {
    document.body.innerHTML = "<div>Supprimer l’article</div>";
    stubVisible(document.querySelector("div")!);
    expect(isDeleteConfirmationModalVisible(document)).toBe(true);
  });

  it("returns false when the modal is not present", () => {
    document.body.innerHTML = "<div>Autre contenu de page</div>";
    expect(isDeleteConfirmationModalVisible(document)).toBe(false);
  });

  // Mission "AUDITER LE FAUX modal_confirmed" (2026-08-17) -- garde-fou
  // explicitement demande : un ancetre ne doit jamais matcher uniquement via
  // le textContent AGREGE de ses descendants (le heading est reparti sur
  // deux noeuds enfants -- aucun element ne porte a lui seul le texte exact).
  it("does not false-positive when the heading text is only present via aggregated descendant textContent", () => {
    document.body.innerHTML = `<div id="heading">Supprimer <span>l'article</span></div>`;
    const container = document.getElementById("heading")!;
    stubVisible(container);
    stubVisible(container.querySelector("span")!);
    // Le div (visible) a des enfants -- exclu. Le span (visible) ne porte
    // que "l'article", pas le texte complet -- exclu aussi.
    expect(isDeleteConfirmationModalVisible(document)).toBe(false);
    // Preuve que ce n'est pas juste "jamais vrai" : le meme texte, porte par
    // un SEUL element feuille visible, matche bien.
    document.body.innerHTML = `<div>${DELETE_MODAL_HEADING_TEXT}</div>`;
    stubVisible(document.querySelector("div")!);
    expect(isDeleteConfirmationModalVisible(document)).toBe(true);
  });
});
