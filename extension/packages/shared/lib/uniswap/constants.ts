/**
 * Uniswap v4 constants for Polygon network
 * Used for swapping tokens to USDC.e for Polymarket trading
 */

// Re-export POLYGON_CHAIN_ID from polymarket for convenience
// Note: POLYGON_CHAIN_ID = 137 is already exported from polymarket module

// Uniswap v4 Contract Addresses on Polygon
export const UNISWAP_V4_ADDRESSES = {
  POOL_MANAGER: '0x67366782805870060151383f4bbff9dab53e5cd6',
  POSITION_DESCRIPTOR: '0x0892771f0c1b78ad6013d6e5536007e1c16e6794',
  POSITION_MANAGER: '0x1ec2ebf4f37e7363fdfe3551602425af0b3ceef9',
  QUOTER: '0xb3d5c3dfc3a7aebff71895a7191796bffc2c81b9',
  STATE_VIEW: '0x5ea1bd7974c8a611cbab0bdcafcb1d9cc9b3ba5a',
  UNIVERSAL_ROUTER: '0x1095692a6237d83c6a72f3f5efedb9a670c49223',
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
} as const;

// Common tokens on Polygon for swapping
export const POLYGON_TOKENS = {
  // Wrapped POL (formerly MATIC)
  WPOL: {
    address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    decimals: 18,
    symbol: 'WPOL',
    name: 'Wrapped POL',
  },
  // USDC.e (Bridged USDC) - This is what Polymarket uses
  USDC_E: {
    address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    decimals: 6,
    symbol: 'USDC.e',
    name: 'USD Coin (PoS)',
  },
  // Native USDC on Polygon
  USDC: {
    address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    decimals: 6,
    symbol: 'USDC',
    name: 'USD Coin',
  },
  // Wrapped ETH on Polygon
  WETH: {
    address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    decimals: 18,
    symbol: 'WETH',
    name: 'Wrapped Ether',
  },
  // DAI on Polygon
  DAI: {
    address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    decimals: 18,
    symbol: 'DAI',
    name: 'Dai Stablecoin',
  },
  // USDT on Polygon
  USDT: {
    address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    decimals: 6,
    symbol: 'USDT',
    name: 'Tether USD',
  },
} as const;

// Supported input tokens for swapping to USDC.e
// Supported input tokens for swapping to USDC.e (ERC20 tokens only)
export const SUPPORTED_SWAP_TOKENS = [
  POLYGON_TOKENS.WPOL,
  POLYGON_TOKENS.WETH,
  POLYGON_TOKENS.USDC,
  POLYGON_TOKENS.DAI,
  POLYGON_TOKENS.USDT,
] as const;

// Default slippage tolerance (0.5%)
export const DEFAULT_SLIPPAGE_TOLERANCE = 0.005;

// Default deadline (20 minutes from now)
export const DEFAULT_DEADLINE_MINUTES = 20;

// Minimum swap amount in USD
export const MIN_SWAP_AMOUNT_USD = 1;

// Pool fee tiers (in hundredths of a bip, i.e., 500 = 0.05%)
export const FEE_TIERS = {
  LOWEST: 100, // 0.01%
  LOW: 500, // 0.05%
  MEDIUM: 3000, // 0.3%
  HIGH: 10000, // 1%
} as const;

// Tick spacing for different fee tiers
export const TICK_SPACINGS: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
};

export type TokenInfo = (typeof POLYGON_TOKENS)[keyof typeof POLYGON_TOKENS];
