import 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';
import type { TradingSession, OrderParams } from '@extension/shared/lib/polymarket/session-types';
import { CEB_SERVER_URL, CEB_CLOB_API_URL, CEB_GAMMA_API_URL } from '@extension/env';

const GAMMA_API_URL = CEB_GAMMA_API_URL;
const CLOB_API_URL = CEB_CLOB_API_URL;
const SERVER_URL = CEB_SERVER_URL;
const SESSION_STORAGE_KEY = 'insider_trading_session';

/**
 * Generate HMAC-SHA256 signature for L2 authentication
 */
async function buildL2Signature(
  secret: string,
  timestamp: number,
  method: string,
  requestPath: string,
  body?: string,
): Promise<string> {
  const message = `${timestamp}${method}${requestPath}${body || ''}`;

  // Decode base64 secret
  const secretBytes = Uint8Array.from(atob(secret), c => c.charCodeAt(0));

  // Create HMAC key
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  // Sign the message
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));

  // Convert to base64
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Build L2 authentication headers for CLOB API requests
 */
async function buildL2Headers(
  address: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  method: string,
  requestPath: string,
  body?: string,
): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await buildL2Signature(apiSecret, timestamp, method, requestPath, body);

  return {
    POLY_ADDRESS: address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: timestamp.toString(),
    POLY_API_KEY: apiKey,
    POLY_PASSPHRASE: passphrase,
  };
}

/**
 * Message types for communication between content script and background
 */
type MessageType =
  | { type: 'FETCH_EVENT'; slug: string }
  | { type: 'FETCH_MARKET'; slug: string }
  | { type: 'FETCH_PRICE'; tokenId: string; side: 'buy' | 'sell' }
  | { type: 'FETCH_ORDERBOOK'; tokenId: string }
  | { type: 'GET_TRADING_SESSION' }
  | { type: 'CREATE_ORDER'; order: OrderParams }
  | {
      type: 'SUBMIT_SIGNED_ORDER';
      signedOrder: any;
      credentials: { address: string; apiKey: string; apiSecret: string; passphrase: string };
      negRisk: boolean;
    }
  | { type: 'GET_SAFE_BALANCE'; safeAddress: string };

/**
 * Handle messages from content scripts
 * Background script can make cross-origin requests without CORS restrictions
 */
chrome.runtime.onMessage.addListener((message: MessageType, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'FETCH_EVENT': {
          const response = await fetch(`${GAMMA_API_URL}/events?slug=${encodeURIComponent(message.slug)}`);
          if (!response.ok) {
            sendResponse({ error: `HTTP ${response.status}` });
            return;
          }
          const data = await response.json();
          sendResponse({ data: Array.isArray(data) && data.length > 0 ? data[0] : null });
          break;
        }

        case 'FETCH_MARKET': {
          const response = await fetch(`${GAMMA_API_URL}/markets?slug=${encodeURIComponent(message.slug)}`);
          if (!response.ok) {
            sendResponse({ error: `HTTP ${response.status}` });
            return;
          }
          const data = await response.json();
          sendResponse({ data: Array.isArray(data) && data.length > 0 ? data[0] : null });
          break;
        }

        case 'FETCH_PRICE': {
          const response = await fetch(
            `${CLOB_API_URL}/price?token_id=${encodeURIComponent(message.tokenId)}&side=${message.side}`,
          );
          if (!response.ok) {
            sendResponse({ error: `HTTP ${response.status}` });
            return;
          }
          const data = await response.json();
          sendResponse({ data });
          break;
        }

        case 'FETCH_ORDERBOOK': {
          const response = await fetch(`${CLOB_API_URL}/book?token_id=${encodeURIComponent(message.tokenId)}`);
          if (!response.ok) {
            sendResponse({ error: `HTTP ${response.status}` });
            return;
          }
          const data = await response.json();
          sendResponse({ data });
          break;
        }

        case 'GET_TRADING_SESSION': {
          // Get cached trading session from storage
          const result = await chrome.storage.local.get(SESSION_STORAGE_KEY);
          sendResponse({ data: result[SESSION_STORAGE_KEY] || null });
          break;
        }

        case 'CREATE_ORDER': {
          // Legacy handler - redirect to new flow
          sendResponse({ error: 'Please use the new order signing flow' });
          break;
        }

        case 'SUBMIT_SIGNED_ORDER': {
          // Submit a signed order through the server
          try {
            const { signedOrder, credentials, negRisk } = message as {
              signedOrder: any;
              credentials: { address: string; apiKey: string; apiSecret: string; passphrase: string };
              negRisk: boolean;
            };

            console.log('[Insider Background] Submitting signed order...');

            // Format order for API
            const orderPayload = {
              order: {
                salt: parseInt(signedOrder.salt),
                maker: signedOrder.maker,
                signer: signedOrder.signer,
                taker: signedOrder.taker,
                tokenId: signedOrder.tokenId,
                makerAmount: signedOrder.makerAmount,
                takerAmount: signedOrder.takerAmount,
                expiration: signedOrder.expiration,
                nonce: signedOrder.nonce,
                feeRateBps: signedOrder.feeRateBps,
                side: signedOrder.side,
                signatureType: signedOrder.signatureType,
                signature: signedOrder.signature,
              },
              owner: credentials.address,
              orderType: 'GTC',
            };

            const bodyStr = JSON.stringify(orderPayload);
            const requestPath = '/order';

            // Build L2 headers for authentication
            const l2Headers = await buildL2Headers(
              credentials.address,
              credentials.apiKey,
              credentials.apiSecret,
              credentials.passphrase,
              'POST',
              requestPath,
              bodyStr,
            );

            // Send to our server which will add Builder headers
            const response = await fetch(`${SERVER_URL}/api/order`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                // Pass L2 headers to server
                ...l2Headers,
                // Additional metadata
                'X-Neg-Risk': negRisk.toString(),
              },
              body: bodyStr,
            });

            const data = await response.json();

            if (!response.ok) {
              console.error('[Insider Background] Order submission failed:', data);
              sendResponse({ error: data.error || `HTTP ${response.status}` });
              return;
            }

            console.log('[Insider Background] Order submitted successfully:', data);
            sendResponse({ data });
          } catch (error) {
            console.error('[Insider Background] Order submission error:', error);
            sendResponse({ error: String(error) });
          }
          break;
        }

        case 'GET_SAFE_BALANCE': {
          // Fetch USDC.e balance for Safe wallet
          const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
          const ERC20_BALANCE_ABI = 'balanceOf(address)(uint256)';

          try {
            // Using Polygon RPC to get balance
            const response = await fetch('https://polygon-rpc.com', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_call',
                params: [
                  {
                    to: USDC_E_ADDRESS,
                    data: `0x70a08231000000000000000000000000${message.safeAddress.slice(2)}`,
                  },
                  'latest',
                ],
              }),
            });

            const result = await response.json();
            if (result.error) {
              sendResponse({ error: result.error.message });
              return;
            }

            // Convert hex to decimal (USDC.e has 6 decimals)
            const balanceWei = BigInt(result.result || '0x0');
            const balance = Number(balanceWei) / 1e6;
            sendResponse({ data: { balance, raw: balanceWei.toString() } });
          } catch (error) {
            sendResponse({ error: String(error) });
          }
          break;
        }

        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('[Insider Background] Error handling message:', error);
      sendResponse({ error: String(error) });
    }
  })();

  // Return true to indicate we'll send response asynchronously
  return true;
});

exampleThemeStorage.get().then(theme => {
  console.log('theme', theme);
});

console.log('[Insider] Background loaded');
console.log("Edit 'chrome-extension/src/background/index.ts' and save to reload.");
