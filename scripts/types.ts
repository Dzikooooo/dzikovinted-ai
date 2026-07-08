export interface ScrapedItem {
  title: string;
  brand: string;
  price: number;
  image: string;
  url: string;
  favourites: number;
}

export interface WatchlistItem extends ScrapedItem {
  category: string;
}

export interface MarketPriceResult {
  marketPrice: number;
  confidence: number;
  source: string;
}

export interface AnalyzedItem extends WatchlistItem {
  market_price: number;
  profit: number;
  roi: number;
  confidence: number;
  price_source: string;
  score: number;
}
