/**
 * Uniswap v4 Integration Module
 *
 * Provides swap functionality for acquiring USDC.e on Polygon
 * to enable seamless Polymarket trading.
 *
 * Features:
 * - Get swap quotes for any supported token to USDC.e
 * - Execute swaps via Universal Router
 * - Handle Permit2 approvals
 * - Token balance checking
 */

export * from './constants.js';
export * from './swap-service.js';
