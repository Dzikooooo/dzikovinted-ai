// Textes et detection lies a l'attente du clic manuel sur "Valider" pendant
// edit_listing (audit RC, 2026-08-05) -- isole dans son propre module,
// testable independamment de l'UI (demande explicite : robustesse du
// filtrage plutot qu'un match de phrase enfoui dans un composant).
//
// Aucun code d'erreur structure n'existe de bout en bout pour distinguer ce
// timeout precis des autres : RunActionOutcome.errorMessage est une simple
// string (voir extension/src/lib/messages.ts -- fichier P-04, non
// modifiable dans ce chantier). MANUAL_CLICK_TIMEOUT_MARKER doit donc rester
// synchronise avec la description exacte passee a waitForCondition() dans
// extension/src/content/vinted-edit.ts::submitEdit() ("... apres le clic
// utilisateur sur Valider ..."). Si ce texte change un jour cote extension,
// ce filtrage cesse silencieusement de s'appliquer (le message technique
// brut redevient visible) -- ne casse rien, perd juste la simplification.
export const MANUAL_CLICK_TIMEOUT_MARKER = 'clic utilisateur sur Valider';

export function isManualClickTimeout(errorMessage: string | null | undefined): boolean {
  return !!errorMessage && errorMessage.includes(MANUAL_CLICK_TIMEOUT_MARKER);
}

// Message client (remplace le detail technique de describeTimeout() pour ce
// cas precis uniquement, voir ListingsManagementSection.tsx::runVintedAction) --
// le detail brut original reste visible dans devLog juste avant ce
// remplacement, jamais perdu, seulement retire de l'affichage utilisateur.
export const MANUAL_CLICK_TIMEOUT_MESSAGE =
  "La validation n'a pas été détectée. Ouvre l'onglet Vinted, clique sur Valider, puis réessaie.";

// Affiche sous la timeline de progression pendant l'etape "publishing" d'un
// edit_listing (voir PublishProgressModal.tsx) -- cette etape correspond en
// pratique a l'attente du clic utilisateur (voir vinted-edit.ts::submitEdit,
// WAITING_FOR_MANUAL_CLICK), jamais rapportee comme un step distinct.
export const MANUAL_CLICK_HINT = 'Clique sur Valider dans l\'onglet Vinted pour terminer la modification.';
