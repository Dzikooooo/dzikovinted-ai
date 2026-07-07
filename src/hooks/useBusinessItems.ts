import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Item } from "../types/business";

export function useBusinessItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadItems() {
    setLoading(true);

    const { data, error } = await supabase
      .from("business_items")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("BUSINESS ITEMS LOAD ERROR:", error);
      setLoading(false);
      return;
    }

    setItems(
      (data ?? []).map((item) => ({
        id: item.id,
        sku: item.sku,
        account: item.account,
        article: item.article,
        brand: item.brand ?? "",
        category: item.category ?? "",
        size: item.size ?? "",
        condition: item.condition ?? "",
        location: item.location ?? "",
        purchasePrice: Number(item.purchase_price ?? 0),
        expectedPrice: Number(item.expected_price ?? 0),
        soldPrice: item.sold_price ? Number(item.sold_price) : undefined,
        fees: Number(item.fees ?? 0),
        shipping: Number(item.shipping ?? 0),
        purchaseDate: item.purchase_date ?? "",
        soldDate: item.sold_date ?? undefined,
        status: item.status,
        notes: item.notes ?? "",
      }))
    );

    setLoading(false);
  }

  useEffect(() => {
    loadItems();
  }, []);

  async function addItem(item: Omit<Item, "id">) {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) return;

    const { error } = await supabase
      .from("business_items")
      .insert({
        user_id: userData.user.id,
        sku: item.sku,
        account: item.account,
        article: item.article,
        brand: item.brand,
        category: item.category,
        size: item.size,
        condition: item.condition,
        location: item.location,
        purchase_price: item.purchasePrice,
        expected_price: item.expectedPrice,
        sold_price: item.soldPrice ?? null,
        fees: item.fees ?? 0,
        shipping: item.shipping ?? 0,
        purchase_date: item.purchaseDate,
        sold_date: item.soldDate ?? null,
        status: item.status,
        notes: item.notes ?? "",
      });

    if (error) {
      console.error("BUSINESS ITEM INSERT ERROR:", error);
      return;
    }

    await loadItems();
  }

  async function deleteItem(sku: string) {
    const { error } = await supabase
      .from("business_items")
      .delete()
      .eq("sku", sku);

    if (error) {
      console.error("BUSINESS ITEM DELETE ERROR:", error);
      return;
    }

    await loadItems();
  }

  async function sellItem(
    sku: string,
    soldPrice: number,
    fees: number
  ) {
    const { error } = await supabase
      .from("business_items")
      .update({
        status: "Vendu",
        sold_price: soldPrice,
        fees,
        sold_date: new Date().toISOString().slice(0, 10),
      })
      .eq("sku", sku);

    if (error) {
      console.error("BUSINESS ITEM SELL ERROR:", error);
      return;
    }

    await loadItems();
  }

  async function updateItem(updated: Item) {
    const { error } = await supabase
      .from("business_items")
      .update({
        account: updated.account,
        article: updated.article,
        brand: updated.brand,
        category: updated.category,
        size: updated.size,
        condition: updated.condition,
        location: updated.location,
        purchase_price: updated.purchasePrice,
        expected_price: updated.expectedPrice,
        status: updated.status,
        notes: updated.notes,
      })
      .eq("sku", updated.sku);

    if (error) {
      console.error("BUSINESS ITEM UPDATE ERROR:", error);
      return;
    }

    await loadItems();
  }
  return {
    items,
    loading,
    addItem,
    updateItem,
    deleteItem,
    sellItem,
    reload: loadItems,
  };
}