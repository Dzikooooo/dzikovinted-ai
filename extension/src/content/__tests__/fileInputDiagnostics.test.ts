import { afterEach, describe, expect, it } from "vitest";
import { describeAvailableFileInputs } from "../fileInputDiagnostics";

// Mission "diagnostic final PHOTOS + CATEGORIE" (2026-08-11), item 3 : le
// selecteur historique ADD_PHOTOS_INPUT_SELECTOR (publishSelectors.ts, date
// du 2026-07-10) peut etre devenu perime si Vinted a change son data-testid
// -- ces tests couvrent uniquement la fonction de scan DIAGNOSTIC (aucune
// ecriture DOM), avec un vrai DOM jsdom (document.body.innerHTML), sans
// jamais toucher vinted-publish.ts (effets de bord chrome.* au niveau du
// module, voir son commentaire d'en-tete).
describe("describeAvailableFileInputs", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns an empty array when no <input type=file> exists in the DOM", () => {
    document.body.innerHTML = `<div><input type="text" /></div>`;
    expect(describeAvailableFileInputs()).toEqual([]);
  });

  it("finds a real file input and reports its diagnostic attributes", () => {
    document.body.innerHTML = `
      <div>
        <input type="file" data-testid="new-photo-upload-input" accept="image/*" multiple id="photo-up" name="photos" />
      </div>
    `;
    const result = describeAvailableFileInputs();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "file",
      dataTestId: "new-photo-upload-input",
      accept: "image/*",
      multiple: true,
      id: "photo-up",
      name: "photos",
    });
    expect(result[0].outerHTML).toContain("new-photo-upload-input");
  });

  it("reports null for data-testid when the attribute is absent -- proves the historical selector is stale rather than assuming it", () => {
    document.body.innerHTML = `<input type="file" id="renamed-input" />`;
    const [result] = describeAvailableFileInputs();
    expect(result.dataTestId).toBeNull();
    expect(result.id).toBe("renamed-input");
  });

  it("caps the result at 10 entries and truncates outerHTML, to stay safe for the 400-entry logger.ts ring buffer", () => {
    document.body.innerHTML = Array.from({ length: 15 }, (_, i) => `<input type="file" id="input-${i}" data-extra="${"x".repeat(500)}" />`).join(
      ""
    );
    const result = describeAvailableFileInputs();
    expect(result).toHaveLength(10);
    for (const entry of result) {
      expect((entry.outerHTML as string).length).toBeLessThanOrEqual(300);
    }
  });

  it("ignores non-file inputs entirely", () => {
    document.body.innerHTML = `
      <input type="text" data-testid="title--input" />
      <input type="checkbox" />
      <input type="file" data-testid="the-real-one" />
    `;
    const result = describeAvailableFileInputs();
    expect(result).toHaveLength(1);
    expect(result[0].dataTestId).toBe("the-real-one");
  });
});
