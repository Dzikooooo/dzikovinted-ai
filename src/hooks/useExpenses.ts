import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface Expense {
  id: string;
  category: string;
  amount: number;
  note: string;
  expenseDate: string;
  vintedAccountId: string | null;
}

// Fermeture P0 #7 (audit pre-lancement 2026-07-10, encore ouvert le
// 2026-08-29) : AccountingPage.tsx filtre deja le CA/la marge par compte
// Vinted selectionne, mais les depenses n'etaient jamais filtrees --
// soustraites en integralite du benefice d'un seul compte affiche, un
// chiffre faux. `accountId` suit la meme convention que
// VintedAccountFilterContext ('all' = tous les comptes, sinon un uuid
// precis) -- l'appelant (AccountingPage.tsx) passe deja cette valeur pour
// filtrer `listings`, il suffit de la propager ici.
export function useExpenses(accountId: string) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false });
    if (accountId !== "all") {
      query = query.eq("vinted_account_id", accountId);
    }
    const { data, error: loadError } = await query;
    if (loadError) {
      console.error(loadError);
      setError("Impossible de charger les dépenses. Réessaie plus tard.");
      setLoading(false);
      return;
    }
    setError(null);
    setExpenses(
      (data ?? []).map((expense) => ({
        id: expense.id,
        category: expense.category,
        amount: Number(expense.amount),
        note: expense.note ?? "",
        expenseDate: expense.expense_date,
        vintedAccountId: expense.vinted_account_id ?? null,
      }))
    );
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // Retourne un booleen de succes (meme motif que WatchlistPage.tsx::handleSubmit,
  // 2026-07-24) : l'appelant ne doit fermer/reinitialiser son formulaire que si
  // l'ecriture a reellement reussi, jamais inconditionnellement.
  //
  // Rattache la depense au compte actuellement filtre (accountId), ou a
  // aucun compte precis si "Tous les comptes" est selectionne -- pas de
  // nouveau champ dans le formulaire : le filtre de compte deja visible en
  // haut de page communique deja ce contexte, une depense ajoutee en
  // filtrant sur un compte precis lui appartient naturellement.
  async function addExpense(category: string, amount: number, note: string): Promise<boolean> {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setError("Impossible d'enregistrer la dépense : session expirée. Reconnecte-toi.");
      return false;
    }
    const { error: insertError } = await supabase.from("expenses").insert({
      user_id: data.user.id,
      category,
      amount,
      note,
      vinted_account_id: accountId !== "all" ? accountId : null,
    });
    if (insertError) {
      console.error(insertError);
      setError("Impossible d'enregistrer la dépense. Réessaie plus tard.");
      return false;
    }
    setError(null);
    await loadExpenses();
    return true;
  }

  async function deleteExpense(id: string) {
    const { error: deleteError } = await supabase.from("expenses").delete().eq("id", id);
    if (deleteError) {
      console.error(deleteError);
      setError("Impossible de supprimer la dépense. Réessaie plus tard.");
      return;
    }
    setError(null);
    await loadExpenses();
  }

  return { expenses, loading, error, addExpense, deleteExpense, reload: loadExpenses };
}
