/**
 * Polymarket CLOB WebSocket Service
 *
 * Provides real-time price updates for prediction market outcomes.
 * Connects to wss://ws-subscriptions-clob.polymarket.com/ws/market
 *
 * @see https://docs.polymarket.com/developers/CLOB/websocket/wss-overview
 */

// WebSocket endpoint for market data
const WS_ENDPOINT = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

// Reconnection settings
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;
const HEARTBEAT_INTERVAL_MS = 30000;

/**
 * Price update event from WebSocket
 */
export interface PriceUpdate {
  asset_id: string;
  price: string;
  timestamp: string;
}

/**
 * Book update - includes bid/ask changes
 */
export interface BookUpdate {
  asset_id: string;
  market: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  timestamp: string;
  hash: string;
}

/**
 * Price change event (simplified)
 */
export interface PriceChangeEvent {
  asset_id: string;
  event_type: 'price_change';
  price: string;
  side: 'buy' | 'sell';
  size: string;
  timestamp: string;
}

/**
 * Last trade price event
 */
export interface LastTradePriceEvent {
  asset_id: string;
  event_type: 'last_trade_price';
  price: string;
  timestamp: string;
}

/**
 * Tick size event
 */
export interface TickSizeEvent {
  asset_id: string;
  event_type: 'tick_size_change';
  old_tick_size: string;
  new_tick_size: string;
  timestamp: string;
}

export type WebSocketEvent = BookUpdate | PriceChangeEvent | LastTradePriceEvent | TickSizeEvent;

/**
 * Callback for price updates
 */
export type PriceUpdateCallback = (assetId: string, price: number) => void;

/**
 * Callback for book updates
 */
export type BookUpdateCallback = (update: BookUpdate) => void;

/**
 * WebSocket subscription message format
 * Based on Polymarket CLOB WebSocket API (py-clob-client)
 *
 * The /ws/market endpoint expects:
 * - assets_ids: array of token IDs to subscribe to
 * - type: "Market" (capital M, the channel is in the URL path)
 */
interface SubscriptionMessage {
  assets_ids: string[];
  type: 'Market';
}

/**
 * Polymarket WebSocket Manager
 *
 * Manages a single WebSocket connection with automatic reconnection
 * and subscription management for multiple asset IDs.
 */
class PolymarketWebSocket {
  private ws: WebSocket | null = null;
  private subscribedAssets: Set<string> = new Set();
  private priceCallbacks: Map<string, Set<PriceUpdateCallback>> = new Map();
  private bookCallbacks: Map<string, Set<BookUpdateCallback>> = new Map();
  private globalPriceCallbacks: Set<PriceUpdateCallback> = new Set();
  private reconnectAttempts = 0;
  private isConnecting = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private subscriptionDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private prices: Map<string, number> = new Map();

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      if (this.isConnecting) {
        // Wait for existing connection attempt
        const checkConnection = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection);
            resolve();
          }
        }, 100);
        return;
      }

      this.isConnecting = true;
      console.log('[Polymarket WS] Connecting to:', WS_ENDPOINT);

      try {
        this.ws = new WebSocket(WS_ENDPOINT);

        this.ws.onopen = () => {
          console.log('[Polymarket WS] Connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startHeartbeat();

          // Resubscribe to existing assets
          if (this.subscribedAssets.size > 0) {
            this.sendSubscription();
          }

          resolve();
        };

        this.ws.onmessage = event => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = error => {
          console.error('[Polymarket WS] Error:', error);
          this.isConnecting = false;
        };

        this.ws.onclose = event => {
          console.log('[Polymarket WS] Disconnected:', event.code, event.reason);
          this.isConnecting = false;
          this.stopHeartbeat();
          this.handleReconnect();
        };
      } catch (error) {
        console.error('[Polymarket WS] Failed to create WebSocket:', error);
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string) {
    // Handle non-JSON server messages (like errors)
    if (data.startsWith('INVALID') || data.startsWith('ERROR') || data.startsWith('OK')) {
      console.log('[Polymarket WS] Server response:', data);
      return;
    }

    try {
      const messages = JSON.parse(data);

      // Handle array of messages
      const messageArray = Array.isArray(messages) ? messages : [messages];

      for (const msg of messageArray) {
        // Handle book updates (contains bids/asks)
        if (msg.bids !== undefined && msg.asks !== undefined) {
          const bookUpdate = msg as BookUpdate;
          this.handleBookUpdate(bookUpdate);
          continue;
        }

        // Handle event-based messages
        if (msg.event_type) {
          switch (msg.event_type) {
            case 'price_change':
              // Handle batch price_changes array format
              if (msg.price_changes && Array.isArray(msg.price_changes)) {
                for (const priceChange of msg.price_changes) {
                  this.handlePriceChangeItem(priceChange);
                }
              } else if (msg.asset_id) {
                // Handle single price change (legacy format)
                this.handlePriceChange(msg as PriceChangeEvent);
              }
              break;
            case 'last_trade_price':
              this.handleLastTradePrice(msg as LastTradePriceEvent);
              break;
            case 'tick_size_change':
              // Ignore tick size changes for now
              break;
          }
        }
      }
    } catch (error) {
      console.warn('[Polymarket WS] Failed to parse message:', data);
    }
  }

  /**
   * Handle individual price change item from price_changes array
   */
  private handlePriceChangeItem(item: { asset_id: string; price: string; best_bid?: string; best_ask?: string }) {
    const assetId = item.asset_id;

    // Use best_bid/best_ask mid-price if available, otherwise use price
    let price: number;
    if (item.best_bid && item.best_ask) {
      const bid = parseFloat(item.best_bid);
      const ask = parseFloat(item.best_ask);
      price = (bid + ask) / 2;
    } else {
      price = parseFloat(item.price);
    }

    if (!isNaN(price)) {
      this.prices.set(assetId, price);
      this.notifyPriceUpdate(assetId, price);
    }
  }

  /**
   * Handle book update - extract best bid/ask prices
   */
  private handleBookUpdate(update: BookUpdate) {
    const assetId = update.asset_id;

    // Get best bid price (highest buy order)
    let bestBid = 0;
    if (update.bids && update.bids.length > 0) {
      bestBid = parseFloat(update.bids[0].price) || 0;
    }

    // Get best ask price (lowest sell order)
    let bestAsk = 1;
    if (update.asks && update.asks.length > 0) {
      bestAsk = parseFloat(update.asks[0].price) || 1;
    }

    // Use mid-price as the "current" price
    const midPrice = (bestBid + bestAsk) / 2;

    // Update stored price
    this.prices.set(assetId, midPrice);

    // Notify price callbacks
    this.notifyPriceUpdate(assetId, midPrice);

    // Notify book callbacks
    const bookCallbacks = this.bookCallbacks.get(assetId);
    if (bookCallbacks) {
      bookCallbacks.forEach(cb => cb(update));
    }
  }

  /**
   * Handle price change event
   */
  private handlePriceChange(event: PriceChangeEvent) {
    const price = parseFloat(event.price);
    if (!isNaN(price)) {
      this.prices.set(event.asset_id, price);
      this.notifyPriceUpdate(event.asset_id, price);
    }
  }

  /**
   * Handle last trade price event
   */
  private handleLastTradePrice(event: LastTradePriceEvent) {
    const price = parseFloat(event.price);
    if (!isNaN(price)) {
      this.prices.set(event.asset_id, price);
      this.notifyPriceUpdate(event.asset_id, price);
    }
  }

  /**
   * Notify all callbacks about a price update
   */
  private notifyPriceUpdate(assetId: string, price: number) {
    // Notify asset-specific callbacks
    const callbacks = this.priceCallbacks.get(assetId);
    if (callbacks) {
      callbacks.forEach(cb => cb(assetId, price));
    }

    // Notify global callbacks
    this.globalPriceCallbacks.forEach(cb => cb(assetId, price));
  }

  /**
   * Schedule a subscription message (debounced to batch rapid calls)
   */
  private scheduleSubscription() {
    // Clear any pending subscription
    if (this.subscriptionDebounceTimer) {
      clearTimeout(this.subscriptionDebounceTimer);
    }

    // Schedule subscription after short delay to batch multiple rapid calls
    this.subscriptionDebounceTimer = setTimeout(() => {
      this.sendSubscription();
    }, 100);
  }

  /**
   * Send subscription message for current assets
   */
  private sendSubscription() {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    const assetsArray = Array.from(this.subscribedAssets);
    if (assetsArray.length === 0) {
      return;
    }

    const message: SubscriptionMessage = {
      assets_ids: assetsArray,
      type: 'Market',
    };

    console.log('[Polymarket WS] Subscribing to', assetsArray.length, 'assets');
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Subscribe to price updates for specific asset IDs
   */
  async subscribe(assetIds: string[], onPrice?: PriceUpdateCallback): Promise<void> {
    // Add to subscribed set
    let newAssets = false;
    for (const id of assetIds) {
      if (!this.subscribedAssets.has(id)) {
        this.subscribedAssets.add(id);
        newAssets = true;
      }
    }

    // Register callback if provided
    if (onPrice) {
      for (const id of assetIds) {
        if (!this.priceCallbacks.has(id)) {
          this.priceCallbacks.set(id, new Set());
        }
        this.priceCallbacks.get(id)!.add(onPrice);
      }
    }

    // Connect if not connected
    if (this.ws?.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    // Schedule subscription update if we have new assets (debounced)
    if (newAssets) {
      this.scheduleSubscription();
    }
  }

  /**
   * Subscribe to book updates for specific asset
   */
  subscribeToBook(assetId: string, onBook: BookUpdateCallback): void {
    if (!this.bookCallbacks.has(assetId)) {
      this.bookCallbacks.set(assetId, new Set());
    }
    this.bookCallbacks.get(assetId)!.add(onBook);
  }

  /**
   * Subscribe to all price updates globally
   */
  onPriceUpdate(callback: PriceUpdateCallback): () => void {
    this.globalPriceCallbacks.add(callback);
    return () => {
      this.globalPriceCallbacks.delete(callback);
    };
  }

  /**
   * Unsubscribe from price updates for specific asset IDs
   */
  unsubscribe(assetIds: string[], callback?: PriceUpdateCallback) {
    for (const id of assetIds) {
      // Remove callback if provided
      if (callback && this.priceCallbacks.has(id)) {
        this.priceCallbacks.get(id)!.delete(callback);

        // If no more callbacks, remove the asset from subscriptions
        if (this.priceCallbacks.get(id)!.size === 0) {
          this.priceCallbacks.delete(id);
          this.subscribedAssets.delete(id);
        }
      }
    }
  }

  /**
   * Get the current cached price for an asset
   */
  getPrice(assetId: string): number | undefined {
    return this.prices.get(assetId);
  }

  /**
   * Get all cached prices
   */
  getAllPrices(): Map<string, number> {
    return new Map(this.prices);
  }

  /**
   * Handle automatic reconnection
   */
  private handleReconnect() {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[Polymarket WS] Max reconnection attempts reached');
      return;
    }

    if (this.subscribedAssets.size === 0) {
      // No subscriptions, don't reconnect
      return;
    }

    this.reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS * this.reconnectAttempts;

    console.log(`[Polymarket WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(err => {
        console.error('[Polymarket WS] Reconnection failed:', err);
      });
    }, delay);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Send a ping/subscription refresh to keep alive
        this.sendSubscription();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Disconnect and clean up
   */
  disconnect() {
    this.stopHeartbeat();
    this.subscribedAssets.clear();
    this.priceCallbacks.clear();
    this.bookCallbacks.clear();
    this.globalPriceCallbacks.clear();
    this.prices.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const polymarketWS = new PolymarketWebSocket();

/**
 * Helper to subscribe to a market's price updates
 *
 * @param yesTokenId - YES outcome token ID
 * @param noTokenId - NO outcome token ID
 * @param onUpdate - Callback with updated prices
 * @returns Cleanup function
 */
export function subscribeToMarketPrices(
  yesTokenId: string,
  noTokenId: string,
  onUpdate: (prices: { yes: number; no: number }) => void,
): () => void {
  const cachedPrices = { yes: 0.5, no: 0.5 };

  const handleUpdate = (assetId: string, price: number) => {
    if (assetId === yesTokenId) {
      cachedPrices.yes = price;
    } else if (assetId === noTokenId) {
      cachedPrices.no = price;
    }
    onUpdate({ ...cachedPrices });
  };

  // Subscribe to both assets
  polymarketWS.subscribe([yesTokenId, noTokenId], handleUpdate);

  // Return cleanup function
  return () => {
    polymarketWS.unsubscribe([yesTokenId, noTokenId], handleUpdate);
  };
}
