/**
 * Hook for placing orders from content-ui
 *
 * Implements the complete order flow:
 * 1. Check balance and approval
 * 2. Prompt approval if needed
 * 3. Build order structure
 * 4. Sign order with MetaMask (EIP-712)
 * 5. Submit signed order to background script
 * 6. Background sends to server with L2 auth headers
 * 7. Server adds Builder headers and forwards to Polymarket CLOB
 */

import { useState, useCallback } from 'react';
import type { TradingSession } from '@extension/shared/lib/polymarket/session-types';
import { ethereumBridge } from '../ethereum-bridge';
import {
  buildOrderData,
  buildOrderTypedData,
  type SignedOrder,
  type UserOrder,
  SignatureType,
} from '../utils/order-builder';
import {
  checkTradingRequirements,
  checkAllowance,
  buildApprovalData,
  toRawAmount,
  USDC_E_ADDRESS,
  CTF_EXCHANGE_ADDRESS,
  NEG_RISK_CTF_EXCHANGE_ADDRESS,
  type TokenCheckResult,
} from '../utils/token-utils';

interface OrderParams {
  tokenId: string;
  side: 'buy' | 'sell';
  size: number;
  price: number;
  negRisk?: boolean;
  tickSize?: string;
}

interface UseOrderResult {
  isSubmitting: boolean;
  isApproving: boolean;
  error: string | null;
  submitOrder: (order: OrderParams, session: TradingSession) => Promise<boolean>;
  checkSession: () => Promise<TradingSession | null>;
  checkRequirements: (address: string, amount: number, negRisk: boolean) => Promise<TokenCheckResult | null>;
  approveToken: (address: string, amount: number, negRisk: boolean) => Promise<boolean>;
}

export function useOrder(): UseOrderResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkSession = useCallback(async (): Promise<TradingSession | null> => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TRADING_SESSION' });
      if (response.error) {
        return null;
      }
      return response.data as TradingSession;
    } catch (err) {
      console.error('[Insider] Failed to check session:', err);
      return null;
    }
  }, []);

  /**
   * Check balance and approval status for trading
   */
  const checkRequirements = useCallback(
    async (address: string, amount: number, negRisk: boolean): Promise<TokenCheckResult | null> => {
      try {
        console.log('[Insider] Checking trading requirements...');

        // Create ethCall function that uses the bridge
        const ethCall = async (to: string, data: string): Promise<string> => {
          return await ethereumBridge.ethCall(to, data);
        };

        const result = await checkTradingRequirements(address, amount, negRisk, ethCall);

        console.log('[Insider] Trading requirements:', {
          balance: result.balance.toFixed(2),
          allowance: result.allowance > 1000000 ? 'unlimited' : result.allowance.toFixed(2),
          hasEnoughBalance: result.hasEnoughBalance,
          hasApproval: result.hasApproval,
          needsApproval: result.needsApproval,
        });

        return result;
      } catch (err) {
        console.error('[Insider] Failed to check requirements:', err);
        return null;
      }
    },
    [],
  );

  /**
   * Wait for a transaction to be mined by polling for the allowance change
   */
  const waitForApprovalConfirmation = useCallback(
    async (address: string, spender: string, expectedAmount: number, maxAttempts: number = 20): Promise<boolean> => {
      const ethCall = async (to: string, data: string): Promise<string> => {
        return await ethereumBridge.ethCall(to, data);
      };

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between checks

        try {
          const { rawAllowance } = await checkAllowance(address, spender, ethCall);
          const requiredRaw = toRawAmount(expectedAmount);

          if (rawAllowance >= requiredRaw) {
            console.log(`[Insider] Approval confirmed after ${i + 1} attempts`);
            return true;
          }
          console.log(`[Insider] Waiting for approval... attempt ${i + 1}/${maxAttempts}`);
        } catch (err) {
          console.warn('[Insider] Error checking allowance:', err);
        }
      }

      return false;
    },
    [],
  );

  /**
   * Approve USDC.e for CTF Exchange
   * @param address User's wallet address
   * @param amount The exact amount to approve (in USDC)
   * @param negRisk Whether this is for neg-risk markets
   */
  const approveToken = useCallback(
    async (address: string, amount: number, negRisk: boolean): Promise<boolean> => {
      setIsApproving(true);
      setError(null);

      try {
        console.log(`[Insider] Requesting USDC.e approval for $${amount.toFixed(2)}...`);

        const spender = negRisk ? NEG_RISK_CTF_EXCHANGE_ADDRESS : CTF_EXCHANGE_ADDRESS;
        const approvalData = buildApprovalData(spender, amount);

        const { hash } = await ethereumBridge.sendTransaction({
          to: USDC_E_ADDRESS,
          from: address,
          data: approvalData,
        });

        console.log('[Insider] Approval transaction sent:', hash);
        console.log('[Insider] Waiting for confirmation...');

        // Poll for the approval to be confirmed on-chain
        const confirmed = await waitForApprovalConfirmation(address, spender, amount);

        if (confirmed) {
          console.log('[Insider] Approval confirmed!');
          return true;
        } else {
          console.warn('[Insider] Approval may not have been confirmed yet, but continuing...');
          return true; // Return true anyway as the tx was sent
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to approve token';
        setError(errorMessage);
        console.error('[Insider] Approval error:', err);
        return false;
      } finally {
        setIsApproving(false);
      }
    },
    [waitForApprovalConfirmation],
  );

  const submitOrder = useCallback(async (order: OrderParams, session: TradingSession): Promise<boolean> => {
    setIsSubmitting(true);
    setError(null);

    try {
      console.log('[Insider] Starting order submission flow...');

      // Get wallet address from session
      const walletAddress = session.walletAddress;
      if (!walletAddress) {
        throw new Error('No wallet address in session');
      }

      // Step 1: Build order data structure
      console.log('[Insider] Building order data...');
      const userOrder: UserOrder = {
        tokenId: order.tokenId,
        side: order.side.toUpperCase() as 'BUY' | 'SELL',
        price: order.price,
        size: order.size,
        feeRateBps: 0,
        nonce: 0,
      };

      const orderData = buildOrderData(
        userOrder,
        walletAddress, // maker
        walletAddress, // signer (same for EOA)
        order.tickSize || '0.01',
        SignatureType.EOA,
      );

      console.log('[Insider] Order data built:', {
        tokenId: orderData.tokenId,
        side: orderData.side,
        makerAmount: orderData.makerAmount,
        takerAmount: orderData.takerAmount,
      });

      // Step 2: Build EIP-712 typed data for signing
      console.log('[Insider] Building EIP-712 typed data...');
      const typedData = buildOrderTypedData(orderData, order.negRisk || false);

      // Step 3: Sign with MetaMask
      console.log('[Insider] Requesting order signature from MetaMask...');
      const { signature } = await ethereumBridge.signTypedData(walletAddress, typedData);
      console.log('[Insider] Order signed successfully');

      // Step 4: Create signed order object
      const signedOrder: SignedOrder = {
        ...orderData,
        signature,
      };

      // Step 5: Send to background script for submission
      console.log('[Insider] Submitting signed order to background...');
      const response = await chrome.runtime.sendMessage({
        type: 'SUBMIT_SIGNED_ORDER',
        signedOrder,
        credentials: {
          address: walletAddress,
          apiKey: session.apiKey,
          apiSecret: session.apiSecret,
          passphrase: session.passphrase,
        },
        negRisk: order.negRisk || false,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      console.log('[Insider] Order submitted successfully!', response.data);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit order';
      setError(errorMessage);
      console.error('[Insider] Order submission error:', err);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return {
    isSubmitting,
    isApproving,
    error,
    submitOrder,
    checkSession,
    checkRequirements,
    approveToken,
  };
}
