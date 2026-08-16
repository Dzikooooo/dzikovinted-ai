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
function fieldLine(label: string, value: string | null): string {
  return value ? `${label} : ${value} (à sélectionner sur Vinted)` : `${label} : donnée manquante (à choisir sur Vinted)`;
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
    fieldLine("Matière", payload.material),
    `Taille du colis : ${PACKAGE_SIZE_LABELS[payload.packageSize]} (à sélectionner sur Vinted)`,
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
