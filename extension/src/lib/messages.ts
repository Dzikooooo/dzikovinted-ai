// Contrat de messages partage entre l'app web, le background et le popup.
// Voir EXTENSION.md §4. Toute nouvelle valeur de "type" doit etre ajoutee ici,
// jamais en dur dans un fichier de traitement.

// App web -> background, via chrome.runtime.sendMessage(EXTENSION_ID, ...)
// (externally_connectable, limite a l'origine de l'app - voir manifest.config.ts)
export type ExternalMessage =
  | { type: "PING" }
  | { type: "PAIR"; access_token: string; refresh_token: string };

export type ExternalResponse = { ok: true } | { ok: false; error: string };

// Popup <-> background, via chrome.runtime.sendMessage (sans id, meme extension)
export type InternalMessage = { type: "GET_STATUS" } | { type: "UNPAIR" };

export interface StatusResponse {
  paired: boolean;
  vintedConnected: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export type InternalResponse = StatusResponse | ExternalResponse;

export function isExternalMessage(msg: unknown): msg is ExternalMessage {
  if (typeof msg !== "object" || msg === null || !("type" in msg)) return false;
  const type = (msg as { type: unknown }).type;
  return type === "PING" || type === "PAIR";
}

export function isInternalMessage(msg: unknown): msg is InternalMessage {
  if (typeof msg !== "object" || msg === null || !("type" in msg)) return false;
  const type = (msg as { type: unknown }).type;
  return type === "GET_STATUS" || type === "UNPAIR";
}
