// Mission "PREUVE LIVE PRECISE -- TRANSPORT BINAIRE PHOTOS" (2026-08-11) :
// CAUSE CONFIRMEE -- chrome.tabs.sendMessage()/chrome.runtime.onMessage
// serialisent leur message via JSON (documente par Chrome : "This message
// should be a JSON-ifiable object"), PAS via l'algorithme de clone structure
// complet (contrairement a postMessage()/MessageChannel). Un ArrayBuffer n'a
// aucune propriete enumerable propre -- JSON.stringify(new ArrayBuffer(N))
// produit "{}" , et JSON.parse("{}") redonne un objet litteral SANS
// byteLength ni octets. Preuve directe par les logs live (PHOTO_VALIDITY_
// REPORT) : byteLength:undefined (pas null -- {} n'a pas cette propriete),
// magicBytesHex:"" (Uint8Array({}) -> longueur 0, {}.length est undefined
// -> ToLength(undefined) = 0), sniffedFormat:"unknown" -- exactement la
// signature d'un ArrayBuffer degrade en objet vide par ce round-trip JSON,
// reproductible en isolation (voir binaryTransport.test.ts).
//
// Correction : ArrayBuffer -> base64 (JSON-safe) AVANT chrome.tabs.
// sendMessage (handlePublishListing.ts::sendPublishCommand), et base64 ->
// ArrayBuffer immediatement APRES reception (vinted-publish.ts, avant tout
// appel a reconstructPhotoFiles/injectPhotosWithConfirmation) -- fetchPhoto()
// et reconstructPhotoFiles() restent tous deux INCHANGES, ils continuent de
// manipuler un vrai ArrayBuffer comme avant, seule la frontiere de transport
// est corrigee.
//
// btoa/atob (pas Buffer, indisponible en service worker/content script) --
// disponibles nativement dans les deux contextes (ServiceWorkerGlobalScope
// ET window). Chunk de 32Ko sur l'encodage : String.fromCharCode(...bytes)
// sur un tableau de ~100+ Ko peut depasser la limite d'arguments d'un appel
// de fonction selon le moteur JS.
const ENCODE_CHUNK_SIZE = 0x8000;

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += ENCODE_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + ENCODE_CHUNK_SIZE));
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Descripteur diagnostic PARTAGE (background ET content script) -- utilise
// par PHOTO_BINARY_BEFORE_SEND (avant encodage, cote background) et
// PHOTO_BINARY_AFTER_RECEIVE (apres decodage, cote content script) pour
// prouver empiriquement -- pas supposer -- l'etat reel de la valeur binaire
// de part et d'autre de chrome.tabs.sendMessage.
export interface BinaryDescriptor {
  constructorName: string;
  isArrayBuffer: boolean;
  isUint8Array: boolean;
  byteLength: number | null;
  length: number | null;
  keys: string[];
  first16BytesHex: string | null;
}

export function describeBinaryValue(value: unknown): BinaryDescriptor {
  const isArrayBuffer = value instanceof ArrayBuffer;
  const isUint8Array = value instanceof Uint8Array;
  let first16BytesHex: string | null = null;
  if (isArrayBuffer || isUint8Array) {
    const bytes = isUint8Array ? (value as Uint8Array) : new Uint8Array(value as ArrayBuffer);
    first16BytesHex = Array.from(bytes.slice(0, 16))
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join(" ");
  }
  return {
    constructorName: value === null ? "null" : value === undefined ? "undefined" : (value as object).constructor?.name ?? typeof value,
    isArrayBuffer,
    isUint8Array,
    byteLength: isArrayBuffer ? (value as ArrayBuffer).byteLength : isUint8Array ? (value as Uint8Array).byteLength : null,
    length: value && typeof value === "object" && "length" in value ? (value as { length: unknown }).length as number : null,
    keys: value && typeof value === "object" ? Object.keys(value) : [],
    first16BytesHex,
  };
}
