import { describe, expect, it, vi } from "vitest";

// Mission "ROUND HOTFIX PUBLISH BOOT" (2026-08-18) : CANARI DE BOOT, pas un
// test fonctionnel complet -- vinted-publish.ts n'avait JAMAIS ete importe
// directement par un test unitaire (trop d'effets de bord au chargement du
// module : MutationObserver, listeners installes immediatement -- voir les
// en-tetes de ce fichier et de vinted-item-delete.test.ts pour la meme
// discipline). C'est EXACTEMENT cet angle mort qui a laisse passer la
// regression TDZ (ReferenceError non catchee au chargement du module,
// interrompant son evaluation AVANT l'enregistrement du listener
// PUBLISH_LISTING) sans qu'aucune des 4 verifications habituelles
// (typecheck/lint/tests/build) ne la detecte. Objectif unique de ce test :
// garantir qu'un futur crash module-level similaire (TDZ ou autre exception
// synchrone) fasse echouer la suite de tests, au lieu de rester invisible
// jusqu'au prochain test live.
//
// vi.hoisted() est requis pour que ce stub minimal de `chrome` existe AVANT
// que l'import de vinted-publish.ts (hoiste par Vitest/ESM au-dessus de tout
// le reste) ne s'evalue -- un simple vi.stubGlobal() place plus bas dans ce
// fichier arriverait trop tard, le module aurait deja fini de s'executer.
// sendMessage doit retourner un objet "thenable" (.catch existant) : logger.ts
// (importe transitivement, docLog wrapper de ce fichier) appelle
// chrome.runtime.sendMessage(...).catch(() => {}) des l'evaluation du module
// (logs PUBLISH_CONTENT_VERSION/REPUBLISH_BUILD_DIAGNOSTIC) -- un mock
// retournant simplement `undefined` ferait planter le module pour une raison
// totalement etrangere a ce qu'on veut detecter ici.
const { registeredListeners } = vi.hoisted(() => {
  const registeredListeners: unknown[] = [];
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      sendMessage: () => Promise.resolve(),
      onMessage: {
        addListener: (fn: unknown) => {
          registeredListeners.push(fn);
        },
      },
    },
  };
  return { registeredListeners };
});

describe("vinted-publish.ts -- canari de boot du module", () => {
  it("A. l'import ne rejette pas et ne leve aucune exception synchrone", async () => {
    await expect(import("../vinted-publish")).resolves.toBeDefined();
  });

  it("B. chrome.runtime.onMessage.addListener a bien ete appele au moins une fois", () => {
    // L'import precedent (module ES, mis en cache) a deja execute le module
    // une seule fois pour toute la suite -- verifie l'etat accumule plutot
    // que de re-importer.
    expect(registeredListeners.length).toBeGreaterThan(0);
  });

  it("C. le listener enregistre accepte bien un message PUBLISH_LISTING et repond de facon synchrone (ACK)", () => {
    const listener = registeredListeners[registeredListeners.length - 1] as (
      message: unknown,
      sender: unknown,
      sendResponse: (response: unknown) => void
    ) => unknown;
    expect(typeof listener).toBe("function");

    // Payload COMPLET (voir PublishListingPayload, lib/messages.ts) -- un
    // payload partiel declencherait un TypeError synchrone plus loin dans
    // runPublishOnce() (payload.imageUrls.length), non catche par son propre
    // try/catch (l'acces a imageUrls precede le `try`), qui remonterait en
    // rejet de promesse non gere (void runPublish(...), fire-and-forget) --
    // confirme empiriquement lors de l'ecriture de ce test. Ce canari doit
    // rester silencieux sur ce point : il verifie l'ACK, pas le comportement
    // complet du publish.
    //
    // vi.useFakeTimers() : au-dela de l'ACK synchrone, le listener declenche
    // reellement runPublish() -> runPublishOnce() -> waitForElement(...), qui
    // attend jusqu'a 8000ms (DEFAULT_TIMEOUT_MS, domWait.ts) avant de
    // timeout -- en jsdom vide (aucun element Vinted reel), cet element
    // n'apparaitra jamais. Sans timers factices, ce test attendrait
    // reellement ces 8 secondes avant de pouvoir se terminer (le process
    // Vitest reste actif tant qu'un vrai setTimeout est en attente). Avec des
    // timers factices jamais avances, cette promesse reste indefiniment en
    // attente sans jamais se resoudre ni rejeter -- inoffensif, le fichier de
    // test se termine normalement (aucune horloge reelle a attendre), et ce
    // n'est pas ce comportement post-ACK que ce canari verifie.
    vi.useFakeTimers();
    try {
      const sendResponse = vi.fn();
      const fullPayload = {
        title: "T-shirt test",
        description: "",
        price: 10,
        category: "",
        brand: null,
        size: null,
        condition: "",
        color: null,
        material: null,
        imageUrls: [],
        packageSize: "medium",
        expectedVintedUsername: "",
      };
      listener({ type: "PUBLISH_LISTING", payload: fullPayload, photos: [] }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledTimes(1);
      const response = sendResponse.mock.calls[0][0] as { ok?: boolean; accepted?: boolean };
      expect(response.ok).toBe(true);
      expect(response.accepted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
