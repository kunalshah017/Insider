/**
 * Token utilities for USDC.e balance and approval checks
 *
 * Uses ethereum bridge to interact with ERC-20 contract
 */

// Contract addresses on Polygon mainnet
export const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
export const CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
export const NEG_RISK_CTF_EXCHANGE_ADDRESS = '0xC5d563A36AE78145C45a50134d48A1215220f80a';

export const USDC_DECIMALS = 6;
export const MAX_UINT256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

// ERC-20 function selectors
const BALANCE_OF_SELECTOR = '0x70a08231'; // balanceOf(address)
const ALLOWANCE_SELECTOR = '0xdd62ed3e'; // allowance(address,address)
const APPROVE_SELECTOR = '0x095ea7b3'; // approve(address,uint256)

/**
 * Encode address for contract call (pad to 32 bytes)
 */
function encodeAddress(address: string): string {
  return address.toLowerCase().replace('0x', '').padStart(64, '0');
}

/**
 * Encode uint256 for contract call (pad to 32 bytes)
 */
function encodeUint256(value: string): string {
  return value.replace('0x', '').padStart(64, '0');
}

/**
 * Parse hex balance to number with decimals
 */
function parseBalance(hexValue: string, decimals: number): number {
  const value = BigInt(hexValue);
  const divisor = BigInt(10 ** decimals);
  const integerPart = value / divisor;
  const fractionalPart = value % divisor;

  // Convert to number with precision
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  return parseFloat(`${integerPart}.${fractionalStr}`);
}

/**
 * Convert amount to raw units (e.g., 10.5 USDC -> 10500000)
 */
export function toRawAmount(amount: number, decimals: number = USDC_DECIMALS): bigint {
  return BigInt(Math.floor(amount * 10 ** decimals));
}

/**
 * Convert raw units to display amount (e.g., 10500000 -> 10.5 USDC)
 */
export function fromRawAmount(rawAmount: bigint | string, decimals: number = USDC_DECIMALS): number {
  const value = typeof rawAmount === 'string' ? BigInt(rawAmount) : rawAmount;
  return parseBalance('0x' + value.toString(16), decimals);
}

export interface TokenCheckResult {
  balance: number;
  rawBalance: bigint;
  allowance: number;
  rawAllowance: bigint;
  hasEnoughBalance: boolean;
  hasApproval: boolean;
  needsApproval: boolean;
}

/**
 * Check USDC.e balance for an address
 */
export async function checkBalance(
  address: string,
  ethCall: (to: string, data: string) => Promise<string>,
): Promise<{ balance: number; rawBalance: bigint }> {
  const data = BALANCE_OF_SELECTOR + encodeAddress(address);

  const result = await ethCall(USDC_E_ADDRESS, data);
  const rawBalance = BigInt(result);
  const balance = parseBalance(result, USDC_DECIMALS);

  return { balance, rawBalance };
}

/**
 * Check USDC.e allowance for CTF Exchange
 */
export async function checkAllowance(
  owner: string,
  spender: string,
  ethCall: (to: string, data: string) => Promise<string>,
): Promise<{ allowance: number; rawAllowance: bigint }> {
  const data = ALLOWANCE_SELECTOR + encodeAddress(owner) + encodeAddress(spender);

  const result = await ethCall(USDC_E_ADDRESS, data);
  const rawAllowance = BigInt(result);
  const allowance = parseBalance(result, USDC_DECIMALS);

  return { allowance, rawAllowance };
}

/**
 * Build approval transaction data
 */
export function buildApprovalData(spender: string, amount: string = MAX_UINT256): string {
  return APPROVE_SELECTOR + encodeAddress(spender) + encodeUint256(amount);
}

/**
 * Check if user can trade the specified amount
 */
export async function checkTradingRequirements(
  address: string,
  amount: number,
  negRisk: boolean,
  ethCall: (to: string, data: string) => Promise<string>,
): Promise<TokenCheckResult> {
  const spender = negRisk ? NEG_RISK_CTF_EXCHANGE_ADDRESS : CTF_EXCHANGE_ADDRESS;

  const [balanceResult, allowanceResult] = await Promise.all([
    checkBalance(address, ethCall),
    checkAllowance(address, spender, ethCall),
  ]);

  const requiredRaw = toRawAmount(amount);
  const hasEnoughBalance = balanceResult.rawBalance >= requiredRaw;
  const hasApproval = allowanceResult.rawAllowance >= requiredRaw;
  const needsApproval = !hasApproval;

  return {
    ...balanceResult,
    ...allowanceResult,
    hasEnoughBalance,
    hasApproval,
    needsApproval,
  };
}
