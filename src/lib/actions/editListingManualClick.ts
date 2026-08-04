// Texte du hint affiche pendant l'attente du clic manuel sur "Valider"
// (edit_listing, audit RC, 2026-08-05) -- isole dans son propre module pour
// rester reutilisable/testable independamment de l'UI.
//
// Affiche sous la timeline de progression pendant l'etape "publishing" d'un
// edit_listing (voir PublishProgressModal.tsx) -- cette etape correspond en
// pratique a l'attente du clic utilisateur (voir vinted-edit.ts::submitEdit,
// WAITING_FOR_MANUAL_CLICK), jamais rapportee comme un step distinct.
export const MANUAL_CLICK_HINT = 'Clique sur Valider dans l\'onglet Vinted pour terminer la modification.';
