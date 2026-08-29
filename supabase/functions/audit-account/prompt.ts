import type { AccountStats } from "./stats.ts";

// Extrait de index.ts pour rester testable sans monter tout le monolithe
// Deno.serve (meme convention que analyze-clothing/backgroundStyles.ts).
// Fonction PURE -- aucun effet de bord, aucun appel reseau.
//
// Le prompt ne transmet QUE les statistiques deja calculees deterministement
// par stats.ts (computeAccountStats) -- jamais les annonces brutes une par
// une (couterait cher en tokens des que le compte grossit, et n'apporte rien
// que les stats ne resument deja). Interdiction explicite d'inventer un
// chiffre absent de cette liste (Human feel #7 du playbook design : jamais
// un chiffre invente avec assurance).
export function buildAccountAuditPrompt(stats: AccountStats): string {
  return `
Tu es un expert Vinted specialise dans l'optimisation de catalogues de revente.

Voici les statistiques REELLES et deja calculees du compte a auditer (ne recalcule rien, n'invente AUCUN autre chiffre que ceux ci-dessous) :
- Nombre total d'annonces : ${stats.totalListings}
- En stock (en ligne) : ${stats.activeCount}
- Brouillons : ${stats.draftCount}
- En attente (en construction) : ${stats.pendingCount}
- Vendues : ${stats.soldCount}
- Annonces sans aucune photo : ${stats.noPhotoCount}
- Annonces avec une seule photo : ${stats.singlePhotoCount}
- Photos par annonce (moyenne) : ${stats.avgPhotoCount}
- Description absente ou trop courte : ${stats.missingDescriptionCount}
- Annonces en stock depuis plus de 21 jours sans changement : ${stats.agingActiveCount}
- Annonces qui gagneraient à être republiées : ${stats.needsRepublishCount}
- Catégorie la plus représentée : ${stats.topCategory ?? "aucune"}
- Marque la plus représentée : ${stats.topBrand ?? "aucune"}
- Score global déjà calculé (ne le recalcule pas, réutilise-le tel quel) : ${stats.score}/100

Rédige un audit court, concret et percutant de ce compte Vinted, uniquement basé sur les chiffres ci-dessus. Ne mentionne jamais la photo de profil ni la bio Vinted (non analysées dans cet audit).

Retourne uniquement un JSON valide avec exactement ces champs :
{
  "summary": string,
  "recommendations": [{"category": string, "severity": "haute" | "moyenne" | "basse", "message": string}]
}

"summary" est un paragraphe court (3-4 phrases) qui donne le ton general de l'audit, en citant au moins un chiffre reel ci-dessus.
"recommendations" contient entre 3 et 6 recommandations concretes et actionnables, triees par severite decroissante, chacune basee sur un des chiffres fournis (jamais une recommandation generique sans lien avec les donnees).

Tous les textes en francais correct.
`.trim();
}
