import type { BackgroundStyle, GeneratedListing } from './types';
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
type AnalyzeOptions = {
  imageUrls: string[];
  photoStyle: string;
  enhancePhoto: boolean;
  geminiKey?: string;
  // Fond de photo genere (2026-08-30) : 'original' (ou absent) = aucune
  // edition, comportement inchange -- voir backgroundStyles.ts cote Deno
  // pour l'allowlist complete.
  backgroundStyle?: BackgroundStyle;
};

export async function analyzeWithAI({
  imageUrls,
  photoStyle,
  enhancePhoto,
  geminiKey,
  backgroundStyle,
}: AnalyzeOptions): Promise<GeneratedListing> {
  const base64Images = await Promise.all(
    imageUrls.map((url) => blobUrlToBase64(url))
  );

  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/analyze-clothing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          image_urls: base64Images,
          gemini_key: geminiKey || undefined,
          photo_style: photoStyle,
          enhance_photo: enhancePhoto,
          background_style: backgroundStyle && backgroundStyle !== 'original' ? backgroundStyle : undefined,
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
        condition: listing.condition ?? 'Bon état',
        price: Number(listing.price) || 0,
        quick_price: Number(listing.quick_price) || 0,
        premium_price: Number(listing.premium_price) || 0,
       keywords: Array.isArray(listing.keywords)
  ? listing.keywords
      .map((k: string) => k.trim().toLowerCase())
      .filter((k: string) => !/^taille\s*[xsml0-9]+$/i.test(k))
      .filter((k: string) => !/^taille\s*(xl|xxl|xxxl)$/i.test(k))
      .filter((k: string) => !["xs", "s", "m", "l", "xl", "xxl", "xxxl"].includes(k))
      .filter((k: string, i: number, arr: string[]) => arr.indexOf(k) === i)
  : [],
        vinted_filters: Array.isArray(listing.vinted_filters) ? listing.vinted_filters : [],
        price_source: listing.price_source === 'market' ? 'market' : 'ai_estimate',
        price_comparables_count: Number(listing.price_comparables_count) || 0,
        market_tier: listing.market_tier === 'strong' || listing.market_tier === 'broad' ? listing.market_tier : 'none',
        market_confidence_level: ['elevee', 'moyenne', 'faible', 'ia_uniquement'].includes(listing.market_confidence_level)
          ? listing.market_confidence_level
          : 'ia_uniquement',
        market_confidence_score: Number(listing.market_confidence_score) || 0,
        market_freshness: ['recent', 'acceptable', 'old', 'stale'].includes(listing.market_freshness)
          ? listing.market_freshness
          : null,
        edited_image_urls: Array.isArray(listing.edited_image_urls) ? listing.edited_image_urls : null,
      };
    } catch (err) {
      console.error('Edge function call failed:', err);
      // Toujours propager le message reel (deja extrait de errBody.error
      // plus haut quand la reponse HTTP est en erreur) -- jamais de
      // fallback generique qui masquerait une cause exploitable
      // (credits epuises, cle Gemini manquante, erreur Gemini precise...).
      throw err instanceof Error ? err : new Error('Analyse IA indisponible : erreur inconnue.');
    }
  }

  throw new Error('Analyse IA indisponible : aucune session utilisateur active.');
}
