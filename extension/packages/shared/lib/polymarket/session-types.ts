/**
 * Trading session types for Insider extension
 */

export interface UserApiCredentials {
  key: string;
  secret: string;
  passphrase: string;
}

export interface TradingSession {
  eoaAddress: string;
  safeAddress: string;
  isSafeDeployed: boolean;
  hasApiCredentials: boolean;
  hasApprovals: boolean;
  apiCredentials?: UserApiCredentials;
  lastChecked: number;
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
