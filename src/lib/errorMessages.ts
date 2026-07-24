// Traduction des erreurs techniques en messages comprehensibles (regle
// validee le 2026-07-24, "Cycle B" de la phase pre-beta) : jamais masquer
// ni inventer la cause reelle, toujours proposer une action concrete quand
// c'est possible. Pour une cause reconnue, la traduction FR *est* la cause
// (meme convention que AuthContext.tsx::signIn deja en place) ; pour une
// cause non reconnue, le detail technique d'origine est conserve entre
// parentheses plutot que remplace par un message invente.
function withCause(message: string, cause: string): string {
  return `${message} (${cause})`;
}

// --- Extension Chrome (appairage, RUN_ACTION) ---
export function translateExtensionError(raw: string): string {
  if (/receiving end does not exist|could not establish connection/i.test(raw)) {
    return "L'extension ResellOS ne répond pas. Vérifie qu'elle est bien installée et activée dans Chrome, puis réessaie.";
  }
  return withCause(
    "Une erreur inattendue est survenue avec l'extension ResellOS. Réessaie, et contacte le support si le problème persiste.",
    raw
  );
}

// --- Supabase Auth (inscription, connexion, mot de passe) ---
const AUTH_ERROR_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /user already registered/i,
    message: "Cette adresse email est déjà associée à un compte. Essaie de te connecter, ou utilise \"Mot de passe oublié\" si besoin.",
  },
  {
    pattern: /password should be at least/i,
    message: 'Le mot de passe doit contenir au moins 6 caractères.',
  },
  {
    pattern: /rate limit/i,
    message: 'Trop de tentatives en peu de temps. Réessaie dans quelques minutes.',
  },
  {
    pattern: /new password should be different/i,
    message: "Le nouveau mot de passe doit être différent de l'ancien.",
  },
  {
    pattern: /invalid login credentials/i,
    message: 'Email ou mot de passe incorrect.',
  },
  {
    pattern: /email not confirmed/i,
    message: 'Confirme ton adresse email avant de te connecter (vérifie ta boîte de réception).',
  },
];

export function translateAuthError(raw: string): string {
  const hit = AUTH_ERROR_PATTERNS.find(({ pattern }) => pattern.test(raw));
  if (hit) return hit.message;
  return withCause('Une erreur est survenue. Réessaie dans un instant.', raw);
}

// --- Générateur IA (analyse Gemini) ---
export function translateGeneratorError(raw: string): string {
  // Ces messages viennent deja de la fonction Edge analyze-clothing sous
  // forme claire et actionnable en francais -- les faire passer tels quels
  // plutot que de les envelopper dans le message generique ci-dessous, qui
  // les rendait moins comprehensibles (regression identifiee lors de
  // l'audit du parcours Generateur, 2026-07-24).
  if (
    raw === 'Tu as atteint ta limite de credits. Passe au plan Pro pour continuer.' ||
    raw === 'Profil introuvable' ||
    raw === 'GEMINI_API_KEY manquante. Impossible de générer une annonce réelle.'
  ) {
    return raw;
  }
  if (/gemini api error \(5\d\d\)/i.test(raw) || /service unavailable/i.test(raw)) {
    return "Le service d'analyse IA est temporairement indisponible. Réessaie dans quelques instants.";
  }
  if (/gemini api error \(429\)/i.test(raw) || /rate limit/i.test(raw)) {
    return 'Trop de demandes en peu de temps sur le service IA. Réessaie dans quelques minutes.';
  }
  if (/empty response from gemini/i.test(raw)) {
    return "L'analyse n'a renvoyé aucun résultat. Réessaie, si possible avec des photos plus nettes.";
  }
  if (/failed to fetch|network/i.test(raw)) {
    return 'Impossible de contacter le service d\'analyse. Vérifie ta connexion et réessaie.';
  }
  return withCause("L'analyse a échoué. Réessaie dans un instant.", raw);
}
