// Selecteurs DOM Vinted verifies en direct (navigateur reel, compte reel
// matleshop, page https://www.vinted.fr/items/new) le 2026-07-10. Fichier
// separe de selectors.ts (dedie a la detection de profil/annonces) - un
// fichier par surface fonctionnelle, meme discipline que le reste du
// projet. Vinted peut changer son DOM sans preavis (deja arrive pour
// scripts/vinted-scan.ts et le scraping initial de wardrobeApi.ts) :
// regrouper les selecteurs ici limite la casse a un seul endroit a corriger.
//
// La navigation directe vers /items/new redirige vers l'accueil (garde
// cote Vinted) : il faut passer par un clic sur le lien "Vends tes
// articles" du header (href="/items/new") pour obtenir un vrai chargement
// du formulaire.

export const SELL_ARTICLES_LINK_SELECTOR = '[data-testid="prohibited-listing-education-upload-button"]';

// Compte reellement connecte dans cet onglet : l'attribut alt de l'avatar
// du menu utilisateur porte le pseudo Vinted (verifie en direct : alt=
// "alexisdzk"). Utilise pour detecter un mauvais compte AVANT de remplir
// quoi que ce soit - la page /items/new n'etant pas scopee par compte
// (contrairement a /member/<id>), la protection structurelle utilisee pour
// la synchro (EXTENSION.md §5.3) ne s'applique pas ici, un controle actif
// est necessaire.
export const LOGGED_IN_USERNAME_SELECTOR = '[data-testid="user-menu-button"] img[alt]';

// --- Photos ---
export const MEDIA_UPLOAD_SELECTOR = '[data-testid="media-upload"]';
export const ADD_PHOTOS_INPUT_SELECTOR = '[data-testid="add-photos-input"]'; // input[type=file]
export const DROPZONE_SELECTOR = '[data-testid="dropzone"]';
export const MEDIA_UPLOAD_GRID_SELECTOR = '[data-testid="media-upload-grid"]';

// --- Presentation ---
export const TITLE_INPUT_SELECTOR = '[data-testid="title--input"]';
export const DESCRIPTION_INPUT_SELECTOR = '[data-testid="description--input"]';

// --- Categorie : arbre multi-niveaux (PAS un simple <select>), 2 a 4
// profondeurs selon la branche (verifie : Femmes(catalog-1904) ->
// Chaussures(catalog-16) -> Baskets(catalog-2632), 3 niveaux). Le bouton
// declencheur reste "catalog-select-dropdown-input" a chaque niveau ;
// chaque option de la liste courante est un <li> contenant un element
// id="catalog-{id numerique Vinted}". Un champ de recherche texte existe
// dans le panneau (id="catalog-search-input") mais n'a pas ete exerce en
// direct - la navigation par clic sur les <li> a ete verifiee et fonctionne.
export const CATEGORY_DROPDOWN_TRIGGER_SELECTOR = '[data-testid="catalog-select-dropdown-input"]';
export const CATEGORY_DROPDOWN_CONTENT_SELECTOR = '[data-testid="catalog-select-dropdown-content"]';
export const CATEGORY_SEARCH_INPUT_SELECTOR = "#catalog-search-input";
export const CATEGORY_ITEM_ID_PREFIX = "catalog-"; // + id numerique Vinted

// --- Champs conditionnels : n'existent dans le DOM qu'apres selection
// d'une categorie FEUILLE (verifie : absents avant, presents des que
// "Baskets" a ete choisi). Leur apparition est le signal fiable qu'une
// feuille a ete atteinte - preferer waitForElement() sur brand/size/
// condition plutot que de compter les clics de navigation.
export const BRAND_DROPDOWN_TRIGGER_SELECTOR = '[data-testid="brand-select-dropdown-input"]';
// Verifie en direct le 2026-07-25 (inspection manuelle du DOM reel, mode
// diagnostic dedie) : PAS le meme conteneur que CATEGORY_DROPDOWN_CONTENT_SELECTOR
// -- cause racine confirmee d'un echec reel (selectMatchingOption utilisait par
// defaut le selecteur de la categorie pour tous les pickers, y compris marque).
export const BRAND_DROPDOWN_CONTENT_SELECTOR = '[data-testid="brand-select-dropdown-content"]';
// Mission "BRAND SEARCH INPUT LOCATOR" (2026-08-16) : preuve live directe --
// BRAND_DROPDOWN_TRIGGER_SELECTOR est readonly (voir son DOM reel :
// <input readonly id="brand" ...>), uniquement l'affichage de la valeur
// choisie. Diagnostic dedie confirme qu'aucune frappe (keydown/beforeinput/
// input/keyup) n'atteint jamais ce trigger meme pendant une frappe humaine
// reelle, alors que Vinted emet bien /api/v2/item_upload/brands?keyword=...
// et filtre visiblement les resultats -- la frappe atterrit forcement
// ailleurs. Meme architecture que CATEGORY_SEARCH_INPUT_SELECTOR ci-dessus
// (un champ de recherche DEDIE, distinct du trigger, monte dans le panneau
// une fois ouvert) mais ICI CONFIRMEE EN DIRECT (contrairement a celle de la
// categorie, jamais exercee) : #brand-search-input recoit reellement la
// frappe et declenche le filtrage. Fallback sur le data-testid si l'id
// venait a changer.
export const BRAND_SEARCH_INPUT_SELECTOR = "#brand-search-input";
export const BRAND_SEARCH_INPUT_FALLBACK_SELECTOR = '[data-testid="brand-search--input"]';
// Resultat filtre : PAS le <li> parent (verifie en direct, li.click() ne
// selectionne rien) mais la Cell interactive qu'il contient
// (role="button", portant aria-label="<nom exact de la marque>",
// id="brand-{id numerique Vinted}" -- id NON stable, ne jamais s'appuyer
// dessus). target.click() sur cette Cell est confirme en direct.
export const BRAND_RESULT_CELL_SELECTOR = '[role="button"][aria-label]';
export const SIZE_GRID_TRIGGER_SELECTOR = '[data-testid="category-size-single-grid-input"]';
// Liste verifiee en direct (les 2 premieres options + debut de la 3e,
// visible au scroll) : "Neuf avec etiquette", "Neuf sans etiquette",
// "Tres bon etat". Vinted utilise une echelle a 5 niveaux connue
// ("Bon etat", "Satisfaisant" complètent probablement la liste) - a
// confirmer par lecture live des options au moment de l'implementation
// plutot que de coder ces deux derniers libelles en dur sans verification.
export const CONDITION_LIST_TRIGGER_SELECTOR = '[data-testid="category-condition-single-list-input"]';
export const COLOR_DROPDOWN_TRIGGER_SELECTOR = '[data-testid="color-select-dropdown-input"]'; // optionnel, max 2
export const MATERIAL_LIST_TRIGGER_SELECTOR = '[data-testid="category-material-multi-list-input"]'; // optionnel ("recommande")
// Mission "MATIERE : MULTI-SELECT" (2026-08-16) : preuve live directe fournie
// par l'utilisateur (diagnostic dedie sur /items/new) -- <input readonly
// id="material">, meme architecture que le trigger Marque. Conteneur REEL une
// fois ouvert : "category-material-multi-list-content", DIFFERENT du
// conteneur Categorie (CATEGORY_DROPDOWN_CONTENT_SELECTOR ci-dessus) que
// l'ancien code reutilisait a tort pour ce champ -- jamais valide
// independamment jusqu'a cette preuve, cause probable des echecs observes.
export const MATERIAL_LIST_CONTENT_SELECTOR = '[data-testid="category-material-multi-list-content"]';

// --- Prix ---
export const PRICE_INPUT_SELECTOR = '[data-testid="price-input--input"]';

// --- Taille du colis : obligatoire, sans equivalent dans le modele
// ResellOS (Listing) - 3 cellules cliquables, chacune avec un radio
// package_type_selector_N associe. Automatisee depuis la mission "ROUND
// PACKAGE SIZE" (2026-08-18) : preuve live -- HTMLInputElement.click()
// (methode NATIVE) appelee DIRECTEMENT sur le radio (jamais sur la cellule
// englobante) active reellement le champ, voir packageSizeSelection.ts.
export const PACKAGE_SIZE_CELL_SELECTOR = (n: 1 | 2 | 3) => `[data-testid="${n}-package-size--cell"]`;
export const PACKAGE_SIZE_RADIO_SELECTOR = (n: 1 | 2 | 3) => `#package_type_selector_${n}`;

// --- Soumission ---
// upload-form-save-draft-button = "Sauvegarder le brouillon" (NE PAS
// utiliser, on publie une annonce reelle, pas un brouillon Vinted).
export const SAVE_BUTTON_SELECTOR = '[data-testid="upload-form-save-button"]'; // texte "Ajouter"

// --- Detection d'erreurs generiques (a affiner en test live : le
// selecteur exact d'un bandeau d'erreur Vinted apres soumission n'a pas
// ete observe, car aucune soumission n'a ete tentee durant l'analyse DOM.
// waitForCondition() doit etre utilise avec un predicat combinant
// "redirection vers /items/{id}" OU "apparition d'un message d'erreur",
// ce dernier a confirmer lors du premier test live.) ---
