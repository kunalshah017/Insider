/**
 * Polymarket API Types
 */

export interface PolymarketEvent {
  id: string;
  ticker: string;
  slug: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  image: string;
  icon: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  new: boolean;
  featured: boolean;
  restricted: boolean;
  liquidity: string;
  volume: string;
  openInterest: string;
  commentCount: number;
  markets: PolymarketMarket[];
}

export interface PolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  endDate: string;
  liquidity: string;
  volume: string;
  outcomes: string; // JSON stringified array like '["Yes", "No"]'
  outcomePrices: string; // JSON stringified array like '[0.65, 0.35]'
  clobTokenIds: string; // JSON stringified array of token IDs
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
  acceptingOrderTimestamp: string;
  image: string;
  icon: string;
  description: string;
  groupItemTitle?: string; // For multi-market events (e.g., "March 31", "June 30")
}

export interface ParsedMarket {
  id: string;
  question: string;
  slug: string;
  endDate: string;
  liquidity: number;
  volume: number;
  outcomes: string[];
  outcomePrices: number[];
  clobTokenIds: string[];
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
  image: string;
  description: string;
}

export interface PolymarketPrice {
  price: string;
  side: 'buy' | 'sell';
}

export interface OrderbookLevel {
  price: string;
  size: string;
}

export interface Orderbook {
  market: string;
  asset_id: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: string;
  hash: string;
}

export interface GammaEventResponse {
  id: string;
  title: string;
  slug: string;
  description: string;
  startDate: string;
  endDate: string;
  image: string;
  icon: string;
  active: boolean;
  closed: boolean;
  markets: PolymarketMarket[];
  // ... other fields
}

export interface GammaMarketsResponse extends Array<PolymarketMarket> {}
