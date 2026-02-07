/**
 * OrderModal - Trading modal for placing orders
 * 
 * Displays when user clicks YES/NO on a trading card.
 * Includes wallet connection flow, amount input, order preview, and submit button.
 */

import { useState, useEffect } from 'react';
import { useOrder, useWallet } from '../../../hooks';
import { formatPriceAsPercent } from '@extension/shared';
import type { OrderParams } from '@extension/shared/lib/polymarket/session-types';

interface OrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    marketTitle: string;
    outcome: 'YES' | 'NO';
    tokenId: string;
    price: number;
}

type ModalView = 'order' | 'connect' | 'setup';

export function OrderModal({
    isOpen,
    onClose,
    marketTitle,
    outcome,
    tokenId,
    price,
}: OrderModalProps) {
    const { isSubmitting, error: orderError, submitOrder, getBalance } = useOrder();
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
    const [view, setView] = useState<ModalView>('order');

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

    // Load balance when session is available
    useEffect(() => {
        if (!isOpen || !session?.safeAddress) return;

        const loadBalance = async () => {
            const bal = await getBalance(session.safeAddress);
            setBalance(bal);
        };

        loadBalance();
    }, [isOpen, session, getBalance]);

    if (!isOpen) return null;

    const numAmount = parseFloat(amount) || 0;
    const estimatedShares = numAmount > 0 ? numAmount / price : 0;
    const potentialReturn = estimatedShares * 1; // $1 per share if wins
    const potentialProfit = potentialReturn - numAmount;

    const handleSubmit = async () => {
        if (numAmount <= 0 || !session) return;

        const order: OrderParams = {
            tokenId,
            side: 'buy',
            size: estimatedShares,
            price,
        };

        const success = await submitOrder(order);
        if (success) {
            setOrderSuccess(true);
            setTimeout(() => {
                onClose();
                setOrderSuccess(false);
                setAmount('');
            }, 2000);
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
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2147483647,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                    borderRadius: '16px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    width: '100%',
                    maxWidth: '380px',
                    margin: '16px',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                >
                    <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#e7e9ea' }}>
                            {view === 'connect' ? 'Connect Wallet' :
                                view === 'setup' ? 'Set Up Trading' :
                                    `Buy ${outcome}`}
                        </div>
                        <div
                            style={{
                                fontSize: '12px',
                                color: '#71767b',
                                marginTop: '4px',
                                maxWidth: '280px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {marketTitle}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#71767b',
                            fontSize: '20px',
                            cursor: 'pointer',
                            padding: '4px',
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '16px' }}>
                    {/* CONNECT VIEW */}
                    {view === 'connect' && (
                        <div>
                            <div
                                style={{
                                    textAlign: 'center',
                                    marginBottom: '24px',
                                }}
                            >
                                {/* MetaMask Fox Icon */}
                                <div
                                    style={{
                                        width: '64px',
                                        height: '64px',
                                        margin: '0 auto 16px',
                                        background: 'linear-gradient(135deg, #f6851b, #e4761b)',
                                        borderRadius: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '32px',
                                    }}
                                >
                                    🦊
                                </div>
                                <div style={{ fontSize: '13px', color: '#a3a3a3', marginBottom: '8px' }}>
                                    {hasProvider
                                        ? 'Connect your MetaMask wallet to trade on Polymarket'
                                        : 'MetaMask is required to trade on Polymarket'}
                                </div>
                                <div style={{ fontSize: '11px', color: '#71767b' }}>
                                    {hasProvider
                                        ? 'Your wallet will be connected to Polygon network'
                                        : 'Please install MetaMask extension and refresh the page'}
                                </div>
                            </div>

                            {error && (
                                <div
                                    style={{
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        borderRadius: '8px',
                                        padding: '12px',
                                        marginBottom: '16px',
                                    }}
                                >
                                    <div style={{ fontSize: '12px', color: '#ef4444' }}>{error}</div>
                                </div>
                            )}

                            {hasProvider ? (
                                <button
                                    onClick={handleConnect}
                                    disabled={isConnecting}
                                    style={{
                                        width: '100%',
                                        padding: '14px',
                                        background: 'linear-gradient(135deg, #f6851b, #e4761b)',
                                        border: 'none',
                                        borderRadius: '10px',
                                        color: 'white',
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        cursor: isConnecting ? 'wait' : 'pointer',
                                        opacity: isConnecting ? 0.7 : 1,
                                        transition: 'opacity 0.2s',
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
                                        padding: '14px',
                                        background: 'linear-gradient(135deg, #f6851b, #e4761b)',
                                        border: 'none',
                                        borderRadius: '10px',
                                        color: 'white',
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        textAlign: 'center',
                                        textDecoration: 'none',
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
                            <div
                                style={{
                                    textAlign: 'center',
                                    marginBottom: '24px',
                                }}
                            >
                                <div
                                    style={{
                                        width: '64px',
                                        height: '64px',
                                        margin: '0 auto 16px',
                                        background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                        borderRadius: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '32px',
                                    }}
                                >
                                    ⚡
                                </div>
                                <div style={{ fontSize: '12px', color: '#22c55e', marginBottom: '8px' }}>
                                    ✓ Wallet Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
                                </div>
                                <div style={{ fontSize: '13px', color: '#a3a3a3', marginBottom: '8px' }}>
                                    Set up your trading session
                                </div>
                                <div style={{ fontSize: '11px', color: '#71767b' }}>
                                    This will sign a message to create your Polymarket API credentials
                                </div>
                            </div>

                            {error && (
                                <div
                                    style={{
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        borderRadius: '8px',
                                        padding: '12px',
                                        marginBottom: '16px',
                                    }}
                                >
                                    <div style={{ fontSize: '12px', color: '#ef4444' }}>{error}</div>
                                </div>
                            )}

                            <button
                                onClick={handleSetup}
                                disabled={isConnecting}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                    border: 'none',
                                    borderRadius: '10px',
                                    color: 'white',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    cursor: isConnecting ? 'wait' : 'pointer',
                                    opacity: isConnecting ? 0.7 : 1,
                                    transition: 'opacity 0.2s',
                                    marginBottom: '8px',
                                }}
                            >
                                {isConnecting ? 'Setting Up...' : 'Set Up Trading'}
                            </button>

                            <button
                                onClick={disconnect}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: 'transparent',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '8px',
                                    color: '#71767b',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                }}
                            >
                                Disconnect Wallet
                            </button>
                        </div>
                    )}

                    {/* ORDER VIEW */}
                    {view === 'order' && (
                        <>
                            {/* Session info */}
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: '16px',
                                    padding: '10px',
                                    background: 'rgba(34, 197, 94, 0.1)',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(34, 197, 94, 0.2)',
                                }}
                            >
                                <div>
                                    <div style={{ fontSize: '11px', color: '#22c55e' }}>
                                        ✓ Ready to trade
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#71767b', marginTop: '2px' }}>
                                        {address?.slice(0, 6)}...{address?.slice(-4)}
                                    </div>
                                </div>
                                {balance !== null && (
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '11px', color: '#71767b' }}>Balance</div>
                                        <div style={{ fontSize: '12px', color: '#e7e9ea', fontWeight: 500 }}>
                                            ${balance.toFixed(2)}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Amount input */}
                            <div style={{ marginBottom: '16px' }}>
                                <label
                                    style={{
                                        display: 'block',
                                        fontSize: '12px',
                                        color: '#71767b',
                                        marginBottom: '8px',
                                    }}
                                >
                                    Amount (USDC)
                                </label>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '8px',
                                        padding: '12px',
                                    }}
                                >
                                    <span style={{ color: '#71767b', marginRight: '8px' }}>$</span>
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
                                        }}
                                    />
                                </div>
                                {/* Quick amount buttons */}
                                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                    {[1, 5, 10, 25].map((val) => (
                                        <button
                                            key={val}
                                            onClick={() => setAmount(val.toString())}
                                            style={{
                                                flex: 1,
                                                padding: '6px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                borderRadius: '6px',
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
                                        border: `1px solid ${accentColor}33`,
                                        borderRadius: '8px',
                                        padding: '12px',
                                        marginBottom: '16px',
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            marginBottom: '8px',
                                        }}
                                    >
                                        <span style={{ fontSize: '11px', color: '#71767b' }}>Price per share</span>
                                        <span style={{ fontSize: '11px', color: '#e7e9ea' }}>
                                            {formatPriceAsPercent(price)} ({Math.round(price * 100)}¢)
                                        </span>
                                    </div>
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            marginBottom: '8px',
                                        }}
                                    >
                                        <span style={{ fontSize: '11px', color: '#71767b' }}>Est. shares</span>
                                        <span style={{ fontSize: '11px', color: '#e7e9ea' }}>
                                            {estimatedShares.toFixed(2)}
                                        </span>
                                    </div>
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            paddingTop: '8px',
                                            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                                        }}
                                    >
                                        <span style={{ fontSize: '11px', color: '#71767b' }}>Potential profit</span>
                                        <span style={{ fontSize: '11px', color: accentColor, fontWeight: 600 }}>
                                            +${potentialProfit.toFixed(2)} ({((potentialProfit / numAmount) * 100).toFixed(0)}%)
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Error display */}
                            {error && (
                                <div
                                    style={{
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        borderRadius: '8px',
                                        padding: '12px',
                                        marginBottom: '16px',
                                    }}
                                >
                                    <div style={{ fontSize: '12px', color: '#ef4444' }}>{error}</div>
                                </div>
                            )}

                            {/* Success display */}
                            {orderSuccess && (
                                <div
                                    style={{
                                        background: 'rgba(34, 197, 94, 0.15)',
                                        border: '1px solid rgba(34, 197, 94, 0.3)',
                                        borderRadius: '8px',
                                        padding: '12px',
                                        marginBottom: '16px',
                                    }}
                                >
                                    <div style={{ fontSize: '12px', color: '#22c55e' }}>
                                        ✓ Order submitted successfully!
                                    </div>
                                </div>
                            )}

                            {/* Submit button */}
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting || numAmount <= 0}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    background: isYes
                                        ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                                        : 'linear-gradient(135deg, #ef4444, #dc2626)',
                                    border: 'none',
                                    borderRadius: '10px',
                                    color: 'white',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    cursor: numAmount <= 0 ? 'not-allowed' : 'pointer',
                                    opacity: numAmount <= 0 ? 0.5 : 1,
                                    transition: 'opacity 0.2s',
                                    marginBottom: '8px',
                                }}
                            >
                                {isSubmitting ? 'Submitting...' : `Buy ${outcome} for $${numAmount.toFixed(2)}`}
                            </button>

                            {/* Disconnect option */}
                            <button
                                onClick={() => {
                                    disconnect();
                                    setView('connect');
                                }}
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#71767b',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                }}
                            >
                                Disconnect Wallet
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
