// Selection PRODUCTION de la "Taille du colis" sur Vinted (/items/new).
// Meme discipline que domWait.ts/matchOption.ts/publishFieldSummary.ts :
// logique testable en isolation, re-interroge `document` a chaque appel,
// jamais de reference DOM conservee.
//
// Preuve live (2026-08-18, mission "ROUND PACKAGE SIZE") : deux methodes
// synthetiques testees avant celle-ci ne modifiaient JAMAIS l'etat reel du
// radio (dispatchFullClick() sur la CELLULE englobante -- CustomEvent
// composes, isTrusted:false ; puis un clic humain reel confirme isTrusted:true
// necessaire pour la cellule). Le dernier test diagnostique a prouve que
// HTMLInputElement.click() (methode NATIVE du navigateur) appelee
// DIRECTEMENT sur le radio #package_type_selector_N (jamais sur la cellule)
// active reellement le champ : evenements click(isTrusted:false)/
// input(isTrusted:true)/change(isTrusted:true) observes, et le radio devient
// visuellement/reellement selectionne apres l'appel -- confirme par
// after[index].checked === true en test live, contrairement aux deux
// methodes precedentes.

import { PACKAGE_SIZE_CELL_SELECTOR, PACKAGE_SIZE_RADIO_SELECTOR } from "./publishSelectors";

// Mapping EXPLICITE, jamais devine -- une valeur en dehors des 3 connues
// (donnee absente/invalide, ex. message malforme d'une version anterieure de
// l'extension) retourne `null` : AUCUNE selection n'est jamais tentee sur une
// valeur inconnue, jamais de repli arbitraire sur "small"/index 1 (voir
// clickPackageSizeRadio ci-dessous).
export function packageSizeRadioIndex(value: unknown): 1 | 2 | 3 | null {
  if (value === "small") return 1;
  if (value === "medium") return 2;
  if (value === "large") return 3;
  return null;
}

export interface PackageSizeSelectionOutcome {
  requestedIndex: 1 | 2 | 3 | null;
  radioFound: boolean;
  // null si aucun clic n'a ete tente (index invalide ou radio introuvable) --
  // jamais confondu avec `false` (clic tente, radio reste non coche).
  checkedAfterClick: boolean | null;
}

// Ne fait JAMAIS l'hypothese que .click() a reussi simplement parce qu'il n'a
// pas leve d'exception (voir le commentaire de tete) -- relit systematiquement
// `radio.checked` juste apres l'appel, seule preuve retenue d'une activation
// reelle. N'attend jamais l'apparition du radio (voir waitForElement, cote
// appelant vinted-publish.ts, pour la partie asynchrone) -- lecture/ecriture
// DOM synchrone sur l'etat courant uniquement.
export function clickPackageSizeRadio(value: unknown): PackageSizeSelectionOutcome {
  const requestedIndex = packageSizeRadioIndex(value);
  if (requestedIndex === null) {
    return { requestedIndex: null, radioFound: false, checkedAfterClick: null };
  }
  const radio = document.querySelector<HTMLInputElement>(PACKAGE_SIZE_RADIO_SELECTOR(requestedIndex));
  if (!radio) {
    return { requestedIndex, radioFound: false, checkedAfterClick: null };
  }
  radio.click(); // methode NATIVE -- jamais dispatchEvent(new MouseEvent(...))
  return { requestedIndex, radioFound: true, checkedAfterClick: radio.checked };
}

// Mission "ROUND PRIX + COLIS -- DIAGNOSTIC" (2026-08-19) : purement
// OBSERVATIONNEL -- aucun clic, aucune decision de selection ici. Contexte :
// preuve live -- ResellOS a demande "Moyen" (heuristique app-side, jamais
// une recommandation Vinted reelle, voir PublishConfirmationModal.tsx) alors
// que Vinted recommande visiblement "Petit" pour ce polo. Avant de changer
// QUOI QUE CE SOIT a la logique de choix, cette fonction capture l'etat REEL
// des 3 cellules colis (libelle, id, data-testid, checked, aria-checked,
// value, presence d'un badge/texte "Recommandé", index DOM) pour repondre
// objectivement : Vinted pre-selectionne-t-il reellement une taille, se
// contente-t-il d'un badge "Recommandé" sans pre-selection, ou les deux ?
export interface PackageSizeCellSnapshot {
  index: 1 | 2 | 3;
  cellFound: boolean;
  label: string | null;
  radioId: string | null;
  dataTestId: string | null;
  checked: boolean | null;
  ariaChecked: string | null;
  value: string | null;
  recommended: boolean;
  domIndex: number;
}

// Recherche par TEXTE, jamais un selecteur invente -- aucune preuve live
// n'existe encore sur la structure exacte d'un eventuel badge "Recommandé"
// (meme discipline que deleteFlowSelectors.ts : chercher le texte reellement
// rapporte, pas une structure supposee).
const PACKAGE_SIZE_RECOMMENDED_TEXT_PATTERN = /recommand/i;

export function readPackageSizeCellSnapshots(): PackageSizeCellSnapshot[] {
  const indices: Array<1 | 2 | 3> = [1, 2, 3];
  return indices.map((index, domIndex) => {
    const cell = document.querySelector<HTMLElement>(PACKAGE_SIZE_CELL_SELECTOR(index));
    const radio = document.querySelector<HTMLInputElement>(PACKAGE_SIZE_RADIO_SELECTOR(index));
    // Source de texte la plus large disponible pour ce candidat -- la
    // cellule englobante si trouvee (contient tres probablement le libelle
    // ET un eventuel badge "Recommandé"), repli sur le parent du radio si la
    // cellule elle-meme est introuvable mais le radio existe.
    const textSource = cell ?? radio?.parentElement ?? null;
    return {
      index,
      cellFound: !!cell,
      label: textSource?.textContent?.trim() || null,
      radioId: radio?.id || null,
      dataTestId: cell?.getAttribute("data-testid") ?? null,
      checked: radio ? radio.checked : null,
      ariaChecked: radio?.getAttribute("aria-checked") ?? cell?.getAttribute("aria-checked") ?? null,
      value: radio?.value || null,
      recommended: PACKAGE_SIZE_RECOMMENDED_TEXT_PATTERN.test(textSource?.textContent ?? ""),
      domIndex,
    };
  });
}

// Source UNIQUE de verite pour "Vinted a-t-il deja reellement selectionne
// une taille lui-meme" -- `.checked` (propriete DOM native), jamais
// `aria-checked` seul (potentiellement pas synchronise) ni le badge
// "Recommandé" (purement visuel, ne prouve aucun etat reel selectionne).
// Retourne le PREMIER index reellement coche, ou null si aucun.
export function findAlreadyCheckedPackageSize(snapshots: PackageSizeCellSnapshot[]): 1 | 2 | 3 | null {
  const found = snapshots.find((s) => s.checked === true);
  return found ? found.index : null;
}
