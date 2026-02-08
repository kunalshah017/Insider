/**
 * Trading session types for Insider extension
 */

export interface UserApiCredentials {
  key: string;
  secret: string;
  passphrase: string;
}

/**
 * TradingSession supports two formats for backward compatibility:
 * - New format: eoaAddress, apiCredentials (nested)
 * - Legacy format: walletAddress, apiKey/apiSecret/passphrase (flat)
 */
export interface TradingSession {
  // New format (preferred)
  eoaAddress?: string;
  safeAddress?: string;
  isSafeDeployed?: boolean;
  hasApiCredentials?: boolean;
  hasApprovals?: boolean;
  apiCredentials?: UserApiCredentials;
  lastChecked?: number;

  // Legacy format (for backward compatibility)
  walletAddress?: string;
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  isActive?: boolean;
  createdAt?: number;
}

/**
 * Helper to get wallet address from session (handles both formats)
 */
export function getSessionWalletAddress(session: TradingSession | null): string | null {
  if (!session) return null;
  return session.eoaAddress || session.walletAddress || null;
}

/**
 * Helper to get API credentials from session (handles both formats)
 */
export function getSessionApiCredentials(
  session: TradingSession | null,
): { apiKey: string; apiSecret: string; passphrase: string } | null {
  if (!session) return null;

  // Try new format first
  if (session.apiCredentials) {
    return {
      apiKey: session.apiCredentials.key,
      apiSecret: session.apiCredentials.secret,
      passphrase: session.apiCredentials.passphrase,
    };
  }

  // Fall back to legacy format
  if (session.apiKey && session.apiSecret && session.passphrase) {
    return {
      apiKey: session.apiKey,
      apiSecret: session.apiSecret,
      passphrase: session.passphrase,
    };
  }

  return null;
}

export type SessionStep =
  | 'idle'
  | 'connecting'
  | 'checking'
  | 'deploying'
  | 'credentials'
  | 'approvals'
  | 'complete'
  | 'error';

export interface SessionState {
  session: TradingSession | null;
  step: SessionStep;
  error: Error | null;
  isComplete: boolean;
}

/**
 * Order placement types
 */
export interface OrderParams {
  tokenId: string;
  side: 'BUY' | 'SELL';
  size: number;
  price?: number; // Optional for market orders
  isMarketOrder?: boolean;
  negRisk: boolean;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

/**
 * Message types for background script communication
 */
export type TradingMessageType =
  | 'GET_TRADING_SESSION'
  | 'INIT_TRADING_SESSION'
  | 'END_TRADING_SESSION'
  | 'CREATE_ORDER'
  | 'GET_SAFE_BALANCE'
  | 'CHECK_SESSION_STATUS';

export interface TradingMessage {
  type: TradingMessageType;
  payload?: unknown;
}

export interface GetTradingSessionResponse {
  session: TradingSession | null;
  isComplete: boolean;
}

export interface CreateOrderPayload {
  tokenId: string;
  side: 'BUY' | 'SELL';
  size: number;
  price?: number;
  isMarketOrder?: boolean;
  negRisk: boolean;
  tickSize: string;
}

export interface CreateOrderResponse {
  success: boolean;
  orderId?: string;
  error?: string;
}

export interface SafeBalanceResponse {
  usdce: string;
  formattedUsdce: string;
}
