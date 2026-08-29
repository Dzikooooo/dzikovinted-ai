// Extrait de index.ts pour rester testable sans monter tout le monolithe
// Deno.serve (meme convention que analyze-clothing/../_shared/credits.ts::
// isMetered) -- fonction pure, aucun effet de bord, aucun appel reseau.

export interface AuditPromptInput {
  title: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  condition: string | null;
  photoCount: number;
}

// Pricer Pro -- audit d'une annonce DEJA PUBLIEE (2026-08-29), distinct du
// Generateur IA (analyze-clothing, photo -> nouvelle annonce). Volontairement
// TEXTE SEUL, aucune photo envoyee a Gemini ici :
// 1. Cout/latence : reanalyser des photos deja publiees a chaque audit
//    doublerait le cout Gemini d'une simple relecture de texte.
//    2. Fiabilite : image_urls d'une annonce synchronisee depuis Vinted
//    pointe vers le CDN de Vinted (pas notre propre stockage) -- rien ne
//    garantit que ces URLs restent fetchables cote client sans probleme de
//    CORS pour les convertir en base64 comme le fait analyzeWithAI().
// "photo_note" ci-dessous reste donc explicitement base sur le seul NOMBRE
// de photos, jamais sur un contenu visuel non analyse -- jamais un
// jugement de qualite invente (playbook, Human feel #7 : jamais un chiffre
// invente avec assurance).
export function buildAuditPrompt(input: AuditPromptInput): string {
  return `
Tu es un expert Vinted specialise dans l'optimisation d'annonces (SEO et prix).

Voici une annonce DEJA PUBLIEE a auditer :
- Titre actuel : "${input.title}"
- Description actuelle : "${input.description || "(aucune)"}"
- Categorie : "${input.category || "(non renseignee)"}"
- Marque : "${input.brand || "(non renseignee)"}"
- Etat : "${input.condition || "(non renseigne)"}"
- Nombre de photos : ${input.photoCount}

Analyse ce contenu et propose des ameliorations concretes pour maximiser la visibilite et les ventes sur Vinted. Ne jamais inventer un fait absent (marque, matiere, etat) qui ne serait pas deja donne ci-dessus -- si une information manque, dis-le, ne la devine pas.

Retourne uniquement un JSON valide avec exactement ces champs :
{
  "suggested_title": string,
  "suggested_description": string,
  "keywords": string[],
  "category_note": string,
  "photo_note": string
}

"photo_note" doit se baser UNIQUEMENT sur le nombre de photos (${input.photoCount}), jamais sur leur contenu visuel (non analyse dans cet audit).

Tous les textes en francais correct.
`.trim();
}
