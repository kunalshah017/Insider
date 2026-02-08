import 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';
import type { TradingSession, OrderParams } from '@extension/shared/lib/polymarket/session-types';
import { CEB_SERVER_URL, CEB_CLOB_API_URL, CEB_GAMMA_API_URL, CEB_DATA_API_URL } from '@extension/env';

const GAMMA_API_URL = CEB_GAMMA_API_URL;
const CLOB_API_URL = CEB_CLOB_API_URL;
const DATA_API_URL = CEB_DATA_API_URL;
const SERVER_URL = CEB_SERVER_URL;
const SESSION_STORAGE_KEY = 'insider_trading_session';
const LOCAL_ORDERS_KEY = 'insider_local_orders';

interface LocalOrder {
  id: string;
  tokenId: string;
  side: string;
  price: string;
  size: string;
  status: 'live' | 'cancelled' | 'filled';
  createdAt: string;
  makerAmount: string;
  takerAmount: string;
}

/**
 * Decode URL-safe base64 to standard base64
 * Polymarket API secrets use URL-safe base64 (- and _ instead of + and /)
 */
function base64UrlToBase64(base64url: string): string {
  // Replace URL-safe characters with standard base64 characters
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }

  return base64;
}

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

  // Decode base64 secret (handle URL-safe base64)
  const standardBase64 = base64UrlToBase64(secret);
  const secretBytes = Uint8Array.from(atob(standardBase64), c => c.charCodeAt(0));

  // Create HMAC key
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  // Sign the message
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));

  // Convert to URL-safe base64 (required by Polymarket)
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64Sig = btoa(binary);
  // Convert to URL-safe base64: '+' -> '-', '/' -> '_'
  return base64Sig.replace(/\+/g, '-').replace(/\//g, '_');
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
  | { type: 'GET_SAFE_BALANCE'; safeAddress: string }
  | { type: 'FETCH_OPEN_ORDERS' }
  | { type: 'FETCH_TRADE_HISTORY' }
  | { type: 'GET_LOCAL_ORDERS' }
  | { type: 'CANCEL_ORDER'; orderId: string }
  | { type: 'CANCEL_ALL_ORDERS' }
  | { type: 'FETCH_POSITIONS' }
  | {
      type: 'SELL_SHARES';
      tokenId: string;
      size: string;
      price: string;
      negRisk?: boolean;
    }
  | {
      type: 'REDEEM_POSITION';
      conditionId: string;
      negRisk?: boolean;
    }
  | { type: 'RESOLVE_TCO_LINK'; url: string };

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
            // salt must be a number in JSON (not a string), side is string "BUY"/"SELL"
            // owner should be the API key, not the wallet address
            const orderPayload = {
              order: {
                salt: parseInt(signedOrder.salt, 10), // Must be number in JSON
                maker: signedOrder.maker,
                signer: signedOrder.signer,
                taker: signedOrder.taker,
                tokenId: signedOrder.tokenId,
                makerAmount: signedOrder.makerAmount,
                takerAmount: signedOrder.takerAmount,
                expiration: signedOrder.expiration,
                nonce: signedOrder.nonce,
                feeRateBps: signedOrder.feeRateBps,
                side: signedOrder.side, // String: "BUY" or "SELL"
                signatureType: signedOrder.signatureType,
                signature: signedOrder.signature,
              },
              owner: credentials.apiKey, // API key, not wallet address
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

            // Store order locally for tracking
            if (data.orderID) {
              const localOrder: LocalOrder = {
                id: data.orderID,
                tokenId: signedOrder.tokenId,
                side: signedOrder.side,
                price: (parseInt(signedOrder.makerAmount) / parseInt(signedOrder.takerAmount)).toFixed(4),
                size: (parseInt(signedOrder.takerAmount) / 1e6).toFixed(2),
                status: 'live',
                createdAt: new Date().toISOString(),
                makerAmount: signedOrder.makerAmount,
                takerAmount: signedOrder.takerAmount,
              };

              const stored = await chrome.storage.local.get(LOCAL_ORDERS_KEY);
              const orders: LocalOrder[] = stored[LOCAL_ORDERS_KEY] || [];
              orders.unshift(localOrder); // Add to beginning
              // Keep only last 50 orders
              if (orders.length > 50) orders.pop();
              await chrome.storage.local.set({ [LOCAL_ORDERS_KEY]: orders });
            }

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

        case 'GET_LOCAL_ORDERS': {
          // Get locally stored orders
          try {
            const stored = await chrome.storage.local.get(LOCAL_ORDERS_KEY);
            const orders: LocalOrder[] = stored[LOCAL_ORDERS_KEY] || [];
            sendResponse({ data: orders });
          } catch (error) {
            sendResponse({ error: String(error) });
          }
          break;
        }

        case 'FETCH_TRADE_HISTORY': {
          // Fetch trade history for the user
          try {
            const sessionResult = await chrome.storage.local.get(SESSION_STORAGE_KEY);
            const session = sessionResult[SESSION_STORAGE_KEY] as any;

            if (!session) {
              sendResponse({ error: 'No trading session' });
              return;
            }

            // Handle both old format (walletAddress, apiKey) and new format (eoaAddress, apiCredentials)
            const address = session.eoaAddress || session.walletAddress;
            const apiKey = session.apiCredentials?.key || session.apiKey;
            const apiSecret = session.apiCredentials?.secret || session.apiSecret;
            const passphrase = session.apiCredentials?.passphrase || session.passphrase;

            if (!address || !apiKey || !apiSecret || !passphrase) {
              sendResponse({ error: 'Incomplete trading session' });
              return;
            }

            const requestPath = '/data/trades';
            const method = 'GET';

            // Build L2 headers
            const l2Headers = await buildL2Headers(address, apiKey, apiSecret, passphrase, method, requestPath);

            // Fetch trades from CLOB API
            const response = await fetch(`${CLOB_API_URL}${requestPath}?maker_address=${address}`, {
              method,
              headers: {
                'Content-Type': 'application/json',
                ...l2Headers,
              },
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error('[Insider Background] Failed to fetch trades:', response.status, errorText);
              sendResponse({ error: `HTTP ${response.status}` });
              return;
            }

            const data = await response.json();
            console.log('[Insider Background] Fetched trades:', data);
            // API returns { data: [...], next_cursor, count }, extract the data array
            sendResponse({ data: data.data || [] });
          } catch (error) {
            console.error('[Insider Background] Error fetching trades:', error);
            sendResponse({ error: String(error) });
          }
          break;
        }

        case 'FETCH_OPEN_ORDERS': {
          // Fetch open orders for the user
          try {
            const sessionResult = await chrome.storage.local.get(SESSION_STORAGE_KEY);
            const session = sessionResult[SESSION_STORAGE_KEY] as any;

            if (!session) {
              sendResponse({ error: 'No trading session' });
              return;
            }

            // Handle both old format (walletAddress, apiKey) and new format (eoaAddress, apiCredentials)
            const address = session.eoaAddress || session.walletAddress;
            const apiKey = session.apiCredentials?.key || session.apiKey;
            const apiSecret = session.apiCredentials?.secret || session.apiSecret;
            const passphrase = session.apiCredentials?.passphrase || session.passphrase;

            if (!address || !apiKey || !apiSecret || !passphrase) {
              console.error('[Insider Background] Missing credentials:', {
                address: !!address,
                apiKey: !!apiKey,
                apiSecret: !!apiSecret,
                passphrase: !!passphrase,
              });
              sendResponse({ error: 'Incomplete trading session' });
              return;
            }

            const requestPath = '/data/orders';
            const method = 'GET';

            // Build L2 headers
            const l2Headers = await buildL2Headers(address, apiKey, apiSecret, passphrase, method, requestPath);

            // Fetch orders from CLOB API
            const response = await fetch(`${CLOB_API_URL}${requestPath}?maker_address=${address}`, {
              method,
              headers: {
                'Content-Type': 'application/json',
                ...l2Headers,
              },
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error('[Insider Background] Failed to fetch orders:', response.status, errorText);
              sendResponse({ error: `HTTP ${response.status}` });
              return;
            }

            const responseData = await response.json();
            console.log('[Insider Background] Fetched orders:', responseData);
            // Extract the orders array from the response (API returns {data: [...], next_cursor, ...})
            const orders = Array.isArray(responseData.data) ? responseData.data : responseData;
            sendResponse({ data: orders });
          } catch (error) {
            console.error('[Insider Background] Error fetching orders:', error);
            sendResponse({ error: String(error) });
          }
          break;
        }

        case 'CANCEL_ORDER': {
          // Cancel a specific order
          try {
            const sessionResult = await chrome.storage.local.get(SESSION_STORAGE_KEY);
            const session = sessionResult[SESSION_STORAGE_KEY] as any;

            if (!session) {
              sendResponse({ error: 'No trading session' });
              return;
            }

            // Handle both old format (walletAddress, apiKey) and new format (eoaAddress, apiCredentials)
            const address = session.eoaAddress || session.walletAddress;
            const apiKey = session.apiCredentials?.key || session.apiKey;
            const apiSecret = session.apiCredentials?.secret || session.apiSecret;
            const passphrase = session.apiCredentials?.passphrase || session.passphrase;

            if (!address || !apiKey || !apiSecret || !passphrase) {
              sendResponse({ error: 'Incomplete trading session' });
              return;
            }

            const requestPath = '/order';
            const method = 'DELETE';
            const bodyObj = { orderID: message.orderId };
            const bodyStr = JSON.stringify(bodyObj);

            // Build L2 headers
            const l2Headers = await buildL2Headers(
              address,
              apiKey,
              apiSecret,
              passphrase,
              method,
              requestPath,
              bodyStr,
            );

            // Send cancel request to CLOB API
            const response = await fetch(`${CLOB_API_URL}${requestPath}`, {
              method,
              headers: {
                'Content-Type': 'application/json',
                ...l2Headers,
              },
              body: bodyStr,
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error('[Insider Background] Failed to cancel order:', response.status, errorText);
              sendResponse({ error: `HTTP ${response.status}` });
              return;
            }

            const data = await response.json();
            console.log('[Insider Background] Order cancelled:', data);

            // Update local order status
            const stored = await chrome.storage.local.get(LOCAL_ORDERS_KEY);
            const orders: LocalOrder[] = stored[LOCAL_ORDERS_KEY] || [];
            const updatedOrders = orders.map(o =>
              o.id === message.orderId ? { ...o, status: 'cancelled' as const } : o,
            );
            await chrome.storage.local.set({ [LOCAL_ORDERS_KEY]: updatedOrders });

            sendResponse({ data });
          } catch (error) {
            console.error('[Insider Background] Error cancelling order:', error);
            sendResponse({ error: String(error) });
          }
          break;
        }

        case 'CANCEL_ALL_ORDERS': {
          // Cancel all orders
          try {
            const sessionResult = await chrome.storage.local.get(SESSION_STORAGE_KEY);
            const session = sessionResult[SESSION_STORAGE_KEY] as any;

            if (!session) {
              sendResponse({ error: 'No trading session' });
              return;
            }

            // Handle both old format (walletAddress, apiKey) and new format (eoaAddress, apiCredentials)
            const address = session.eoaAddress || session.walletAddress;
            const apiKey = session.apiCredentials?.key || session.apiKey;
            const apiSecret = session.apiCredentials?.secret || session.apiSecret;
            const passphrase = session.apiCredentials?.passphrase || session.passphrase;

            if (!address || !apiKey || !apiSecret || !passphrase) {
              sendResponse({ error: 'Incomplete trading session' });
              return;
            }

            const requestPath = '/cancel-all';
            const method = 'DELETE';

            // Build L2 headers (no body for cancel-all)
            const l2Headers = await buildL2Headers(address, apiKey, apiSecret, passphrase, method, requestPath);

            // Send cancel request to CLOB API
            const response = await fetch(`${CLOB_API_URL}${requestPath}`, {
              method,
              headers: {
                'Content-Type': 'application/json',
                ...l2Headers,
              },
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error('[Insider Background] Failed to cancel all orders:', response.status, errorText);
              sendResponse({ error: `HTTP ${response.status}` });
              return;
            }

            const data = await response.json();
            console.log('[Insider Background] All orders cancelled:', data);

            // Update all local orders to cancelled
            const stored = await chrome.storage.local.get(LOCAL_ORDERS_KEY);
            const orders: LocalOrder[] = stored[LOCAL_ORDERS_KEY] || [];
            const updatedOrders = orders.map(o => (o.status === 'live' ? { ...o, status: 'cancelled' as const } : o));
            await chrome.storage.local.set({ [LOCAL_ORDERS_KEY]: updatedOrders });

            sendResponse({ data });
          } catch (error) {
            console.error('[Insider Background] Error cancelling all orders:', error);
            sendResponse({ error: String(error) });
          }
          break;
        }

        case 'FETCH_POSITIONS': {
          // Fetch user positions/holdings from Data API
          try {
            const sessionResult = await chrome.storage.local.get(SESSION_STORAGE_KEY);
            const session = sessionResult[SESSION_STORAGE_KEY] as any;

            if (!session) {
              sendResponse({ error: 'No trading session' });
              return;
            }

            // Get the safe/proxy address (positions are held by safe wallet)
            const safeAddress = session.safeAddress || session.proxyAddress;
            const eoaAddress = session.eoaAddress || session.walletAddress;
            const address = safeAddress || eoaAddress;

            if (!address) {
              sendResponse({ error: 'No wallet address' });
              return;
            }

            // Data API is public, no auth required for reading positions
            const response = await fetch(`${DATA_API_URL}/positions?user=${address}&sizeThreshold=0.01`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error('[Insider Background] Failed to fetch positions:', response.status, errorText);
              sendResponse({ error: `HTTP ${response.status}` });
              return;
            }

            const data = await response.json();
            console.log('[Insider Background] Fetched positions:', data);
            sendResponse({ data: data || [] });
          } catch (error) {
            console.error('[Insider Background] Error fetching positions:', error);
            sendResponse({ error: String(error) });
          }
          break;
        }

        case 'SELL_SHARES': {
          // Sell order requires MetaMask signing via content script
          // This handler routes the request to an active tab with our content script
          try {
            const {
              tokenId,
              size,
              price,
              negRisk = false,
            } = message as {
              tokenId: string;
              size: string;
              price: string;
              negRisk?: boolean;
            };

            if (!tokenId || !size || !price) {
              sendResponse({ error: 'Missing required parameters: tokenId, size, price' });
              return;
            }

            const sessionResult = await chrome.storage.local.get(SESSION_STORAGE_KEY);
            const session = sessionResult[SESSION_STORAGE_KEY] as TradingSession;

            if (!session) {
              sendResponse({ error: 'No trading session. Please connect wallet on Twitter first.' });
              return;
            }

            // Support both old (walletAddress) and new (eoaAddress) session formats
            const walletAddress = session.eoaAddress || (session as any).walletAddress;
            if (!walletAddress) {
              sendResponse({ error: 'No wallet address in session' });
              return;
            }

            // Get API credentials - support both old and new formats
            const apiKey = session.apiCredentials?.key || (session as any).apiKey;
            const apiSecret = session.apiCredentials?.secret || (session as any).apiSecret;
            const passphrase = session.apiCredentials?.passphrase || (session as any).passphrase;

            if (!apiKey || !apiSecret || !passphrase) {
              sendResponse({ error: 'No API credentials in session. Please reconnect wallet.' });
              return;
            }

            console.log('[Insider Background] Sell order requested, routing to content script for signing...');

            // Find an active tab to route the signing request
            // Try to find a tab with our content script (twitter.com or x.com)
            const tabs = await chrome.tabs.query({ url: ['*://*.twitter.com/*', '*://*.x.com/*'] });

            if (tabs.length === 0) {
              sendResponse({
                error:
                  'Please open Twitter/X in a tab to sign the sell order. MetaMask signing requires an active web page.',
              });
              return;
            }

            const activeTab = tabs[0];
            if (!activeTab.id) {
              sendResponse({ error: 'No valid tab found for signing' });
              return;
            }

            // Send signing request to content script
            console.log('[Insider Background] Sending sign request to tab:', activeTab.id);

            try {
              const signResult = await chrome.tabs.sendMessage(activeTab.id, {
                type: 'SIGN_SELL_ORDER',
                tokenId,
                size: parseFloat(size),
                price: parseFloat(price),
                negRisk,
                walletAddress,
                session: {
                  apiKey,
                  apiSecret,
                  passphrase,
                },
              });

              if (signResult.error) {
                sendResponse({ error: signResult.error });
                return;
              }

              console.log('[Insider Background] Sell order signed and submitted:', signResult);

              // Store locally for tracking
              if (signResult.data?.orderID) {
                const stored = await chrome.storage.local.get(LOCAL_ORDERS_KEY);
                const orders: LocalOrder[] = stored[LOCAL_ORDERS_KEY] || [];
                const newOrder: LocalOrder = {
                  id: signResult.data.orderID,
                  tokenId,
                  side: 'SELL',
                  price,
                  size,
                  status: 'live',
                  createdAt: new Date().toISOString(),
                  makerAmount: signResult.data.makerAmount || '0',
                  takerAmount: signResult.data.takerAmount || '0',
                };
                orders.unshift(newOrder);
                await chrome.storage.local.set({ [LOCAL_ORDERS_KEY]: orders });
              }

              sendResponse({ data: signResult.data });
            } catch (tabError) {
              console.error('[Insider Background] Error communicating with content script:', tabError);
              sendResponse({
                error: 'Could not connect to Twitter page. Please refresh Twitter and try again.',
              });
            }
          } catch (error) {
            console.error('[Insider Background] Error placing sell order:', error);
            sendResponse({ error: String(error) });
          }
          break;
        }

        case 'REDEEM_POSITION': {
          // Redeem winning tokens via CTF contract
          try {
            const { conditionId, negRisk = false } = message as {
              type: 'REDEEM_POSITION';
              conditionId: string;
              negRisk?: boolean;
            };

            if (!conditionId) {
              sendResponse({ error: 'Missing required parameter: conditionId' });
              return;
            }

            const sessionResult = await chrome.storage.local.get(SESSION_STORAGE_KEY);
            const session = sessionResult[SESSION_STORAGE_KEY] as TradingSession;

            if (!session) {
              sendResponse({ error: 'No trading session. Please connect wallet on Twitter first.' });
              return;
            }

            // Support both old (walletAddress) and new (eoaAddress) session formats
            const walletAddress = session.eoaAddress || (session as any).walletAddress;
            if (!walletAddress) {
              sendResponse({ error: 'No wallet address in session' });
              return;
            }

            console.log('[Insider Background] Redeem position requested, routing to content script...');

            // Find an active tab to route the redeem request
            const tabs = await chrome.tabs.query({ url: ['*://*.twitter.com/*', '*://*.x.com/*'] });

            if (tabs.length === 0) {
              sendResponse({
                error: 'Please open Twitter/X in a tab to redeem. MetaMask transaction requires an active web page.',
              });
              return;
            }

            const activeTab = tabs[0];
            if (!activeTab.id) {
              sendResponse({ error: 'No valid tab found for redemption' });
              return;
            }

            // Send redeem request to content script
            console.log('[Insider Background] Sending redeem request to tab:', activeTab.id);

            try {
              const redeemResult = await chrome.tabs.sendMessage(activeTab.id, {
                type: 'SIGN_REDEEM_POSITION',
                conditionId,
                negRisk,
                walletAddress,
              });

              if (redeemResult.error) {
                sendResponse({ error: redeemResult.error });
                return;
              }

              console.log('[Insider Background] Redeem transaction completed:', redeemResult);
              sendResponse({ data: redeemResult.data });
            } catch (tabError) {
              console.error('[Insider Background] Error communicating with content script:', tabError);
              sendResponse({
                error: 'Could not connect to Twitter page. Please refresh Twitter and try again.',
              });
            }
          } catch (error) {
            console.error('[Insider Background] Error redeeming position:', error);
            sendResponse({ error: String(error) });
          }
          break;
        }

        case 'RESOLVE_TCO_LINK': {
          // Resolve t.co shortened URLs by following redirects
          try {
            const { url } = message as { type: 'RESOLVE_TCO_LINK'; url: string };
            console.log('[Insider Background] Resolving t.co link:', url);

            // First try with redirect: 'manual' to capture the Location header
            try {
              const manualResponse = await fetch(url, {
                method: 'GET',
                redirect: 'manual',
              });

              // Check for redirect in Location header
              const location = manualResponse.headers.get('Location');
              if (location) {
                console.log('[Insider Background] Got redirect Location:', location);
                // If it's another redirect (like to polymarket), follow it
                if (location.includes('polymarket.com')) {
                  sendResponse({ data: { resolvedUrl: location } });
                  break;
                }
                // Follow the next redirect
                const nextResponse = await fetch(location, {
                  method: 'GET',
                  redirect: 'follow',
                });
                if (nextResponse.url && nextResponse.url.includes('polymarket.com')) {
                  console.log('[Insider Background] Final URL:', nextResponse.url);
                  sendResponse({ data: { resolvedUrl: nextResponse.url } });
                  break;
                }
              }
            } catch (manualErr) {
              console.log('[Insider Background] Manual redirect failed:', manualErr);
            }

            // Fallback: try following redirects automatically
            const response = await fetch(url, {
              method: 'GET',
              redirect: 'follow',
            });

            console.log('[Insider Background] Response URL:', response.url);
            console.log('[Insider Background] Response status:', response.status);

            // The final URL after redirects
            if (response.url && response.url !== url) {
              console.log('[Insider Background] Resolved to:', response.url);
              sendResponse({ data: { resolvedUrl: response.url } });
            } else {
              // Try to extract URL from page content (t.co sometimes uses JS redirects)
              const text = await response.text();
              const urlMatch =
                text.match(/URL=([^"'\s>]+)/i) ||
                text.match(/href="([^"]+polymarket[^"]+)"/i) ||
                text.match(/location\.href\s*=\s*["']([^"']+polymarket[^"']+)["']/i);
              if (urlMatch && urlMatch[1]) {
                console.log('[Insider Background] Extracted URL from content:', urlMatch[1]);
                sendResponse({ data: { resolvedUrl: urlMatch[1] } });
              } else {
                console.log('[Insider Background] Could not resolve URL, page content length:', text.length);
                sendResponse({ error: 'Could not resolve URL' });
              }
            }
          } catch (error) {
            console.error('[Insider Background] Error resolving t.co link:', error);
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
