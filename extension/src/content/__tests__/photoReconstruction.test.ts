import { describe, expect, it } from "vitest";
import { reconstructPhotoFiles, sniffImageFormat } from "../photoReconstruction";
import type { FetchedPhoto } from "../../lib/messages";

function makeFetchedPhoto(overrides: Partial<FetchedPhoto> = {}): FetchedPhoto {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4]); // JPEG magic bytes + filler
  return {
    url: "https://images1.vinted.net/photo1.jpg",
    arrayBuffer: bytes.buffer,
    mimeType: "image/jpeg",
    fileName: "photo1.jpg",
    error: null,
    httpStatus: 200,
    contentTypeHeader: "image/jpeg",
    contentLengthHeader: String(bytes.byteLength),
    finalUrl: "https://images1.vinted.net/photo1.jpg",
    redirected: false,
    ...overrides,
  };
}

describe("sniffImageFormat", () => {
  it("recognizes JPEG magic bytes (FF D8 FF)", () => {
    expect(sniffImageFormat(new Uint8Array([0xff, 0xd8, 0xff, 0, 0]))).toBe("jpeg");
  });

  it("recognizes PNG magic bytes (89 50 4E 47)", () => {
    expect(sniffImageFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe("png");
  });

  it("recognizes WEBP magic bytes (RIFF....WEBP)", () => {
    // "RIFF" (52 49 46 46) + 4 octets de taille (ignores) + "WEBP" (57 45 42 50)
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffImageFormat(bytes)).toBe("webp");
  });

  it("returns 'unknown' for content that isn't a recognized image format (e.g. an HTML error page)", () => {
    const htmlBytes = new TextEncoder().encode("<!doctype html><html>");
    expect(sniffImageFormat(htmlBytes)).toBe("unknown");
  });

  // Mission "5 photos non reconnues comme images" (2026-08-11) : formats
  // modernes plausibles cote CDN, tous bases sur le conteneur ISOBMFF (box
  // "ftyp" a l'offset 4, "major brand" sur 4 octets a l'offset 8).
  it("recognizes AVIF via its ISOBMFF ftyp/avif brand", () => {
    const bytes = new Uint8Array([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0]);
    expect(sniffImageFormat(bytes)).toBe("avif");
  });

  it("recognizes HEIC via its ISOBMFF ftyp/heic brand", () => {
    const bytes = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0]);
    expect(sniffImageFormat(bytes)).toBe("heic");
  });
});

describe("reconstructPhotoFiles", () => {
  it("conserves byteLength, MIME type and filename exactly when reconstructing a File from a FetchedPhoto", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 10, 20, 30, 40, 50]);
    const photo = makeFetchedPhoto({ arrayBuffer: bytes.buffer, mimeType: "image/jpeg", fileName: "polo-front.jpg" });

    const [result] = reconstructPhotoFiles([photo]);

    expect(result.file).not.toBeNull();
    expect(result.file!.name).toBe("polo-front.jpg");
    expect(result.file!.type).toBe("image/jpeg");
    expect(result.file!.size).toBe(bytes.byteLength);
    expect(result.byteLength).toBe(bytes.byteLength);
    expect(result.sniffedFormat).toBe("jpeg");
    expect(result.error).toBeNull();
  });

  it("produces a null file (never a thrown exception) for a photo whose background fetch already failed", () => {
    const failedPhoto = makeFetchedPhoto({ arrayBuffer: null, mimeType: null, error: "HTTP 403" });

    const [result] = reconstructPhotoFiles([failedPhoto]);

    expect(result.file).toBeNull();
    expect(result.fileCreated).toBe(false);
    expect(result.error).toBe("HTTP 403");
  });

  it("keeps the exact order of multiple photos, skipping only the failed ones -- never reordering or silently dropping a successful one", () => {
    const photos: FetchedPhoto[] = [
      makeFetchedPhoto({ url: "https://images1.vinted.net/1.jpg", fileName: "1.jpg" }),
      makeFetchedPhoto({ url: "https://images1.vinted.net/2.jpg", fileName: "2.jpg", arrayBuffer: null, mimeType: null, error: "HTTP 500" }),
      makeFetchedPhoto({ url: "https://images1.vinted.net/3.jpg", fileName: "3.jpg" }),
    ];

    const results = reconstructPhotoFiles(photos);

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.url)).toEqual(["https://images1.vinted.net/1.jpg", "https://images1.vinted.net/2.jpg", "https://images1.vinted.net/3.jpg"]);
    expect(results[0].file?.name).toBe("1.jpg");
    expect(results[1].file).toBeNull();
    expect(results[2].file?.name).toBe("3.jpg");

    const files = results.filter((r) => r.file !== null).map((r) => r.file!);
    expect(files.map((f) => f.name)).toEqual(["1.jpg", "3.jpg"]);
  });

  // Mission "5 photos non reconnues comme images" (2026-08-11), item 8 :
  // renverse le comportement precedent -- un contenu qui ne correspond a
  // AUCUN format image connu (ni jpeg/png/webp/avif/heic/heif) n'est PLUS
  // transforme en File injectable. Un HTTP 200 ne garantit jamais un
  // contenu image valide (page d'erreur HTML, challenge, reponse tronquee).
  it("rejects content that doesn't match ANY recognized image format -- never produces an injectable File from non-image bytes", () => {
    const notReallyAnImage = new TextEncoder().encode("<!doctype html><html>Erreur</html>");
    const photo = makeFetchedPhoto({ arrayBuffer: notReallyAnImage.buffer, mimeType: "image/jpeg", fileName: "broken.jpg" });

    const [result] = reconstructPhotoFiles([photo]);

    expect(result.file).toBeNull();
    expect(result.sniffedFormat).toBe("unknown");
    expect(result.error).toContain("non reconnu");
  });

  // Mission "5 photos non reconnues" (2026-08-11) : le CDN peut mal declarer
  // le Content-Type (mimeType recu du fetch background) alors que les octets
  // reels sont un format image CONNU mais different -- le File doit porter
  // le MIME REEL (sniffe), jamais la valeur potentiellement fausse recue.
  it("uses the sniffed format's canonical MIME type, not a mismatched declared mimeType (CDN mislabeling)", () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 1, 2, 3, 4]);
    // mimeType declare (recu du fetch background) dit "image/jpeg", mais les
    // octets reels sont un PNG -- simule un CDN qui mislabel son Content-Type.
    const photo = makeFetchedPhoto({ arrayBuffer: pngBytes.buffer, mimeType: "image/jpeg", fileName: "mislabeled.jpg" });

    const [result] = reconstructPhotoFiles([photo]);

    expect(result.file).not.toBeNull();
    expect(result.sniffedFormat).toBe("png");
    expect(result.file!.type).toBe("image/png");
    expect(result.declaredMimeType).toBe("image/jpeg");
  });

  // Format moderne plausible cote CDN Vinted (mission "5 photos non
  // reconnues", section 7) : un vrai AVIF (conteneur ISOBMFF, brand "avif")
  // doit desormais etre reconnu et reste injectable, jamais rejete a tort.
  it("recognizes a real AVIF file (ISOBMFF container, ftyp/avif brand) and keeps it injectable", () => {
    const avifBytes = new Uint8Array([
      0, 0, 0, 0x1c, // box size (arbitraire, non verifie par le sniffer)
      0x66, 0x74, 0x79, 0x70, // "ftyp"
      0x61, 0x76, 0x69, 0x66, // major brand "avif"
      0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, // filler
    ]);
    const photo = makeFetchedPhoto({ arrayBuffer: avifBytes.buffer, mimeType: "image/avif", fileName: "photo.avif" });

    const [result] = reconstructPhotoFiles([photo]);

    expect(result.sniffedFormat).toBe("avif");
    expect(result.file).not.toBeNull();
    expect(result.file!.type).toBe("image/avif");
  });
});
