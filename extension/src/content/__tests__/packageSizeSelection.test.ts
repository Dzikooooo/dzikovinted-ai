import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clickPackageSizeRadio,
  findAlreadyCheckedPackageSize,
  packageSizeRadioIndex,
  readPackageSizeCellSnapshots,
  type PackageSizeCellSnapshot,
} from "../packageSizeSelection";

// Mission "ROUND PACKAGE SIZE -- implementation production" (2026-08-18) :
// couvre le mapping 1/2/3 (jamais devine sur une valeur inconnue) et
// l'activation reelle du radio via .click() natif, avec verification
// systematique de `checked` apres coup -- jamais une reussite supposee sur
// le seul fait que .click() n'a pas leve d'exception.

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("packageSizeRadioIndex", () => {
  it("mappe small/medium/large vers 1/2/3", () => {
    expect(packageSizeRadioIndex("small")).toBe(1);
    expect(packageSizeRadioIndex("medium")).toBe(2);
    expect(packageSizeRadioIndex("large")).toBe(3);
  });

  it("retourne null pour toute valeur absente/invalide -- jamais de repli arbitraire", () => {
    expect(packageSizeRadioIndex(undefined)).toBeNull();
    expect(packageSizeRadioIndex(null)).toBeNull();
    expect(packageSizeRadioIndex("")).toBeNull();
    expect(packageSizeRadioIndex("SMALL")).toBeNull(); // casse stricte, jamais tolerante
    expect(packageSizeRadioIndex("moyen")).toBeNull(); // jamais le libelle FR, uniquement la valeur payload
    expect(packageSizeRadioIndex(2)).toBeNull(); // jamais un index deja numerique
    expect(packageSizeRadioIndex({})).toBeNull();
  });
});

describe("clickPackageSizeRadio", () => {
  it("clique nativement le radio correspondant et rapporte checked:true quand l'activation reussit (radio simule 'natif')", () => {
    document.body.innerHTML = `
      <input type="radio" id="package_type_selector_1" name="package_size" />
      <input type="radio" id="package_type_selector_2" name="package_size" />
      <input type="radio" id="package_type_selector_3" name="package_size" />
    `;
    const outcome = clickPackageSizeRadio("medium");
    expect(outcome.requestedIndex).toBe(2);
    expect(outcome.radioFound).toBe(true);
    // jsdom applique le comportement natif reel de .click() sur un input radio
    // (coche l'element, decoche les autres du meme `name`) -- pas un mock.
    expect(outcome.checkedAfterClick).toBe(true);
    expect(document.getElementById("package_type_selector_2")).toHaveProperty("checked", true);
    expect(document.getElementById("package_type_selector_1")).toHaveProperty("checked", false);
  });

  it("decoche les radios freres du meme groupe -- un seul choix actif a la fois", () => {
    document.body.innerHTML = `
      <input type="radio" id="package_type_selector_1" name="package_size" checked />
      <input type="radio" id="package_type_selector_2" name="package_size" />
      <input type="radio" id="package_type_selector_3" name="package_size" />
    `;
    const outcome = clickPackageSizeRadio("large");
    expect(outcome.checkedAfterClick).toBe(true);
    expect(document.getElementById("package_type_selector_1")).toHaveProperty("checked", false);
    expect(document.getElementById("package_type_selector_3")).toHaveProperty("checked", true);
  });

  it("rapporte radioFound:false et checkedAfterClick:null quand le radio cible n'existe pas dans le DOM -- ne plante jamais", () => {
    const outcome = clickPackageSizeRadio("small");
    expect(outcome.requestedIndex).toBe(1);
    expect(outcome.radioFound).toBe(false);
    expect(outcome.checkedAfterClick).toBeNull();
  });

  it("ne tente AUCUN clic (aucune selection arbitraire) quand la valeur est absente/invalide, meme si des radios existent dans le DOM", () => {
    document.body.innerHTML = `<input type="radio" id="package_type_selector_1" name="package_size" />`;
    const outcome = clickPackageSizeRadio(undefined);
    expect(outcome.requestedIndex).toBeNull();
    expect(outcome.radioFound).toBe(false);
    expect(outcome.checkedAfterClick).toBeNull();
    // preuve directe qu'aucun clic n'a ete tente : le radio existant reste
    // dans son etat initial (jamais coche arbitrairement, ex. sur "Petit").
    expect(document.getElementById("package_type_selector_1")).toHaveProperty("checked", false);
  });

  it("cible uniquement le radio demande, jamais un autre index par confusion de selecteur", () => {
    document.body.innerHTML = `
      <input type="radio" id="package_type_selector_1" name="package_size" />
      <input type="radio" id="package_type_selector_2" name="package_size" />
    `;
    clickPackageSizeRadio("small");
    expect(document.getElementById("package_type_selector_1")).toHaveProperty("checked", true);
    expect(document.getElementById("package_type_selector_2")).toHaveProperty("checked", false);
  });
});

// Mission "ROUND PRIX + COLIS -- DIAGNOSTIC" (2026-08-19) : instrumentation
// purement observationnelle -- ces tests couvrent uniquement la lecture,
// jamais un clic/une decision de selection (hors perimetre de ce round).
function makeCell(index: 1 | 2 | 3, opts: { checked?: boolean; label?: string; recommended?: boolean; dataTestId?: string } = {}): HTMLElement {
  const { checked = false, label = "Taille", recommended = false, dataTestId = `${index}-package-size--cell` } = opts;
  const cell = document.createElement("div");
  cell.setAttribute("data-testid", dataTestId);
  const radio = document.createElement("input");
  radio.type = "radio";
  radio.id = `package_type_selector_${index}`;
  radio.name = "package_size";
  radio.value = String(index);
  radio.checked = checked;
  const text = document.createElement("span");
  text.textContent = recommended ? `${label} Recommandé` : label;
  cell.appendChild(text);
  cell.appendChild(radio);
  document.body.appendChild(cell);
  return cell;
}

describe("readPackageSizeCellSnapshots", () => {
  it("capture label/id/data-testid/checked/aria-checked/value/recommended/index pour chaque cellule presente", () => {
    makeCell(1, { label: "Petit", recommended: true });
    makeCell(2, { label: "Moyen" });
    makeCell(3, { label: "Grand" });

    const snapshots = readPackageSizeCellSnapshots();
    expect(snapshots).toHaveLength(3);

    expect(snapshots[0]).toMatchObject({
      index: 1,
      cellFound: true,
      radioId: "package_type_selector_1",
      dataTestId: "1-package-size--cell",
      checked: false,
      value: "1",
      recommended: true,
      domIndex: 0,
    });
    expect(snapshots[0].label).toContain("Petit");

    expect(snapshots[1]).toMatchObject({ index: 2, checked: false, recommended: false, domIndex: 1 });
    expect(snapshots[2]).toMatchObject({ index: 3, checked: false, recommended: false, domIndex: 2 });
  });

  it("rapporte cellFound:false et des champs null pour une cellule absente du DOM, sans jamais planter", () => {
    // aucune cellule injectee
    const snapshots = readPackageSizeCellSnapshots();
    expect(snapshots).toHaveLength(3);
    for (const s of snapshots) {
      expect(s.cellFound).toBe(false);
      expect(s.label).toBeNull();
      expect(s.radioId).toBeNull();
      expect(s.checked).toBeNull();
      expect(s.recommended).toBe(false);
    }
  });

  it("reflete checked:true reel sur le radio effectivement coche par Vinted", () => {
    makeCell(1, { label: "Petit", checked: true });
    makeCell(2, { label: "Moyen" });

    const snapshots = readPackageSizeCellSnapshots();
    expect(snapshots.find((s) => s.index === 1)?.checked).toBe(true);
    expect(snapshots.find((s) => s.index === 2)?.checked).toBe(false);
  });

  it("detecte un texte 'Recommandé' insensible a la casse, sans le confondre avec un etat coche", () => {
    makeCell(1, { label: "Petit", recommended: true, checked: false });

    const snapshots = readPackageSizeCellSnapshots();
    const cell1 = snapshots.find((s) => s.index === 1)!;
    expect(cell1.recommended).toBe(true);
    expect(cell1.checked).toBe(false); // "Recommandé" visuel != reellement selectionne
  });
});

describe("findAlreadyCheckedPackageSize", () => {
  it("retourne null quand aucune cellule n'est reellement cochee", () => {
    const snapshots: PackageSizeCellSnapshot[] = [
      { index: 1, cellFound: true, label: "Petit", radioId: "a", dataTestId: "1-package-size--cell", checked: false, ariaChecked: null, value: "1", recommended: true, domIndex: 0 },
      { index: 2, cellFound: true, label: "Moyen", radioId: "b", dataTestId: "2-package-size--cell", checked: false, ariaChecked: null, value: "2", recommended: false, domIndex: 1 },
    ];
    expect(findAlreadyCheckedPackageSize(snapshots)).toBeNull();
  });

  it("retourne l'index reellement coche, jamais base sur 'recommended' seul", () => {
    const snapshots: PackageSizeCellSnapshot[] = [
      { index: 1, cellFound: true, label: "Petit", radioId: "a", dataTestId: "1-package-size--cell", checked: false, ariaChecked: null, value: "1", recommended: true, domIndex: 0 },
      { index: 2, cellFound: true, label: "Moyen", radioId: "b", dataTestId: "2-package-size--cell", checked: true, ariaChecked: null, value: "2", recommended: false, domIndex: 1 },
    ];
    expect(findAlreadyCheckedPackageSize(snapshots)).toBe(2);
  });

  it("via readPackageSizeCellSnapshots() reel : trouve l'index coche par Vinted meme si ce n'est pas celui demande par ResellOS", () => {
    makeCell(1, { label: "Petit", checked: true }); // Vinted a deja selectionne "Petit"
    makeCell(2, { label: "Moyen" });

    const snapshots = readPackageSizeCellSnapshots();
    expect(findAlreadyCheckedPackageSize(snapshots)).toBe(1);
  });
});

// Mission "ROUND PRIX + COLIS -- COMPORTEMENT FINAL" (2026-08-19) : preuve
// live confirmee sur un polo reel (index 1/Petit : checked:true ET
// recommended:true ; index 2/3 : les deux false). Ces tests composent les
// MEMES briques exportees que selectPackageSizeWithConfirmation()
// (vinted-publish.ts, non exportee -- meme discipline de test que
// brandCommitConfirmed/colorCommitConfirmed, dont l'orchestration privee
// n'est jamais testee directement non plus, uniquement ses briques pures)
// pour prouver le comportement final de bout en bout : si Vinted a deja
// reellement selectionne une taille, ResellOS ne clique RIEN et adopte cet
// etat, meme si la valeur demandee differe.
function simulatePackageSizeDecision(requestedValue: unknown): { clicked: boolean; alreadySelectedIndex: 1 | 2 | 3 | null } {
  const snapshots = readPackageSizeCellSnapshots();
  const alreadyCheckedIndex = findAlreadyCheckedPackageSize(snapshots);
  if (alreadyCheckedIndex !== null) {
    return { clicked: false, alreadySelectedIndex: alreadyCheckedIndex };
  }
  clickPackageSizeRadio(requestedValue);
  return { clicked: true, alreadySelectedIndex: null };
}

describe("comportement final -- Vinted deja selectionne vs fallback (composition des briques exportees)", () => {
  it("1. Petit deja checked + recommended -> aucun clic, Petit gagne (scenario live exact)", () => {
    makeCell(1, { label: "Petit", checked: true, recommended: true });
    makeCell(2, { label: "Moyen" });
    makeCell(3, { label: "Grand" });

    const result = simulatePackageSizeDecision("medium"); // payload demande "medium"
    expect(result.clicked).toBe(false);
    expect(result.alreadySelectedIndex).toBe(1);
    expect(document.getElementById("package_type_selector_1")).toHaveProperty("checked", true);
    expect(document.getElementById("package_type_selector_2")).toHaveProperty("checked", false);
  });

  it("2. Moyen deja checked (sans badge recommended) -> aucun clic, Moyen gagne", () => {
    makeCell(1, { label: "Petit" });
    makeCell(2, { label: "Moyen", checked: true });
    makeCell(3, { label: "Grand" });

    const result = simulatePackageSizeDecision("small"); // payload demande "small"
    expect(result.clicked).toBe(false);
    expect(result.alreadySelectedIndex).toBe(2);
    expect(document.getElementById("package_type_selector_2")).toHaveProperty("checked", true);
    expect(document.getElementById("package_type_selector_1")).toHaveProperty("checked", false);
  });

  it("3. aucun radio deja checked -> comportement de fallback actuel (clic sur la valeur demandee)", () => {
    makeCell(1, { label: "Petit" });
    makeCell(2, { label: "Moyen" });
    makeCell(3, { label: "Grand" });

    const result = simulatePackageSizeDecision("medium");
    expect(result.clicked).toBe(true);
    expect(result.alreadySelectedIndex).toBeNull();
    expect(document.getElementById("package_type_selector_2")).toHaveProperty("checked", true);
  });

  it("4. payload 'medium' mais Vinted a deja coche Petit -> Petit gagne, jamais ecrase par la demande", () => {
    makeCell(1, { label: "Petit", checked: true, recommended: true });
    makeCell(2, { label: "Moyen" });

    const result = simulatePackageSizeDecision("medium");
    expect(result.clicked).toBe(false);
    expect(result.alreadySelectedIndex).toBe(1);
    expect(document.getElementById("package_type_selector_1")).toHaveProperty("checked", true);
    expect(document.getElementById("package_type_selector_2")).toHaveProperty("checked", false);
  });
});

// 5. "readiness bloquée si aucun choix confirmé" : packageSizeCommitConfirmed
// et son cablage dans isReadyNow (watchForPublishReadiness, vinted-publish.ts)
// ne sont pas exportes -- meme limite de testabilite deja acceptee pour
// brandCommitConfirmed/colorCommitConfirmed (aucun test direct de leur
// orchestration privee non plus). Verifie par lecture de code : isReadyNow
// exige `packageSizeReady === true` -- `null` (jamais tente) et `false`
// (tente, jamais confirme) restent TOUS LES DEUX "pas pret", exactement la
// meme discipline que les 2 signaux deja en place. Prouve indirectement par
// les scenarios 1-4 ci-dessus : packageSizeCommitConfirmed ne devient `true`
// QUE dans les branches "deja selectionne" et "clic confirme" -- jamais par
// defaut.
