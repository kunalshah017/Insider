/**
 * Approval utilities for Polymarket trading
 *
 * Handles checking and creating token approval transactions for:
 * - USDC.e (ERC-20) to CTF, CTF Exchange, Neg Risk CTF Exchange, Neg Risk Adapter
 * - Outcome tokens (ERC-1155) to CTF Exchange, Neg Risk CTF Exchange, Neg Risk Adapter
 */

import { encodeFunctionData, erc20Abi, createPublicClient, http } from 'viem';
import { polygon } from 'viem/chains';
import type { SafeTransaction, OperationType } from '@polymarket/builder-relayer-client';
import {
  USDC_E_CONTRACT_ADDRESS,
  CTF_CONTRACT_ADDRESS,
  CTF_EXCHANGE_ADDRESS,
  NEG_RISK_CTF_EXCHANGE_ADDRESS,
  NEG_RISK_ADAPTER_ADDRESS,
  POLYGON_RPC_URL,
} from './constants.js';

const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

// ERC-1155 ABI for approval
const erc1155Abi = [
  {
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    name: 'isApprovedForAll',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Create public client for reading blockchain state
const publicClient = createPublicClient({
  chain: polygon,
  transport: http(POLYGON_RPC_URL),
});

// USDC.e needs to be approved to these contracts
const USDC_E_SPENDERS = [
  { address: CTF_CONTRACT_ADDRESS, name: 'CTF Contract' },
  { address: NEG_RISK_ADAPTER_ADDRESS, name: 'Neg Risk Adapter' },
  { address: CTF_EXCHANGE_ADDRESS, name: 'CTF Exchange' },
  { address: NEG_RISK_CTF_EXCHANGE_ADDRESS, name: 'Neg Risk CTF Exchange' },
] as const;

// Outcome tokens (ERC-1155) need to be approved to these operators
const OUTCOME_TOKEN_OPERATORS = [
  { address: CTF_EXCHANGE_ADDRESS, name: 'CTF Exchange' },
  { address: NEG_RISK_CTF_EXCHANGE_ADDRESS, name: 'Neg Risk CTF Exchange' },
  { address: NEG_RISK_ADAPTER_ADDRESS, name: 'Neg Risk Adapter' },
] as const;

export interface ApprovalStatus {
  allApproved: boolean;
  usdcApprovals: { address: string; name: string; approved: boolean }[];
  ctfApprovals: { address: string; name: string; approved: boolean }[];
}

/**
 * Check all required token approvals for a Safe address
 */
export async function checkAllApprovals(safeAddress: string): Promise<ApprovalStatus> {
  const usdcApprovals = await Promise.all(
    USDC_E_SPENDERS.map(async spender => {
      try {
        const allowance = await publicClient.readContract({
          address: USDC_E_CONTRACT_ADDRESS,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [safeAddress as `0x${string}`, spender.address as `0x${string}`],
        });
        // Consider approved if allowance > 0 (we use max uint256)
        const approved = BigInt(allowance) > BigInt(0);
        return { address: spender.address, name: spender.name, approved };
      } catch (error) {
        console.error(`Error checking USDC.e approval for ${spender.name}:`, error);
        return { address: spender.address, name: spender.name, approved: false };
      }
    }),
  );

  const ctfApprovals = await Promise.all(
    OUTCOME_TOKEN_OPERATORS.map(async operator => {
      try {
        const approved = await publicClient.readContract({
          address: CTF_CONTRACT_ADDRESS,
          abi: erc1155Abi,
          functionName: 'isApprovedForAll',
          args: [safeAddress as `0x${string}`, operator.address as `0x${string}`],
        });
        return { address: operator.address, name: operator.name, approved: Boolean(approved) };
      } catch (error) {
        console.error(`Error checking CTF approval for ${operator.name}:`, error);
        return { address: operator.address, name: operator.name, approved: false };
      }
    }),
  );

  const allApproved = usdcApprovals.every(a => a.approved) && ctfApprovals.every(a => a.approved);

  return { allApproved, usdcApprovals, ctfApprovals };
}

/**
 * Create all approval transactions for batch execution via Relayer
 */
export function createAllApprovalTxs(): SafeTransaction[] {
  const transactions: SafeTransaction[] = [];

  // USDC.e ERC-20 approvals
  for (const spender of USDC_E_SPENDERS) {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender.address as `0x${string}`, BigInt(MAX_UINT256)],
    });

    transactions.push({
      to: USDC_E_CONTRACT_ADDRESS,
      operation: 0 as OperationType, // Call
      data,
      value: '0',
    });
  }

  // CTF ERC-1155 approvals
  for (const operator of OUTCOME_TOKEN_OPERATORS) {
    const data = encodeFunctionData({
      abi: erc1155Abi,
      functionName: 'setApprovalForAll',
      args: [operator.address as `0x${string}`, true],
    });

    transactions.push({
      to: CTF_CONTRACT_ADDRESS,
      operation: 0 as OperationType, // Call
      data,
      value: '0',
    });
  }

  return transactions;
}
