// Sniff LEGER des magic bytes d'une image -- purement diagnostique, jamais
// bloquant, aucune dependance DOM/chrome (importable depuis le background ET
// les content scripts, voir content/photoReconstruction.ts qui re-exporte
// cette fonction pour son propre usage cote injection DOM).
//
// Mission "5 photos non reconnues comme images" (2026-08-11) : le sniffer
// initial (jpeg/png/webp) rapportait 5/5 "unknown" en test live -- avant de
// supposer un contenu reellement invalide, il faut d'abord exclure les
// formats modernes que les CDN servent couramment mais que ce sniffer ne
// reconnaissait pas encore (AVIF/HEIC, tous deux bases sur le conteneur
// ISOBMFF -- meme structure que MP4 : une box "ftyp" a l'offset 4, dont les 4
// octets suivants (la "major brand") identifient le format reel).

export type SniffedImageFormat = "jpeg" | "png" | "webp" | "avif" | "heic" | "heif" | "unknown";

function readAscii(bytes: Uint8Array, offset: number, length: number): string | null {
  if (bytes.length < offset + length) return null;
  let s = "";
  for (let i = 0; i < length; i++) s += String.fromCharCode(bytes[offset + i]);
  return s;
}

// ISOBMFF (AVIF/HEIC/HEIF partagent ce meme conteneur, comme MP4) : box
// "ftyp" a l'offset 4, "major brand" (4 octets) a l'offset 8 -- identifie le
// format reel du contenu, independamment de toute extension de fichier ou
// Content-Type declare.
function sniffIsobmffBrand(bytes: Uint8Array): string | null {
  if (readAscii(bytes, 4, 4) !== "ftyp") return null;
  return readAscii(bytes, 8, 4);
}

const AVIF_BRANDS = new Set(["avif", "avis"]);
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]);
const HEIF_BRANDS = new Set(["mif1", "msf1"]);

export function sniffImageFormat(bytes: Uint8Array): SniffedImageFormat {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "webp";
  }
  const brand = sniffIsobmffBrand(bytes);
  if (brand) {
    if (AVIF_BRANDS.has(brand)) return "avif";
    if (HEIC_BRANDS.has(brand)) return "heic";
    if (HEIF_BRANDS.has(brand)) return "heif";
  }
  return "unknown";
}

// Diagnostic uniquement (jamais logue le fichier entier) -- ex. "FF D8 FF E0
// 00 10 4A 46 49 46 00 01".
export function bytesToHex(bytes: Uint8Array, length = 32): string {
  return Array.from(bytes.slice(0, length))
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
}
