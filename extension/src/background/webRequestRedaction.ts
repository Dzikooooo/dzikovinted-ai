// Extrait de deleteRequestInstrumentation.ts (mission "AUTOMATISER
// ENTIEREMENT LA SUPPRESSION DE A", 2026-08-17) lors de l'ajout d'un second
// point de capture passive chrome.webRequest (publishMutationInstrumentation.ts,
// mission "ELARGISSEMENT AUTOMATISATION PUBLICATION", meme jour) -- logique
// de redaction/decodage strictement identique entre les deux, factorisee ici
// plutot que dupliquee une seconde fois.

const SENSITIVE_HEADER_NAMES = new Set(["cookie", "authorization"]);

// Cookie/Authorization (session reelle de l'utilisateur) jamais journalises
// en clair -- seule leur presence/longueur l'est. Tout le reste (dont un
// eventuel header anti-bot ou jeton CSRF) est journalise integralement.
export function redactHeaders(headers: chrome.webRequest.HttpHeader[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const header of headers ?? []) {
    if (!header.name) continue;
    const value = header.value ?? (header.binaryValue ? `<binaire, ${header.binaryValue.byteLength} octets>` : "");
    out[header.name] = SENSITIVE_HEADER_NAMES.has(header.name.toLowerCase())
      ? `<redige, ${value.length} caracteres>`
      : value;
  }
  return out;
}

export function decodeRequestBody(body: chrome.webRequest.OnBeforeRequestDetails["requestBody"]): unknown {
  if (!body) return undefined;
  if (body.formData) return body.formData;
  if (body.raw) {
    try {
      const decoder = new TextDecoder("utf-8");
      return body.raw
        .filter((chunk): chunk is chrome.webRequest.UploadData & { bytes: ArrayBuffer } => chunk.bytes !== undefined)
        .map((chunk) => decoder.decode(chunk.bytes))
        .join("");
    } catch {
      return "<corps binaire illisible>";
    }
  }
  return undefined;
}
