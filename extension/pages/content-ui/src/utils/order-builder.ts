/**
 * Order Builder Utilities for Polymarket
 *
 * Builds order structures and EIP-712 typed data for signing orders via MetaMask.
 * Based on Polymarket's order-utils and clob-client implementations.
 */

// Polygon Mainnet CTF Exchange contract addresses
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK_CTF_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a';

// Signature types
export enum SignatureType {
  EOA = 0,
  POLY_PROXY = 1,
  POLY_GNOSIS_SAFE = 2,
}

export interface UserOrder {
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  feeRateBps?: number;
  nonce?: number;
  expiration?: number;
}

export interface OrderData {
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  side: 'BUY' | 'SELL';
  expiration: string;
  nonce: string;
  feeRateBps: string;
  signatureType: number;
}

export interface SignedOrder extends OrderData {
  signature: string;
}

// Rounding configurations for different tick sizes
const ROUNDING_CONFIG: Record<string, { price: number; size: number; amount: number }> = {
  '0.1': { price: 1, size: 2, amount: 3 },
  '0.01': { price: 2, size: 2, amount: 4 },
  '0.001': { price: 3, size: 2, amount: 5 },
  '0.0001': { price: 4, size: 2, amount: 6 },
};

/**
 * Generate a random salt for the order
 */
function generateSalt(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  let hex = '';
  for (let i = 0; i < randomBytes.length; i++) {
    hex += randomBytes[i].toString(16).padStart(2, '0');
  }
  return BigInt('0x' + hex).toString();
}

/**
 * Round a number to specified decimal places
 */
function roundDown(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.floor(value * factor) / factor;
}

/**
 * Calculate maker and taker amounts based on order parameters
 */
function calculateAmounts(
  side: 'BUY' | 'SELL',
  size: number,
  price: number,
  tickSize: string,
): { makerAmount: string; takerAmount: string } {
  const config = ROUNDING_CONFIG[tickSize] || ROUNDING_CONFIG['0.01'];

  // Round values
  const roundedPrice = roundDown(price, config.price);
  const roundedSize = roundDown(size, config.size);

  // Calculate raw amounts (in wei-like units, 6 decimals for USDC)
  const DECIMALS = 6;
  const SCALE = Math.pow(10, DECIMALS);

  if (side === 'BUY') {
    // Buying outcome tokens: pay USDC (makerAmount), receive tokens (takerAmount)
    const takerAmount = Math.round(roundedSize * SCALE); // tokens to receive
    const makerAmount = Math.round(roundedSize * roundedPrice * SCALE); // USDC to pay
    return {
      makerAmount: makerAmount.toString(),
      takerAmount: takerAmount.toString(),
    };
  } else {
    // Selling outcome tokens: pay tokens (makerAmount), receive USDC (takerAmount)
    const makerAmount = Math.round(roundedSize * SCALE); // tokens to pay
    const takerAmount = Math.round(roundedSize * roundedPrice * SCALE); // USDC to receive
    return {
      makerAmount: makerAmount.toString(),
      takerAmount: takerAmount.toString(),
    };
  }
}

/**
 * Build order data structure for signing
 */
export function buildOrderData(
  userOrder: UserOrder,
  maker: string,
  signer: string,
  tickSize: string = '0.01',
  signatureType: SignatureType = SignatureType.EOA,
): OrderData {
  const { makerAmount, takerAmount } = calculateAmounts(userOrder.side, userOrder.size, userOrder.price, tickSize);

  return {
    salt: generateSalt(),
    maker: maker,
    signer: signer,
    taker: '0x0000000000000000000000000000000000000000', // Open order (anyone can fill)
    tokenId: userOrder.tokenId,
    makerAmount,
    takerAmount,
    side: userOrder.side,
    expiration: (userOrder.expiration || 0).toString(),
    nonce: (userOrder.nonce || 0).toString(),
    feeRateBps: (userOrder.feeRateBps || 0).toString(),
    signatureType,
  };
}

/**
 * Build EIP-712 typed data for order signing
 * This is what MetaMask will sign
 */
export function buildOrderTypedData(order: OrderData, negRisk: boolean = false) {
  const exchangeAddress = negRisk ? NEG_RISK_CTF_EXCHANGE : CTF_EXCHANGE;

  // Side enum: BUY = 0, SELL = 1
  const sideValue = order.side === 'BUY' ? 0 : 1;

  return {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Order: [
        { name: 'salt', type: 'uint256' },
        { name: 'maker', type: 'address' },
        { name: 'signer', type: 'address' },
        { name: 'taker', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
        { name: 'makerAmount', type: 'uint256' },
        { name: 'takerAmount', type: 'uint256' },
        { name: 'expiration', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'feeRateBps', type: 'uint256' },
        { name: 'side', type: 'uint8' },
        { name: 'signatureType', type: 'uint8' },
      ],
    },
    primaryType: 'Order',
    domain: {
      name: 'Polymarket CTF Exchange',
      version: '1',
      chainId: 137, // Polygon mainnet
      verifyingContract: exchangeAddress,
    },
    message: {
      salt: order.salt,
      maker: order.maker,
      signer: order.signer,
      taker: order.taker,
      tokenId: order.tokenId,
      makerAmount: order.makerAmount,
      takerAmount: order.takerAmount,
      expiration: order.expiration,
      nonce: order.nonce,
      feeRateBps: order.feeRateBps,
      side: sideValue,
      signatureType: order.signatureType,
    },
  };
}

/**
 * Convert signed order to the format expected by Polymarket CLOB API
 */
export function formatOrderForApi(signedOrder: SignedOrder, owner: string, orderType: 'GTC' | 'GTD' | 'FOK' = 'GTC') {
  return {
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
    owner,
    orderType,
  };
}

/**
 * Generate HMAC-SHA256 signature for L2 authentication
 */
export async function buildL2Signature(
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
export async function buildL2Headers(
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
