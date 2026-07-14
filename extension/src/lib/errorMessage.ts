// BUG REEL trouve le 2026-07-14 : "Echec de l'import : [object Object]"
// affiche a l'utilisateur. Cause racine : les trois copies dupliquees de
// errorMessage() (background/index.ts, handlers/editListing.ts,
// handlers/publishListing.ts) faisaient `err instanceof Error ? err.message
// : String(err)`. Or les erreurs Supabase (PostgrestError, AuthError) sont
// des OBJETS SIMPLES ({ message, code, details, hint, status... }), PAS des
// instances d'Error -- sync.ts::recordSingleItemImport les `throw` telles
// quelles (throw accountError/selectError/updateError/insertError). Pour un
// objet simple, `String(obj)` produit litteralement "[object Object]",
// jamais le vrai message.
//
// Point de verite unique desormais : extrait ici (troisieme copie
// identique apparue, meme convention que formFill.ts) pour que les trois
// call sites ne puissent plus diverger.
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;

  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof e.message === "string" && e.message) parts.push(e.message);
    if (typeof e.code === "string" && e.code) parts.push(`code: ${e.code}`);
    if (typeof e.status === "number" || typeof e.status === "string") parts.push(`status: ${e.status}`);
    if (parts.length > 0) return parts.join(" — ");
    // Dernier recours honnete : jamais "[object Object]" silencieux meme
    // pour une forme totalement inattendue.
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }

  return String(err);
}
