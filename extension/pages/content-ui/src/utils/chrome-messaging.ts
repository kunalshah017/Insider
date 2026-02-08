/**
 * Chrome Extension Messaging Utilities
 *
 * Provides safe message passing between content scripts and background script
 * with automatic retry logic and graceful error handling for context invalidation.
 */

/**
 * Check if the extension context is still valid
 * This can become invalid if the extension is reloaded/updated while the page is open
 */
export function isExtensionContextValid(): boolean {
  try {
    return typeof chrome?.runtime?.id === 'string' && chrome.runtime.id.length > 0;
  } catch {
    return false;
  }
}

/**
 * Error thrown when the extension context has been invalidated
 * User needs to refresh the page to reconnect
 */
export class ExtensionContextError extends Error {
  constructor() {
    super('Extension context invalidated. Please refresh the page to reconnect.');
    this.name = 'ExtensionContextError';
  }
}

export interface SafeMessageResponse<T> {
  data?: T;
  error?: string;
}

/**
 * Safely send a message to the background script with retry logic
 *
 * Handles:
 * - Extension context invalidation (extension reloaded/updated)
 * - Service worker termination (transient, retries automatically)
 * - Message port closure
 *
 * @param message The message to send to the background script
 * @param retries Number of retries for transient errors (default: 2)
 * @returns Promise with response data or error
 */
export async function safeSendMessage<T>(
  message: Record<string, unknown>,
  retries = 2,
): Promise<SafeMessageResponse<T>> {
  // Check if extension context is valid before attempting to send
  if (!isExtensionContextValid()) {
    return { error: 'Extension context invalidated. Please refresh the page to reconnect.' };
  }

  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(message, async (response: SafeMessageResponse<T>) => {
        if (chrome.runtime.lastError) {
          const errorMessage = chrome.runtime.lastError.message || '';
          console.error('[Insider] Chrome runtime error:', errorMessage);

          // Check for extension context invalidation
          if (errorMessage.includes('Extension context invalidated') || errorMessage.includes('message port closed')) {
            resolve({ error: 'Extension context invalidated. Please refresh the page to reconnect.' });
            return;
          }

          // Retry for transient errors (service worker waking up)
          if (retries > 0 && errorMessage.includes('Receiving end does not exist')) {
            console.log('[Insider] Background not ready, retrying in 500ms...');
            await new Promise(r => setTimeout(r, 500));
            const result = await safeSendMessage<T>(message, retries - 1);
            resolve(result);
            return;
          }

          resolve({ error: errorMessage || 'Failed to communicate with extension' });
          return;
        }
        resolve(response || { error: 'No response from background' });
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';

      // Check for context invalidation in caught error
      if (errorMessage.includes('Extension context invalidated')) {
        resolve({ error: 'Extension context invalidated. Please refresh the page to reconnect.' });
        return;
      }

      resolve({ error: errorMessage });
    }
  });
}

/**
 * Check if an error is due to extension context invalidation
 */
export function isContextInvalidatedError(error: unknown): boolean {
  if (error instanceof ExtensionContextError) return true;

  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Extension context invalidated') || message.includes('message port closed');
}
