import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface Expense {
  id: string;
  category: string;
  amount: number;
  note: string;
  expenseDate: string;
}

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadExpenses() {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false });
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
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    loadExpenses();
  }, []);

  // Retourne un booleen de succes (meme motif que WatchlistPage.tsx::handleSubmit,
  // 2026-07-24) : l'appelant ne doit fermer/reinitialiser son formulaire que si
  // l'ecriture a reellement reussi, jamais inconditionnellement.
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