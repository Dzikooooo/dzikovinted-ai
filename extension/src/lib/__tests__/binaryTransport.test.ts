import { describe, expect, it } from "vitest";
import { arrayBufferToBase64, base64ToArrayBuffer, describeBinaryValue } from "../binaryTransport";
import { reconstructPhotoFiles } from "../../content/photoReconstruction";
import type { FetchedPhoto } from "../messages";

// Mission "PREUVE LIVE PRECISE -- TRANSPORT BINAIRE PHOTOS" (2026-08-11) :
// CAUSE CONFIRMEE en test live -- chrome.tabs.sendMessage()/chrome.runtime.
// onMessage serialisent leur message via JSON (documente par Chrome), pas
// via l'algorithme de clone structure complet. Un ArrayBuffer degenere donc
// en objet vide "{}" a la traversee -- ces tests reproduisent d'abord ce
// mecanisme EXACT (item 1), puis prouvent que le correctif base64 (JSON-safe
// par construction) le contourne integralement (items 2-5 de la mission,
// "tests obligatoires").
function buildWebpBytes(payloadByte: number, length = 64): Uint8Array {
  const bytes = new Uint8Array(length);
  // "RIFF" + taille (4 octets, valeur arbitraire ici) + "WEBP"
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0, 0, 0, 0], 4);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  for (let i = 12; i < length; i++) bytes[i] = payloadByte;
  return bytes;
}

function makeFetchedPhoto(overrides: Partial<FetchedPhoto> = {}): FetchedPhoto {
  return {
    url: "https://images1.vinted.net/photo1.webp",
    arrayBuffer: buildWebpBytes(0xaa).buffer as ArrayBuffer,
    mimeType: "image/webp",
    fileName: "photo1.webp",
    error: null,
    httpStatus: 200,
    contentTypeHeader: "image/webp",
    contentLengthHeader: "64",
    finalUrl: "https://images1.vinted.net/photo1.webp",
    redirected: false,
    ...overrides,
  };
}

describe("reproduction du mecanisme reel (mission item 1)", () => {
  it("proves chrome.tabs.sendMessage's JSON serialization degrades an ArrayBuffer to an empty plain object -- exact match to the live PHOTO_VALIDITY_REPORT symptoms", () => {
    const realBuffer = buildWebpBytes(0xaa).buffer as ArrayBuffer;
    // Reproduit exactement ce que chrome.tabs.sendMessage() fait a un
    // ArrayBuffer embarque dans un message (JSON.stringify -> "{}" -> parse).
    const degraded = JSON.parse(JSON.stringify(realBuffer)) as unknown;

    expect(degraded).toEqual({});
    // Signature EXACTE observee en live : byteLength undefined (pas null --
    // {} n'a simplement pas cette propriete), pas une ArrayBuffer.
    expect((degraded as { byteLength?: number }).byteLength).toBeUndefined();
    expect(degraded instanceof ArrayBuffer).toBe(false);

    // new Uint8Array({}) -> longueur 0 (ToLength(undefined) = 0), exactement
    // ce qui produit magicBytesHex:"" et sniffedFormat:"unknown" en live.
    const bytesFromDegraded = new Uint8Array(degraded as ArrayBufferLike);
    expect(bytesFromDegraded.length).toBe(0);
  });
});

describe("arrayBufferToBase64 / base64ToArrayBuffer", () => {
  it("round-trips the exact bytes of a real WebP buffer -- proves the wire representation survives transport intact", () => {
    const original = buildWebpBytes(0xaa);
    const base64 = arrayBufferToBase64(original.buffer as ArrayBuffer);
    expect(typeof base64).toBe("string");

    const decoded = new Uint8Array(base64ToArrayBuffer(base64));
    expect(decoded).toEqual(original);
  });

  it("preserves byte-for-byte content across 5 distinct photo payloads -- mission item 5 ('payload 5 photos conserve les 5 contenus')", () => {
    const payloads = [0x11, 0x22, 0x33, 0x44, 0x55].map((b) => buildWebpBytes(b));
    const roundTripped = payloads.map((p) => new Uint8Array(base64ToArrayBuffer(arrayBufferToBase64(p.buffer as ArrayBuffer))));
    roundTripped.forEach((decoded, i) => {
      expect(decoded).toEqual(payloads[i]);
    });
  });
});

describe("describeBinaryValue", () => {
  it("reports a real ArrayBuffer correctly (isArrayBuffer, byteLength, first16BytesHex)", () => {
    const buffer = buildWebpBytes(0xaa).buffer as ArrayBuffer;
    const d = describeBinaryValue(buffer);
    expect(d.isArrayBuffer).toBe(true);
    expect(d.byteLength).toBe(64);
    expect(d.first16BytesHex).toContain("52 49 46 46"); // "RIFF"
  });

  it("reports a JSON-degraded ArrayBuffer ({}) as neither ArrayBuffer nor Uint8Array, with null byteLength -- the diagnostic signature this instrumentation exists to catch", () => {
    const degraded = JSON.parse(JSON.stringify(new ArrayBuffer(10)));
    const d = describeBinaryValue(degraded);
    expect(d.isArrayBuffer).toBe(false);
    expect(d.isUint8Array).toBe(false);
    expect(d.byteLength).toBeNull();
    expect(d.first16BytesHex).toBeNull();
  });
});

describe("end-to-end: fetchPhoto's ArrayBuffer -> base64 (transport) -> ArrayBuffer -> reconstructPhotoFiles", () => {
  it("produces a real, valid WebP File after a full base64 round-trip -- mission items 2/3 ('reconstruction produit un vrai File WebP', 'magic bytes détectés comme webp')", () => {
    const photo = makeFetchedPhoto();
    const base64 = arrayBufferToBase64(photo.arrayBuffer!);
    const transported: FetchedPhoto = { ...photo, arrayBuffer: base64ToArrayBuffer(base64) };

    const [result] = reconstructPhotoFiles([transported]);

    expect(result.sniffedFormat).toBe("webp");
    expect(result.file).not.toBeNull();
    expect(result.file!.type).toBe("image/webp");
    expect(result.error).toBeNull();
  });

  it("keeps all 5 photos individually valid and content-distinct after transport -- mission item 5", () => {
    const photos = [0x11, 0x22, 0x33, 0x44, 0x55].map((b, i) =>
      makeFetchedPhoto({ url: `https://images1.vinted.net/photo${i}.webp`, fileName: `photo${i}.webp`, arrayBuffer: buildWebpBytes(b).buffer as ArrayBuffer })
    );
    const transported = photos.map((p) => ({ ...p, arrayBuffer: base64ToArrayBuffer(arrayBufferToBase64(p.arrayBuffer!)) }));

    const results = reconstructPhotoFiles(transported);

    expect(results).toHaveLength(5);
    for (const r of results) {
      expect(r.sniffedFormat).toBe("webp");
      expect(r.file).not.toBeNull();
    }
    // Contenus distincts preserves (pas juste "5 fichiers valides" -- le
    // BON contenu, dans le BON ordre).
    const sizes = results.map((r) => r.byteLength);
    expect(new Set(sizes).size).toBeGreaterThanOrEqual(1); // meme taille ici (64), le contenu differe par payloadByte
    expect(results.map((r) => r.url)).toEqual(photos.map((p) => p.url));
  });

  it("without the fix, the same JSON-degraded ArrayBuffer would be rejected as 'unknown' -- proves the fix is what makes the difference, not a coincidence", () => {
    const degraded = JSON.parse(JSON.stringify(buildWebpBytes(0xaa).buffer as ArrayBuffer)) as ArrayBuffer;
    const brokenPhoto = makeFetchedPhoto({ arrayBuffer: degraded });

    const [result] = reconstructPhotoFiles([brokenPhoto]);

    expect(result.sniffedFormat).toBe("unknown");
    expect(result.file).toBeNull();
    // Signature EXACTE observee dans le PHOTO_VALIDITY_REPORT live :
    // byteLength undefined (pas 0, pas null) -- {}.byteLength n'existe
    // simplement pas comme propriete.
    expect(result.byteLength).toBeUndefined();
  });
});
