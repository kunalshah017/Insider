/**
 * useMarketPrices - React hook for real-time market price updates
 *
 * Subscribes to Polymarket WebSocket for live price updates on YES/NO outcomes.
 */

import { useState, useEffect, useRef } from 'react';
import { polymarketWS, subscribeToMarketPrices } from '@extension/shared/lib/polymarket/websocket';

export interface MarketPrices {
  yes: number;
  no: number;
  isLive: boolean;
  lastUpdate: number | null;
}

interface UseMarketPricesOptions {
  /** Initial YES price (fallback before WebSocket connects) */
  initialYesPrice?: number;
  /** Initial NO price (fallback before WebSocket connects) */
  initialNoPrice?: number;
  /** Whether to auto-connect to WebSocket */
  autoConnect?: boolean;
}

/**
 * Hook to subscribe to real-time price updates for a market
 *
 * @param yesTokenId - Token ID for YES outcome
 * @param noTokenId - Token ID for NO outcome
 * @param options - Configuration options
 * @returns Current prices and connection status
 *
 * @example
 * ```tsx
 * const { yes, no, isLive } = useMarketPrices(
 *   '123...', // YES token ID
 *   '456...', // NO token ID
 *   { initialYesPrice: 0.65, initialNoPrice: 0.35 }
 * );
 * ```
 */
export function useMarketPrices(
  yesTokenId: string | null | undefined,
  noTokenId: string | null | undefined,
  options: UseMarketPricesOptions = {},
): MarketPrices {
  const { initialYesPrice = 0.5, initialNoPrice = 0.5, autoConnect = true } = options;

  // Use refs to track the "best known" prices (either from WS or initial)
  const currentPricesRef = useRef({ yes: initialYesPrice, no: initialNoPrice });
  const hasReceivedLiveDataRef = useRef(false);

  // Initialize state with initial prices
  const [prices, setPrices] = useState<MarketPrices>(() => ({
    yes: initialYesPrice,
    no: initialNoPrice,
    isLive: false,
    lastUpdate: null,
  }));

  // Track mounted state to avoid state updates after unmount
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Update initial prices ref when they change (but don't reset if we have live data)
  useEffect(() => {
    if (!hasReceivedLiveDataRef.current) {
      currentPricesRef.current = { yes: initialYesPrice, no: initialNoPrice };
      setPrices(prev => ({
        ...prev,
        yes: initialYesPrice,
        no: initialNoPrice,
      }));
    }
  }, [initialYesPrice, initialNoPrice]);

  useEffect(() => {
    // Skip if no token IDs provided
    if (!yesTokenId || !noTokenId || !autoConnect) {
      return;
    }

    console.log('[useMarketPrices] Subscribing to:', { yesTokenId, noTokenId });

    // Subscribe to price updates
    const unsubscribe = subscribeToMarketPrices(yesTokenId, noTokenId, newPrices => {
      if (!mountedRef.current) return;

      // Mark that we've received live data
      hasReceivedLiveDataRef.current = true;

      // Update refs
      currentPricesRef.current = newPrices;

      // Update state with live prices
      setPrices({
        yes: newPrices.yes,
        no: newPrices.no,
        isLive: true,
        lastUpdate: Date.now(),
      });
    });

    return () => {
      console.log('[useMarketPrices] Unsubscribing');
      unsubscribe();
      // Note: We don't reset hasReceivedLiveDataRef here to preserve the last known price
    };
  }, [yesTokenId, noTokenId, autoConnect]);

  return prices;
}

/**
 * Hook to get cached price for a single asset
 */
export function useAssetPrice(assetId: string | null | undefined): number | null {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!assetId) return;

    // Get cached price first
    const cached = polymarketWS.getPrice(assetId);
    if (cached !== undefined) {
      setPrice(cached);
    }

    // Subscribe to updates
    polymarketWS.subscribe([assetId], (id, newPrice) => {
      if (id === assetId) {
        setPrice(newPrice);
      }
    });

    return () => {
      polymarketWS.unsubscribe([assetId]);
    };
  }, [assetId]);

  return price;
}

/**
 * Hook to manage WebSocket connection status
 */
export function useWebSocketStatus(): {
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
} {
  const [isConnected, setIsConnected] = useState(polymarketWS.isConnected());

  const connect = useCallback(async () => {
    await polymarketWS.connect();
    setIsConnected(true);
  }, []);

  const disconnect = useCallback(() => {
    polymarketWS.disconnect();
    setIsConnected(false);
  }, []);

  useEffect(() => {
    // Check connection status periodically
    const interval = setInterval(() => {
      setIsConnected(polymarketWS.isConnected());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return { isConnected, connect, disconnect };
}
