import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface Account {
  id: string;
  name: string;
}

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAccounts() {
    setLoading(true);
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .order("name", { ascending: true });
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    setAccounts((data ?? []) as Account[]);
    setLoading(false);
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  async function addAccount(name: string) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { error } = await supabase.from("accounts").insert({
      user_id: data.user.id,
      name,
    });
    if (error) {
      console.error(error);
      return;
    }
    await loadAccounts();
  }

  async function deleteAccount(id: string) {
    await supabase.from("accounts").delete().eq("id", id);
    await loadAccounts();
  }

  return { accounts, loading, addAccount, deleteAccount, reload: loadAccounts };
}
