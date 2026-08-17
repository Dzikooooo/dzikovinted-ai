// Logique pure (aucun DOM, aucun chrome.*) extraite de vinted-publish.ts
// pour rester testable en isolation, meme discipline que domWait.ts/
// matchOption.ts -- vinted-publish.ts porte des effets de bord au niveau du
// module (chrome.runtime.onMessage.addListener), qui empechent de l'importer
// tel quel dans un test unitaire sans mock global de `chrome`.

import type { PublishListingPayload } from "../lib/messages";

// Mission "REPUBLICATION FIDELE" (2026-08-11), item G ("liste DYNAMIQUE...
// DONNÉE MANQUANTE" vs "À CONFIRMER") : chaque champ manuel porte desormais
// sa VALEUR reellement connue de ResellOS quand elle existe (permet a
// l'utilisateur de savoir QUOI selectionner sur Vinted, ex. "Catégorie :
// Hommes Polos", plutot qu'un simple nom de champ sans contexte -- voir
// PublishProgressModal.tsx qui affiche ces chaines telles quelles sous "À
// confirmer sur Vinted"). Distingue explicitement "donnée manquante" (aucune
// valeur connue -- ResellOS ne peut rien suggerer) de la valeur connue (a
// simplement reporter sur Vinted, ecriture bloquee par isTrusted). Champs
// TOUJOURS listes (jamais silencieusement omis, meme sans valeur connue) :
// Vinted exige un choix humain sur chacun d'eux quoi qu'il arrive (voir
// checks.ts::publishListingDefinition -- aucun check ne bloque plus dessus
// depuis le 2026-08-11).
//
// Mission "AUDIT DIVERGENCE READY_TO_SUBMIT" (2026-08-16) : preuve live --
// un test reel montrait Matière vide en pending avec un libelle identique a
// un champ reellement obligatoire (ex. Marque), alors que Matière/Couleur
// sont deja documentes ailleurs dans ce paquet comme optionnels sur Vinted
// (voir publishSelectors.ts : Couleur "optionnel, max 2", Matiere
// "optionnel (recommande)"). watchForPublishReadiness() ne bloque deja QUE
// sur l'etat reel du bouton Vinted (jamais sur `pending`, voir son en-tete) --
// ce correctif ne change donc rien a la publication reelle, seulement le
// LIBELLE affiche, pour que l'utilisateur sache immediatement qu'aucune
// action n'est requise sur ces deux champs precis quand ResellOS n'a pas de
// valeur, au lieu de les lire comme un blocage au meme titre que Catégorie/
// État/Marque/Taille (reellement obligatoires sur Vinted).
const OPTIONAL_ON_VINTED_LABELS = new Set(["Couleur", "Matière"]);

function fieldLine(label: string, value: string | null): string {
  if (value) return `${label} : ${value} (à sélectionner sur Vinted)`;
  if (OPTIONAL_ON_VINTED_LABELS.has(label)) {
    return `${label} : facultatif sur Vinted, non renseigné par ResellOS (aucune action requise)`;
  }
  return `${label} : donnée manquante (à choisir sur Vinted)`;
}

// Mission "MATIERE : MULTI-SELECT" (2026-08-16) : `payload.materials` (tableau
// derive, voir src/lib/materials.ts::parseMaterials) est desormais la source
// de verite quand elle contient au moins une valeur -- affichage joint par
// ", " pour rester un simple `string` compatible avec fieldLine() ci-dessus,
// jamais une refonte du type de retour (PublishProgressModal.tsx affiche
// `pending`/`confirmed` comme de simples listes de chaines). Repli sur
// `payload.material` seul si `materials` est absent/vide -- retro-
// compatibilite avec tout appelant qui ne peuplerait pas encore ce champ.
function materialDisplayValue(payload: PublishListingPayload): string | null {
  if (payload.materials && payload.materials.length > 0) return payload.materials.join(", ");
  return payload.material;
}

const PACKAGE_SIZE_LABELS: Record<PublishListingPayload["packageSize"], string> = {
  small: "Petit",
  medium: "Moyen",
  large: "Grand",
};

export function computeManualFields(payload: PublishListingPayload): string[] {
  return [
    fieldLine("Catégorie", payload.category || null),
    fieldLine("État", payload.condition || null),
    fieldLine("Marque", payload.brand),
    fieldLine("Taille", payload.size),
    fieldLine("Couleur", payload.color),
    fieldLine("Matière", materialDisplayValue(payload)),
    // Mission "AUDIT DIVERGENCE READY_TO_SUBMIT" (2026-08-16) : preuve live --
    // Vinted affichait "Petit" (son propre choix par defaut) alors que le
    // payload demandait "Moyen" -- ce champ n'a JAMAIS ete automatise (aucun
    // code de ce fichier n'ecrit jamais sur PACKAGE_SIZE_CELL_SELECTOR,
    // verifie par grep). L'ancien libelle ("Moyen : à sélectionner") pouvait
    // laisser croire que "Moyen" etait deja applique ou en cours de
    // traitement -- desormais explicite : ResellOS ne touche jamais ce
    // champ, la valeur visible sur Vinted a l'instant T est TOUJOURS le
    // choix de Vinted (par defaut ou deja modifie par l'utilisateur), jamais
    // une confirmation de la valeur demandee.
    `Taille du colis : ${PACKAGE_SIZE_LABELS[payload.packageSize]} demandé -- ResellOS ne sélectionne jamais ce champ, Vinted affiche son propre choix (vérifie/corrige-le toi-même avant de publier)`,
  ];
}

// Mission "FINIR LES CHAMPS MANQUANTS" (2026-08-11) : mutation pure (aucun
// DOM) reutilisee par vinted-publish.ts pour mettre a jour `pending` une fois
// la reprise post-categorie tentee sur un champ -- retire le placeholder
// statique pose par computeManualFields() ci-dessus ("Label : ..." quelle que
// soit sa forme exacte, prefixe identifie par le SEUL prefixe stable
// `${label} :` commun aux deux variantes de fieldLine()) puis pousse le
// resultat REEL (ou rien si `replacement` est null, ex. champ confirme -- il
// n'a plus besoin de figurer dans `pending` du tout). Matche sur le prefixe
// exact "Label :" (espace inclus) pour ne jamais confondre "Taille" (le
// champ) et "Taille du colis" (un champ distinct, jamais concerne ici).
export function replaceManualPlaceholder(pending: string[], label: string, replacement: string | null): void {
  const index = pending.findIndex((entry) => entry.startsWith(`${label} :`));
  if (index >= 0) pending.splice(index, 1);
  if (replacement) pending.push(replacement);
}
