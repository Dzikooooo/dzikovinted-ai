import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
const searches = [
  "nike shox",
  "ralph lauren zip",
  "adidas samba",
];

const opportunities = searches.map((search, index) => ({
  title: search
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" "),
  brand: search.split(" ")[0],
  category: "Vinted",
  image: "https://images.unsplash.com/photo-1549298916-b41d501d3772",
  price_found: 30 + index * 8,
  market_price: 75 + index * 15,
  profit: 45 + index * 7,
  roi: 120 + index * 10,
  score: 90 + index,
  vinted_url: `https://www.vinted.fr/catalog?search_text=${encodeURIComponent(search)}`,
  status: "live",
}));

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
