// Selecteurs texte pour le flow de suppression d'une annonce Vinted --
// confirme en direct par l'utilisateur (mission "DIAGNOSTIC LIVE
// SUPPRESSION ANCIENNE ANNONCE VINTED", 2026-08-17) : page /items/{id} ->
// bouton "Supprimer" -> modale "Supprimer l'article" -> bouton "Confirmer
// et supprimer". Aucun data-testid/selecteur CSS n'a ete releve en direct
// (uniquement les libelles visibles) -- recherche par texte exact plutot
// qu'un selecteur invente, meme discipline que isBrandLocked() (vinted-edit.ts).
//
// BUG REEL confirme en test live (mission "AUDITER LE FAUX modal_confirmed",
// 2026-08-17) : isDeleteConfirmationModalVisible() se basait UNIQUEMENT sur
// document.body.textContent.includes(...) -- aucune verification de
// visibilite. Preuve live : DELETE_PROGRESS{step:"modal_confirmed"} loggue
// SANS delai perceptible apres trigger_clicked, ET SANS que la modale
// n'apparaisse jamais visuellement a l'ecran -- Vinted conserve
// vraisemblablement le texte "Supprimer l'article" dans le DOM (cache) avant
// meme l'ouverture reelle de la modale. waitForCondition() (domWait.ts)
// teste son predicat de facon SYNCHRONE des le premier appel -- si le texte
// est deja present (meme cache) au moment du clic sur "Supprimer", la
// condition resout instantanement, sans jamais attendre le moindre rendu
// reel. Corrige en exigeant un element REELLEMENT VISIBLE (isVisible(),
// meme heuristique offsetParent/getClientRects que partout ailleurs dans ce
// projet, voir attributeDropdownDiagnostics.ts) portant EXACTEMENT ce texte
// -- jamais plus la simple presence dans l'agregat body.textContent.
import { isVisible } from "./attributeDropdownDiagnostics";

export const DELETE_TRIGGER_TEXT = "Supprimer";
export const DELETE_MODAL_HEADING_TEXT = "Supprimer l'article";
export const DELETE_CONFIRM_TEXT = "Confirmer et supprimer";

export function findButtonByExactText(root: ParentNode, text: string): HTMLButtonElement | null {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
  return buttons.find((b) => (b.textContent ?? "").trim() === text) ?? null;
}

export function findDeleteTriggerButton(root: ParentNode = document): HTMLButtonElement | null {
  return findButtonByExactText(root, DELETE_TRIGGER_TEXT);
}

// Meme cause racine que isDeleteConfirmationModalVisible ci-dessous : un
// bouton "Confirmer et supprimer" cache/premonte quelque part dans le DOM
// (avant l'ouverture reelle de la modale) matcherait findButtonByExactText
// sur le seul texte, sans jamais avoir ete reellement interactif. Filtre
// isVisible() en plus du texte exact -- ne reutilise PAS findButtonByExactText
// tel quel (qui ne retourne que le PREMIER match texte, potentiellement le
// candidat cache si un second candidat visible existe plus loin dans le
// DOM) : parcourt tous les boutons candidats et ne retient que ceux
// reellement visibles. findDeleteTriggerButton reste volontairement
// inchange -- son comportement est deja confirme correct en direct, la
// portee de ce correctif est strictement le flow de confirmation.
export function findDeleteConfirmButton(root: ParentNode = document): HTMLButtonElement | null {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
  return buttons.find((b) => (b.textContent ?? "").trim() === DELETE_CONFIRM_TEXT && isVisible(b)) ?? null;
}

// Ne recherche plus le texte dans l'agregat body.textContent (voir
// commentaire d'en-tete) : ne retient qu'un element FEUILLE (aucun enfant --
// evite qu'un ancetre ne matche uniquement via le textContent agrege de ses
// descendants, ex. <div>Supprimer <span>l'article</span></div> ne doit
// matcher NI le div [texte agrege mais a des enfants] NI le span [texte
// propre incomplet]) dont le texte propre, normalise (trim + apostrophe
// courbe -> droite, meme discipline que precedemment), egale EXACTEMENT le
// libelle attendu -- ET reellement visible (isVisible()). Aucune structure
// de modale (role="dialog"/aria-modal) supposee : rien de tel n'a ete
// confirme en direct (voir commentaire d'origine ci-dessus).
export function isDeleteConfirmationModalVisible(doc: Document = document): boolean {
  const normalize = (s: string) => s.replace(/[‘’]/g, "'").trim();
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>("*")).filter(
    (el) => el.children.length === 0 && normalize(el.textContent ?? "") === DELETE_MODAL_HEADING_TEXT
  );
  return candidates.some(isVisible);
}
