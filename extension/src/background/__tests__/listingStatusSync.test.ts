import { describe, expect, it } from "vitest";
import { deriveResellOsStatus, resolveStaleDraftStatus } from "../listingStatusSync";

describe("deriveResellOsStatus", () => {
  it("maps sold_completed to vendu", () => {
    expect(deriveResellOsStatus("sold_completed")).toBe("vendu");
  });

  it("maps draft to draft", () => {
    expect(deriveResellOsStatus("draft")).toBe("draft");
  });

  it("maps any other raw Vinted status (online/hidden/reserved/sold_pending/unknown) to en_stock", () => {
    expect(deriveResellOsStatus("online")).toBe("en_stock");
    expect(deriveResellOsStatus("hidden")).toBe("en_stock");
    expect(deriveResellOsStatus("reserved")).toBe("en_stock");
    expect(deriveResellOsStatus("sold_pending")).toBe("en_stock");
    expect(deriveResellOsStatus("unknown")).toBe("en_stock");
  });
});

// Mission "brouillon fantome" (2026-08-11) : test live reel confirme --
// annonce genuinement publiee/visible sur Vinted (prix/vues/favoris
// affiches), bloquee par ResellOS avec "Cette annonce est en brouillon --
// termine-la avant de la republier." (checkListingRepublishEligible,
// checks.ts). Cause : listings.status ("draft") n'etait jamais rafraichi
// par la synchro passive (recordListings, sync.ts) une fois la ligne creee,
// contrairement a vinted_status qui l'est a chaque synchro.
describe("resolveStaleDraftStatus", () => {
  it("returns null when the existing ResellOS status isn't 'draft' -- never touches en_stock or vendu", () => {
    expect(resolveStaleDraftStatus("en_stock", "online")).toBeNull();
    expect(resolveStaleDraftStatus("vendu", "online")).toBeNull();
  });

  it("returns null when a stale 'draft' listing is STILL a real Vinted draft -- nothing to refresh yet", () => {
    expect(resolveStaleDraftStatus("draft", "draft")).toBeNull();
  });

  it("refreshes a stale 'draft' to 'en_stock' once Vinted confirms the listing is genuinely live -- the exact reported bug", () => {
    expect(resolveStaleDraftStatus("draft", "online")).toBe("en_stock");
    expect(resolveStaleDraftStatus("draft", "hidden")).toBe("en_stock");
    expect(resolveStaleDraftStatus("draft", "reserved")).toBe("en_stock");
  });

  it("refreshes a stale 'draft' straight to 'vendu' if Vinted reports it sold while still marked draft locally", () => {
    expect(resolveStaleDraftStatus("draft", "sold_completed")).toBe("vendu");
  });
});
