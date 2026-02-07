import 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';

const GAMMA_API_URL = 'https://gamma-api.polymarket.com';
const CLOB_API_URL = 'https://clob.polymarket.com';

/**
 * Message types for communication between content script and background
 */
type MessageType =
  | { type: 'FETCH_EVENT'; slug: string }
  | { type: 'FETCH_MARKET'; slug: string }
  | { type: 'FETCH_PRICE'; tokenId: string; side: 'buy' | 'sell' }
  | { type: 'FETCH_ORDERBOOK'; tokenId: string };

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
