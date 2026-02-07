import type {
  GammaEventResponse,
  GammaMarketsResponse,
  Orderbook,
  ParsedMarket,
  PolymarketMarket,
  PolymarketPrice,
} from './types.js';

/**
 * Parse a Polymarket market response into a more usable format
 */
export function parseMarket(market: PolymarketMarket): ParsedMarket {
  let outcomes: string[] = [];
  let outcomePrices: number[] = [];
  let clobTokenIds: string[] = [];

  try {
    outcomes = JSON.parse(market.outcomes || '[]');
  } catch {
    outcomes = ['Yes', 'No'];
  }

  try {
    outcomePrices = JSON.parse(market.outcomePrices || '[]').map(Number);
  } catch {
    outcomePrices = [0.5, 0.5];
  }

  try {
    clobTokenIds = JSON.parse(market.clobTokenIds || '[]');
  } catch {
    clobTokenIds = [];
  }

  return {
    id: market.id,
    question: market.question,
    slug: market.slug,
    endDate: market.endDate,
    liquidity: parseFloat(market.liquidity) || 0,
    volume: parseFloat(market.volume) || 0,
    outcomes,
    outcomePrices,
    clobTokenIds,
    active: market.active,
    closed: market.closed,
    acceptingOrders: market.acceptingOrders,
    image: market.image,
    description: market.description,
  };
}

/**
 * Send a message to the background script and wait for response
 * This bypasses CORS restrictions since background scripts can make cross-origin requests
 */
async function sendToBackground<T>(message: Record<string, unknown>): Promise<T | null> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(message, (response: { data?: T; error?: string }) => {
      if (chrome.runtime.lastError) {
        console.error('[Polymarket] Chrome runtime error:', chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      if (response?.error) {
        console.error('[Polymarket] Background error:', response.error);
        resolve(null);
        return;
      }
      resolve(response?.data ?? null);
    });
  });
}

/**
 * Fetch event data by slug from Gamma API (via background script)
 */
export async function fetchEventBySlug(slug: string): Promise<GammaEventResponse | null> {
  try {
    const data = await sendToBackground<GammaEventResponse>({
      type: 'FETCH_EVENT',
      slug,
    });
    return data;
  } catch (error) {
    console.error('[Polymarket] Error fetching event:', error);
    return null;
  }
}

/**
 * Fetch market data by slug from Gamma API (via background script)
 */
export async function fetchMarketBySlug(slug: string): Promise<PolymarketMarket | null> {
  try {
    const data = await sendToBackground<PolymarketMarket>({
      type: 'FETCH_MARKET',
      slug,
    });
    return data;
  } catch (error) {
    console.error('[Polymarket] Error fetching market:', error);
    return null;
  }
}

/**
 * Fetch current price for a token from CLOB API (via background script)
 */
export async function fetchPrice(tokenId: string, side: 'buy' | 'sell' = 'buy'): Promise<number | null> {
  try {
    const data = await sendToBackground<PolymarketPrice>({
      type: 'FETCH_PRICE',
      tokenId,
      side,
    });
    return data ? parseFloat(data.price) || null : null;
  } catch (error) {
    console.error('[Polymarket] Error fetching price:', error);
    return null;
  }
}

/**
 * Fetch orderbook for a token from CLOB API (via background script)
 */
export async function fetchOrderbook(tokenId: string): Promise<Orderbook | null> {
  try {
    const data = await sendToBackground<Orderbook>({
      type: 'FETCH_ORDERBOOK',
      tokenId,
    });
    return data;
  } catch (error) {
    console.error('[Polymarket] Error fetching orderbook:', error);
    return null;
  }
}

/**
 * Fetch prices for both YES and NO outcomes
 */
export async function fetchMarketPrices(
  yesTokenId: string,
  noTokenId: string,
): Promise<{ yes: number; no: number } | null> {
  try {
    const [yesPrice, noPrice] = await Promise.all([fetchPrice(yesTokenId, 'buy'), fetchPrice(noTokenId, 'buy')]);

    if (yesPrice === null || noPrice === null) {
      return null;
    }

    return { yes: yesPrice, no: noPrice };
  } catch (error) {
    console.error('[Polymarket] Error fetching market prices:', error);
    return null;
  }
}
