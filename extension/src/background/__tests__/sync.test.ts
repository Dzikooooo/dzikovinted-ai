import { afterEach, describe, expect, it, vi } from "vitest";

// Mission "FIABILISATION SYNCHRO VINTED, lot 1" (2026-08-16) : importer
// sync.ts declenche l'evaluation de supabaseClient.ts (createClient(),
// touche chrome.storage.local des le chargement du module) -- meme
// contrainte deja documentee dans enrichListing.test.ts. Mocke chaque
// dependance chrome-adjacente (session/supabaseClient/logger/retry/sku)
// pour tester le VRAI recordListings()/recordAccountDetected(), pas un
// proxy -- ce sont precisement l'ordonnancement des ecritures et le
// gate `complete` que cette mission doit prouver, pas seulement une
// decision pure extraite.
vi.mock("../session", () => ({ getValidAccessToken: vi.fn() }));
vi.mock("../supabaseClient", () => ({ supabaseWithToken: vi.fn() }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../retry", () => ({ withRetry: (fn: () => Promise<unknown>) => fn() }));
vi.mock("../../lib/sku", async () => {
  const actual = await vi.importActual<typeof import("../../lib/sku")>("../../lib/sku");
  return { ...actual, runSkuRepair: vi.fn().mockResolvedValue({ success: true }) };
});

import { getValidAccessToken } from "../session";
import { supabaseWithToken } from "../supabaseClient";
import {
  deleteListingRow,
  findDuplicateListingId,
  mergeImageUrls,
  rebindListingToVintedItem,
  recordAccountDetected,
  recordListings,
  recordSingleItemImport,
} from "../sync";
import type { ListingPayload, SingleItemPayload } from "../../lib/messages";

type Row = Record<string, unknown>;

// Fake Supabase minimal, TAILLE SUR MESURE pour les appels exacts emis par
// sync.ts (from/select/insert/update/eq/in/not/neq/maybeSingle/single) --
// pas un emulateur general. Opere sur un etat en memoire reel plutot que des
// reponses scriptees : permet d'asserter sur l'ETAT FINAL (ex.
// "listings_synced_at vaut toujours null") plutot que sur l'ordre exact des
// appels, plus robuste et plus lisible.
interface FakeState {
  vintedAccounts: Map<string, Row>;
  listings: Map<string, Row>;
  snapshots: Row[];
  nextId: number;
  failOn: Set<string>;
}

function makeState(): FakeState {
  return { vintedAccounts: new Map(), listings: new Map(), snapshots: [], nextId: 1, failOn: new Set() };
}

class FakeQueryBuilder implements PromiseLike<{ data: unknown; error: unknown; count?: number }> {
  private op: "select" | "insert" | "update" | "delete" | null = null;
  private selectOpts: { count?: string; head?: boolean } | null = null;
  private insertRows: Row[] | null = null;
  private updatePayload: Row | null = null;
  private filters: Array<(row: Row) => boolean> = [];

  constructor(
    private table: string,
    private state: FakeState
  ) {}

  private rows(): Map<string, Row> {
    if (this.table === "vinted_accounts") return this.state.vintedAccounts;
    if (this.table === "listings") return this.state.listings;
    if (this.table === "listing_metric_snapshots") throw new Error("listing_metric_snapshots utilise insert() direct, pas de Map dediee");
    throw new Error(`FakeSupabase: table inconnue "${this.table}"`);
  }

  select(_cols: string, opts?: { count?: string; head?: boolean }): this {
    if (!this.op) this.op = "select";
    this.selectOpts = opts ?? null;
    return this;
  }
  insert(rows: Row | Row[]): this {
    this.op = "insert";
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(payload: Row): this {
    this.op = "update";
    this.updatePayload = payload;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push((row) => row[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]): this {
    this.filters.push((row) => vals.includes(row[col]));
    return this;
  }
  neq(col: string, val: unknown): this {
    this.filters.push((row) => row[col] !== val);
    return this;
  }
  not(col: string, op: string, val: unknown): this {
    if (op === "is") {
      this.filters.push((row) => row[col] !== null && row[col] !== undefined);
    } else if (op === "in") {
      const list = String(val).replace(/[()]/g, "").split(",").filter(Boolean);
      this.filters.push((row) => !list.includes(String(row[col])));
    } else {
      throw new Error(`FakeSupabase: operateur .not() non supporte: ${op}`);
    }
    return this;
  }

  private matchingRows(): Row[] {
    if (this.table === "listing_metric_snapshots") return [];
    return Array.from(this.rows().values()).filter((row) => this.filters.every((f) => f(row)));
  }

  private execute(): { data: unknown; error: unknown; count?: number } {
    const failKey = `${this.table}.${this.op}`;
    if (this.state.failOn.has(failKey)) {
      return { data: null, error: { message: `Fake Supabase failure injectee: ${failKey}` } };
    }

    if (this.table === "listing_metric_snapshots" && this.op === "insert") {
      this.state.snapshots.push(...(this.insertRows ?? []));
      return { data: this.insertRows, error: null };
    }

    if (this.op === "select") {
      if (this.selectOpts?.count === "exact" && this.selectOpts.head) {
        return { data: null, error: null, count: this.matchingRows().length };
      }
      return { data: this.matchingRows(), error: null };
    }

    if (this.op === "insert") {
      const inserted = (this.insertRows ?? []).map((row) => {
        const id = (row.id as string | undefined) ?? `row-${this.state.nextId++}`;
        const full = { ...row, id };
        this.rows().set(id, full);
        return full;
      });
      return { data: inserted, error: null };
    }

    if (this.op === "update") {
      const targets = this.matchingRows();
      for (const row of targets) Object.assign(row, this.updatePayload);
      return { data: targets, error: null };
    }

    if (this.op === "delete") {
      const targets = this.matchingRows();
      for (const row of targets) this.rows().delete(row.id as string);
      return { data: targets, error: null };
    }

    return { data: null, error: null };
  }

  maybeSingle() {
    const r = this.execute();
    const arr = (r.data as Row[] | null) ?? [];
    return Promise.resolve({ data: arr[0] ?? null, error: r.error });
  }
  single() {
    const r = this.execute();
    const arr = (r.data as Row[] | null) ?? [];
    return Promise.resolve({ data: arr[0] ?? null, error: r.error });
  }
  then<TResult1, TResult2 = never>(
    onFulfilled?: ((value: { data: unknown; error: unknown; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }
}

function makeFakeClient(state: FakeState) {
  return { from: (table: string) => new FakeQueryBuilder(table, state) };
}

function stubValidSession(userId = "user-1"): void {
  vi.mocked(getValidAccessToken).mockResolvedValue({ accessToken: "token", userId });
}

function stubClient(state: FakeState): void {
  vi.mocked(supabaseWithToken).mockReturnValue(makeFakeClient(state) as unknown as ReturnType<typeof supabaseWithToken>);
}

function makeListing(overrides: Partial<ListingPayload> = {}): ListingPayload {
  return {
    vintedItemId: "111",
    title: "Pull Zara",
    price: 15,
    imageUrl: "https://images.vinted.net/a.jpg",
    vintedUrl: "https://www.vinted.fr/items/111",
    favourites: 2,
    views: 30,
    status: "online",
    brand: "Zara",
    size: "M",
    ...overrides,
  };
}

describe("recordListings", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Cas E : recordListings reussit completement -> listings_synced_at mis a
  // jour A LA FIN (scan complet, aucune erreur).
  it("advances listings_synced_at once the full complete scan succeeds", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);

    const result = await recordListings("999", "matleshop", [makeListing()], true);

    expect(result.ok).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.created).toBe(1);
    const account = Array.from(state.vintedAccounts.values())[0];
    expect(account.listings_synced_at).not.toBeNull();
    expect(account.listings_synced_at).toBeTypeOf("string");
  });

  // Cas F : une erreur Supabase survient AVANT la fin (ici, l'update de
  // marquage des annonces disparues) -> listings_synced_at NE DOIT PAS avoir
  // avance (la fonction rejette avant meme d'atteindre ce point de code).
  it("never advances listings_synced_at when a Supabase error occurs before the end", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);
    state.failOn.add("listings.update"); // touche a la fois le marquage deleted ET les updates d'annonces existantes

    await expect(recordListings("999", "matleshop", [makeListing()], true)).rejects.toBeTruthy();

    const account = Array.from(state.vintedAccounts.values())[0];
    expect(account.listings_synced_at ?? null).toBeNull();
  });

  // Cas G : scan incomplet (complete:false) -> aucune annonce EXISTANTE
  // marquee deleted, et listings_synced_at non avance non plus.
  it("never marks an absent listing as deleted, and never advances listings_synced_at, on an incomplete scan", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);
    // Annonce deja connue en base, liee au meme compte, absente du scan
    // partiel qui suit.
    const accountId = "acct-1";
    state.vintedAccounts.set(accountId, {
      id: accountId,
      user_id: "user-1",
      vinted_user_id: "999",
      vinted_username: "matleshop",
      connected: true,
      listings_synced_at: null,
    });
    state.listings.set("listing-old", {
      id: "listing-old",
      vinted_account_id: accountId,
      vinted_item_id: "OLD-ITEM",
      status: "en_stock",
      vinted_status: "online",
      sold_price: null,
      vinted_sync_status: null,
    });

    // Scan partiel ne contenant PAS "OLD-ITEM" -- si la garde ne fonctionne
    // pas, l'ancienne logique la marquerait 'deleted' a tort.
    const result = await recordListings("999", "matleshop", [makeListing({ vintedItemId: "NEW-ITEM" })], false);

    expect(result.ok).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.deletedMarked).toBe(0);
    expect(state.listings.get("listing-old")?.vinted_status).toBe("online"); // jamais touchee
    const account = state.vintedAccounts.get(accountId);
    expect(account?.listings_synced_at).toBeNull();
  });

  // Cas H : scan COMPLET avec une vraie disparition -> comportement deleted
  // existant conserve (non-regression).
  it("still marks a genuinely absent listing as deleted on a complete scan (regression check)", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);
    const accountId = "acct-1";
    state.vintedAccounts.set(accountId, {
      id: accountId,
      user_id: "user-1",
      vinted_user_id: "999",
      vinted_username: "matleshop",
      connected: true,
      listings_synced_at: null,
    });
    state.listings.set("listing-old", {
      id: "listing-old",
      vinted_account_id: accountId,
      vinted_item_id: "OLD-ITEM",
      status: "en_stock",
      vinted_status: "online",
      sold_price: null,
      vinted_sync_status: null,
    });

    const result = await recordListings("999", "matleshop", [makeListing({ vintedItemId: "NEW-ITEM" })], true);

    expect(result.ok).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.deletedMarked).toBe(1);
    expect(state.listings.get("listing-old")?.vinted_status).toBe("deleted");
    const account = state.vintedAccounts.get(accountId);
    expect(account?.listings_synced_at).not.toBeNull();
  });

  // Point 4 (retour d'erreur) : session invalide -> plus un simple `return`
  // silencieux, un resultat structure explicite.
  it("returns a structured not_paired result instead of a silent return when the session is invalid", async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue(null);

    const result = await recordListings("999", "matleshop", [makeListing()], true);

    expect(result).toEqual({ ok: false, complete: false, created: 0, updated: 0, deletedMarked: 0, reason: "not_paired" });
  });

  // Non-regression explicite demandee : protection des brouillons locaux
  // (vinted_sync_status sync_pending/sync_failed) toujours respectee --
  // price n'est jamais ecrase par la synchro passive dans ce cas.
  it("still protects a local unsynced draft's price during a complete passive sync (non-regression)", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);
    const accountId = "acct-1";
    state.vintedAccounts.set(accountId, {
      id: accountId,
      user_id: "user-1",
      vinted_user_id: "999",
      vinted_username: "matleshop",
      connected: true,
      listings_synced_at: null,
    });
    state.listings.set("listing-draft", {
      id: "listing-draft",
      vinted_account_id: accountId,
      vinted_item_id: "DRAFT-ITEM",
      status: "en_stock",
      vinted_status: "online",
      sold_price: null,
      vinted_sync_status: "sync_pending",
      price: 42,
    });

    const result = await recordListings(
      "999",
      "matleshop",
      [makeListing({ vintedItemId: "DRAFT-ITEM", price: 99 })],
      true
    );

    expect(result.ok).toBe(true);
    // price INCHANGE (42, jamais ecrase par les 99 envoyes par Vinted) --
    // seul vinted_status/favourites/views/synced_at/vinted_url sont
    // rafraichis pour une ligne draftPending.
    expect(state.listings.get("listing-draft")?.price).toBe(42);
  });
});

describe("recordAccountDetected", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a structured not_paired result instead of a silent return when the session is invalid", async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue(null);

    const result = await recordAccountDetected("999", "matleshop");

    expect(result).toEqual({ ok: false, reason: "not_paired" });
  });

  it("returns ok:true and creates the account when the session is valid", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);

    const result = await recordAccountDetected("999", "matleshop");

    expect(result).toEqual({ ok: true, reason: "success" });
    expect(state.vintedAccounts.size).toBe(1);
  });
});

// Mission "REPUBLICATION : CORRIGER LES DOUBLONS" (2026-08-17) : ces 3
// fonctions sont les briques Supabase de la transaction de remplacement
// (voir republishTransaction.ts, teste en isolation avec ces 3 fonctions
// mockees). Ici, c'est l'inverse : le VRAI query-building est exerce contre
// le FakeQueryBuilder, pour prouver que la recherche de doublon ne s'appuie
// JAMAIS sur titre/prix (seulement vinted_item_id) -- l'inverse ne peut pas
// etre prouve en mockant la fonction elle-meme.
function makeListingRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "listing-x",
    vinted_account_id: "acct-1",
    vinted_item_id: "ITEM-X",
    title: "Pull Zara",
    price: 15,
    vinted_url: "https://www.vinted.fr/items/ITEM-X",
    status: "en_stock",
    vinted_status: "online",
    sold_price: null,
    vinted_sync_status: null,
    ...overrides,
  };
}

describe("rebindListingToVintedItem", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rattache la ligne ORIGINALE (par id ResellOS) au nouvel item -- jamais une nouvelle ligne", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);
    state.listings.set("listing-1", makeListingRow({ id: "listing-1", vinted_item_id: "OLD-1" }));

    const result = await rebindListingToVintedItem("listing-1", "acct-1", "NEW-1", "https://www.vinted.fr/items/NEW-1");

    expect(result).toEqual({ ok: true, found: true, alreadySold: false, previousVintedItemId: "OLD-1" });
    expect(state.listings.size).toBe(1); // toujours UNE seule ligne
    const row = state.listings.get("listing-1");
    expect(row?.vinted_item_id).toBe("NEW-1");
    expect(row?.vinted_url).toBe("https://www.vinted.fr/items/NEW-1");
    expect(row?.vinted_status).toBe("online");
    expect(row?.status).toBe("en_stock");
  });

  it("refuse de rattacher une ligne déjà vendue (sold_price non null) -- jamais un écrasement silencieux d'une vente réelle", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);
    state.listings.set("listing-1", makeListingRow({ id: "listing-1", vinted_item_id: "OLD-1", sold_price: 42 }));

    const result = await rebindListingToVintedItem("listing-1", "acct-1", "NEW-1", "https://www.vinted.fr/items/NEW-1");

    expect(result).toEqual({ ok: false, found: true, alreadySold: true, previousVintedItemId: "OLD-1" });
    expect(state.listings.get("listing-1")?.vinted_item_id).toBe("OLD-1"); // inchange
  });

  it("retourne found:false quand la ligne ResellOS n'existe pas", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);

    const result = await rebindListingToVintedItem("listing-missing", "acct-1", "NEW-1", "https://www.vinted.fr/items/NEW-1");

    expect(result.ok).toBe(false);
    expect(result.found).toBe(false);
  });
});

describe("findDuplicateListingId", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("trouve un doublon reel : meme compte, meme vinted_item_id, ligne differente", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);
    state.listings.set("listing-1", makeListingRow({ id: "listing-1", vinted_item_id: "NEW-1" }));
    state.listings.set("listing-2-orphan", makeListingRow({ id: "listing-2-orphan", vinted_item_id: "NEW-1" }));

    const duplicateId = await findDuplicateListingId("acct-1", "NEW-1", "listing-1");

    expect(duplicateId).toBe("listing-2-orphan");
  });

  // Preuve explicite (demande mission) : deux annonces DIFFERENTES qui
  // partagent titre+prix ne doivent JAMAIS etre traitees comme un doublon --
  // seul vinted_item_id compte, jamais un rapprochement titre/prix.
  it("ne fusionne JAMAIS deux annonces différentes qui partagent seulement le même titre/prix (vinted_item_id différent)", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);
    state.listings.set("listing-1", makeListingRow({ id: "listing-1", vinted_item_id: "NEW-1", title: "Pull Zara", price: 15 }));
    // Meme titre, meme prix, mais un vinted_item_id VRAIMENT different --
    // une annonce distincte et legitime, jamais un doublon.
    state.listings.set("listing-unrelated", makeListingRow({ id: "listing-unrelated", vinted_item_id: "OTHER-999", title: "Pull Zara", price: 15 }));

    const duplicateId = await findDuplicateListingId("acct-1", "NEW-1", "listing-1");

    expect(duplicateId).toBeNull();
  });

  it("ignore un doublon appartenant a un AUTRE compte Vinted", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);
    state.listings.set("listing-1", makeListingRow({ id: "listing-1", vinted_account_id: "acct-1", vinted_item_id: "NEW-1" }));
    state.listings.set("listing-other-account", makeListingRow({ id: "listing-other-account", vinted_account_id: "acct-2", vinted_item_id: "NEW-1" }));

    const duplicateId = await findDuplicateListingId("acct-1", "NEW-1", "listing-1");

    expect(duplicateId).toBeNull();
  });

  it("retourne null quand aucun doublon n'existe", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);
    state.listings.set("listing-1", makeListingRow({ id: "listing-1", vinted_item_id: "NEW-1" }));

    const duplicateId = await findDuplicateListingId("acct-1", "NEW-1", "listing-1");

    expect(duplicateId).toBeNull();
  });
});

describe("deleteListingRow", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("supprime définitivement la ligne visée", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);
    state.listings.set("listing-orphan", makeListingRow({ id: "listing-orphan" }));

    const ok = await deleteListingRow("listing-orphan");

    expect(ok).toBe(true);
    expect(state.listings.has("listing-orphan")).toBe(false);
  });

  it("retourne false proprement en cas d'échec Supabase, sans lever", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);
    state.listings.set("listing-orphan", makeListingRow({ id: "listing-orphan" }));
    state.failOn.add("listings.delete");

    const ok = await deleteListingRow("listing-orphan");

    expect(ok).toBe(false);
    expect(state.listings.has("listing-orphan")).toBe(true); // jamais supprimee si Supabase a echoue
  });
});

// Mission "PHOTOS PERDUES APRES REPUBLICATION" (2026-08-17) : bug live --
// une annonce republiee affichait 1 seule miniature dans la modale de
// republication alors qu'elle en possedait 5 avant. Cause reelle confirmee
// par audit direct : recordSingleItemImport() (appelee automatiquement par
// enrichListingIfNeeded() pendant une republication, pour visiter la page
// Vinted de l'ANCIENNE annonce et en extraire les champs manquants)
// ecrivait item.imageUrls SANS CONDITION -- si cette ancienne page est
// devenue masquee/supprimee/introuvable (le cas meme qui declenche le
// bandeau de republication), l'extraction DOM (extractPhotoUrls(),
// itemSelectors.ts) ne trouve plus les vraies vignettes et ne remonte
// qu'un extrait degrade, effacant silencieusement l'historique reel.
describe("mergeImageUrls", () => {
  it("garde l'existant quand la nouvelle source en contient MOINS (extraction degradee)", () => {
    expect(mergeImageUrls(["a", "b", "c", "d", "e"], ["a"])).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("garde l'existant quand la nouvelle source est vide", () => {
    expect(mergeImageUrls(["a", "b", "c", "d", "e"], [])).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("accepte la nouvelle source quand elle en contient AUTANT (remplacement legitime, meme volume)", () => {
    expect(mergeImageUrls(["a", "b"], ["x", "y"])).toEqual(["x", "y"]);
  });

  it("accepte la nouvelle source quand elle en contient PLUS (source genuinement plus riche)", () => {
    expect(mergeImageUrls(["a"], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("n'a rien a proteger sur une ligne qui n'existait pas encore (tableau existant vide)", () => {
    expect(mergeImageUrls([], ["a"])).toEqual(["a"]);
  });
});

describe("recordSingleItemImport", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeSingleItemPayload(overrides: Partial<SingleItemPayload> = {}): SingleItemPayload {
    return {
      vintedItemId: "ITEM-X",
      vintedUrl: "https://www.vinted.fr/items/ITEM-X",
      title: "Polo Ralph Lauren",
      description: "Polo en bon etat",
      price: 25,
      brand: "Ralph Lauren",
      category: "Polos",
      color: "Bleu",
      size: "M",
      condition: "Très bon état",
      material: null,
      imageUrls: ["https://images.vinted.net/1.jpg"],
      ...overrides,
    };
  }

  // TEST DE REGRESSION explicitement demande : "listing local avec 5 photos
  // -> sync/rebind avec payload distant ne contenant qu'une thumbnail ->
  // listing final doit toujours avoir ses 5 photos."
  it("RÉGRESSION : un listing local à 5 photos conserve ses 5 photos même si la ré-extraction Vinted n'en trouve qu'une (page masquée/introuvable)", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);
    const accountId = "acct-1";
    state.vintedAccounts.set(accountId, {
      id: accountId,
      user_id: "user-1",
      vinted_username: "matleshop",
    });
    const fivePhotos = [
      "https://images.vinted.net/1.jpg",
      "https://images.vinted.net/2.jpg",
      "https://images.vinted.net/3.jpg",
      "https://images.vinted.net/4.jpg",
      "https://images.vinted.net/5.jpg",
    ];
    state.listings.set(
      "listing-polo",
      makeListingRow({
        id: "listing-polo",
        vinted_account_id: accountId,
        vinted_item_id: "ITEM-X",
        title: "Polo Ralph Lauren",
        image_urls: fivePhotos,
        views: 10,
        favourites: 2,
      })
    );

    // Simule exactement enrichListingIfNeeded() visitant une page Vinted
    // devenue morte/masquee : extractPhotoUrls() n'y trouve plus qu'UNE
    // vignette residuelle (ou une image generique) au lieu des 5 reelles.
    const degraded = makeSingleItemPayload({ imageUrls: ["https://images.vinted.net/degraded-1.jpg"] });

    const result = await recordSingleItemImport("matleshop", degraded);

    expect(result).toEqual({ created: false, draftProtected: false });
    // Assertion centrale : les 5 photos historiques sont TOUJOURS la valeur
    // finale, jamais remplacees par l'extrait degrade a 1 photo.
    expect(state.listings.get("listing-polo")?.image_urls).toEqual(fivePhotos);
  });

  it("accepte une ré-extraction qui contient AUTANT ou PLUS de photos (mise à jour légitime)", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);
    const accountId = "acct-1";
    state.vintedAccounts.set(accountId, { id: accountId, user_id: "user-1", vinted_username: "matleshop" });
    state.listings.set(
      "listing-polo",
      makeListingRow({
        id: "listing-polo",
        vinted_account_id: accountId,
        vinted_item_id: "ITEM-X",
        image_urls: ["https://images.vinted.net/old-1.jpg", "https://images.vinted.net/old-2.jpg"],
      })
    );

    const freshFull = makeSingleItemPayload({
      imageUrls: ["https://images.vinted.net/new-1.jpg", "https://images.vinted.net/new-2.jpg", "https://images.vinted.net/new-3.jpg"],
    });

    await recordSingleItemImport("matleshop", freshFull);

    expect(state.listings.get("listing-polo")?.image_urls).toEqual(freshFull.imageUrls);
  });

  it("un tout premier import (aucune ligne existante) écrit les photos telles quelles, rien à protéger", async () => {
    const state = makeState();
    stubValidSession();
    stubClient(state);
    const accountId = "acct-1";
    state.vintedAccounts.set(accountId, { id: accountId, user_id: "user-1", vinted_username: "matleshop" });

    const payload = makeSingleItemPayload({ vintedItemId: "BRAND-NEW", imageUrls: ["https://images.vinted.net/only-1.jpg"] });
    const result = await recordSingleItemImport("matleshop", payload);

    expect(result.created).toBe(true);
    const inserted = Array.from(state.listings.values()).find((row) => row.vinted_item_id === "BRAND-NEW");
    expect(inserted?.image_urls).toEqual(["https://images.vinted.net/only-1.jpg"]);
  });
});
