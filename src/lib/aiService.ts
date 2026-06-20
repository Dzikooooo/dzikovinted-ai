import type { GeneratedListing } from './types';
import { analyzeClothing as mockAnalyze } from './mockAI';
import { supabase } from './supabase';

async function blobUrlToBase64(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function analyzeWithAI(
  imageUrls: string[],
  openaiKey?: string
): Promise<GeneratedListing> {
  const base64Images = await Promise.all(
    imageUrls.map((url) => blobUrlToBase64(url))
  );

  console.log('Uploaded images:', base64Images.length, 'images converted to base64');

  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
     const response = await fetch(`${supabaseUrl}/functions/v1/hyper-handler`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          image_urls: base64Images,
          openai_key: openaiKey || undefined,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errBody.error || `Edge function error: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const listing = data.listing;
      return {
        title: listing.title ?? '',
        description: listing.description ?? '',
        brand: listing.brand ?? '',
        category: listing.category ?? '',
        color: listing.color ?? '',
        size: listing.size ?? '',
        material: listing.material ?? '',
        condition: listing.condition ?? 'Bon etat',
        price: Number(listing.price) || 0,
        quick_price: Number(listing.quick_price) || 0,
        premium_price: Number(listing.premium_price) || 0,
        keywords: Array.isArray(listing.keywords) ? listing.keywords : [],
        vinted_filters: Array.isArray(listing.vinted_filters) ? listing.vinted_filters : [],
      };
    } catch (err) {
      console.error('Edge function call failed:', err);
      if (openaiKey) {
        throw err;
      }
     throw new Error("Analyse IA indisponible : la fonction Supabase a échoué.");
    }
  }

  throw new Error("Analyse IA indisponible : la fonction Supabase a échoué.");
}
