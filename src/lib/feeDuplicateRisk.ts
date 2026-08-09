// P1-4 (Freeze Audit correctif) : categorie de depense qui risque de doubler
// un cout deja compte via `listings.fees` (champ "Frais" saisi au moment de
// marquer une vente, voir ListingsManagementSection.tsx). Aucun identifiant
// commun ne relie une ligne `expenses` a une vente `listings` precise --
// une deduplication automatique serait un rapprochement incertain, donc le
// choix assume est d'avertir au bon moment (AccountingPage.tsx) plutot que
// de deviner. Extrait en fonction pure pour etre testable independamment du
// rendu du formulaire de depense.
const DUPLICATE_FEE_RISK_CATEGORY = 'Frais Vinted';

export function isDuplicateFeeRiskCategory(category: string): boolean {
  return category === DUPLICATE_FEE_RISK_CATEGORY;
}
