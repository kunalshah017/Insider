/**
 * useWallet - Hook for wallet connection in content-ui
 *
 * Uses the ethereum bridge to communicate with MetaMask through the page context.
 * Content scripts run in an isolated world and cannot access window.ethereum directly.
 */

import { useState, useCallback, useEffect } from 'react';
import { ethereumBridge } from '../ethereum-bridge';
import type { TradingSession } from '@extension/shared/lib/polymarket/session-types';
import { getSessionWalletAddress } from '@extension/shared/lib/polymarket/session-types';
import { CEB_CLOB_API_URL } from '@extension/env';
import { safeSendMessage, isExtensionContextValid } from '../utils/chrome-messaging';

// Storage key for session
const SESSION_STORAGE_KEY = 'insider_trading_session';

// API endpoints from env
const CLOB_API_URL = CEB_CLOB_API_URL;

// Polygon chain params

// Polygon chain params
const POLYGON_CHAIN_ID = '0x89'; // 137 in hex
const POLYGON_CHAIN_PARAMS = {
  chainId: POLYGON_CHAIN_ID,
  chainName: 'Polygon Mainnet',
  nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  rpcUrls: ['https://polygon-rpc.com'],
  blockExplorerUrls: ['https://polygonscan.com'],
};

interface UseWalletResult {
  isConnected: boolean;
  isConnecting: boolean;
  address: string | null;
  session: TradingSession | null;
  error: string | null;
  hasProvider: boolean;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  initializeSession: () => Promise<boolean>;
}

export function useWallet(): UseWalletResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [session, setSession] = useState<TradingSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasProvider, setHasProvider] = useState(false);

  // Initialize bridge and check provider on mount
  useEffect(() => {
    const init = async () => {
      try {
        // Initialize the ethereum bridge
        await ethereumBridge.init();

        // Check if provider exists
        const { hasProvider: providerExists } = await ethereumBridge.checkProvider();
        setHasProvider(providerExists);
        console.log('[Insider] Provider check:', providerExists ? 'MetaMask found' : 'No provider');

        // Load saved session
        const stored = await chrome.storage.local.get(SESSION_STORAGE_KEY);
        if (stored[SESSION_STORAGE_KEY]) {
          const savedSession = stored[SESSION_STORAGE_KEY] as TradingSession;
          setSession(savedSession);
          setAddress(getSessionWalletAddress(savedSession));
          setIsConnected(true);
        }
      } catch (err) {
        console.error('[Insider] Failed to initialize wallet:', err);
      }
    };
    init();
  }, []);

  // Connect wallet using ethereum bridge
  const connect = useCallback(async (): Promise<boolean> => {
    setIsConnecting(true);
    setError(null);

    try {
      // Check provider first
      const { hasProvider: providerExists } = await ethereumBridge.checkProvider();

      if (!providerExists) {
        setError('MetaMask not found. Please install MetaMask extension and refresh the page.');
        setHasProvider(false);
        return false;
      }

      setHasProvider(true);

      // Request account connection
      console.log('[Insider] Requesting wallet connection...');
      const { accounts } = await ethereumBridge.connect();

      if (!accounts || accounts.length === 0) {
        setError('No accounts returned from MetaMask');
        return false;
      }

      const walletAddress = accounts[0];
      console.log('[Insider] Wallet connected:', walletAddress);

      // Switch to Polygon
      try {
        console.log('[Insider] Switching to Polygon...');
        await ethereumBridge.switchChain(POLYGON_CHAIN_ID, POLYGON_CHAIN_PARAMS);
        console.log('[Insider] Switched to Polygon');
      } catch (switchErr: any) {
        console.error('[Insider] Failed to switch chain:', switchErr);
        // Don't fail connection for chain switch errors
      }

      setAddress(walletAddress);
      setIsConnected(true);

      return true;
    } catch (err: any) {
      const message = err.message || 'Failed to connect wallet';
      setError(message);
      console.error('[Insider] Connect error:', err);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // Initialize full trading session (API credentials)
  const initializeSession = useCallback(async (): Promise<boolean> => {
    if (!address) {
      setError('Wallet not connected');
      return false;
    }

    setIsConnecting(true);
    setError(null);

    try {
      console.log('[Insider] Initializing trading session...');

      // Step 1: Derive L2 API credentials via EIP-712 signing
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = 0;

      // EIP-712 typed data for Polymarket API key derivation
      const typedData = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
          ],
          ClobAuth: [
            { name: 'address', type: 'address' },
            { name: 'timestamp', type: 'string' },
            { name: 'nonce', type: 'uint256' },
            { name: 'message', type: 'string' },
          ],
        },
        primaryType: 'ClobAuth',
        domain: {
          name: 'ClobAuthDomain',
          version: '1',
          chainId: 137,
        },
        message: {
          address: address,
          timestamp: timestamp.toString(),
          nonce: nonce,
          message: 'This message attests that I control the given wallet',
        },
      };

      console.log('[Insider] Requesting signature for API key derivation...');
      const { signature } = await ethereumBridge.signTypedData(address, typedData);
      console.log('[Insider] Signature obtained');

      // Derive API credentials from Polymarket using L1 headers (GET request)
      // The Polymarket API expects authentication in headers, not body
      console.log('[Insider] Deriving API credentials...');
      const deriveResponse = await fetch(`${CLOB_API_URL}/auth/derive-api-key`, {
        method: 'GET',
        headers: {
          POLY_ADDRESS: address,
          POLY_SIGNATURE: signature,
          POLY_TIMESTAMP: timestamp.toString(),
          POLY_NONCE: nonce.toString(),
        },
      });

      if (!deriveResponse.ok) {
        const errText = await deriveResponse.text();
        throw new Error(`Failed to derive API credentials: ${errText}`);
      }

      const credentials = await deriveResponse.json();
      console.log('[Insider] API credentials derived successfully');

      // For now, use EOA as safe address (full Safe wallet deployment can be added later)
      const safeAddress = address;

      // Create and store session
      const newSession: TradingSession = {
        walletAddress: address,
        safeAddress,
        apiKey: credentials.apiKey,
        apiSecret: credentials.secret,
        passphrase: credentials.passphrase,
        isActive: true,
        createdAt: Date.now(),
      };

      // Save to chrome.storage
      await chrome.storage.local.set({ [SESSION_STORAGE_KEY]: newSession });

      // Notify background script (if context is still valid)
      if (isExtensionContextValid()) {
        try {
          await safeSendMessage({
            type: 'SET_TRADING_SESSION',
            session: newSession,
          });
        } catch (err) {
          console.warn('[Insider] Could not notify background script:', err);
        }
      }

      setSession(newSession);
      console.log('[Insider] Trading session initialized!');

      return true;
    } catch (err: any) {
      const message = err.message || 'Failed to initialize session';
      setError(message);
      console.error('[Insider] Session init error:', err);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [address]);

  // Disconnect wallet
  const disconnect = useCallback(async () => {
    try {
      await chrome.storage.local.remove(SESSION_STORAGE_KEY);
      if (isExtensionContextValid()) {
        await safeSendMessage({ type: 'CLEAR_TRADING_SESSION' });
      }
    } catch (err) {
      console.error('[Insider] Disconnect error:', err);
    }

    setIsConnected(false);
    setAddress(null);
    setSession(null);
    setError(null);
  }, []);

  return {
    isConnected,
    isConnecting,
    address,
    session,
    error,
    hasProvider,
    connect,
    disconnect,
    initializeSession,
  };
}
