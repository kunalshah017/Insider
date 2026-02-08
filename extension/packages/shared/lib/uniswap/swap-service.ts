/**
 * Uniswap v4 Swap Service for Polygon
 *
 * Provides functionality to:
 * - Get swap quotes for any token to USDC.e
 * - Execute swaps using Universal Router
 * - Handle token approvals via Permit2
 *
 * This enables the "Agentic Finance" pattern where the extension
 * automatically helps users acquire USDC.e for Polymarket trading.
 */

import { ethers } from 'ethers';
import {
  UNISWAP_V4_ADDRESSES,
  POLYGON_TOKENS,
  DEFAULT_SLIPPAGE_TOLERANCE,
  DEFAULT_DEADLINE_MINUTES,
  FEE_TIERS,
  TICK_SPACINGS,
  type TokenInfo,
} from './constants.js';

// Quoter V2 ABI (minimal interface for quoting)
const QUOTER_ABI = [
  {
    inputs: [
      {
        components: [
          {
            components: [
              { internalType: 'address', name: 'currency0', type: 'address' },
              { internalType: 'address', name: 'currency1', type: 'address' },
              { internalType: 'uint24', name: 'fee', type: 'uint24' },
              { internalType: 'int24', name: 'tickSpacing', type: 'int24' },
              { internalType: 'address', name: 'hooks', type: 'address' },
            ],
            internalType: 'struct PoolKey',
            name: 'poolKey',
            type: 'tuple',
          },
          { internalType: 'bool', name: 'zeroForOne', type: 'bool' },
          { internalType: 'uint128', name: 'exactAmount', type: 'uint128' },
          { internalType: 'bytes', name: 'hookData', type: 'bytes' },
        ],
        internalType: 'struct IV4Quoter.QuoteExactSingleParams',
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'quoteExactInputSingle',
    outputs: [
      { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
      { internalType: 'uint256', name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          {
            components: [
              { internalType: 'address', name: 'currency0', type: 'address' },
              { internalType: 'address', name: 'currency1', type: 'address' },
              { internalType: 'uint24', name: 'fee', type: 'uint24' },
              { internalType: 'int24', name: 'tickSpacing', type: 'int24' },
              { internalType: 'address', name: 'hooks', type: 'address' },
            ],
            internalType: 'struct PoolKey',
            name: 'poolKey',
            type: 'tuple',
          },
          { internalType: 'bool', name: 'zeroForOne', type: 'bool' },
          { internalType: 'uint128', name: 'exactAmount', type: 'uint128' },
          { internalType: 'bytes', name: 'hookData', type: 'bytes' },
        ],
        internalType: 'struct IV4Quoter.QuoteExactSingleParams',
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'quoteExactOutputSingle',
    outputs: [
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'uint256', name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

// Universal Router ABI (minimal interface for swapping)
const UNIVERSAL_ROUTER_ABI = [
  {
    inputs: [
      { internalType: 'bytes', name: 'commands', type: 'bytes' },
      { internalType: 'bytes[]', name: 'inputs', type: 'bytes[]' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
    ],
    name: 'execute',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
];

// Permit2 ABI (minimal interface for approvals)
const PERMIT2_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint160', name: 'amount', type: 'uint160' },
      { internalType: 'uint48', name: 'expiration', type: 'uint48' },
    ],
    name: 'approve',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [
      { internalType: 'uint160', name: 'amount', type: 'uint160' },
      { internalType: 'uint48', name: 'expiration', type: 'uint48' },
      { internalType: 'uint48', name: 'nonce', type: 'uint48' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

// ERC20 ABI (minimal interface)
const ERC20_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
];

export interface SwapQuote {
  inputToken: TokenInfo;
  outputToken: TokenInfo;
  inputAmount: string;
  outputAmount: string;
  inputAmountFormatted: string;
  outputAmountFormatted: string;
  exchangeRate: number;
  priceImpact: number;
  gasEstimate: string;
  route: string;
  minimumReceived: string;
  slippageTolerance: number;
}

export interface SwapParams {
  inputToken: TokenInfo;
  inputAmount: string;
  slippageTolerance?: number;
  deadline?: number;
}

export interface TokenBalance {
  token: TokenInfo;
  balance: string;
  balanceFormatted: string;
}

/**
 * Sort tokens to determine currency0 and currency1 for pool key
 * In Uniswap v4, currency0 must be the smaller address
 */
function sortTokens(tokenA: string, tokenB: string): { currency0: string; currency1: string; zeroForOne: boolean } {
  const addressA = tokenA.toLowerCase();
  const addressB = tokenB.toLowerCase();

  if (addressA < addressB) {
    return { currency0: tokenA, currency1: tokenB, zeroForOne: true };
  } else {
    return { currency0: tokenB, currency1: tokenA, zeroForOne: false };
  }
}

/**
 * Get swap quote for exchanging a token to USDC.e
 */
export async function getSwapQuote(
  provider: ethers.providers.Provider,
  inputToken: TokenInfo,
  inputAmount: string,
  slippageTolerance: number = DEFAULT_SLIPPAGE_TOLERANCE,
): Promise<SwapQuote | null> {
  try {
    const quoter = new ethers.Contract(UNISWAP_V4_ADDRESSES.QUOTER, QUOTER_ABI, provider);

    const outputToken = POLYGON_TOKENS.USDC_E;
    const inputAmountBN = ethers.utils.parseUnits(inputAmount, inputToken.decimals);

    // Sort tokens to get correct pool key
    const { currency0, currency1, zeroForOne } = sortTokens(inputToken.address, outputToken.address);

    // Try different fee tiers to find the best quote
    const feeTiers = [FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.LOWEST, FEE_TIERS.HIGH];
    let bestQuote: { amountOut: ethers.BigNumber; gasEstimate: ethers.BigNumber; fee: number } | null = null;

    for (const fee of feeTiers) {
      try {
        const tickSpacing = TICK_SPACINGS[fee] || 10;

        const poolKey = {
          currency0,
          currency1,
          fee,
          tickSpacing,
          hooks: ethers.constants.AddressZero, // No hooks for standard swaps
        };

        const params = {
          poolKey,
          zeroForOne,
          exactAmount: inputAmountBN,
          hookData: '0x',
        };

        // Use callStatic to simulate without executing
        const [amountOut, gasEstimate] = await quoter.callStatic.quoteExactInputSingle(params);

        if (!bestQuote || amountOut.gt(bestQuote.amountOut)) {
          bestQuote = { amountOut, gasEstimate, fee };
        }
      } catch (err) {
        // Pool doesn't exist for this fee tier, try next
        console.log(`[Uniswap] No pool found for fee tier ${fee}`);
        continue;
      }
    }

    if (!bestQuote) {
      console.error('[Uniswap] No valid pool found for swap');
      return null;
    }

    const outputAmountFormatted = ethers.utils.formatUnits(bestQuote.amountOut, outputToken.decimals);
    const inputAmountNum = parseFloat(inputAmount);
    const outputAmountNum = parseFloat(outputAmountFormatted);

    // Calculate minimum received after slippage
    const minimumReceivedBN = bestQuote.amountOut.mul(Math.floor((1 - slippageTolerance) * 10000)).div(10000);

    const minimumReceived = ethers.utils.formatUnits(minimumReceivedBN, outputToken.decimals);

    // Calculate exchange rate and approximate price impact
    const exchangeRate = outputAmountNum / inputAmountNum;

    // Price impact estimation (simplified - would need more data for accurate calculation)
    const priceImpact = 0; // TODO: Calculate from pool state

    return {
      inputToken,
      outputToken,
      inputAmount: inputAmountBN.toString(),
      outputAmount: bestQuote.amountOut.toString(),
      inputAmountFormatted: inputAmount,
      outputAmountFormatted,
      exchangeRate,
      priceImpact,
      gasEstimate: bestQuote.gasEstimate.toString(),
      route: `${inputToken.symbol} → USDC.e (${bestQuote.fee / 10000}% fee)`,
      minimumReceived,
      slippageTolerance,
    };
  } catch (error) {
    console.error('[Uniswap] Error getting swap quote:', error);
    return null;
  }
}

/**
 * Get swap quote using ethCall function (works with ethereumBridge in content scripts)
 * This version doesn't require a provider and works via the message bridge
 */
export async function getSwapQuoteViaEthCall(
  ethCall: (to: string, data: string) => Promise<string>,
  inputToken: TokenInfo,
  inputAmount: string,
  slippageTolerance: number = DEFAULT_SLIPPAGE_TOLERANCE,
): Promise<SwapQuote | null> {
  try {
    console.log('[Uniswap] Getting quote via ethCall for', inputToken.symbol, inputAmount);

    const outputToken = POLYGON_TOKENS.USDC_E;
    const inputAmountBN = ethers.utils.parseUnits(inputAmount, inputToken.decimals);

    // Sort tokens to get correct pool key
    const { currency0, currency1, zeroForOne } = sortTokens(inputToken.address, outputToken.address);

    // Create interface for encoding/decoding
    const quoterInterface = new ethers.utils.Interface(QUOTER_ABI);

    // Try different fee tiers to find the best quote
    const feeTiers = [FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.LOWEST, FEE_TIERS.HIGH];
    let bestQuote: { amountOut: ethers.BigNumber; gasEstimate: ethers.BigNumber; fee: number } | null = null;

    for (const fee of feeTiers) {
      try {
        const tickSpacing = TICK_SPACINGS[fee] || 10;

        const poolKey = {
          currency0,
          currency1,
          fee,
          tickSpacing,
          hooks: ethers.constants.AddressZero,
        };

        const params = {
          poolKey,
          zeroForOne,
          exactAmount: inputAmountBN,
          hookData: '0x',
        };

        // Encode the function call
        const data = quoterInterface.encodeFunctionData('quoteExactInputSingle', [params]);

        console.log(`[Uniswap] Trying fee tier ${fee}...`);

        // Call the quoter contract via ethCall
        const result = await ethCall(UNISWAP_V4_ADDRESSES.QUOTER, data);

        // Decode the result
        const [amountOut, gasEstimate] = quoterInterface.decodeFunctionResult('quoteExactInputSingle', result);

        console.log(`[Uniswap] Fee tier ${fee} quote:`, ethers.utils.formatUnits(amountOut, outputToken.decimals));

        if (!bestQuote || amountOut.gt(bestQuote.amountOut)) {
          bestQuote = { amountOut, gasEstimate, fee };
        }
      } catch (err) {
        // Pool doesn't exist for this fee tier, try next
        console.log(`[Uniswap] No pool found for fee tier ${fee}`);
        continue;
      }
    }

    if (!bestQuote) {
      console.error('[Uniswap] No valid pool found for swap');
      return null;
    }

    const outputAmountFormatted = ethers.utils.formatUnits(bestQuote.amountOut, outputToken.decimals);
    const inputAmountNum = parseFloat(inputAmount);
    const outputAmountNum = parseFloat(outputAmountFormatted);

    // Calculate minimum received after slippage
    const minimumReceivedBN = bestQuote.amountOut.mul(Math.floor((1 - slippageTolerance) * 10000)).div(10000);
    const minimumReceived = ethers.utils.formatUnits(minimumReceivedBN, outputToken.decimals);

    // Calculate exchange rate
    const exchangeRate = outputAmountNum / inputAmountNum;

    console.log('[Uniswap] Best quote:', {
      outputAmount: outputAmountFormatted,
      fee: bestQuote.fee,
      exchangeRate,
    });

    return {
      inputToken,
      outputToken,
      inputAmount: inputAmountBN.toString(),
      outputAmount: bestQuote.amountOut.toString(),
      inputAmountFormatted: inputAmount,
      outputAmountFormatted,
      exchangeRate,
      priceImpact: 0,
      gasEstimate: bestQuote.gasEstimate.toString(),
      route: `${inputToken.symbol} → USDC.e (${bestQuote.fee / 10000}% fee)`,
      minimumReceived,
      slippageTolerance,
    };
  } catch (error) {
    console.error('[Uniswap] Error getting swap quote via ethCall:', error);
    return null;
  }
}

/**
 * Get token balance for a user using ethCall function (works with ethereumBridge)
 * This is the preferred method for content scripts where window.ethereum is not available
 */
export async function getTokenBalanceViaEthCall(
  ethCall: (to: string, data: string) => Promise<string>,
  token: TokenInfo,
  userAddress: string,
): Promise<TokenBalance> {
  try {
    // Encode balanceOf(address) call
    const iface = new ethers.utils.Interface(ERC20_ABI);
    const data = iface.encodeFunctionData('balanceOf', [userAddress]);

    const result = await ethCall(token.address, data);

    // Decode the result
    const [balance] = iface.decodeFunctionResult('balanceOf', result);
    const balanceFormatted = ethers.utils.formatUnits(balance, token.decimals);

    return {
      token,
      balance: balance.toString(),
      balanceFormatted,
    };
  } catch (error) {
    console.error(`[Uniswap] Error getting balance for ${token.symbol}:`, error);
    return {
      token,
      balance: '0',
      balanceFormatted: '0',
    };
  }
}

/**
 * Get all token balances using ethCall function
 */
export async function getAllTokenBalancesViaEthCall(
  ethCall: (to: string, data: string) => Promise<string>,
  userAddress: string,
): Promise<TokenBalance[]> {
  const tokens = Object.values(POLYGON_TOKENS);
  const balances = await Promise.all(tokens.map(token => getTokenBalanceViaEthCall(ethCall, token, userAddress)));
  return balances;
}

/**
 * Get token balance for a user
 */
export async function getTokenBalance(
  provider: ethers.providers.Provider,
  token: TokenInfo,
  userAddress: string,
): Promise<TokenBalance> {
  try {
    const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
    const balance = await contract.balanceOf(userAddress);
    const balanceFormatted = ethers.utils.formatUnits(balance, token.decimals);

    return {
      token,
      balance: balance.toString(),
      balanceFormatted,
    };
  } catch (error) {
    console.error(`[Uniswap] Error getting balance for ${token.symbol}:`, error);
    return {
      token,
      balance: '0',
      balanceFormatted: '0',
    };
  }
}

/**
 * Get all token balances for a user
 */
export async function getAllTokenBalances(
  provider: ethers.providers.Provider,
  userAddress: string,
): Promise<TokenBalance[]> {
  const tokens = Object.values(POLYGON_TOKENS);
  const balances = await Promise.all(tokens.map(token => getTokenBalance(provider, token, userAddress)));
  return balances;
}

/**
 * Check if token needs approval for Permit2
 */
export async function checkPermit2Approval(
  provider: ethers.providers.Provider,
  token: TokenInfo,
  userAddress: string,
  amount: string,
): Promise<{ needsApproval: boolean; currentAllowance: string }> {
  try {
    const tokenContract = new ethers.Contract(token.address, ERC20_ABI, provider);
    const allowance = await tokenContract.allowance(userAddress, UNISWAP_V4_ADDRESSES.PERMIT2);
    const amountBN = ethers.utils.parseUnits(amount, token.decimals);

    return {
      needsApproval: allowance.lt(amountBN),
      currentAllowance: ethers.utils.formatUnits(allowance, token.decimals),
    };
  } catch (error) {
    console.error('[Uniswap] Error checking Permit2 approval:', error);
    return { needsApproval: true, currentAllowance: '0' };
  }
}

/**
 * Approve token for Permit2 (first step of swap)
 */
export async function approveTokenForPermit2(
  signer: ethers.Signer,
  token: TokenInfo,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const tokenContract = new ethers.Contract(token.address, ERC20_ABI, signer);

    // Approve max amount for Permit2
    const tx = await tokenContract.approve(UNISWAP_V4_ADDRESSES.PERMIT2, ethers.constants.MaxUint256);

    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.transactionHash,
    };
  } catch (error: any) {
    console.error('[Uniswap] Error approving token for Permit2:', error);
    return {
      success: false,
      error: error.message || 'Failed to approve token',
    };
  }
}

/**
 * Approve Permit2 to spend tokens on Universal Router
 */
export async function approveUniversalRouter(
  signer: ethers.Signer,
  token: TokenInfo,
  amount: string,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const permit2 = new ethers.Contract(UNISWAP_V4_ADDRESSES.PERMIT2, PERMIT2_ABI, signer);

    const amountBN = ethers.utils.parseUnits(amount, token.decimals);
    // Set expiration to 30 days from now
    const expiration = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

    const tx = await permit2.approve(token.address, UNISWAP_V4_ADDRESSES.UNIVERSAL_ROUTER, amountBN, expiration);

    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.transactionHash,
    };
  } catch (error: any) {
    console.error('[Uniswap] Error approving Universal Router:', error);
    return {
      success: false,
      error: error.message || 'Failed to approve Universal Router',
    };
  }
}

/**
 * Execute a swap from input token to USDC.e
 *
 * This uses Uniswap v4's Universal Router with the V4_SWAP command
 */
export async function executeSwap(
  signer: ethers.Signer,
  quote: SwapQuote,
  deadline?: number,
): Promise<{ success: boolean; txHash?: string; error?: string; outputAmount?: string }> {
  try {
    const { V4Planner, Actions } = await import('@uniswap/v4-sdk');
    const { RoutePlanner, CommandType } = await import('@uniswap/universal-router-sdk');

    const universalRouter = new ethers.Contract(UNISWAP_V4_ADDRESSES.UNIVERSAL_ROUTER, UNIVERSAL_ROUTER_ABI, signer);

    // Set deadline
    const swapDeadline = deadline || Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_MINUTES * 60;

    // Sort tokens for pool key
    const { currency0, currency1, zeroForOne } = sortTokens(quote.inputToken.address, quote.outputToken.address);

    // Determine fee tier from route (parse from quote.route)
    const feeMatch = quote.route.match(/(\d+\.?\d*)%/);
    const feePercent = feeMatch ? parseFloat(feeMatch[1]) : 0.05;
    const fee = Math.round(feePercent * 10000);
    const tickSpacing = TICK_SPACINGS[fee] || 10;

    // Build the swap configuration
    const swapConfig = {
      poolKey: {
        currency0,
        currency1,
        fee,
        tickSpacing,
        hooks: ethers.constants.AddressZero,
      },
      zeroForOne,
      amountIn: quote.inputAmount,
      amountOutMinimum: ethers.utils.parseUnits(quote.minimumReceived, quote.outputToken.decimals).toString(),
      hookData: '0x00',
    };

    // Create v4 planner for the swap
    const v4Planner = new V4Planner();
    const routePlanner = new RoutePlanner();

    // Add swap action
    v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [swapConfig]);
    v4Planner.addAction(Actions.SETTLE_ALL, [swapConfig.poolKey.currency0, swapConfig.amountIn]);
    v4Planner.addAction(Actions.TAKE_ALL, [swapConfig.poolKey.currency1, swapConfig.amountOutMinimum]);

    const encodedActions = v4Planner.finalize();
    routePlanner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params]);

    // Prepare transaction options
    const txOptions: ethers.PayableOverrides = {};

    // If swapping native POL, include value
    if (quote.inputToken.address.toLowerCase() === POLYGON_TOKENS.WPOL.address.toLowerCase()) {
      // For native token swaps, we'd need to wrap first or use a different approach
      // For now, assume we're swapping wrapped tokens
    }

    // Execute the swap
    const tx = await universalRouter.execute(routePlanner.commands, [encodedActions], swapDeadline, txOptions);

    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.transactionHash,
      outputAmount: quote.outputAmountFormatted,
    };
  } catch (error: any) {
    console.error('[Uniswap] Error executing swap:', error);
    return {
      success: false,
      error: error.message || 'Failed to execute swap',
    };
  }
}

/**
 * Check if token needs approval for Permit2 (using ethCall via bridge)
 */
export async function checkPermit2ApprovalViaEthCall(
  ethCall: (to: string, data: string) => Promise<string>,
  token: TokenInfo,
  userAddress: string,
  amount: string,
): Promise<{ needsApproval: boolean; currentAllowance: string }> {
  try {
    const iface = new ethers.utils.Interface(ERC20_ABI);
    const data = iface.encodeFunctionData('allowance', [userAddress, UNISWAP_V4_ADDRESSES.PERMIT2]);

    const result = await ethCall(token.address, data);
    const [allowance] = iface.decodeFunctionResult('allowance', result);

    const amountBN = ethers.utils.parseUnits(amount, token.decimals);

    return {
      needsApproval: allowance.lt(amountBN),
      currentAllowance: ethers.utils.formatUnits(allowance, token.decimals),
    };
  } catch (error) {
    console.error('[Uniswap] Error checking Permit2 approval:', error);
    return { needsApproval: true, currentAllowance: '0' };
  }
}

/**
 * Approve token for Permit2 using sendTransaction via bridge
 */
export async function approveTokenForPermit2ViaBridge(
  sendTransaction: (tx: { to: string; from: string; data: string }) => Promise<{ hash: string }>,
  token: TokenInfo,
  userAddress: string,
  amount: string,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    // Approve only the exact amount needed, not unlimited
    const amountBN = ethers.utils.parseUnits(amount, token.decimals);
    console.log('[Uniswap] Approving', token.symbol, 'for Permit2, amount:', amount);

    const iface = new ethers.utils.Interface(ERC20_ABI);
    const data = iface.encodeFunctionData('approve', [UNISWAP_V4_ADDRESSES.PERMIT2, amountBN]);

    const { hash } = await sendTransaction({
      to: token.address,
      from: userAddress,
      data,
    });

    console.log('[Uniswap] Permit2 approval tx sent:', hash);

    return {
      success: true,
      txHash: hash,
    };
  } catch (error: any) {
    console.error('[Uniswap] Error approving token for Permit2:', error);
    return {
      success: false,
      error: error.message || 'Failed to approve token',
    };
  }
}

/**
 * Approve Universal Router on Permit2 using sendTransaction via bridge
 */
export async function approveUniversalRouterViaBridge(
  sendTransaction: (tx: { to: string; from: string; data: string }) => Promise<{ hash: string }>,
  token: TokenInfo,
  amount: string,
  userAddress: string,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    console.log('[Uniswap] Approving Universal Router on Permit2...');

    const iface = new ethers.utils.Interface(PERMIT2_ABI);
    const amountBN = ethers.utils.parseUnits(amount, token.decimals);
    // Set expiration to 30 days from now
    const expiration = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

    const data = iface.encodeFunctionData('approve', [
      token.address,
      UNISWAP_V4_ADDRESSES.UNIVERSAL_ROUTER,
      amountBN,
      expiration,
    ]);

    const { hash } = await sendTransaction({
      to: UNISWAP_V4_ADDRESSES.PERMIT2,
      from: userAddress,
      data,
    });

    console.log('[Uniswap] Universal Router approval tx sent:', hash);

    return {
      success: true,
      txHash: hash,
    };
  } catch (error: any) {
    console.error('[Uniswap] Error approving Universal Router:', error);
    return {
      success: false,
      error: error.message || 'Failed to approve Universal Router',
    };
  }
}

/**
 * Execute a swap using sendTransaction via bridge
 * This builds the Universal Router transaction data and sends it via the bridge
 */
export async function executeSwapViaBridge(
  sendTransaction: (tx: { to: string; from: string; data: string; value?: string }) => Promise<{ hash: string }>,
  quote: SwapQuote,
  userAddress: string,
  deadline?: number,
): Promise<{ success: boolean; txHash?: string; error?: string; outputAmount?: string }> {
  try {
    console.log('[Uniswap] Executing swap via bridge...');
    console.log('[Uniswap] Quote:', JSON.stringify(quote, null, 2));

    const { V4Planner, Actions } = await import('@uniswap/v4-sdk');
    const { RoutePlanner, CommandType } = await import('@uniswap/universal-router-sdk');

    // Set deadline
    const swapDeadline = deadline || Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_MINUTES * 60;

    // Sort tokens for pool key
    const { currency0, currency1, zeroForOne } = sortTokens(quote.inputToken.address, quote.outputToken.address);

    // Determine fee tier from route (parse from quote.route)
    const feeMatch = quote.route.match(/(\d+\.?\d*)%/);
    const feePercent = feeMatch ? parseFloat(feeMatch[1]) : 0.05;
    const fee = Math.round(feePercent * 10000);
    const tickSpacing = TICK_SPACINGS[fee] || 10;

    console.log('[Uniswap] Swap params:', {
      currency0,
      currency1,
      zeroForOne,
      fee,
      tickSpacing,
      inputAmount: quote.inputAmount,
      minimumReceived: quote.minimumReceived,
    });

    // Parse amounts
    const amountIn = ethers.BigNumber.from(quote.inputAmount);
    const amountOutMinimum = ethers.utils.parseUnits(quote.minimumReceived, quote.outputToken.decimals);

    // Build the pool key
    const poolKey = {
      currency0,
      currency1,
      fee,
      tickSpacing,
      hooks: ethers.constants.AddressZero,
    };

    // Create v4 planner for the swap
    const v4Planner = new V4Planner();

    // The order matters! For exact input swaps:
    // 1. First SWAP_EXACT_IN_SINGLE - this creates the delta in the pool
    // 2. Then SETTLE_ALL - pay what we owe (input token)
    // 3. Then TAKE_ALL - receive what we're owed (output token)

    // Determine input/output currencies based on swap direction
    const inputCurrency = zeroForOne ? currency0 : currency1;
    const outputCurrency = zeroForOne ? currency1 : currency0;

    // For SWAP_EXACT_IN_SINGLE, the struct is:
    // (PoolKey poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData)
    v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [
      {
        poolKey,
        zeroForOne,
        amountIn: amountIn.toString(),
        amountOutMinimum: amountOutMinimum.toString(),
        hookData: '0x',
      },
    ]);

    // SETTLE_ALL: pay all owed input tokens from user
    // Parameters: (address currency, uint256 maxAmount)
    v4Planner.addAction(Actions.SETTLE_ALL, [inputCurrency, amountIn.toString()]);

    // TAKE_ALL: receive all owed output tokens to user
    // Parameters: (address currency, uint256 minAmount)
    v4Planner.addAction(Actions.TAKE_ALL, [outputCurrency, amountOutMinimum.toString()]);

    // Finalize the v4 actions
    const v4Calldata = v4Planner.finalize();
    console.log('[Uniswap] V4 calldata:', v4Calldata);

    // Create route planner and add V4_SWAP command
    const routePlanner = new RoutePlanner();
    routePlanner.addCommand(CommandType.V4_SWAP, [v4Calldata]);

    // Encode the execute function call
    const routerInterface = new ethers.utils.Interface(UNIVERSAL_ROUTER_ABI);
    const data = routerInterface.encodeFunctionData('execute', [
      routePlanner.commands,
      routePlanner.inputs,
      swapDeadline,
    ]);

    console.log('[Uniswap] Sending swap transaction...');
    console.log('[Uniswap] Router:', UNISWAP_V4_ADDRESSES.UNIVERSAL_ROUTER);
    console.log('[Uniswap] From:', userAddress);

    const { hash } = await sendTransaction({
      to: UNISWAP_V4_ADDRESSES.UNIVERSAL_ROUTER,
      from: userAddress,
      data,
    });

    console.log('[Uniswap] Swap tx sent:', hash);

    return {
      success: true,
      txHash: hash,
      outputAmount: quote.outputAmountFormatted,
    };
  } catch (error: any) {
    console.error('[Uniswap] Error executing swap:', error);
    return {
      success: false,
      error: error.message || 'Failed to execute swap',
    };
  }
}

export { POLYGON_TOKENS, UNISWAP_V4_ADDRESSES, DEFAULT_SLIPPAGE_TOLERANCE, DEFAULT_DEADLINE_MINUTES };
