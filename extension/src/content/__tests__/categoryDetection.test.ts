import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  confirmTriggerValue,
  describeCategoryTriggerDom,
  detectCategorySelection,
  hasAnyAttributeTrigger,
  hasCategoryChanged,
  readAttributeTriggerPresence,
  readTriggerText,
  readTriggerValue,
  type AttributeTriggerPresence,
  type AttributeTriggerSelectors,
} from "../categoryDetection";
import { waitForCondition, WaitTimeoutError } from "../domWait";

const NO_ATTRIBUTES: AttributeTriggerPresence = {
  brandTriggerFound: false,
  sizeTriggerFound: false,
  conditionTriggerFound: false,
  colorTriggerFound: false,
  materialTriggerFound: false,
};

const ALL_ATTRIBUTES: AttributeTriggerPresence = {
  brandTriggerFound: true,
  sizeTriggerFound: true,
  conditionTriggerFound: true,
  colorTriggerFound: true,
  materialTriggerFound: true,
};

const SELECTORS: AttributeTriggerSelectors = {
  brand: '[data-testid="brand-select-dropdown-input"]',
  size: '[data-testid="category-size-single-grid-input"]',
  condition: '[data-testid="category-condition-single-list-input"]',
  color: '[data-testid="color-select-dropdown-input"]',
  material: '[data-testid="category-material-multi-list-input"]',
};

// Mission "CATEGORY_SELECTION_NOT_DETECTED CONFIRME EN LIVE" (2026-08-12) :
// ces tests couvrent directement la separation demandee entre "categorie
// choisie" (hasCategoryChanged, base sur le TEXTE du trigger categorie
// lui-meme) et "attributs disponibles" (hasAnyAttributeTrigger, base sur les
// 5 triggers d'attribut) -- avant cette extraction, une seule et meme
// apparition de CONDITION_LIST_TRIGGER_SELECTOR servait de preuve aux deux,
// ce qui a produit CATEGORY_SELECTION_NOT_DETECTED en live alors que la
// categorie ETAIT bien choisie (le picker Etat, lui, n'etait jamais apparu).
describe("hasCategoryChanged", () => {
  it("returns false when nothing has changed yet (both null)", () => {
    expect(hasCategoryChanged(null, null)).toBe(false);
  });

  it("returns false when the current text is still the initial text (no real selection yet)", () => {
    expect(hasCategoryChanged("Catégorie", "Catégorie")).toBe(false);
  });

  it("returns false when the trigger has disappeared or become empty (current is null)", () => {
    expect(hasCategoryChanged(null, "Catégorie")).toBe(false);
  });

  it("returns true once the displayed text genuinely changes -- e.g. 'Polos' after selection", () => {
    expect(hasCategoryChanged("Polos", "Catégorie")).toBe(true);
  });

  it("returns true even when there was no initial text at all (trigger started empty)", () => {
    expect(hasCategoryChanged("Polos", null)).toBe(true);
  });
});

describe("hasAnyAttributeTrigger", () => {
  it("returns false when none of the 5 attribute triggers are present", () => {
    expect(
      hasAnyAttributeTrigger({
        brandTriggerFound: false,
        sizeTriggerFound: false,
        conditionTriggerFound: false,
        colorTriggerFound: false,
        materialTriggerFound: false,
      })
    ).toBe(false);
  });

  it("returns true as soon as a single attribute trigger is present -- doesn't require Condition specifically", () => {
    expect(
      hasAnyAttributeTrigger({
        brandTriggerFound: true,
        sizeTriggerFound: false,
        conditionTriggerFound: false,
        colorTriggerFound: false,
        materialTriggerFound: false,
      })
    ).toBe(true);
  });

  it("returns true when Condition alone is present (still a valid signal, just no longer the ONLY one accepted)", () => {
    expect(
      hasAnyAttributeTrigger({
        brandTriggerFound: false,
        sizeTriggerFound: false,
        conditionTriggerFound: true,
        colorTriggerFound: false,
        materialTriggerFound: false,
      })
    ).toBe(true);
  });
});

describe("readTriggerText / readAttributeTriggerPresence (DOM-backed)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("readTriggerText returns null when the element is absent", () => {
    expect(readTriggerText('[data-testid="catalog-select-dropdown-input"]')).toBeNull();
  });

  it("readTriggerText returns null when the element exists but has empty text (placeholder icon only)", () => {
    const el = document.createElement("div");
    el.setAttribute("data-testid", "catalog-select-dropdown-input");
    document.body.appendChild(el);
    expect(readTriggerText('[data-testid="catalog-select-dropdown-input"]')).toBeNull();
  });

  it("readTriggerText returns the trimmed text once the element has a real value", () => {
    const el = document.createElement("div");
    el.setAttribute("data-testid", "catalog-select-dropdown-input");
    el.textContent = "  Polos  ";
    document.body.appendChild(el);
    expect(readTriggerText('[data-testid="catalog-select-dropdown-input"]')).toBe("Polos");
  });

  it("readAttributeTriggerPresence reports found/not-found independently per field", () => {
    const brand = document.createElement("div");
    brand.setAttribute("data-testid", "brand-select-dropdown-input");
    document.body.appendChild(brand);

    const presence = readAttributeTriggerPresence(SELECTORS);
    expect(presence).toEqual({
      brandTriggerFound: true,
      sizeTriggerFound: false,
      conditionTriggerFound: false,
      colorTriggerFound: false,
      materialTriggerFound: false,
    });
  });
});

// Mission "CORRIGER LA DETECTION POST-SELECTION MANUELLE DE CATEGORIE"
// (2026-08-12) : preuve live directe -- readTriggerText() reste null AVANT
// ET APRES une selection humaine reelle de "Polos" (categoryTriggerFound:true
// mais currentCategoryText:null dans les deux etats), alors que la
// transition "0 attribut present -> 5 attributs presents" est observee de
// facon fiable au meme instant. detectCategorySelection() encode desormais
// les DEUX chemins demandes, avec la protection explicite contre le
// faux-positif "attributs deja presents au demarrage".
describe("detectCategorySelection", () => {
  // Cas J.2 : etat initial, categorie illisible, aucun attribut -- aucune
  // detection.
  it("detects nothing when category is unreadable and no attribute control is present (initial state)", () => {
    const method = detectCategorySelection(
      { categoryText: null, attributesPresent: NO_ATTRIBUTES },
      { categoryText: null, hadAnyAttributeTrigger: false }
    );
    expect(method).toBeNull();
  });

  // Cas J.3 : transition reelle (preuve live) -- aucun attribut au depart,
  // au moins un apparait -> detection via le repli structurel.
  it("detects via the structural fallback when attribute controls transition from absent to present", () => {
    const method = detectCategorySelection(
      { categoryText: null, attributesPresent: ALL_ATTRIBUTES },
      { categoryText: null, hadAnyAttributeTrigger: false }
    );
    expect(method).toBe("attribute_controls_appeared");
  });

  // Cas J.4 : plusieurs attributs apparaissent simultanement (comme observe
  // en live : les 5 passent a true ensemble) -- une seule methode de
  // detection retournee, jamais un tableau ou une double detection.
  it("returns a single detection method even when all 5 attribute triggers appear at once", () => {
    const method = detectCategorySelection(
      { categoryText: null, attributesPresent: ALL_ATTRIBUTES },
      { categoryText: null, hadAnyAttributeTrigger: false }
    );
    expect(method).toBe("attribute_controls_appeared");
  });

  // Cas J.5 (proxy) : une fois l'etat stabilise apres detection, rappeler la
  // fonction avec le MEME etat courant redonne la MEME reponse -- la
  // fonction est pure/idempotente, donc aucune "double detection" ne peut
  // emerger d'appels repetes sur un etat inchange (le vrai garde contre la
  // double detection est structurel cote appelant : waitForCondition()
  // s'arrete des que le predicat devient vrai, voir vinted-publish.ts).
  it("is idempotent -- calling it again with the same already-detected state returns the same method", () => {
    const current = { categoryText: null, attributesPresent: ALL_ATTRIBUTES };
    const initial = { categoryText: null, hadAnyAttributeTrigger: false };
    expect(detectCategorySelection(current, initial)).toBe(detectCategorySelection(current, initial));
  });

  // Cas J.6 : la valeur categorie EST lisible et change -- le chemin direct
  // doit gagner, meme si les attributs ont AUSSI change en meme temps
  // (les deux conditions sont vraies simultanement dans un cas reel ou la
  // lecture texte fonctionnerait).
  it("prioritizes the direct value-change path over the structural fallback when both are true", () => {
    const method = detectCategorySelection(
      { categoryText: "Polos", attributesPresent: ALL_ATTRIBUTES },
      { categoryText: "Catégorie", hadAnyAttributeTrigger: false }
    );
    expect(method).toBe("category_value_changed");
  });

  // Cas J.7 : valeur categorie illisible (reste null), mais les attributs
  // apparaissent -- le repli doit fonctionner seul.
  it("falls back to attribute_controls_appeared when the category value stays unreadable but attributes appear", () => {
    const method = detectCategorySelection(
      { categoryText: null, attributesPresent: ALL_ATTRIBUTES },
      { categoryText: null, hadAnyAttributeTrigger: false }
    );
    expect(method).toBe("attribute_controls_appeared");
  });

  // Cas J.8 : protection explicite contre le faux-positif -- si des
  // attributs sont DEJA presents au demarrage (document rouvert sur un etat
  // deja avance, ou tout autre raison), ne jamais interpreter leur simple
  // presence continue comme une NOUVELLE selection humaine.
  it("never reports a detection when attribute controls were already present at watch start (no false positive)", () => {
    const method = detectCategorySelection(
      { categoryText: null, attributesPresent: ALL_ATTRIBUTES },
      { categoryText: null, hadAnyAttributeTrigger: true }
    );
    expect(method).toBeNull();
  });

  // Cas J.9 : rien ne change du tout -- reste null (le timeout cote
  // waitForCondition() gere la sortie propre, voir vinted-publish.ts).
  it("detects nothing when neither the category value nor any attribute control changes", () => {
    const method = detectCategorySelection(
      { categoryText: null, attributesPresent: NO_ATTRIBUTES },
      { categoryText: null, hadAnyAttributeTrigger: false }
    );
    expect(method).toBeNull();
  });
});

describe("describeCategoryTriggerDom", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  // Cas J.1 : element absent -- jamais d'erreur, un objet "found: false"
  // explicite.
  it("returns found:false with all fields null when the trigger element doesn't exist", () => {
    const diagnostic = describeCategoryTriggerDom('[data-testid="catalog-select-dropdown-input"]');
    expect(diagnostic.found).toBe(false);
    expect(diagnostic.textContent).toBeNull();
    expect(diagnostic.value).toBeNull();
  });

  // Cas J.1 (variante) : element present mais texte/value illisibles --
  // jamais d'erreur, structure complete rapportee malgre tout.
  it("returns found:true with the real structure even when textContent/value are empty (no crash)", () => {
    const el = document.createElement("div");
    el.setAttribute("data-testid", "catalog-select-dropdown-input");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", "Choisir une catégorie");
    document.body.appendChild(el);

    const diagnostic = describeCategoryTriggerDom('[data-testid="catalog-select-dropdown-input"]');
    expect(diagnostic.found).toBe(true);
    expect(diagnostic.tagName).toBe("DIV");
    expect(diagnostic.dataTestId).toBe("catalog-select-dropdown-input");
    expect(diagnostic.role).toBe("button");
    expect(diagnostic.ariaLabel).toBe("Choisir une catégorie");
    expect(diagnostic.value).toBeNull(); // un <div> n'a pas de propriete .value
  });

  it("reads .value on elements that actually have it (e.g. an <input>)", () => {
    const input = document.createElement("input");
    input.setAttribute("data-testid", "catalog-select-dropdown-input");
    input.value = "Polos";
    document.body.appendChild(input);

    const diagnostic = describeCategoryTriggerDom('[data-testid="catalog-select-dropdown-input"]');
    expect(diagnostic.value).toBe("Polos");
  });

  it("truncates an excessively long outerHTML rather than logging it whole", () => {
    const el = document.createElement("div");
    el.setAttribute("data-testid", "catalog-select-dropdown-input");
    el.innerHTML = `<span>${"x".repeat(1000)}</span>`;
    document.body.appendChild(el);

    const diagnostic = describeCategoryTriggerDom('[data-testid="catalog-select-dropdown-input"]');
    expect(diagnostic.outerHTML?.length).toBeLessThan(600);
    expect(diagnostic.outerHTML?.endsWith("…")).toBe(true);
  });
});

// Mission "LIVE RETEST RESULTS -- FIX SIZE/COLOR CONFIRMATION + COLOR
// DROPDOWN CLOSURE" (2026-08-13) : preuve live directe -- pour Taille et
// Couleur, le trigger est un <input> ; readTriggerText() (textContent) est
// structurellement TOUJOURS vide sur un <input> (pas de noeud texte enfant),
// ce qui explique le faux "click_not_confirmed_in_trigger" alors que
// valueProperty ("L"/"Bleu") etait deja correctement rempli.
describe("readTriggerValue", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reads .value on a real <input> trigger (live shape: Taille/Couleur)", () => {
    const input = document.createElement("input");
    input.setAttribute("data-testid", "category-size-single-grid-input");
    input.value = "L";
    document.body.appendChild(input);

    expect(readTriggerValue('[data-testid="category-size-single-grid-input"]')).toBe("L");
  });

  it("returns null for a non-<input> trigger, even if it happens to have a .value-like property", () => {
    const div = document.createElement("div");
    div.setAttribute("data-testid", "category-size-single-grid-input");
    document.body.appendChild(div);

    expect(readTriggerValue('[data-testid="category-size-single-grid-input"]')).toBeNull();
  });

  it("returns null when the trigger is absent", () => {
    expect(readTriggerValue('[data-testid="absent"]')).toBeNull();
  });

  it("returns null when the input exists but its value is empty", () => {
    const input = document.createElement("input");
    input.setAttribute("data-testid", "category-size-single-grid-input");
    document.body.appendChild(input);

    expect(readTriggerValue('[data-testid="category-size-single-grid-input"]')).toBeNull();
  });
});

// Mission "LIVE RETEST RESULTS -- FIX SIZE/COLOR CONFIRMATION + COLOR
// DROPDOWN CLOSURE" (2026-08-13) : confirmTriggerValue() est la fonction
// PURE extraite de vinted-publish.ts::attemptDedicatedPickerPrefill --
// couvre exactement les cas A-E demandes par la mission (Taille/Couleur
// confirmes depuis input.value, jamais faussement confirmes depuis une
// valeur differente, jamais "L" confirme depuis "XL"/"XXL").
describe("confirmTriggerValue", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function makeSizeInput(value: string): void {
    const input = document.createElement("input");
    input.setAttribute("data-testid", "category-size-single-grid-input");
    input.value = value;
    document.body.appendChild(input);
  }

  function makeColorInput(value: string): void {
    const input = document.createElement("input");
    input.setAttribute("data-testid", "color-select-dropdown-input");
    input.value = value;
    document.body.appendChild(input);
  }

  // Cas A : Taille, requested "L", input.value "L" => confirmed.
  it("Taille -- confirms when requested 'L' and input.value is exactly 'L' (live-confirmed case)", () => {
    makeSizeInput("L");
    const result = confirmTriggerValue('[data-testid="category-size-single-grid-input"]', "L");
    expect(result.confirmed).toBe(true);
    expect(result.observedValue).toBe("L");
  });

  // Cas B : Taille, requested "L", input.value ne represente PAS "L" =>
  // jamais de faux confirmed.
  it("Taille -- does NOT confirm when input.value does not represent the requested 'L'", () => {
    makeSizeInput("M");
    const result = confirmTriggerValue('[data-testid="category-size-single-grid-input"]', "L");
    expect(result.confirmed).toBe(false);
    expect(result.observedValue).toBe("M");
  });

  // Cas C : Couleur, requested "Bleu", input.value "Bleu" => confirmed.
  it("Couleur -- confirms when requested 'Bleu' and input.value is exactly 'Bleu' (live-confirmed case)", () => {
    makeColorInput("Bleu");
    const result = confirmTriggerValue('[data-testid="color-select-dropdown-input"]', "Bleu");
    expect(result.confirmed).toBe(true);
    expect(result.observedValue).toBe("Bleu");
  });

  // Cas D : Couleur, requested "Bleu", input.value ne represente PAS "Bleu"
  // => jamais de faux confirmed.
  it("Couleur -- does NOT confirm when input.value does not represent the requested 'Bleu'", () => {
    makeColorInput("Marine");
    const result = confirmTriggerValue('[data-testid="color-select-dropdown-input"]', "Bleu");
    expect(result.confirmed).toBe(false);
    expect(result.observedValue).toBe("Marine");
  });

  // Cas E : "L" ne doit JAMAIS etre confirme depuis "XL"/"XXL" -- preuve
  // directe que la comparaison est une EGALITE STRICTE, pas .includes()
  // ("XL".includes("L") est vrai, ce serait une regression dangereuse).
  it("never confirms 'L' from an input.value of 'XL' (exact-match-first safety, not substring)", () => {
    makeSizeInput("XL");
    const result = confirmTriggerValue('[data-testid="category-size-single-grid-input"]', "L");
    expect(result.confirmed).toBe(false);
  });

  it("never confirms 'L' from an input.value of 'XXL'", () => {
    makeSizeInput("XXL");
    const result = confirmTriggerValue('[data-testid="category-size-single-grid-input"]', "L");
    expect(result.confirmed).toBe(false);
  });

  it("still confirms 'XL' from an input.value of 'XL' (the exact match itself is not broken by the strict comparison)", () => {
    makeSizeInput("XL");
    const result = confirmTriggerValue('[data-testid="category-size-single-grid-input"]', "XL");
    expect(result.confirmed).toBe(true);
  });

  it("matches case/accent-insensitively via normalize(), like the rest of the matching pipeline", () => {
    makeColorInput("bleu");
    const result = confirmTriggerValue('[data-testid="color-select-dropdown-input"]', "Bleu");
    expect(result.confirmed).toBe(true);
  });

  // Repli existant INCHANGE : quand le trigger n'est PAS un <input> (donc
  // readTriggerValue() renvoie null), readTriggerText() reste la source --
  // meme comportement egal-ou-contient qu'avant cette mission, jamais
  // modifie ici (utilise par Etat et le chemin generique).
  it("falls back to readTriggerText() (equal-or-contains) when the trigger is not an <input>", () => {
    const div = document.createElement("div");
    div.setAttribute("data-testid", "some-non-input-trigger");
    div.textContent = "État : Très bon état";
    document.body.appendChild(div);

    const result = confirmTriggerValue('[data-testid="some-non-input-trigger"]', "Très bon état");
    expect(result.confirmed).toBe(true);
    expect(result.observedValue).toBe("État : Très bon état");
  });

  it("returns confirmed:false and observedValue:null when the trigger is absent entirely", () => {
    const result = confirmTriggerValue('[data-testid="absent"]', "L");
    expect(result.confirmed).toBe(false);
    expect(result.observedValue).toBeNull();
  });

  // Mission "AUDIT DIVERGENCE READY_TO_SUBMIT", volet Etat (2026-08-16) :
  // preuve live directe -- le trigger Etat (category-condition-single-list-
  // input) est bien un <input>, exactement comme Taille/Couleur ci-dessus
  // (jusqu'ici seuls testes ici) -- vinted-publish.ts::attemptConditionPrefill
  // reutilise desormais confirmTriggerValue() pour ce trigger, ce cas n'etait
  // pas encore couvert dans ce fichier.
  function makeConditionInput(value: string): void {
    const input = document.createElement("input");
    input.setAttribute("data-testid", "category-condition-single-list-input");
    input.value = value;
    document.body.appendChild(input);
  }

  it("Etat -- confirms when requested 'Très bon état' and input.value is exactly 'Très bon état' (live-confirmed case)", () => {
    makeConditionInput("Très bon état");
    const result = confirmTriggerValue('[data-testid="category-condition-single-list-input"]', "Très bon état");
    expect(result.confirmed).toBe(true);
    expect(result.observedValue).toBe("Très bon état");
  });

  // CAUSE RACINE confirmee en live (2026-08-16) : immediately_after_click,
  // le trigger Etat porte valueProperty:"" ET valueAttribute:"" (chaine
  // vide, PAS absente) -- readTriggerValue() traite deja une valeur vide
  // comme "pas de valeur exploitable" (voir son propre commentaire),
  // renvoie donc null, et confirmTriggerValue() retombe sur
  // readTriggerText() -- lui-meme structurellement vide pour un <input>
  // (aucun noeud texte enfant). Preuve directe que lire IMMEDIATEMENT apres
  // le clic ne peut jamais confirmer, quelle que soit la valeur demandee.
  it("Etat -- does NOT confirm immediately after a click when input.value is still an empty string (the exact live sequence before re-render)", () => {
    makeConditionInput("");
    const result = confirmTriggerValue('[data-testid="category-condition-single-list-input"]', "Très bon état");
    expect(result.confirmed).toBe(false);
    expect(result.observedValue).toBeNull();
  });
});

// Mission "AUDIT DIVERGENCE READY_TO_SUBMIT", volet Etat (2026-08-16) :
// couvre le DELAI de mise a jour du trigger lui-meme -- pas seulement
// confirmTriggerValue() en isolation (deja couvert ci-dessus), mais son
// usage reel dans une attente polling (waitForCondition, domWait.ts),
// exactement comme vinted-publish.ts::attemptConditionPrefill. Reproduit la
// sequence live prouvee : valeur vide juste apres le clic, peuplee
// seulement apres un re-render asynchrone -- la confirmation ne doit
// reussir qu'APRES cette mise a jour, jamais avant, et jamais via un
// setTimeout fixe utilise comme preuve (le polling doit reellement observer
// la mutation DOM).
describe("confirmTriggerValue + waitForCondition -- delayed trigger update (live sequence)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("only confirms once the trigger's value is updated asynchronously after the click -- never on the initial empty read", async () => {
    const input = document.createElement("input");
    input.setAttribute("data-testid", "category-condition-single-list-input");
    input.value = ""; // etat immediately_after_click reellement observe en live
    document.body.appendChild(input);

    let observedAtStart: string | null = "not_checked";
    const promise = waitForCondition(
      () => {
        const result = confirmTriggerValue('[data-testid="category-condition-single-list-input"]', "Très bon état");
        if (observedAtStart === "not_checked") observedAtStart = result.observedValue;
        return result.confirmed;
      },
      { timeoutMs: 2000, description: "trigger displays the selected condition" }
    );

    // Simule le re-render asynchrone de Vinted (confirme en live a +100ms) --
    // un vrai changement de propriete DOM, jamais un simple delai.
    setTimeout(() => {
      input.value = "Très bon état";
      // input.value seul ne declenche aucune mutation observable par
      // MutationObserver (ce n'est pas un attribut) -- force une mutation
      // d'attribut reelle sur le meme element pour que waitForCondition()
      // re-evalue le predicat, exactement comme le re-render React reel
      // (qui, lui, mute bien le DOM) le ferait.
      input.setAttribute("data-updated", "true");
    }, 30);

    await expect(promise).resolves.toBeUndefined();
    // Preuve que le premier check (avant la mutation) a bien vu la valeur
    // vide -- la confirmation n'a jamais ete "chanceuse" sur un premier essai.
    expect(observedAtStart).toBeNull();
    expect(input.value).toBe("Très bon état");
  });

  it("still rejects with WaitTimeoutError if the trigger value never actually changes to the requested condition", async () => {
    const input = document.createElement("input");
    input.setAttribute("data-testid", "category-condition-single-list-input");
    input.value = "";
    document.body.appendChild(input);

    await expect(
      waitForCondition(
        () => confirmTriggerValue('[data-testid="category-condition-single-list-input"]', "Très bon état").confirmed,
        { timeoutMs: 50, description: "trigger displays the selected condition" }
      )
    ).rejects.toBeInstanceOf(WaitTimeoutError);
  });
});
