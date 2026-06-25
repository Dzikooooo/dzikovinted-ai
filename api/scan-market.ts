import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const opportunities = [
    {
      title: "Nike Shox TL",
      brand: "Nike",
      category: "Chaussures",
      image:
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff",
      price_found: 38,
      market_price: 95,
      profit: 57,
      roi: 150,
      score: 98,
      vinted_url: "https://www.vinted.fr/items/nike-shox-tl",
      status: "live",
    },
    {
      title: "Ralph Lauren Zip",
      brand: "Ralph Lauren",
      category: "Sweat",
      image:
        "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab",
      price_found: 24,
      market_price: 55,
      profit: 31,
      roi: 129,
      score: 95,
      vinted_url: "https://www.vinted.fr/items/ralph-lauren-zip",
      status: "live",
    },
    {
      title: "Adidas Samba",
      brand: "Adidas",
      category: "Chaussures",
      image:
        "https://images.unsplash.com/photo-1549298916-b41d501d3772",
      price_found: 32,
      market_price: 75,
      profit: 43,
      roi: 134,
      score: 94,
      vinted_url: "https://www.vinted.fr/items/adidas-samba",
      status: "live",
    },
    {
      title: "Carhartt Detroit",
      brand: "Carhartt",
      category: "Veste",
      image:
        "https://images.unsplash.com/photo-1523381210434-271e8be1f52b",
      price_found: 70,
      market_price: 120,
      profit: 50,
      roi: 71,
      score: 91,
      vinted_url: "https://www.vinted.fr/items/carhartt-detroit",
      status: "live",
    },
    {
      title: "Stüssy Hoodie",
      brand: "Stüssy",
      category: "Sweat",
      image:
        "https://images.unsplash.com/photo-1512436991641-6745cdb1723f",
      price_found: 42,
      market_price: 80,
      profit: 38,
      roi: 90,
      score: 89,
      vinted_url: "https://www.vinted.fr/items/stussy-hoodie",
      status: "live",
    },
  ];

  const { data, error } = await supabase
    .from("market_opportunities")
    .upsert(opportunities, {
      onConflict: "vinted_url",
    })
    .select();

  if (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }

  return res.status(200).json({
    success: true,
    inserted: data,
  });
}
