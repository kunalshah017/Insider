/**
 * InlineTradingPanel - Inline trading UI that appears within the TradingCard
 * 
 * This replaces the modal approach to avoid z-index issues with Twitter's UI.
 * Shows wallet connection, setup, and order placement all within the card.
 */

import { useState, useEffect } from 'react';
import { useOrder, useWallet } from '../../../hooks';
import { formatPriceAsPercent } from '@extension/shared';
import type { TokenCheckResult } from '../../../utils/token-utils';

interface InlineTradingPanelProps {
    isOpen: boolean;
    onClose: () => void;
    marketTitle: string;
    outcome: 'YES' | 'NO';
    tokenId: string;
    price: number;
}

type PanelView = 'order' | 'connect' | 'setup' | 'approve';

export function InlineTradingPanel({
    isOpen,
    onClose,
    marketTitle,
    outcome,
    tokenId,
    price,
}: InlineTradingPanelProps) {
    const { isSubmitting, isApproving, error: orderError, submitOrder, checkRequirements, approveToken } = useOrder();
    const {
        isConnected,
        isConnecting,
        address,
        session,
        error: walletError,
        hasProvider,
        connect,
        initializeSession,
        disconnect
    } = useWallet();

    const [amount, setAmount] = useState('');
    const [balance, setBalance] = useState<number | null>(null);
    const [orderSuccess, setOrderSuccess] = useState(false);
    const [view, setView] = useState<PanelView>('order');
    const [tokenCheck, setTokenCheck] = useState<TokenCheckResult | null>(null);
    const [isCheckingRequirements, setIsCheckingRequirements] = useState(false);

    // Determine initial view based on wallet state
    useEffect(() => {
        if (!isOpen) return;

        if (!isConnected) {
            setView('connect');
        } else if (!session) {
            setView('setup');
        } else {
            setView('order');
        }
    }, [isOpen, isConnected, session]);

    // Load balance and check requirements when session is available
    useEffect(() => {
        if (!isOpen || !session?.walletAddress || !address) return;

        const loadRequirements = async () => {
            setIsCheckingRequirements(true);
            const result = await checkRequirements(address, 0, false);
            if (result) {
                setBalance(result.balance);
                setTokenCheck(result);
            }
            setIsCheckingRequirements(false);
        };

        loadRequirements();
    }, [isOpen, session, address, checkRequirements]);

    if (!isOpen) return null;

    const numAmount = parseFloat(amount) || 0;
    const estimatedShares = numAmount > 0 ? numAmount / price : 0;
    const potentialReturn = estimatedShares * 1;
    const potentialProfit = potentialReturn - numAmount;

    const handleSubmit = async () => {
        if (numAmount <= 0 || !session || !address) return;

        // Check requirements before submitting
        setIsCheckingRequirements(true);
        const requirements = await checkRequirements(address, numAmount, false);
        setIsCheckingRequirements(false);

        if (!requirements) {
            return;
        }

        setTokenCheck(requirements);
        setBalance(requirements.balance);

        // Check if user has enough balance
        if (!requirements.hasEnoughBalance) {
            // Error will be shown in the UI
            return;
        }

        // Check if approval is needed
        if (requirements.needsApproval) {
            setView('approve');
            return;
        }

        // Proceed with order
        const order = {
            tokenId,
            side: 'buy' as const,
            size: estimatedShares,
            price,
            negRisk: false, // TODO: detect from market data
            tickSize: '0.01',
        };

        const success = await submitOrder(order, session);
        if (success) {
            setOrderSuccess(true);
            setTimeout(() => {
                onClose();
                setOrderSuccess(false);
                setAmount('');
            }, 2000);
        }
    };

    const handleApprove = async () => {
        if (!address) return;

        const success = await approveToken(address, false);
        if (success) {
            // Re-check requirements
            const requirements = await checkRequirements(address, numAmount, false);
            if (requirements) {
                setTokenCheck(requirements);
                if (requirements.hasApproval) {
                    setView('order');
                }
            }
        }
    };

    const handleConnect = async () => {
        const success = await connect();
        if (success) {
            setView('setup');
        }
    };

    const handleSetup = async () => {
        const success = await initializeSession();
        if (success) {
            setView('order');
        }
    };

    const isYes = outcome === 'YES';
    const accentColor = isYes ? '#22c55e' : '#ef4444';
    const bgAccent = isYes ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';
    const error = orderError || walletError;

    return (
        <div
            style={{
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(0, 0, 0, 0.3)',
                padding: '16px',
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                }}
            >
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#e7e9ea' }}>
                    {view === 'connect' ? '🦊 Connect Wallet' :
                        view === 'setup' ? '⚡ Set Up Trading' :
                            `Buy ${outcome}`}
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: 'none',
                        color: '#71767b',
                        fontSize: '16px',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: '4px',
                    }}
                >
                    ✕
                </button>
            </div>

            {/* CONNECT VIEW */}
            {view === 'connect' && (
                <div>
                    <div style={{ fontSize: '12px', color: '#a3a3a3', marginBottom: '12px' }}>
                        {hasProvider
                            ? 'Connect MetaMask to trade on Polymarket'
                            : 'MetaMask is required to trade'}
                    </div>

                    {error && (
                        <div
                            style={{
                                background: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '6px',
                                padding: '8px',
                                marginBottom: '12px',
                                fontSize: '11px',
                                color: '#ef4444',
                            }}
                        >
                            {error}
                        </div>
                    )}

                    {hasProvider ? (
                        <button
                            onClick={handleConnect}
                            disabled={isConnecting}
                            style={{
                                width: '100%',
                                padding: '12px',
                                background: 'linear-gradient(135deg, #f6851b, #e4761b)',
                                border: 'none',
                                borderRadius: '8px',
                                color: 'white',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: isConnecting ? 'wait' : 'pointer',
                                opacity: isConnecting ? 0.7 : 1,
                            }}
                        >
                            {isConnecting ? 'Connecting...' : 'Connect MetaMask'}
                        </button>
                    ) : (
                        <a
                            href="https://metamask.io/download/"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: 'block',
                                width: '100%',
                                padding: '12px',
                                background: 'linear-gradient(135deg, #f6851b, #e4761b)',
                                border: 'none',
                                borderRadius: '8px',
                                color: 'white',
                                fontSize: '13px',
                                fontWeight: 600,
                                textAlign: 'center',
                                textDecoration: 'none',
                                boxSizing: 'border-box',
                            }}
                        >
                            Install MetaMask
                        </a>
                    )}
                </div>
            )}

            {/* SETUP VIEW */}
            {view === 'setup' && (
                <div>
                    <div style={{ fontSize: '11px', color: '#22c55e', marginBottom: '8px' }}>
                        ✓ Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#a3a3a3', marginBottom: '12px' }}>
                        Sign a message to create your Polymarket API credentials
                    </div>

                    {error && (
                        <div
                            style={{
                                background: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '6px',
                                padding: '8px',
                                marginBottom: '12px',
                                fontSize: '11px',
                                color: '#ef4444',
                            }}
                        >
                            {error}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={handleSetup}
                            disabled={isConnecting}
                            style={{
                                flex: 1,
                                padding: '12px',
                                background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                border: 'none',
                                borderRadius: '8px',
                                color: 'white',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: isConnecting ? 'wait' : 'pointer',
                                opacity: isConnecting ? 0.7 : 1,
                            }}
                        >
                            {isConnecting ? 'Setting Up...' : 'Set Up Trading'}
                        </button>
                        <button
                            onClick={() => { disconnect(); setView('connect'); }}
                            style={{
                                padding: '12px',
                                background: 'transparent',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                borderRadius: '8px',
                                color: '#71767b',
                                fontSize: '13px',
                                cursor: 'pointer',
                            }}
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {/* APPROVE VIEW */}
            {view === 'approve' && (
                <div>
                    <div style={{ fontSize: '11px', color: '#22c55e', marginBottom: '8px' }}>
                        ✓ Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
                    </div>
                    <div
                        style={{
                            background: 'rgba(251, 191, 36, 0.15)',
                            border: '1px solid rgba(251, 191, 36, 0.3)',
                            borderRadius: '8px',
                            padding: '12px',
                            marginBottom: '12px',
                        }}
                    >
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#fbbf24', marginBottom: '6px' }}>
                            ⚠️ Approval Required
                        </div>
                        <div style={{ fontSize: '11px', color: '#a3a3a3' }}>
                            You need to approve USDC.e to trade on Polymarket.
                            This is a one-time transaction that requires a small amount of POL for gas.
                        </div>
                    </div>

                    {error && (
                        <div
                            style={{
                                background: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '6px',
                                padding: '8px',
                                marginBottom: '12px',
                                fontSize: '11px',
                                color: '#ef4444',
                            }}
                        >
                            {error}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={handleApprove}
                            disabled={isApproving}
                            style={{
                                flex: 1,
                                padding: '12px',
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                border: 'none',
                                borderRadius: '8px',
                                color: 'white',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: isApproving ? 'wait' : 'pointer',
                                opacity: isApproving ? 0.7 : 1,
                            }}
                        >
                            {isApproving ? 'Approving...' : 'Approve USDC.e'}
                        </button>
                        <button
                            onClick={() => setView('order')}
                            style={{
                                padding: '12px',
                                background: 'transparent',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                borderRadius: '8px',
                                color: '#71767b',
                                fontSize: '13px',
                                cursor: 'pointer',
                            }}
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {/* ORDER VIEW */}
            {view === 'order' && (
                <div>
                    {/* Session info */}
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '12px',
                            padding: '8px',
                            background: 'rgba(34, 197, 94, 0.1)',
                            borderRadius: '6px',
                            fontSize: '11px',
                        }}
                    >
                        <span style={{ color: '#22c55e' }}>
                            ✓ {address?.slice(0, 6)}...{address?.slice(-4)}
                        </span>
                        {balance !== null && (
                            <span style={{ color: '#e7e9ea' }}>
                                ${balance.toFixed(2)} USDC
                            </span>
                        )}
                    </div>

                    {/* Amount input */}
                    <div style={{ marginBottom: '12px' }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '8px',
                                padding: '10px',
                            }}
                        >
                            <span style={{ color: '#71767b', marginRight: '8px', fontSize: '14px' }}>$</span>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                min="0"
                                step="0.01"
                                style={{
                                    flex: 1,
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#e7e9ea',
                                    fontSize: '16px',
                                    outline: 'none',
                                    width: '100%',
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                            {[1, 5, 10, 25].map((val) => (
                                <button
                                    key={val}
                                    onClick={() => setAmount(val.toString())}
                                    style={{
                                        flex: 1,
                                        padding: '6px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '4px',
                                        color: '#a3a3a3',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    ${val}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Order preview */}
                    {numAmount > 0 && (
                        <div
                            style={{
                                background: bgAccent,
                                borderRadius: '6px',
                                padding: '10px',
                                marginBottom: '12px',
                                fontSize: '11px',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ color: '#71767b' }}>Price</span>
                                <span style={{ color: '#e7e9ea' }}>{formatPriceAsPercent(price)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ color: '#71767b' }}>Shares</span>
                                <span style={{ color: '#e7e9ea' }}>{estimatedShares.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                <span style={{ color: '#71767b' }}>Potential profit</span>
                                <span style={{ color: accentColor, fontWeight: 600 }}>
                                    +${potentialProfit.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Error/Success */}
                    {error && (
                        <div style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            borderRadius: '6px',
                            padding: '8px',
                            marginBottom: '12px',
                            fontSize: '11px',
                            color: '#ef4444',
                        }}>
                            {error}
                        </div>
                    )}

                    {/* Insufficient balance warning */}
                    {numAmount > 0 && balance !== null && numAmount > balance && (
                        <div style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '6px',
                            padding: '8px',
                            marginBottom: '12px',
                            fontSize: '11px',
                            color: '#ef4444',
                        }}>
                            Insufficient balance. You have ${balance.toFixed(2)} USDC.e
                        </div>
                    )}

                    {orderSuccess && (
                        <div style={{
                            background: 'rgba(34, 197, 94, 0.15)',
                            borderRadius: '6px',
                            padding: '8px',
                            marginBottom: '12px',
                            fontSize: '11px',
                            color: '#22c55e',
                        }}>
                            ✓ Order submitted!
                        </div>
                    )}

                    {/* Submit button */}
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || isCheckingRequirements || numAmount <= 0 || (balance !== null && numAmount > balance)}
                        style={{
                            width: '100%',
                            padding: '12px',
                            background: isYes
                                ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                                : 'linear-gradient(135deg, #ef4444, #dc2626)',
                            border: 'none',
                            borderRadius: '8px',
                            color: 'white',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: numAmount <= 0 || (balance !== null && numAmount > balance) ? 'not-allowed' : 'pointer',
                            opacity: numAmount <= 0 || (balance !== null && numAmount > balance) ? 0.5 : 1,
                        }}
                    >
                        {isCheckingRequirements ? 'Checking...' : isSubmitting ? 'Submitting...' : `Buy ${outcome} for $${numAmount.toFixed(2)}`}
                    </button>
                </div>
            )}
        </div>
    );
}
