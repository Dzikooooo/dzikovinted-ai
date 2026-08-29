// Mini-mapping local pour traduire un status.lastError technique en message
// client generique -- meme esprit que src/lib/errorMessages.ts (app web),
// jamais duplique integralement ici : le popup ne connait qu'un sous-ensemble
// tres restreint d'erreurs (celles remontees par pairing.ts/session.ts dans
// vinted_accounts.last_error). status.lastError brut n'atteint JAMAIS
// l'ecran principal -- fallback toujours present, le detail technique
// complet reste uniquement consultable dans le panneau Diagnostic (journal).

const KNOWN_PATTERNS: { pattern: RegExp; message: string }[] = [
  // EN PREMIER, volontairement : /session/ juste en dessous matcherait aussi
  // et dirait "reessaie dans un instant" -- or ici aucune nouvelle tentative
  // ne peut aboutir, le refresh token est mort. Le seul geste utile est de se
  // reconnecter depuis l'application.
  {
    pattern: /session_revoked/i,
    message: "Ta session a expiré. Reconnecte-toi sur resellosapp.com puis relance l'appairage.",
  },
  { pattern: /network|fetch/i, message: "Connexion réseau instable. Nouvelle tentative automatique." },
  // withTimeout (retry.ts) -- bug live 2026-08-29 (popup bloque
  // indefiniment sur "Verification du statut"). AVANT /refresh|expired|
  // session/i (juste en dessous) : un delai depasse ne dit RIEN sur l'etat
  // du token, contrairement a un vrai refus de rafraichissement.
  { pattern: /délai dépassé|delai depasse|timeout/i, message: "Le serveur met du temps à répondre. Réessaie dans un instant." },
  { pattern: /refresh|expired|session/i, message: "Ta session a besoin d'être rafraîchie. Réessaie dans un instant." },
  { pattern: /rate limit|too many/i, message: "Trop de tentatives récentes. Réessaie dans quelques minutes." },
];

const FALLBACK_MESSAGE = "Un problème est survenu pendant la synchronisation. Le détail est disponible dans Diagnostic.";

export function toClientErrorMessage(rawError: string | null): string {
  if (!rawError) return FALLBACK_MESSAGE;
  const known = KNOWN_PATTERNS.find(({ pattern }) => pattern.test(rawError));
  return known ? known.message : FALLBACK_MESSAGE;
}
