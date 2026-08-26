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

// Mission "ONGLET MASQUE -- GEOMETRIE NULLE" (2026-08-25) -- CAUSE RACINE
// PROUVEE par la sonde DELETE_TRIGGER_STATE d'un run en echec :
//   rect { top:0, left:0, width:0, height:0 }   inViewport:false
//   ancetres TOUS display:block/grid, visibility:visible, opacity:1
//
// Aucun ancetre n'etait masque : l'element etait bel et bien "affichable".
// L'onglet de suppression est ouvert avec chrome.tabs.create({active:false})
// (deleteOldListing.ts) -- un onglet d'arriere-plan n'est jamais rendu, donc
// aucun element n'y possede de boite de layout : offsetParent est null ET
// getClientRects() est vide pour TOUT le document. isVisible() y renvoie
// donc structurellement false, quel que soit l'element.
//
// La bascule est volontairement pilotee par la SEULE visibilite du document,
// jamais par une heuristique de geometrie : dans un document reellement
// rendu, le controle strict reste rigoureusement INCHANGE. C'est essentiel --
// c'est lui qui empeche le faux "modal_confirmed" prouve en aout (heading
// pre-monte mais jamais affiche). On ne relache la contrainte que la ou elle
// n'a plus aucun pouvoir discriminant : un document non rendu.
export function isLayoutUnavailable(doc: Document = document): boolean {
  return doc.hidden || doc.visibilityState !== "visible";
}

// Repli utilise UNIQUEMENT quand le layout est indisponible : la visibilite
// est alors deduite des styles calcules (qui, eux, restent corrects dans un
// onglet d'arriere-plan) en remontant toute la chaine des ancetres.
export function isStyleVisible(el: Element): boolean {
  let node: Element | null = el;
  while (node instanceof HTMLElement) {
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    if (style.opacity === "0") return false;
    if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true") return false;
    node = node.parentElement;
  }
  return true;
}

// Point d'entree unique du flow de suppression : geometrie reelle quand elle
// existe, styles calcules sinon.
export function isInteractable(el: Element, doc: Document = document): boolean {
  if (isVisible(el)) return true;
  if (!isLayoutUnavailable(doc)) return false;
  return isStyleVisible(el);
}

export const DELETE_TRIGGER_TEXT = "Supprimer";
export const DELETE_MODAL_HEADING_TEXT = "Supprimer l'article";
export const DELETE_CONFIRM_TEXT = "Confirmer et supprimer";

export function findButtonByExactText(root: ParentNode, text: string): HTMLButtonElement | null {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
  return buttons.find((b) => (b.textContent ?? "").trim() === text) ?? null;
}

// Mission "DIAGNOSTIC SUPPRESSION" (2026-08-25) -- PREUVE LIVE : le snapshot
// DELETE_DOM_SNAPSHOT du run en echec a remonte le bouton declencheur avec
// data-testid="item-delete-button" ET visible:false. C'est le premier
// data-testid reellement observe sur ce flow (l'en-tete de ce fichier notait
// qu'aucun n'avait ete releve en direct) : il devient donc le selecteur
// prioritaire, le texte "Supprimer" restant un repli -- ce libelle est bien
// trop generique pour etre fiable seul sur une page Vinted.
//
// La priorite reste ordonnee par VISIBILITE d'abord, testid ensuite : un
// bouton invisible n'est pas cliquable utilement, et findButtonByExactText()
// ne retourne que le PREMIER match texte, potentiellement un candidat cache
// alors qu'un candidat visible existe plus loin dans le DOM (meme piege que
// celui deja corrige pour findDeleteConfirmButton ci-dessous). Le repli
// final sur un candidat invisible est conserve pour ne PAS transformer ce
// cas en "trigger_not_found" : mieux vaut tenter le clic et laisser le
// diagnostic post-clic trancher que perdre l'information.
export const DELETE_TRIGGER_TESTID = "item-delete-button";

export function findDeleteTriggerButton(root: ParentNode = document): HTMLButtonElement | null {
  const byTestId = Array.from(
    root.querySelectorAll<HTMLButtonElement>(`button[data-testid="${DELETE_TRIGGER_TESTID}"]`)
  );
  const byText = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).filter(
    (b) => (b.textContent ?? "").trim() === DELETE_TRIGGER_TEXT
  );
  return (
    byTestId.find((b) => isInteractable(b)) ?? byText.find((b) => isInteractable(b)) ?? byTestId[0] ?? byText[0] ?? null
  );
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
  return buttons.find((b) => (b.textContent ?? "").trim() === DELETE_CONFIRM_TEXT && isInteractable(b)) ?? null;
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
// Mission "DIAGNOSTIC SUPPRESSION" (2026-08-25) : le test live a echoue en
// "modal_not_found" avec modalVisible:false. La detection par texte-feuille
// ci-dessous reste la voie principale (elle est la seule live-confirmee),
// mais elle rate une modale dont le titre serait rendu autrement (icone
// inline, texte scinde sur plusieurs noeuds, libelle modifie). Second canal
// ajoute : un conteneur de dialogue REELLEMENT VISIBLE portant l'un des deux
// libelles attendus. Volontairement PAS "n'importe quel role=dialog" -- ce
// serait exactement le faux positif deja corrige plus haut : la visibilite
// du conteneur ET la presence d'un libelle specifique au flow suppression
// sont toutes deux exigees.
export function isDeleteConfirmationModalVisible(doc: Document = document): boolean {
  const normalize = (s: string) => s.replace(/[‘’]/g, "'").trim();
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>("*")).filter(
    (el) => el.children.length === 0 && normalize(el.textContent ?? "") === DELETE_MODAL_HEADING_TEXT
  );
  if (candidates.some((el) => isInteractable(el, doc))) return true;

  const dialogs = Array.from(
    doc.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"], dialog')
  );
  return dialogs.some((el) => {
    if (!isInteractable(el, doc)) return false;
    const text = normalize(el.textContent ?? "");
    return text.includes(DELETE_MODAL_HEADING_TEXT) || text.includes(DELETE_CONFIRM_TEXT);
  });
}
