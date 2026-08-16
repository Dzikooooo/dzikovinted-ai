// Diagnostics PURS (lecture DOM uniquement, aucun clic, aucun effet de
// bord) pour la mission "IDENTIFIER ET CORRIGER LES DERNIERS BLOQUAGES DES
// ATTRIBUTS" (2026-08-12). Meme discipline que categoryDetection.ts/
// matchOption.ts : extrait de vinted-publish.ts pour rester testable sans
// mock chrome.
//
// Preuve live confirmee (mission precedente) : Etat/Taille/Couleur
// atteignent "trigger_click_attempted" (readOptionTexts a bien trouve le
// trigger ET tente dispatchFullClick dessus) mais n'atteignent JAMAIS
// "dropdown_content_found" -- meme avec le timeout de 20000ms confirme
// fonctionnel. "trigger_click_attempted" prouve seulement qu'un clic a ete
// TENTE, jamais qu'un dropdown s'est reellement ouvert. Ces fonctions
// capturent l'etat REEL du DOM a plusieurs instants autour du clic, pour
// distinguer sans supposer :
// - le clic synthetique n'ouvre rien du tout (isTrusted, meme famille de
//   blocage que la categorie) ;
// - le clic ouvre bien quelque chose mais le contentSelector attendu ne
//   correspond pas a ce qui apparait reellement ;
// - le contenu est rendu ailleurs (portal/dialog) que la ou edit_listing le
//   trouve.

export interface DropdownDomSnapshot {
  ariaExpanded: string | null;
  triggerOuterHtml: string | null;
  activeElementTag: string | null;
  activeElementTestId: string | null;
  visibleListboxCount: number;
  visibleOptionCount: number;
  matchingTestIds: string[];
  dialogOrPopoverCount: number;
}

const OUTER_HTML_MAX_LENGTH = 500;
const DROPDOWN_DIAGNOSTIC_TESTID_KEYWORDS = ["dropdown", "content", "condition", "size", "color", "select", "list", "option"];

function truncate(html: string | null | undefined): string | null {
  if (!html) return null;
  return html.length > OUTER_HTML_MAX_LENGTH ? `${html.slice(0, OUTER_HTML_MAX_LENGTH)}…` : html;
}

// offsetParent est null pour un element display:none OU position:fixed --
// getClientRects() couvre ce second cas, evitant un faux "invisible" pour un
// dropdown legitimement positionne en fixed (frequent pour ce type de
// composant).
// Exportee (etait privee) : reutilisee telle quelle par conditionOptionReader.ts
// pour filtrer les conteneurs condition-{id} caches -- meme heuristique
// partout, aucune duplication.
export function isVisible(el: Element): boolean {
  const htmlEl = el as HTMLElement;
  return htmlEl.offsetParent !== null || htmlEl.getClientRects().length > 0;
}

// Mission "DIAGNOSTIC FINAL CLIC HUMAIN + DROPDOWNS ATTRIBUTS" (2026-08-12) :
// preuve live -- ATTRIBUTE_HUMAN_CLICK_DIAGNOSTIC n'a produit AUCUN log
// malgre un clic humain reel reussi (Taille/Etat/Couleur selectionnes
// visuellement). Audit de code de l'ancienne implementation
// (attachHumanClickComparisonListener, listener attache UNE FOIS sur une
// reference DOM conservee, phase bulle par defaut) : deux causes plausibles
// -- reference devenue stale si Vinted/React remonte le trigger entre
// l'attache et le clic humain (le nouveau noeud ne porte jamais l'ancien
// listener), et/ou stopPropagation() cote Vinted en phase bulle avant que
// l'evenement n'atteigne notre listener attache sur un ancetre. Cette
// fonction PURE encode la logique de correspondance re-interrogeant le DOM
// A CHAQUE appel (jamais une reference conservee) -- utilisee par un
// listener document-level en phase CAPTURE cote vinted-publish.ts, insensible
// a un remplacement du noeud trigger tant que le SELECTEUR continue de
// matcher.
export interface HumanClickMatch {
  triggerFoundAtClickTime: boolean;
  triggerContainsEventTarget: boolean;
}

export function matchesHumanClick(triggerSelector: string, eventTarget: Node | null): HumanClickMatch {
  const trigger = document.querySelector<HTMLElement>(triggerSelector);
  return {
    triggerFoundAtClickTime: !!trigger,
    triggerContainsEventTarget: !!(trigger && eventTarget && trigger.contains(eventTarget)),
  };
}

export function snapshotDropdownDom(triggerSelector: string): DropdownDomSnapshot {
  const trigger = document.querySelector<HTMLElement>(triggerSelector);
  const active = document.activeElement as HTMLElement | null;

  const listboxes = Array.from(document.querySelectorAll('[role="listbox"]')).filter(isVisible);
  const options = Array.from(document.querySelectorAll('[role="option"]')).filter(isVisible);
  const dialogsOrPopovers = Array.from(document.querySelectorAll('[role="dialog"], [role="presentation"], [popover]'));

  const matchingTestIds = Array.from(document.querySelectorAll<HTMLElement>("[data-testid]"))
    .map((el) => el.getAttribute("data-testid") ?? "")
    .filter((id) => DROPDOWN_DIAGNOSTIC_TESTID_KEYWORDS.some((kw) => id.toLowerCase().includes(kw)));

  return {
    ariaExpanded: trigger?.getAttribute("aria-expanded") ?? null,
    triggerOuterHtml: truncate(trigger?.outerHTML),
    activeElementTag: active?.tagName ?? null,
    activeElementTestId: active?.getAttribute?.("data-testid") ?? null,
    visibleListboxCount: listboxes.length,
    visibleOptionCount: options.length,
    matchingTestIds: [...new Set(matchingTestIds)],
    dialogOrPopoverCount: dialogsOrPopovers.length,
  };
}

// Compare deux instantanes de testids (avant/apres) -- revele precisement
// quels elements sont NOUVEAUX depuis le clic, sans devoir tout re-logger.
export function diffTestIds(before: string[], after: string[]): string[] {
  const beforeSet = new Set(before);
  return after.filter((id) => !beforeSet.has(id));
}

// Mission "IDENTIFIER FACTUELLEMENT LA STRUCTURE DOM REELLE" (2026-08-12) :
// preuve live -- le clic humain sur Etat fait passer matchingTestIds de 51 a
// 87 (36 nouveaux elements), dropdown visiblement ouvert dans l'UI Vinted,
// alors que visibleListboxCount/visibleOptionCount restent a 0 tout du long.
// CONFIRME PAR CETTE PREUVE (pas une hypothese) : le heuristique generique
// role="listbox"/role="option" ne correspond PAS a la structure reelle de ce
// composant Vinted -- il faut regarder les data-testid AJOUTES, pas les
// roles ARIA. Cette fonction identifie precisement CES elements (pas
// seulement leur nombre) pour la comparaison synthetique vs humain demandee.
export interface MatchingTestIdElementDiagnostic {
  dataTestId: string;
  tagName: string;
  role: string | null;
  textContent: string | null;
  ariaLabel: string | null;
  ariaExpanded: string | null;
  ariaSelected: string | null;
  ariaHidden: string | null;
  className: string | null;
  isVisible: boolean;
  outerHTML: string | null;
  parentTagName: string | null;
  parentDataTestId: string | null;
  parentClassName: string | null;
}

const TEXT_CONTENT_MAX_LENGTH = 120;

function describeMatchingTestIdElement(el: Element): MatchingTestIdElementDiagnostic {
  const htmlEl = el as HTMLElement;
  const parent = el.parentElement;
  const text = el.textContent?.trim() ?? null;
  return {
    dataTestId: el.getAttribute("data-testid") ?? "",
    tagName: el.tagName,
    role: el.getAttribute("role"),
    textContent: text ? (text.length > TEXT_CONTENT_MAX_LENGTH ? `${text.slice(0, TEXT_CONTENT_MAX_LENGTH)}…` : text) : null,
    ariaLabel: el.getAttribute("aria-label"),
    ariaExpanded: el.getAttribute("aria-expanded"),
    ariaSelected: el.getAttribute("aria-selected"),
    ariaHidden: el.getAttribute("aria-hidden"),
    className: readClassName(el),
    isVisible: isVisible(el),
    outerHTML: truncate(htmlEl.outerHTML),
    parentTagName: parent?.tagName ?? null,
    parentDataTestId: parent?.getAttribute("data-testid") ?? null,
    parentClassName: parent ? readClassName(parent) : null,
  };
}

export interface DropdownDomDiff {
  addedTestIds: string[];
  removedTestIds: string[];
  addedElements: MatchingTestIdElementDiagnostic[];
}

// Re-interroge le DOM MAINTENANT (jamais une reference conservee) et compare
// au baseline fourni (typiquement le matchingTestIds de la phase
// "before_click"/premier snapshot humain) -- pour CHAQUE testid nouvellement
// apparu, capture le detail complet de son element reel. Reutilise le meme
// filtre de mots-cles que snapshotDropdownDom() pour rester coherent avec
// les compteurs deja logues.
export function diffDropdownDomElements(baselineTestIds: string[]): DropdownDomDiff {
  const matchingElements = Array.from(document.querySelectorAll<HTMLElement>("[data-testid]")).filter((el) => {
    const id = el.getAttribute("data-testid") ?? "";
    return DROPDOWN_DIAGNOSTIC_TESTID_KEYWORDS.some((kw) => id.toLowerCase().includes(kw));
  });
  const currentTestIds = [...new Set(matchingElements.map((el) => el.getAttribute("data-testid") ?? ""))];

  const addedTestIds = diffTestIds(baselineTestIds, currentTestIds);
  const removedTestIds = diffTestIds(currentTestIds, baselineTestIds);

  const addedTestIdSet = new Set(addedTestIds);
  const seen = new Set<string>();
  const addedElements: MatchingTestIdElementDiagnostic[] = [];
  for (const el of matchingElements) {
    const id = el.getAttribute("data-testid") ?? "";
    if (addedTestIdSet.has(id) && !seen.has(id)) {
      seen.add(id);
      addedElements.push(describeMatchingTestIdElement(el));
    }
  }

  return { addedTestIds, removedTestIds, addedElements };
}

// Diagnostic Marque (item F, mission "IDENTIFIER ET CORRIGER LES DERNIERS
// BLOQUAGES DES ATTRIBUTS") : preuve live -- describeMatchAttempt() rapporte
// exactMatches.length === 2 pour "Polo Ralph Lauren" (reason:
// "multiple_exact_matches_ambiguous"). Deux options normalisees identiques
// existent donc dans le DOM lu par readOptionTexts(). Ces details permettent
// de distinguer, SANS deviner : deux options Vinted reellement distinctes,
// une duplication DOM (mobile/desktop -- deja rencontre et documente pour
// les photos dans itemSelectors.ts), une option visible + une cachee, ou une
// duplication introduite par notre propre extraction (readOptionTexts()
// lit tous les <li> sans filtrage de visibilite, contrairement a
// extractPhotoUrls() qui deduplique explicitement par URL).
export interface ExactMatchCandidateDiagnostic {
  index: number;
  rawText: string;
  normalizedText: string;
  tagName: string;
  outerHTML: string | null;
  id: string | null;
  role: string | null;
  dataTestId: string | null;
  ariaSelected: string | null;
  ariaHidden: string | null;
  hidden: boolean;
  isVisible: boolean;
  boundingClientRect: { x: number; y: number; width: number; height: number } | null;
  parentOuterHTML: string | null;
}

export function describeExactMatchCandidate(
  el: Element,
  index: number,
  rawText: string,
  normalizedText: string
): ExactMatchCandidateDiagnostic {
  const htmlEl = el as HTMLElement;
  const rect = typeof htmlEl.getBoundingClientRect === "function" ? htmlEl.getBoundingClientRect() : null;
  return {
    index,
    rawText,
    normalizedText,
    tagName: el.tagName,
    outerHTML: truncate(htmlEl.outerHTML),
    id: el.id || null,
    role: el.getAttribute("role"),
    dataTestId: el.getAttribute("data-testid"),
    ariaSelected: el.getAttribute("aria-selected"),
    ariaHidden: el.getAttribute("aria-hidden"),
    hidden: htmlEl.hidden === true,
    isVisible: isVisible(el),
    boundingClientRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
    parentOuterHTML: truncate((el.parentElement as HTMLElement | null)?.outerHTML),
  };
}

// Mission "DIAGNOSTIC FINAL CLIC HUMAIN + DROPDOWNS ATTRIBUTS" (2026-08-12),
// item 6 : preuve live -- les 2 exactMatches "Polo Ralph Lauren" sont deux
// <li> REELLEMENT DISTINCTS (isVisible:true, hidden:false tous les deux,
// boundingClientRect verticaux differents) -- PAS une copie cachee evidente.
// Objectif de ces details structurels : determiner si ResellOS agrege deux
// LISTES differentes (ex. deux <ul> distincts, conteneurs desktop/mobile,
// groupes/sections separes) alors qu'une seule est active/logique -- sans
// jamais deduire ni deduppliquer ici, seulement observer.
export interface ExactMatchAncestorInfo {
  tagName: string;
  id: string | null;
  className: string | null;
  dataTestId: string | null;
  role: string | null;
  ariaLabel: string | null;
}

export interface ExactMatchStructuralDiagnostic {
  parentIndexAmongSiblings: number | null;
  closestUlOuterHTML: string | null;
  closestUlTestId: string | null;
  closestUlId: string | null;
  closestUlClassName: string | null;
  closestUlRole: string | null;
  closestUlAriaLabel: string | null;
  ancestors: ExactMatchAncestorInfo[];
  nearbySectionText: string | null;
}

function readClassName(el: Element): string | null {
  return typeof el.className === "string" && el.className ? el.className : null;
}

export function describeExactMatchStructure(el: Element): ExactMatchStructuralDiagnostic {
  const parent = el.parentElement;
  const parentIndexAmongSiblings = parent ? Array.from(parent.children).indexOf(el) : null;

  const closestUl = el.closest("ul");

  // Mission "LIVE RETEST RESULTS -- FIX SIZE/COLOR CONFIRMATION + COLOR
  // DROPDOWN CLOSURE" (2026-08-13), item 5 : preuve live -- les deux <li>
  // "Polo Ralph Lauren" appartiennent a deux <ul> REELLEMENT distincts
  // (uniqueClosestUlCount:2, allCandidatesShareSameClosestUl:false,
  // ATTRIBUTE_MATCH_DUPLICATE_IDENTITY_DIAGNOSTIC). closestUlClassName
  // partageait deja un PREFIXE commun (insuffisant comme preuve d'identite,
  // Vinted reutilise vraisemblablement cette classe utilitaire ailleurs) --
  // role/aria-label n'etaient PAS encore captures ni sur le <ul> lui-meme ni
  // sur ses 3 premiers ancetres, alors que c'est le signal le plus probable
  // pour distinguer une section "suggerees/recentes" d'une section "toutes
  // les marques" (Vinted etiquette generalement ce type de regroupement via
  // aria-label plutot qu'un h1-h6 visible, que nearbySectionText ne peut pas
  // capturer). Ajout MINIMAL et cible -- aucun nouvel element scanne, memes
  // 3 niveaux d'ancetres deja parcourus, aucun dump DOM supplementaire.
  const ancestors: ExactMatchAncestorInfo[] = [];
  let current: Element | null = el.parentElement;
  for (let depth = 0; depth < 3 && current; depth += 1) {
    ancestors.push({
      tagName: current.tagName,
      id: current.id || null,
      className: readClassName(current),
      dataTestId: current.getAttribute("data-testid"),
      role: current.getAttribute("role"),
      ariaLabel: current.getAttribute("aria-label"),
    });
    current = current.parentElement;
  }

  // Heuristique purement observationnelle (aucune decision dessus) : premier
  // titre/en-tete trouve dans les 5 ancetres proches -- pourrait reveler que
  // les deux candidats appartiennent a deux sections/groupes distincts (ex.
  // "Marques populaires" vs "Toutes les marques").
  let nearbySectionText: string | null = null;
  let sectionNode: Element | null = el.parentElement;
  for (let depth = 0; depth < 5 && sectionNode && !nearbySectionText; depth += 1) {
    const heading = sectionNode.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
    const headingText = heading?.textContent?.trim();
    if (headingText) nearbySectionText = headingText;
    sectionNode = sectionNode.parentElement;
  }

  return {
    parentIndexAmongSiblings,
    closestUlOuterHTML: truncate(closestUl?.outerHTML),
    closestUlTestId: closestUl?.getAttribute("data-testid") ?? null,
    closestUlId: closestUl?.id || null,
    closestUlClassName: closestUl ? readClassName(closestUl) : null,
    closestUlRole: closestUl?.getAttribute("role") ?? null,
    closestUlAriaLabel: closestUl?.getAttribute("aria-label") ?? null,
    ancestors,
    nearbySectionText,
  };
}
