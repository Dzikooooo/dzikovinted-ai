// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installPriceMainWorldWriter,
  PRICE_WRITER_INSTALLED_ATTR,
  PRICE_WRITE_REQUEST_EVENT,
  PRICE_WRITE_RESULT_EVENT,
  type PriceWriteResultDetail,
} from "../priceMainWorldWriter";

// Mission "ECRITURE DU PRIX EN MONDE MAIN" (2026-08-26) : ce module tourne en
// contexte MAIN en production. jsdom n'a qu'un seul monde JS -- ces tests
// couvrent donc son CONTRAT (correlation requestId, ecriture, tracker,
// evenements emis, cas d'erreur), jamais l'isolation elle-meme, qui est une
// propriete de Chrome et ne peut pas etre simulee ici. C'est dit explicitement
// plutot que suggere par le nom des tests.
const SELECTOR = '[data-testid="price-input--input"]';

function makeInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.setAttribute("data-testid", "price-input--input");
  document.body.appendChild(input);
  return input;
}

function request(value: string, requestId = "req-1", selector = SELECTOR): Promise<PriceWriteResultDetail> {
  return new Promise((resolve) => {
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<PriceWriteResultDetail>).detail;
      if (detail.requestId !== requestId) return;
      document.removeEventListener(PRICE_WRITE_RESULT_EVENT, onResult);
      resolve(detail);
    };
    document.addEventListener(PRICE_WRITE_RESULT_EVENT, onResult);
    document.dispatchEvent(
      new CustomEvent(PRICE_WRITE_REQUEST_EVENT, { detail: { requestId, selector, value } })
    );
  });
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("priceMainWorldWriter", () => {
  it("marque son installation par un attribut DOM (lisible sans course par le monde isole)", () => {
    installPriceMainWorldWriter();
    expect(document.documentElement.hasAttribute(PRICE_WRITER_INSTALLED_ATTR)).toBe(true);
  });

  it("ecrit la valeur brute et emet input puis change, dans cet ordre", async () => {
    installPriceMainWorldWriter();
    const input = makeInput();
    const seen: string[] = [];
    input.addEventListener("input", () => seen.push("input"));
    input.addEventListener("change", () => seen.push("change"));

    const result = await request("24");

    expect(result.ok).toBe(true);
    expect(input.value).toBe("24");
    expect(seen).toEqual(["input", "change"]);
  });

  it("emet un InputEvent complet (inputType insertText + data), pas un Event generique", async () => {
    installPriceMainWorldWriter();
    const input = makeInput();
    let captured: InputEvent | null = null;
    input.addEventListener("input", (e) => {
      captured = e as InputEvent;
    });

    await request("24");

    expect(captured).toBeInstanceOf(InputEvent);
    expect(captured!.inputType).toBe("insertText");
    expect(captured!.data).toBe("24");
    expect(captured!.bubbles).toBe(true);
  });

  it("reinitialise le _valueTracker avec une valeur DIFFERENTE de celle ecrite", async () => {
    installPriceMainWorldWriter();
    const input = makeInput();
    let tracked = "ancien";
    Object.defineProperty(input, "_valueTracker", {
      value: { getValue: () => tracked, setValue: (v: string) => { tracked = v; } },
      configurable: true,
    });

    const result = await request("24");

    expect(result.trackerState).toBe("reset");
    expect(tracked).toBe("");
    expect(tracked).not.toBe(input.value);
  });

  it("valeur cible vide : le tracker recoit une sentinelle NON vide", async () => {
    installPriceMainWorldWriter();
    const input = makeInput();
    input.value = "9";
    let tracked = "9";
    Object.defineProperty(input, "_valueTracker", {
      value: { getValue: () => tracked, setValue: (v: string) => { tracked = v; } },
      configurable: true,
    });

    await request("");

    expect(tracked).not.toBe("");
    expect(input.value).toBe("");
  });

  it("signale trackerState 'absent' sans echouer quand l'element ne porte aucun tracker", async () => {
    installPriceMainWorldWriter();
    makeInput();

    const result = await request("24");

    expect(result.ok).toBe(true);
    expect(result.trackerState).toBe("absent");
  });

  it("repond element_not_found plutot que d'ecrire ailleurs quand le selecteur ne matche rien", async () => {
    installPriceMainWorldWriter();

    const result = await request("24");

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("element_not_found");
  });

  it("renvoie le requestId recu, pour que l'appelant correle sa propre demande", async () => {
    installPriceMainWorldWriter();
    makeInput();

    const result = await request("24", "req-42");

    expect(result.requestId).toBe("req-42");
  });


  // Mission "CYCLE COMPLET EN MONDE MAIN" (2026-08-26) : le blur doit avoir
  // lieu ICI (contexte JS de React) -- c'est son handler onBlur qui commite la
  // valeur dans l'etat du composant, ce qu'un blur emis depuis le monde isole
  // ne peut pas provoquer.
  it("blure l'element APRES input/change, et le signale par blurred:true", async () => {
    installPriceMainWorldWriter();
    const input = makeInput();
    const seen: string[] = [];
    input.addEventListener("input", () => seen.push("input"));
    input.addEventListener("change", () => seen.push("change"));
    input.addEventListener("blur", () => seen.push("blur"));

    const result = await request("24");

    expect(seen).toEqual(["input", "change", "blur"]);
    expect(result.blurred).toBe(true);
    expect(document.activeElement).not.toBe(input);
  });

  // Mission "CYCLE COMPLET EN MONDE MAIN" (2026-08-26) : REGRESSION d'une
  // preuve live -- invoquer directement le onChange des props React internes
  // (`__reactProps…`) avec un objet target partiel faisait repasser le champ a
  // "NaN €". Ce chemin a ete supprime ; ce test garde la porte fermee.
  it("ne touche JAMAIS aux props React internes (__reactProps) -- un onChange invoque a la main faisait deriver le composant en NaN", async () => {
    installPriceMainWorldWriter();
    const input = makeInput();
    const onChange = vi.fn();
    Object.defineProperty(input, "__reactProps$abc", { value: { onChange }, configurable: true, enumerable: true });

    const result = await request("24");

    expect(result.ok).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("24");
  });

  // --- Audit C1 (2026-08-26) ---------------------------------------------
  // Cet ecouteur vit sur `document` dans le monde MAIN : n'importe quel script
  // de la page peut emettre l'evenement. Ces tests verifient que les deux
  // pouvoirs dangereux sont fermes -- selecteur libre, et valeur libre (qui
  // armerait le patch reseau).
  it("refuse un selecteur hors allowlist -- jamais d'ecriture dans un input arbitraire", async () => {
    installPriceMainWorldWriter();
    const intrus = document.createElement("input");
    intrus.setAttribute("data-testid", "autre-champ");
    document.body.appendChild(intrus);
    const onResult = vi.fn();
    document.addEventListener(PRICE_WRITE_RESULT_EVENT, onResult);

    document.dispatchEvent(
      new CustomEvent(PRICE_WRITE_REQUEST_EVENT, {
        detail: { requestId: "x", selector: '[data-testid="autre-champ"]', value: "24" },
      })
    );

    expect(onResult).not.toHaveBeenCalled();
    expect(intrus.value).toBe("");
    document.removeEventListener(PRICE_WRITE_RESULT_EVENT, onResult);
  });

  it.each(["24; DROP", "abc", "-5", "1e9", "24.999"])(
    "refuse une valeur non strictement numerique (%j)",
    async (value) => {
      installPriceMainWorldWriter();
      const input = makeInput();
      const onResult = vi.fn();
      document.addEventListener(PRICE_WRITE_RESULT_EVENT, onResult);

      document.dispatchEvent(
        new CustomEvent(PRICE_WRITE_REQUEST_EVENT, { detail: { requestId: "x", selector: SELECTOR, value } })
      );

      expect(onResult).not.toHaveBeenCalled();
      expect(input.value).toBe("");
      document.removeEventListener(PRICE_WRITE_RESULT_EVENT, onResult);
    }
  );

  it("accepte les formes numeriques legitimes, y compris l'effacement", async () => {
    installPriceMainWorldWriter();
    makeInput();

    for (const value of ["24", "24.50", "24,50", ""]) {
      const result = await request(value, `req-${value}`);
      expect(result.ok).toBe(true);
    }
  });

  it("ignore une demande malformee (selector ou value absent) sans repondre", async () => {
    installPriceMainWorldWriter();
    makeInput();
    const onResult = vi.fn();
    document.addEventListener(PRICE_WRITE_RESULT_EVENT, onResult);

    document.dispatchEvent(new CustomEvent(PRICE_WRITE_REQUEST_EVENT, { detail: { requestId: "x" } }));

    expect(onResult).not.toHaveBeenCalled();
  });
});

// Mission "INTERACTION UTILISATEUR COMPLETE" (2026-08-26) : enveloppe
// pointer/souris + keyup. Ces tests verrouillent surtout ce qui NE doit PAS
// arriver -- la valeur reste ecrite une seule fois, et aucun keydown/keypress
// n'annonce des frappes qui n'ont pas eu lieu (la contradiction
// evenement/valeur qui produisait le NaN avant l'ecriture atomique).
describe("priceMainWorldWriter -- enveloppe d'interaction", () => {
  it("emet l'enveloppe pointer/souris AVANT l'ecriture, puis keyup, puis change", async () => {
    installPriceMainWorldWriter();
    const input = makeInput();
    const seen: string[] = [];
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "input", "keyup", "change", "blur"]) {
      input.addEventListener(type, () => seen.push(type));
    }

    await request("24");

    expect(seen).toEqual([
      "pointerdown",
      "mousedown",
      "pointerup",
      "mouseup",
      "click",
      "input",
      "keyup",
      "change",
      "blur",
    ]);
  });

  it("n'emet AUCUN keydown/keypress -- jamais de frappe annoncee sans ecriture correspondante", async () => {
    installPriceMainWorldWriter();
    const input = makeInput();
    const keyEvents: string[] = [];
    input.addEventListener("keydown", () => keyEvents.push("keydown"));
    input.addEventListener("keypress", () => keyEvents.push("keypress"));

    await request("24");

    expect(keyEvents).toEqual([]);
  });

  it("keyup porte le DERNIER caractere de la valeur, et la valeur n'est ecrite qu'une fois", async () => {
    installPriceMainWorldWriter();
    const input = makeInput();
    let keyupKey: string | null = null;
    input.addEventListener("keyup", (e) => {
      keyupKey = (e as KeyboardEvent).key;
    });
    const writes: string[] = [];
    input.addEventListener("input", () => writes.push(input.value));

    await request("24");

    expect(keyupKey).toBe("4");
    expect(writes).toEqual(["24"]);
  });
});
