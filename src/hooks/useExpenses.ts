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

  async function loadExpenses() {
    setLoading(true);
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false });
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
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

  async function addExpense(category: string, amount: number, note: string) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { error } = await supabase.from("expenses").insert({
      user_id: data.user.id,
      category,
      amount,
      note,
    });
    if (error) {
      console.error(error);
      return;
    }
    await loadExpenses();
  }

  async function deleteExpense(id: string) {
    await supabase.from("expenses").delete().eq("id", id);
    await loadExpenses();
  }

  return { expenses, loading, addExpense, deleteExpense, reload: loadExpenses };
}