/**
 * Ethereum Provider Bridge
 *
 * This module handles communication between the content script (isolated world)
 * and the page context (where window.ethereum lives).
 *
 * Uses a web accessible resource script to avoid CSP inline script restrictions.
 */

// Track pending requests
const pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>();
let bridgeReady = false;
let bridgeReadyPromise: Promise<void> | null = null;

// Generate unique request IDs
let requestIdCounter = 0;
function generateRequestId(): string {
  return `insider_${Date.now()}_${++requestIdCounter}`;
}

// Setup response listener
function setupResponseListener() {
  window.addEventListener('message', event => {
    if (event.source !== window) return;

    const { type, id, success, data, error } = event.data || {};

    if (type === 'INSIDER_WALLET_BRIDGE_READY') {
      bridgeReady = true;
      console.log('[Insider] Provider bridge ready');
      return;
    }

    if (type !== 'INSIDER_WALLET_RESPONSE') return;

    const pending = pendingRequests.get(id);
    if (!pending) return;

    pendingRequests.delete(id);

    if (success) {
      pending.resolve(data);
    } else {
      pending.reject(new Error(error || 'Unknown error'));
    }
  });
}

// Inject the provider bridge script as a web accessible resource
function injectProviderBridge(): Promise<void> {
  if (bridgeReadyPromise) return bridgeReadyPromise;

  bridgeReadyPromise = new Promise(resolve => {
    if (bridgeReady) {
      resolve();
      return;
    }

    // Setup listener first
    setupResponseListener();

    // Check if already injected
    if (document.getElementById('insider-provider-bridge')) {
      // Already injected, wait for ready signal or resolve
      const timeout = setTimeout(() => resolve(), 500);
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'INSIDER_WALLET_BRIDGE_READY') {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          resolve();
        }
      };
      window.addEventListener('message', handler);
      return;
    }

    // Create script element with src pointing to web accessible resource
    const script = document.createElement('script');
    script.id = 'insider-provider-bridge';
    script.src = chrome.runtime.getURL('provider-bridge.js');

    // Wait for bridge ready signal
    const readyHandler = (event: MessageEvent) => {
      if (event.data?.type === 'INSIDER_WALLET_BRIDGE_READY') {
        window.removeEventListener('message', readyHandler);
        resolve();
      }
    };
    window.addEventListener('message', readyHandler);

    // Handle script load errors
    script.onerror = () => {
      console.error('[Insider] Failed to load provider bridge script');
      window.removeEventListener('message', readyHandler);
      resolve(); // Resolve anyway to not block
    };

    // Inject the script
    (document.head || document.documentElement).appendChild(script);

    // Timeout fallback
    setTimeout(() => {
      window.removeEventListener('message', readyHandler);
      resolve();
    }, 2000);
  });

  return bridgeReadyPromise;
}

// Send a request to the injected script
async function sendRequest(type: string, payload?: any): Promise<any> {
  await injectProviderBridge();

  return new Promise((resolve, reject) => {
    const id = generateRequestId();

    // Timeout after 60 seconds (for user interaction)
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('Request timeout'));
    }, 60000);

    pendingRequests.set(id, {
      resolve: value => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: error => {
        clearTimeout(timeout);
        reject(error);
      },
    });

    window.postMessage({ type, id, payload }, '*');
  });
}

// Public API
export const ethereumBridge = {
  /**
   * Check if ethereum provider is available
   */
  async checkProvider(): Promise<{ hasProvider: boolean; isMetaMask: boolean }> {
    return sendRequest('INSIDER_WALLET_CHECK');
  },

  /**
   * Request wallet connection
   */
  async connect(): Promise<{ accounts: string[] }> {
    return sendRequest('INSIDER_WALLET_CONNECT');
  },

  /**
   * Switch to a specific chain
   */
  async switchChain(chainId: string, chainParams?: any): Promise<{ chainId: string; added?: boolean }> {
    return sendRequest('INSIDER_WALLET_SWITCH_CHAIN', { chainId, chainParams });
  },

  /**
   * Sign typed data (EIP-712)
   */
  async signTypedData(address: string, typedData: any): Promise<{ signature: string }> {
    return sendRequest('INSIDER_WALLET_SIGN_TYPED_DATA', { address, typedData });
  },

  /**
   * Make an eth_call to read contract data
   */
  async ethCall(to: string, data: string): Promise<string> {
    return sendRequest('INSIDER_WALLET_ETH_CALL', { to, data });
  },

  /**
   * Get native token balance (POL/MATIC)
   */
  async getBalance(address: string): Promise<{ balance: string }> {
    return sendRequest('INSIDER_WALLET_GET_BALANCE', { address });
  },

  /**
   * Send a transaction (for approvals, etc.)
   */
  async sendTransaction(tx: { to: string; from: string; data: string; value?: string }): Promise<{ hash: string }> {
    return sendRequest('INSIDER_WALLET_SEND_TX', tx);
  },

  /**
   * Initialize the bridge (call this early)
   */
  async init(): Promise<void> {
    await injectProviderBridge();
  },
};
